from __future__ import annotations

from collections import defaultdict, OrderedDict
from datetime import datetime, timezone
import logging
from pathlib import Path
import time
from typing import Any, AsyncGenerator, DefaultDict, Dict, List, Optional
from uuid import uuid4

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

from ..database.chat_repository import (
    ChatMessageRecord,
    ChatRepository,
    ChatSessionRecord,
    FirestoreChatRepository,
    InMemoryChatRepository,
)
from ..ingestion import IngestionResult, SlideIngestionPipeline
from .classifier import ClassificationResult, TurnClassifier
from .settings import Settings, get_settings
from .telemetry import TelemetryEvent, TelemetryLogger

logger = logging.getLogger(__name__)


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
        self._telemetry = TelemetryLogger(settings)
        self._repository: ChatRepository = repository or self._select_repository()
        self._classifier: Optional[TurnClassifier] = None
        self._session_cache_order: "OrderedDict[str, None]" = OrderedDict()
        self._max_cached_sessions = settings.max_cached_sessions or 0
        self._ingestion_pipeline: Optional[SlideIngestionPipeline] = None

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
        session_history = self._conversations[session_id]

        classification = await self._classify_turn(
            session_id=session_id,
            learner_text=question,
            session_history=session_history,
        )

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

    async def ingest_upload(
        self,
        *,
        session_id: str,
        file_bytes: bytes,
        filename: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> IngestionResult:
        pipeline = self._get_ingestion_pipeline()
        base_metadata: Dict[str, Any] = dict(metadata or {})
        base_metadata.setdefault("session_id", session_id)
        base_metadata.setdefault("source_filename", filename)

        document_id = str(
            base_metadata.get("document_id")
            or self._derive_document_id(filename=filename, session_id=session_id)
        )

        return await pipeline.ingest(
            document_id=document_id,
            file_bytes=file_bytes,
            filename=filename,
            metadata=base_metadata,
        )

    async def delete_document(self, document_id: str) -> None:
        if not document_id:
            return
        pipeline = self._get_ingestion_pipeline()
        pipeline.delete_document(document_id)

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
        classifier = self._get_classifier()
        if classifier is None:
            result = TurnClassifier._heuristic_label(learner_text, self._friction_min_words)
            self._last_classifications[session_id] = result
            return result

        result = await classifier.classify(
            session_id=session_id,
            learner_text=learner_text,
            conversation=session_history,
            min_words=self._friction_min_words,
        )
        self._last_classifications[session_id] = result
        return result

    def _get_classifier(self) -> Optional[TurnClassifier]:
        if not self._settings.turn_classifier_enabled:
            return None
        if self._classifier is None:
            self._classifier = TurnClassifier(self._settings)
        return self._classifier

    def _select_repository(self) -> ChatRepository:
        try:
            return FirestoreChatRepository()
        except RuntimeError as exc:
            logger.warning("Firestore unavailable (%s); falling back to in-memory chat repository.", exc)
            return InMemoryChatRepository()

    def _get_ingestion_pipeline(self) -> SlideIngestionPipeline:
        if self._ingestion_pipeline is None:
            try:
                self._ingestion_pipeline = SlideIngestionPipeline(self._settings)
            except RuntimeError as exc:  # pragma: no cover - defensive logging
                logger.exception("Unable to initialise ingestion pipeline")
                raise RuntimeError(str(exc)) from exc
        return self._ingestion_pipeline

    @staticmethod
    def _derive_document_id(*, filename: str, session_id: str) -> str:
        def _slug(value: str) -> str:
            sanitized = [ch if ch.isalnum() else "-" for ch in value.lower()]
            collapsed = "".join(sanitized)
            collapsed = "-".join(part for part in collapsed.split("-") if part)
            return collapsed or "document"

        name_slug = _slug(Path(filename).stem or "document")
        session_slug = _slug(session_id)
        base = f"{name_slug}-{session_slug}".strip("-")
        return base or f"document-{uuid4().hex[:8]}"

    def _ensure_session_loaded(self, session_id: str) -> None:
        try:
            record = self._repository.load_session(session_id)
        except Exception:
            logger.exception("Failed loading session %s from Firestore", session_id)
            raise
        if record is None:
            self._remove_session_from_cache(session_id)
        else:
            self._hydrate_session_from_record(record)
            self._mark_session_accessed(session_id)

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
            self._mark_session_accessed(session_id)
            # Always persist the latest turn so refreshes and multi-device sessions stay in sync.
            record = self._build_session_record(session_id)
            self._repository.save_session(record)
        except Exception:
            logger.exception("Unable to persist session %s to Firestore", session_id)
            raise

    def _mark_session_accessed(self, session_id: str) -> None:
        if not self._max_cached_sessions:
            return
        self._session_cache_order.pop(session_id, None)
        self._session_cache_order[session_id] = None
        self._evict_session_cache()

    def _evict_session_cache(self) -> None:
        if not self._max_cached_sessions:
            return
        while len(self._session_cache_order) > self._max_cached_sessions:
            stale_session, _ = self._session_cache_order.popitem(last=False)
            self._remove_session_from_cache(stale_session)

    def _remove_session_from_cache(self, session_id: str) -> None:
        self._session_cache_order.pop(session_id, None)
        self._conversations.pop(session_id, None)
        self._friction_progress.pop(session_id, None)
        self._session_modes.pop(session_id, None)
        self._last_prompts.pop(session_id, None)
        self._guidance_ready.pop(session_id, None)
        self._last_classifications.pop(session_id, None)

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
            history.append(
                {
                    "role": "user" if role == "human" else "assistant",
                    "content": self._extract_display_text(message),
                    "created_at": self._extract_timestamp(message).isoformat(),
                    "turn_classification": message.additional_kwargs.get("turn_classification") if hasattr(message, "additional_kwargs") else None,
                    "classification_rationale": message.additional_kwargs.get("classification_rationale") if hasattr(message, "additional_kwargs") else None,
                    "classification_source": message.additional_kwargs.get("classification_source") if hasattr(message, "additional_kwargs") else None,
                    "classification_raw": message.additional_kwargs.get("classification_raw") if hasattr(message, "additional_kwargs") else None,
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

    def get_analytics(
        self,
        *,
        quiz_id: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        # quiz_id and user_id parameters are reserved for future filtering
        # when session metadata captures these associations.
        try:
            summaries = self._repository.list_sessions()
        except Exception:
            logger.exception("Failed listing chat sessions for analytics")
            raise

        totals = {"good": 0, "needs_focusing": 0}
        trend_counts: DefaultDict[str, Dict[str, int]] = defaultdict(lambda: {"good": 0, "needs_focusing": 0})
        session_payload: List[Dict[str, Any]] = []
        total_messages = 0
        classified_turns = 0

        for summary in summaries:
            try:
                record = self._repository.load_session(summary.session_id)
            except Exception:
                logger.exception("Failed loading session %s for analytics", summary.session_id)
                continue
            if record is None:
                continue

            message_count = len(record.messages)
            total_messages += message_count
            good_turns = 0
            needs_turns = 0

            for entry in record.messages:
                if entry.role != "human":
                    continue
                label = entry.turn_classification
                if label not in ("good", "needs_focusing"):
                    continue
                classified_turns += 1
                if label == "good":
                    good_turns += 1
                    totals["good"] += 1
                else:
                    needs_turns += 1
                    totals["needs_focusing"] += 1

                day_key = entry.created_at.astimezone(timezone.utc).date().isoformat()
                bucket = trend_counts[day_key]
                bucket[label] += 1

            session_payload.append(
                {
                    "session_id": summary.session_id,
                    "turns": message_count,
                    "classified_turns": good_turns + needs_turns,
                    "good_turns": good_turns,
                    "needs_focusing_turns": needs_turns,
                    "last_activity_at": summary.updated_at,
                }
            )

        session_payload.sort(key=lambda item: item["last_activity_at"], reverse=True)
        session_count = len(session_payload)
        average_turns = round(total_messages / session_count, 2) if session_count else 0.0
        classification_rate = round(classified_turns / total_messages, 2) if total_messages else 0.0

        daily_trend = []
        for day_key in sorted(trend_counts.keys()):
            counts = trend_counts[day_key]
            total_for_day = counts["good"] + counts["needs_focusing"]
            daily_trend.append(
                {
                    "date": day_key,
                    "good": counts["good"],
                    "needs_focusing": counts["needs_focusing"],
                    "total": total_for_day,
                }
            )

        return {
            "session_count": session_count,
            "total_messages": total_messages,
            "classified_turns": classified_turns,
            "totals": totals,
            "daily_trend": daily_trend,
            "sessions": session_payload,
            "average_turns_per_session": average_turns,
            "classification_rate": classification_rate,
        }

    def reset_session(self, session_id: str) -> None:
        try:
            self._repository.delete_session(session_id)
        except Exception:
            logger.exception("Failed deleting session %s from Firestore", session_id)
            raise
        self._remove_session_from_cache(session_id)

    def get_session_state(self, session_id: str) -> Dict[str, Any]:
        self._ensure_session_loaded(session_id)
        progress = self._friction_progress.get(session_id, 0)
        threshold = self._friction_threshold
        guidance_ready = self._guidance_ready.get(session_id, False)
        remaining = 0 if guidance_ready else max(threshold - progress, 0)
        next_prompt = "guidance" if self._session_modes.get(session_id) == "guidance" else "friction"
        classification = self._last_classifications.get(session_id)
        classification_source = None
        if classification is not None:
            classification_source = "model" if classification.used_model else "heuristic"
        return {
            "next_prompt": next_prompt,
            "last_prompt": self._last_prompts.get(session_id, "friction"),
            "friction_attempts": progress,
            "friction_threshold": threshold,
            "responses_needed": remaining,
            "guidance_ready": guidance_ready,
            "min_words": self._friction_min_words,
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
