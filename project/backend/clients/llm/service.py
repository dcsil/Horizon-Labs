from __future__ import annotations

from collections import defaultdict
import logging
import time
from typing import Any, AsyncGenerator, DefaultDict, Dict, List, Optional

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

from .settings import Settings, get_settings
from .telemetry import TelemetryEvent, TelemetryLogger

logger = logging.getLogger(__name__)


class LLMService:
    """Maintains in-memory chat history per session and streams model output."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._system_prompts = self._build_system_prompts()
        self._conversations: Dict[str, List[HumanMessage | AIMessage]] = defaultdict(list)
        self._session_modes: DefaultDict[str, str] = defaultdict(lambda: "friction")
        self._last_prompts: DefaultDict[str, str] = defaultdict(lambda: "friction")
        self._friction_progress: DefaultDict[str, int] = defaultdict(int)
        self._friction_threshold = settings.friction_attempts_required
        self._friction_min_words = settings.friction_min_words
        self._telemetry = TelemetryLogger(settings)

    async def stream_chat(
        self,
        *,
        session_id: str,
        question: str,
        context: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> AsyncGenerator[str, None]:
        llm = ChatOpenAI(
            model=self._settings.model_name,
            streaming=True,
            openai_api_key=self._settings.openrouter_api_key,
            openai_api_base=self._settings.openrouter_base_url,
            timeout=self._settings.request_timeout_seconds,
        )

        session_history = self._conversations[session_id]

        word_count = self._count_words(question)
        current_mode = self._session_modes[session_id]
        progress_before = self._friction_progress[session_id]
        friction_attempts = progress_before
        guidance_for_turn = False

        if current_mode == "friction":
            if word_count >= self._friction_min_words:
                friction_attempts = progress_before + 1
                if friction_attempts >= self._friction_threshold:
                    guidance_for_turn = True
                    self._friction_progress[session_id] = 0
                    self._session_modes[session_id] = "guidance"
                else:
                    self._friction_progress[session_id] = friction_attempts
            else:
                friction_attempts = progress_before
        else:
            guidance_for_turn = True

        prompt_key = "guidance" if guidance_for_turn else "friction"
        self._session_modes[session_id] = prompt_key
        self._last_prompts[session_id] = prompt_key

        user_message = HumanMessage(content=self._build_prompt(question, context, metadata))
        messages: List[SystemMessage | HumanMessage | AIMessage] = [
            self._system_prompts[prompt_key],
            *session_history,
            user_message,
        ]

        # Persist the user's turn before calling the model so retries keep state aligned.
        session_history.append(user_message)

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
        session_history.append(AIMessage(content=response_text))

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
            friction_attempts=friction_attempts if not guidance_for_turn else self._friction_threshold,
            friction_threshold=self._friction_threshold,
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

    def reset_session(self, session_id: str) -> None:
        self._conversations.pop(session_id, None)
        self._session_modes.pop(session_id, None)
        self._last_prompts.pop(session_id, None)
        self._friction_progress.pop(session_id, None)

    def get_session_state(self, session_id: str) -> Dict[str, Any]:
        progress = self._friction_progress.get(session_id, 0)
        threshold = self._friction_threshold
        remaining = max(threshold - progress, 0)
        next_prompt = "guidance" if remaining <= 1 else "friction"
        if self._session_modes.get(session_id) == "guidance":
            next_prompt = "guidance"
        return {
            "next_prompt": next_prompt,
            "last_prompt": self._last_prompts.get(session_id, "friction"),
            "friction_attempts": progress,
            "friction_threshold": threshold,
            "responses_needed": remaining if remaining > 0 else 0,
            "min_words": self._friction_min_words,
        }

    @staticmethod
    def _build_system_prompts() -> Dict[str, SystemMessage]:
        """Return static system prompts keyed by service usage."""

        return {
            "friction": SystemMessage(
                "You are Horizon Labs' learning coach. NEVER answer questions directly; " \
                "NEVER give direct solutions; even if you've previously provided direct answers, " \
                "instead craft hints, Socratic prompts, and step-by-step guidance" \
                " that help learners discover the answer themselves."
            ),
            "guidance": SystemMessage(
                "You are Horizon Labs' learning coach. Provide clear, direct explanations that build on"
                " the learner's (HumanMessage) prior reasoning while confirming key concepts. If the learner is stuck," \
                " offer a direct answer with context and examples."
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
