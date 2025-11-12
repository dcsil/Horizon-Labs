from __future__ import annotations

from datetime import datetime, timezone
import types

import pytest

from clients.database.chat_repository import ChatMessageRecord, ChatSessionRecord


@pytest.mark.anyio
async def test_root_and_health_endpoints(async_client):
    root = await async_client.get("/")
    assert root.status_code == 200
    assert root.json() == {"status": "ok"}

    health = await async_client.get("/health")
    assert health.status_code == 200
    assert health.json() == {"status": "ok"}

    root_head = await async_client.head("/")
    assert root_head.status_code == 200

    health_head = await async_client.head("/health")
    assert health_head.status_code == 200


@pytest.mark.anyio
async def test_chat_history_sessions_and_reset(async_client, test_llm_service):
    session_id = "chat-int-1"
    now = datetime.now(timezone.utc)
    record = ChatSessionRecord(
        session_id=session_id,
        messages=[
            ChatMessageRecord(
                role="human",
                content="How do I expand this expression?",
                created_at=now,
                display_content="How do I expand this expression?",
                turn_classification="good",
                classification_rationale="Shows reasoning",
                classification_source="heuristic",
            ),
            ChatMessageRecord(
                role="ai",
                content="Try distributing each term over the parentheses.",
                created_at=now,
                display_content="Try distributing each term over the parentheses.",
            ),
        ],
        friction_progress=1,
        session_mode="friction",
        last_prompt="friction",
        guidance_ready=True,
    )
    test_llm_service._repository.save_session(record)  # type: ignore[attr-defined]

    history = await async_client.get("/chat/history", params={"session_id": session_id})
    assert history.status_code == 200
    payload = history.json()
    assert payload["session_id"] == session_id
    assert len(payload["messages"]) == 2
    assert payload["messages"][0]["turn_classification"] == "good"

    sessions = await async_client.get("/chat/sessions")
    assert sessions.status_code == 200
    sessions_payload = sessions.json()
    assert any(item["session_id"] == session_id for item in sessions_payload["sessions"])

    state = await async_client.get("/debug/friction-state", params={"session_id": session_id})
    assert state.status_code == 200
    state_payload = state.json()
    assert state_payload["guidance_ready"] is True
    assert state_payload["friction_attempts"] == 1

    reset = await async_client.post("/chat/reset", json={"session_id": session_id})
    assert reset.status_code == 200
    assert reset.json() == {"status": "reset"}

    history_after = await async_client.get("/chat/history", params={"session_id": session_id})
    assert history_after.status_code == 200
    assert history_after.json()["messages"] == []

    sessions_after = await async_client.get("/chat/sessions")
    assert sessions_after.status_code == 200
    assert all(item["session_id"] != session_id for item in sessions_after.json()["sessions"])


@pytest.mark.anyio
async def test_chat_stream_returns_tokens(async_client, test_llm_service):
    original = test_llm_service.stream_chat

    async def stub_stream_chat(self, *, session_id, question, context=None, metadata=None, use_guidance=False):
        yield "chunk-one"
        yield "chunk-two"

    try:
        test_llm_service.stream_chat = types.MethodType(stub_stream_chat, test_llm_service)  # type: ignore[assignment]
        response = await async_client.post(
            "/chat/stream",
            json={"session_id": "chat-stream-1", "message": "Hello"},
        )
        assert response.status_code == 200
        body = (await response.aread()).decode()
        assert '"chunk-one"' in body
        assert '"chunk-two"' in body
        assert "event: end" in body
    finally:
        test_llm_service.stream_chat = original  # type: ignore[assignment]


@pytest.mark.anyio
async def test_chat_stream_rejects_empty_message(async_client):
    response = await async_client.post(
        "/chat/stream",
        json={"session_id": "chat-stream-2", "message": "   "},
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "message cannot be empty"
