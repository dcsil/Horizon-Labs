from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone, timedelta
import logging
import time
import re
from uuid import uuid4
from typing import Any, AsyncGenerator, DefaultDict, Dict, List, Optional, Set

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

from ..database.chat_repository import (
    ChatMessageRecord,
    ChatRepository,
    ChatSessionRecord,
    TopicRecord,
    PendingMicrocheckRecord,
    MicrocheckAttemptRecord,
    MicrocheckQuestionRecord,
    MicrocheckResultRecord,
    FirestoreChatRepository,
    InMemoryChatRepository,
    ChatSessionSummary,
)
from .classifier import ClassificationResult, TurnClassifier
from .settings import Settings, get_settings
from .telemetry import TelemetryEvent, TelemetryLogger

logger = logging.getLogger(__name__)


class PendingMicrocheckError(RuntimeError):
    """Raised when a session has a pending microcheck that blocks chat activity."""


class LLMService:
    """Maintains in-memory chat history per session and streams model output."""

    def __init__(self, settings: Settings, repository: Optional[ChatRepository] = None) -> None:
        self._settings = settings
        self._system_prompts = self._build_system_prompts()
        self._conversations: Dict[str, List[HumanMessage | AIMessage]] = defaultdict(list)
        self._session_modes: DefaultDict[str, str] = defaultdict(lambda: "friction")
        self._last_prompts: DefaultDict[str, str] = defaultdict(lambda: "friction")
        self._friction_progress: DefaultDict[str, int] = defaultdict(int)
        self._guidance_ready: DefaultDict[str, bool] = defaultdict(bool)
        self._last_classifications: Dict[str, ClassificationResult] = {}
        self._friction_threshold = settings.friction_attempts_required
        self._friction_min_words = settings.friction_min_words
        self._topics: Dict[str, Dict[str, TopicRecord]] = defaultdict(dict)
        self._pending_microchecks: Dict[str, PendingMicrocheckRecord] = {}
        self._microcheck_history: Dict[str, List[MicrocheckAttemptRecord]] = defaultdict(list)
        self._turns_since_microcheck: DefaultDict[str, int] = defaultdict(int)
        self._last_activity: Dict[str, datetime] = {}
        self._topic_examples: Dict[str, Dict[str, List[str]]] = defaultdict(lambda: defaultdict(list))
        self._microcheck_enabled = settings.microcheck_enabled
        self._microcheck_question_count = max(1, settings.microcheck_question_count)
        self._microcheck_frequency = max(1, settings.microcheck_frequency_turns)
        self._microcheck_return_timeout = max(0, settings.microcheck_return_minutes)
        self._telemetry = TelemetryLogger(settings)
        self._repository: ChatRepository = repository or self._select_repository()
        self._classifier = TurnClassifier(settings)

    async def stream_chat(
        self,
        *,
        session_id: str,
        question: str,
        context: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        use_guidance: bool = False,
    ) -> AsyncGenerator[str, None]:
        llm = ChatOpenAI(
            model=self._settings.model_name,
            streaming=True,
            openai_api_key=self._settings.openrouter_api_key,
            openai_api_base=self._settings.openrouter_base_url,
            timeout=self._settings.request_timeout_seconds,
        )

        self._ensure_session_loaded(session_id)
        if self._microcheck_enabled:
            self._refresh_idle_microcheck_state(session_id)
            if self._pending_microchecks.get(session_id):
                raise PendingMicrocheckError("Complete the pending microcheck before continuing the chat.")
        session_history = self._conversations[session_id]

        classification = await self._classify_turn(
            session_id=session_id,
            learner_text=question,
            session_history=session_history,
        )

        topic = self._assign_topic(session_id, question)
        topic_id = topic.topic_id

        word_count = self._count_words(question)
        current_mode = self._session_modes[session_id]
        progress_before = self._friction_progress[session_id]
        friction_attempts = progress_before
        guidance_ready = self._guidance_ready[session_id]
        qualifies_by_length = word_count >= self._friction_min_words
        qualifies_by_label = classification.label == "good"
        qualifies_for_progress = qualifies_by_label or qualifies_by_length
        if current_mode != "guidance":
            if not guidance_ready:
                if qualifies_for_progress:
                    friction_attempts = min(progress_before + 1, self._friction_threshold)
                    self._friction_progress[session_id] = friction_attempts
                    if friction_attempts >= self._friction_threshold:
                        self._guidance_ready[session_id] = True
                        guidance_ready = True
                else:
                    friction_attempts = progress_before
            else:
                friction_attempts = progress_before
        else:
            guidance_ready = True

        guidance_for_turn = False
        attempts_for_event = self._friction_progress[session_id]
        if use_guidance and guidance_ready:
            guidance_for_turn = True
            attempts_for_event = max(attempts_for_event, friction_attempts, progress_before)
            self._guidance_ready[session_id] = False
            self._friction_progress[session_id] = 0
            friction_attempts = 0
        elif use_guidance and not guidance_ready:
            logger.info("Guidance requested for session %s but not yet unlocked; staying in friction mode", session_id)
        else:
            attempts_for_event = self._friction_progress[session_id]

        prompt_key = "guidance" if guidance_for_turn else "friction"
        self._session_modes[session_id] = prompt_key
        self._last_prompts[session_id] = prompt_key

        timestamp = datetime.now(timezone.utc).isoformat()
        # Persist the learner's raw question separately from the prompt template so the
        # frontend can render it verbatim while the LLM still receives full context.
        user_message = HumanMessage(
            content=self._build_prompt(question, context, metadata),
            additional_kwargs={
                "created_at": timestamp,
                "display_text": question,
                "turn_classification": classification.label,
                "classification_rationale": classification.rationale,
                "classification_source": "model" if classification.used_model else "heuristic",
                "classification_raw": classification.raw_output,
                "topic_id": topic_id,
                "topic_name": topic.name,
            },
        )
        messages: List[SystemMessage | HumanMessage | AIMessage] = [
            self._system_prompts[prompt_key],
            *session_history,
            user_message,
        ]

        # Persist the user's turn before calling the model so retries keep state aligned.
        session_history.append(user_message)
        self._persist_session(session_id)

        response_chunks: List[str] = []
        usage: Dict[str, float] = {
            "input_tokens": 0.0,
            "output_tokens": 0.0,
            "total_tokens": 0.0,
            "total_cost": 0.0,
        }
        latency_start = time.perf_counter()
        async for chunk in llm.astream(messages):
            text = getattr(chunk, "content", "")
            if text:
                response_chunks.append(text)
                yield text
            chunk_usage = getattr(chunk, "usage_metadata", None)
            if chunk_usage:
                self._accumulate_usage(usage, chunk_usage)

        response_text = "".join(response_chunks)
        assistant_metadata = {
            "created_at": datetime.now(timezone.utc).isoformat(),
            "display_text": response_text,
        }
        session_history.append(AIMessage(content=response_text, additional_kwargs=assistant_metadata))
        if self._microcheck_enabled:
            self._handle_microcheck_after_turn(session_id, topic_id=topic_id)
        self._last_activity[session_id] = datetime.now(timezone.utc)
        self._persist_session(session_id)

        if guidance_for_turn:
            logger.info(
                "guidance provided for session %s after %s qualifying attempts",
                session_id,
                self._friction_threshold,
            )
        self._session_modes[session_id] = "friction"

        latency_ms = (time.perf_counter() - latency_start) * 1000
        event = TelemetryEvent(
            session_id=session_id,
            service="chat",
            latency_ms=latency_ms,
            input_tokens=int(usage["input_tokens"]),
            output_tokens=int(usage["output_tokens"]),
            total_tokens=int(usage["total_tokens"]),
            total_cost=usage["total_cost"] or None,
            guidance_used=guidance_for_turn or None,
            friction_attempts=attempts_for_event,
            friction_threshold=self._friction_threshold,
            turn_classification=classification.label,
            classification_source="model" if classification.used_model else "heuristic",
        )
        self._telemetry.record(event)

    @staticmethod
    def _build_prompt(
        question: str,
        context: Optional[str],
        metadata: Optional[Dict[str, Any]],
    ) -> str:
        extras: List[str] = []
        if context:
            extras.append(f"Context:\n{context}")
        if metadata:
            formatted_meta = "\n".join(f"- {key}: {value}" for key, value in metadata.items())
            extras.append(f"Metadata:\n{formatted_meta}")
        extras.append(f"Question:\n{question}")
        return "\n\n".join(extras)

    @staticmethod
    def _count_words(text: str) -> int:
        return len([word for word in text.strip().split() if word])

    async def _classify_turn(
        self,
        *,
        session_id: str,
        learner_text: str,
        session_history: List[HumanMessage | AIMessage],
    ) -> ClassificationResult:
        result = await self._classifier.classify(
            session_id=session_id,
            learner_text=learner_text,
            conversation=session_history,
            min_words=self._friction_min_words,
        )
        self._last_classifications[session_id] = result
        return result

    @staticmethod
    def _tokenize_topic_text(text: str) -> List[str]:
        tokens = re.findall(r"[a-z0-9]+", text.lower())
        filtered = [token for token in tokens if len(token) > 2]
        return filtered or ["general"]

    @staticmethod
    def _generate_topic_name(tokens: List[str], index: int) -> str:
        if tokens:
            return " ".join(token.capitalize() for token in tokens[:3])
        return f"Topic {index}"

    def _assign_topic(self, session_id: str, learner_text: str) -> TopicRecord:
        tokens = self._tokenize_topic_text(learner_text)
        token_set: Set[str] = set(tokens)

        topics = self._topics[session_id]
        best_topic: Optional[TopicRecord] = None
        best_overlap = 0
        for topic in topics.values():
            topic_keywords = set(topic.keywords)
            overlap = len(topic_keywords & token_set)
            if overlap > best_overlap:
                best_topic = topic
                best_overlap = overlap

        if best_topic and best_overlap > 0:
            merged_keywords = list(dict.fromkeys([*best_topic.keywords, *tokens]))[:10]
            updated_topic = TopicRecord(
                topic_id=best_topic.topic_id,
                name=best_topic.name,
                keywords=merged_keywords,
                message_count=best_topic.message_count + 1,
                mastery=best_topic.mastery,
            )
            topics[updated_topic.topic_id] = updated_topic
            topic_record = updated_topic
        else:
            topic_id = f"topic-{uuid4().hex[:8]}"
            name = self._generate_topic_name(tokens, len(topics) + 1)
            topic_record = TopicRecord(
                topic_id=topic_id,
                name=name,
                keywords=tokens[:5],
                message_count=1,
                mastery=0.5,
            )
            topics[topic_id] = topic_record

        snippet = learner_text.strip()
        if snippet:
            snippet = snippet[:160]
            examples = self._topic_examples[session_id][topic_record.topic_id]
            examples.append(snippet)
            if len(examples) > 5:
                self._topic_examples[session_id][topic_record.topic_id] = examples[-5:]

        return topic_record

    def _refresh_idle_microcheck_state(self, session_id: str) -> None:
        if not self._microcheck_enabled or self._microcheck_return_timeout <= 0:
            return
        if self._pending_microchecks.get(session_id):
            return
        last_activity = self._last_activity.get(session_id)
        if last_activity is None:
            last_activity = self._infer_last_activity(session_id)
        if last_activity is None:
            return
        idle_duration = datetime.now(timezone.utc) - last_activity
        if idle_duration >= timedelta(minutes=self._microcheck_return_timeout):
            self._create_microcheck(session_id)

    def _infer_last_activity(self, session_id: str) -> Optional[datetime]:
        history = self._conversations.get(session_id, [])
        for message in reversed(history):
            if isinstance(message, HumanMessage):
                raw_ts = message.additional_kwargs.get("created_at") if hasattr(message, "additional_kwargs") else None
                if isinstance(raw_ts, str):
                    try:
                        return datetime.fromisoformat(raw_ts)
                    except ValueError:
                        continue
        return None

    def _handle_microcheck_after_turn(self, session_id: str, *, topic_id: str) -> None:
        if not self._microcheck_enabled:
            return
        if self._pending_microchecks.get(session_id):
            return
        self._turns_since_microcheck[session_id] += 1
        if self._turns_since_microcheck[session_id] >= self._microcheck_frequency:
            self._create_microcheck(session_id)

    def _create_microcheck(self, session_id: str) -> None:
        topics = list(self._topics[session_id].values())
        if not topics:
            default_topic = TopicRecord(
                topic_id=f"topic-{uuid4().hex[:8]}",
                name="General Reflection",
                keywords=["general"],
                message_count=1,
                mastery=0.5,
            )
            self._topics[session_id][default_topic.topic_id] = default_topic
            topics = [default_topic]

        topics_sorted = sorted(topics, key=lambda item: item.message_count, reverse=True)
        selected_topics = topics_sorted[: self._microcheck_question_count]
        microcheck_id = f"mc-{uuid4().hex[:8]}"
        questions: List[MicrocheckQuestionRecord] = []
        for index, topic in enumerate(selected_topics, start=1):
            question_id = f"{microcheck_id}-q{index}"
            prompt = f"What is the best next action to strengthen your understanding of {topic.name}?"
            options = [
                {"id": "A", "text": f"Summarize {topic.name} in your own words and check it with the coach."},
                {"id": "B", "text": f"Skip {topic.name} and move on to an unrelated subject."},
                {"id": "C", "text": "Avoid reviewing and hope it resolves itself."},
            ]
            questions.append(
                MicrocheckQuestionRecord(
                    question_id=question_id,
                    prompt=prompt,
                    options=options,
                    correct_option_id="A",
                    topic_id=topic.topic_id,
                )
            )

        pending = PendingMicrocheckRecord(
            microcheck_id=microcheck_id,
            created_at=datetime.now(timezone.utc),
            questions=questions,
        )
        self._pending_microchecks[session_id] = pending
        self._turns_since_microcheck[session_id] = 0
        logger.info("Microcheck %s created for session %s", microcheck_id, session_id)

    def has_pending_microcheck(self, session_id: str) -> bool:
        self._ensure_session_loaded(session_id)
        if self._microcheck_enabled:
            self._refresh_idle_microcheck_state(session_id)
        return self._pending_microchecks.get(session_id) is not None

    def get_pending_microcheck(self, session_id: str) -> Optional[dict]:
        self._ensure_session_loaded(session_id)
        pending = self._pending_microchecks.get(session_id)
        if not pending:
            return None
        topics = self._topics.get(session_id, {})
        questions_payload: List[dict] = []
        for question in pending.questions:
            topic = topics.get(question.topic_id)
            questions_payload.append(
                {
                    "question_id": question.question_id,
                    "prompt": question.prompt,
                    "options": question.options,
                    "topic_id": question.topic_id,
                    "topic_name": topic.name if topic else None,
                }
            )
        return {
            "microcheck_id": pending.microcheck_id,
            "created_at": pending.created_at.isoformat(),
            "questions": questions_payload,
        }

    def submit_microcheck(self, session_id: str, microcheck_id: str, answers: Dict[str, str]) -> dict:
        self._ensure_session_loaded(session_id)
        pending = self._pending_microchecks.get(session_id)
        if not pending or pending.microcheck_id != microcheck_id:
            raise PendingMicrocheckError("No matching microcheck found for submission.")

        topics = self._topics.get(session_id, {})
        results: List[MicrocheckResultRecord] = []
        feedback_lines: List[str] = []
        mastery_updates: List[dict] = []

        for question in pending.questions:
            selected_option = answers.get(question.question_id, "")
            correct = selected_option == question.correct_option_id
            results.append(
                MicrocheckResultRecord(
                    question_id=question.question_id,
                    selected_option_id=selected_option,
                    correct=correct,
                    topic_id=question.topic_id,
                )
            )
            topic = topics.get(question.topic_id)
            if topic:
                delta = 0.1 if correct else -0.1
                new_mastery = max(0.0, min(1.0, topic.mastery + delta))
                updated_topic = TopicRecord(
                    topic_id=topic.topic_id,
                    name=topic.name,
                    keywords=topic.keywords,
                    message_count=topic.message_count,
                    mastery=new_mastery,
                )
                topics[topic.topic_id] = updated_topic
                guidance = (
                    f"Nice work on {topic.name}! Keep practicing by teaching it aloud."
                    if correct
                    else f"Revisit {topic.name} and try to articulate the key idea again."
                )
                feedback_lines.append(guidance)
                mastery_updates.append(
                    {
                        "topic_id": topic.topic_id,
                        "topic_name": topic.name,
                        "mastery": new_mastery,
                        "correct": correct,
                    }
                )
            else:
                feedback_lines.append("Consider reviewing recent material to reinforce your understanding.")

        attempt = MicrocheckAttemptRecord(
            microcheck_id=microcheck_id,
            created_at=pending.created_at,
            completed_at=datetime.now(timezone.utc),
            results=results,
            feedback="\n".join(feedback_lines),
        )
        self._microcheck_history[session_id].append(attempt)
        self._pending_microchecks.pop(session_id, None)
        self._turns_since_microcheck[session_id] = 0
        self._last_activity[session_id] = datetime.now(timezone.utc)
        self._persist_session(session_id)

        return {
            "microcheck_id": microcheck_id,
            "feedback": attempt.feedback,
            "results": [
                {
                    "question_id": result.question_id,
                    "selected_option_id": result.selected_option_id,
                    "correct": result.correct,
                    "topic_id": result.topic_id,
                    "topic_name": self._topics[session_id].get(result.topic_id).name
                    if self._topics[session_id].get(result.topic_id)
                    else None,
                }
                for result in results
            ],
            "mastery_updates": mastery_updates,
        }

    def _select_repository(self) -> ChatRepository:
        try:
            return FirestoreChatRepository()
        except RuntimeError as exc:
            logger.warning("Firestore unavailable (%s); falling back to in-memory chat repository.", exc)
            return InMemoryChatRepository()

    def _ensure_session_loaded(self, session_id: str) -> None:
        try:
            record = self._repository.load_session(session_id)
        except Exception:
            logger.exception("Failed loading session %s from Firestore", session_id)
            raise
        if record is None:
            self._conversations.pop(session_id, None)
            self._friction_progress.pop(session_id, None)
            self._session_modes.pop(session_id, None)
            self._last_prompts.pop(session_id, None)
            self._guidance_ready.pop(session_id, None)
            self._last_classifications.pop(session_id, None)
            self._topics.pop(session_id, None)
            self._pending_microchecks.pop(session_id, None)
            self._microcheck_history.pop(session_id, None)
            self._turns_since_microcheck.pop(session_id, None)
            self._last_activity.pop(session_id, None)
            self._topic_examples.pop(session_id, None)
        else:
            self._hydrate_session_from_record(record)

    def _hydrate_session_from_record(self, record: ChatSessionRecord) -> None:
        session_messages: List[HumanMessage | AIMessage | SystemMessage] = []
        for entry in record.messages:
            metadata = {
                "created_at": entry.created_at.isoformat(),
            }
            if entry.display_content is not None:
                metadata["display_text"] = entry.display_content
            if entry.turn_classification is not None:
                metadata["turn_classification"] = entry.turn_classification
            if entry.classification_rationale is not None:
                metadata["classification_rationale"] = entry.classification_rationale
            if entry.classification_source is not None:
                metadata["classification_source"] = entry.classification_source
            if entry.classification_raw is not None:
                metadata["classification_raw"] = entry.classification_raw
            if entry.topic_id is not None:
                metadata["topic_id"] = entry.topic_id

            if entry.role == "human":
                session_messages.append(HumanMessage(content=entry.content, additional_kwargs=metadata))
            elif entry.role == "ai":
                session_messages.append(AIMessage(content=entry.content, additional_kwargs=metadata))
            else:
                session_messages.append(SystemMessage(content=entry.content, additional_kwargs=metadata))

        if session_messages:
            self._conversations[record.session_id] = session_messages
        self._friction_progress[record.session_id] = record.friction_progress
        self._session_modes[record.session_id] = record.session_mode or "friction"
        self._last_prompts[record.session_id] = record.last_prompt or "friction"
        self._guidance_ready[record.session_id] = record.guidance_ready
        topics_map: Dict[str, TopicRecord] = {}
        for topic in record.topics or []:
            if topic.topic_id:
                topics_map[topic.topic_id] = topic
        self._topics[record.session_id] = topics_map
        self._microcheck_history[record.session_id] = list(record.microcheck_history or [])
        if record.pending_microcheck:
            self._pending_microchecks[record.session_id] = record.pending_microcheck
        else:
            self._pending_microchecks.pop(record.session_id, None)
        self._turns_since_microcheck[record.session_id] = record.turns_since_microcheck
        examples_map: Dict[str, List[str]] = defaultdict(list)
        for message in session_messages:
            if isinstance(message, HumanMessage):
                topic_id = (
                    message.additional_kwargs.get("topic_id")
                    if hasattr(message, "additional_kwargs")
                    else None
                )
                if topic_id:
                    snippet = self._extract_display_text(message)
                    if snippet:
                        examples_map[topic_id].append(snippet[:160])
        for topic_id in topics_map:
            examples_map.setdefault(topic_id, [])
        self._topic_examples[record.session_id] = examples_map  # type: ignore[assignment]
        inferred_activity = self._infer_last_activity(record.session_id)
        if inferred_activity:
            self._last_activity[record.session_id] = inferred_activity

        last_classification: Optional[ClassificationResult] = None
        for message in reversed(session_messages):
            if isinstance(message, HumanMessage):
                additional = getattr(message, "additional_kwargs", {}) or {}
                label = additional.get("turn_classification")
                if label:
                    rationale = additional.get("classification_rationale")
                    source = additional.get("classification_source")
                    raw_output = additional.get("classification_raw")
                    used_model = True if source == "model" else False
                    last_classification = ClassificationResult(
                        label=label,
                        rationale=rationale,
                        used_model=used_model,
                        raw_output=raw_output,
                    )
                    break
        if last_classification:
            self._last_classifications[record.session_id] = last_classification
        else:
            self._last_classifications.pop(record.session_id, None)

    def _persist_session(self, session_id: str) -> None:
        try:
            # Always persist the latest turn so refreshes and multi-device sessions stay in sync.
            record = self._build_session_record(session_id)
            self._repository.save_session(record)
        except Exception:
            logger.exception("Unable to persist session %s to Firestore", session_id)
            raise

    def _build_session_record(self, session_id: str) -> ChatSessionRecord:
        history = self._conversations.get(session_id, [])
        entries: List[ChatMessageRecord] = []
        for message in history:
            record = self._convert_message_to_record(message)
            if record:
                entries.append(record)

        return ChatSessionRecord(
            session_id=session_id,
            messages=entries,
            friction_progress=self._friction_progress.get(session_id, 0),
            session_mode=self._session_modes.get(session_id, "friction"),
            last_prompt=self._last_prompts.get(session_id, "friction"),
            guidance_ready=self._guidance_ready.get(session_id, False),
            topics=list(self._topics.get(session_id, {}).values()),
            microcheck_history=list(self._microcheck_history.get(session_id, [])),
            pending_microcheck=self._pending_microchecks.get(session_id),
            turns_since_microcheck=self._turns_since_microcheck.get(session_id, 0),
        )

    def _convert_message_to_record(
        self, message: SystemMessage | HumanMessage | AIMessage
    ) -> Optional[ChatMessageRecord]:
        role = self._coerce_role(message)
        if role == "system":
            return None

        created_at = self._extract_timestamp(message)
        display_text = self._extract_display_text(message)
        additional = getattr(message, "additional_kwargs", {}) or {}
        return ChatMessageRecord(
            role=role,
            content=message.content,
            created_at=created_at,
            display_content=display_text,
            turn_classification=additional.get("turn_classification"),
            classification_rationale=additional.get("classification_rationale"),
            classification_source=additional.get("classification_source"),
            classification_raw=additional.get("classification_raw"),
            topic_id=additional.get("topic_id"),
        )

    @staticmethod
    def _coerce_role(message: SystemMessage | HumanMessage | AIMessage) -> str:
        if isinstance(message, HumanMessage):
            return "human"
        if isinstance(message, AIMessage):
            return "ai"
        return "system"

    @staticmethod
    def _extract_timestamp(message: SystemMessage | HumanMessage | AIMessage) -> datetime:
        raw_ts = message.additional_kwargs.get("created_at") if hasattr(message, "additional_kwargs") else None
        if isinstance(raw_ts, str):
            try:
                return datetime.fromisoformat(raw_ts)
            except ValueError:
                pass
        return datetime.now(timezone.utc)

    @staticmethod
    def _extract_display_text(message: SystemMessage | HumanMessage | AIMessage) -> str:
        if hasattr(message, "additional_kwargs"):
            value = message.additional_kwargs.get("display_text")
            if isinstance(value, str):
                return value
        return message.content

    def get_chat_history(self, session_id: str) -> Dict[str, Any]:
        self._ensure_session_loaded(session_id)
        history: List[Dict[str, Any]] = []
        for message in self._conversations.get(session_id, []):
            role = self._coerce_role(message)
            if role == "system":
                continue
            # Return a lean payload tailored for the frontend UI.
            additional = message.additional_kwargs if hasattr(message, "additional_kwargs") else {}
            topic_id = additional.get("topic_id") if isinstance(additional, dict) else None
            topic_name = None
            if topic_id:
                topic = self._topics.get(session_id, {}).get(topic_id)
                if topic:
                    topic_name = topic.name
            history.append(
                {
                    "role": "user" if role == "human" else "assistant",
                    "content": self._extract_display_text(message),
                    "created_at": self._extract_timestamp(message).isoformat(),
                    "turn_classification": additional.get("turn_classification") if isinstance(additional, dict) else None,
                    "classification_rationale": additional.get("classification_rationale") if isinstance(additional, dict) else None,
                    "classification_source": additional.get("classification_source") if isinstance(additional, dict) else None,
                    "classification_raw": additional.get("classification_raw") if isinstance(additional, dict) else None,
                    "topic_id": topic_id,
                    "topic_name": topic_name,
                }
            )

        return {"session_id": session_id, "messages": history}

    def list_sessions(self) -> List[Dict[str, Any]]:
        try:
            summaries = self._repository.list_sessions()
        except Exception:
            logger.exception("Failed listing chat sessions from repository")
            raise
        payload: List[Dict[str, Any]] = []
        for summary in summaries:
            payload.append(
                {
                    "session_id": summary.session_id,
                    "updated_at": summary.updated_at.isoformat(),
                    "message_count": summary.message_count,
                }
            )
        return payload

    def reset_session(self, session_id: str) -> None:
        try:
            self._repository.delete_session(session_id)
        except Exception:
            logger.exception("Failed deleting session %s from Firestore", session_id)
            raise
        self._conversations.pop(session_id, None)
        self._session_modes.pop(session_id, None)
        self._last_prompts.pop(session_id, None)
        self._friction_progress.pop(session_id, None)
        self._guidance_ready.pop(session_id, None)
        self._topics.pop(session_id, None)
        self._pending_microchecks.pop(session_id, None)
        self._microcheck_history.pop(session_id, None)
        self._turns_since_microcheck.pop(session_id, None)
        self._last_activity.pop(session_id, None)
        self._topic_examples.pop(session_id, None)
        self._last_classifications.pop(session_id, None)

    def get_session_state(self, session_id: str) -> Dict[str, Any]:
        self._ensure_session_loaded(session_id)
        if self._microcheck_enabled:
            self._refresh_idle_microcheck_state(session_id)
        progress = self._friction_progress.get(session_id, 0)
        threshold = self._friction_threshold
        guidance_ready = self._guidance_ready.get(session_id, False)
        remaining = 0 if guidance_ready else max(threshold - progress, 0)
        next_prompt = "guidance" if self._session_modes.get(session_id) == "guidance" else "friction"
        classification = self._last_classifications.get(session_id)
        classification_source = None
        if classification is not None:
            classification_source = "model" if classification.used_model else "heuristic"
        microcheck_pending = self._pending_microchecks.get(session_id) is not None
        turns_since_microcheck = self._turns_since_microcheck.get(session_id, 0)
        turns_until_microcheck = 0 if microcheck_pending else max(self._microcheck_frequency - turns_since_microcheck, 0)
        topics_summary = [
            {
                "topic_id": topic.topic_id,
                "topic_name": topic.name,
                "message_count": topic.message_count,
                "mastery": topic.mastery,
            }
            for topic in sorted(self._topics.get(session_id, {}).values(), key=lambda item: item.message_count, reverse=True)
        ]
        return {
            "next_prompt": next_prompt,
            "last_prompt": self._last_prompts.get(session_id, "friction"),
            "friction_attempts": progress,
            "friction_threshold": threshold,
            "responses_needed": remaining,
            "guidance_ready": guidance_ready,
            "min_words": self._friction_min_words,
            "microcheck_pending": microcheck_pending,
            "microcheck_turns_remaining": turns_until_microcheck,
            "microcheck_frequency": self._microcheck_frequency,
            "microcheck_question_count": self._microcheck_question_count,
            "topics": topics_summary,
            "classification_label": classification.label if classification else None,
            "classification_rationale": classification.rationale if classification else None,
            "classification_source": classification_source,
            "classification_raw": classification.raw_output if classification else None,
        }

    @staticmethod
    def _build_system_prompts() -> Dict[str, SystemMessage]:
        """Return static system prompts keyed by service usage."""

        return {
            "friction": SystemMessage(
                "You are Horizon Labs' learning coach. NEVER answer questions directly; " \
                "NEVER give direct solutions; even if you've previously provided direct answers, " \
                "instead craft hints, Socratic prompts, and step-by-step guidance " \
                "that help learners discover the answer themselves."
            ),
            "guidance": SystemMessage(
                "You are Horizon Labs' learning coach. Provide clear, direct explanations that build on "
                "the learner's (HumanMessage) prior reasoning while confirming key concepts. If the learner is stuck, " \
                "offer a direct answer with context and examples (ONLY ON PREVIOUSLY DISCUSSED TOPICS). " \
                "At the end, suggest 2 to 3 follow-ups to deepen understanding."
            ),
            "quiz": SystemMessage(
                "You are Horizon Labs' learning coach. Create quizzes that assess understanding."
            ),
        }

    @staticmethod
    def _accumulate_usage(target: Dict[str, float], chunk_usage: Dict[str, Any]) -> None:
        for key in ("input_tokens", "output_tokens", "total_tokens"):
            value = chunk_usage.get(key)
            if value is not None:
                target[key] += float(value)
        cost = chunk_usage.get("total_cost")
        if cost is not None:
            target["total_cost"] += float(cost)


_llm_service: Optional[LLMService] = None


def get_llm_service() -> LLMService:
    global _llm_service
    if _llm_service is None:
        settings = get_settings()
        _llm_service = LLMService(settings)
    return _llm_service
