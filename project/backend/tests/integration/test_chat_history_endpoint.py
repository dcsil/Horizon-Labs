from __future__ import annotations

from datetime import datetime, timezone

import pytest

from clients.database.chat_repository import ChatMessageRecord, ChatSessionRecord
from clients.llm.service import LLMService


@pytest.mark.integration
@pytest.mark.asyncio
async def test_chat_history_returns_persisted_transcript(
    async_client,
    test_llm_service: LLMService,
) -> None:
    session_id = "session-123"
    timestamp = datetime.now(timezone.utc)
    repository = test_llm_service._repository  # type: ignore[attr-defined]
    repository.save_session(
        ChatSessionRecord(
            session_id=session_id,
            messages=[
                ChatMessageRecord(
                    role="human",
                    content="stored question",
                    display_content="stored question",
                    created_at=timestamp,
                ),
                ChatMessageRecord(
                    role="ai",
                    content="stored answer",
                    display_content="stored answer",
                    created_at=timestamp,
                ),
            ],
            friction_progress=0,
            session_mode="friction",
            last_prompt="friction",
            guidance_ready=False,
        )
    )

    response = await async_client.get(f"/chat/history?session_id={session_id}")

    assert response.status_code == 200
    payload = response.json()
    assert payload["session_id"] == session_id
    assert len(payload["messages"]) == 2
    assert payload["messages"][0]["role"] == "user"
    assert payload["messages"][0]["content"] == "stored question"
    assert payload["messages"][1]["role"] == "assistant"
    assert payload["messages"][1]["content"] == "stored answer"
