from __future__ import annotations

from collections import defaultdict
from typing import Any, AsyncGenerator, Dict, List, Optional

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

from .settings import Settings, get_settings


class LLMService:
    """Maintains in-memory chat history per session and streams model output."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._system_message = SystemMessage(
            "You are Horizon Labs' assistant. Keep answers concise and helpful."
        )
        self._conversations: Dict[str, List[HumanMessage | AIMessage]] = defaultdict(list)

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
            self._system_message,
            *session_history,
            user_message,
        ]

        # Persist the user's turn before calling the model so retries keep state aligned.
        session_history.append(user_message)

        response_chunks: List[str] = []
        async for chunk in llm.astream(messages):
            text = getattr(chunk, "content", "")
            if text:
                response_chunks.append(text)
                yield text

        response_text = "".join(response_chunks)
        session_history.append(AIMessage(content=response_text))

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


_llm_service: Optional[LLMService] = None


def get_llm_service() -> LLMService:
    global _llm_service
    if _llm_service is None:
        settings = get_settings()
        _llm_service = LLMService(settings)
    return _llm_service
