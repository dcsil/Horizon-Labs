from __future__ import annotations

from collections import defaultdict
import time
from typing import Any, AsyncGenerator, Dict, List, Optional

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

from .settings import Settings, get_settings
from .telemetry import TelemetryEvent, TelemetryLogger


class LLMService:
    """Maintains in-memory chat history per session and streams model output."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._system_prompts = self._build_system_prompts()
        self._conversations: Dict[str, List[HumanMessage | AIMessage]] = defaultdict(list)
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
        user_message = HumanMessage(content=self._build_prompt(question, context, metadata))
        messages: List[SystemMessage | HumanMessage | AIMessage] = [
            self._system_prompts["chat"],
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

        latency_ms = (time.perf_counter() - latency_start) * 1000
        event = TelemetryEvent(
            session_id=session_id,
            service="chat",
            latency_ms=latency_ms,
            input_tokens=int(usage["input_tokens"]),
            output_tokens=int(usage["output_tokens"]),
            total_tokens=int(usage["total_tokens"]),
            total_cost=usage["total_cost"] or None,
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

    def reset_session(self, session_id: str) -> None:
        self._conversations.pop(session_id, None)

    @staticmethod
    def _build_system_prompts() -> Dict[str, SystemMessage]:
        """Return static system prompts keyed by service usage."""

        return {
            "chat": SystemMessage(
                "You are Horizon Labs' learning coach. Never answer questions directly;"
                " instead craft hints, Socratic prompts, and step-by-step guidance"
                " that help learners discover the answer themselves."
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
