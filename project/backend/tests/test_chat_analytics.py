from __future__ import annotations

"""Validate chat analytics endpoint aggregates classifications and session stats."""

from datetime import datetime, timedelta, timezone

import pytest

from clients.database.chat_repository import ChatMessageRecord, ChatSessionRecord


@pytest.mark.anyio
async def test_chat_analytics_endpoint(async_client, chat_repository):
    base_time = datetime(2024, 9, 1, 10, 0, tzinfo=timezone.utc)

    session_one = ChatSessionRecord(
        session_id="chat-1",
        messages=[
            ChatMessageRecord(
                role="human",
                content="Hello",
                display_content="Hello",
                created_at=base_time,
                turn_classification="good",
            ),
            ChatMessageRecord(
                role="ai",
                content="Hi",
                created_at=base_time,
            ),
            ChatMessageRecord(
                role="human",
                content="Still lost",
                display_content="Still lost",
                created_at=base_time + timedelta(days=1),
                turn_classification="needs_focusing",
            ),
        ],
        friction_progress=0,
        session_mode="friction",
        last_prompt="friction",
    )

    session_two = ChatSessionRecord(
        session_id="chat-2",
        messages=[
            ChatMessageRecord(
                role="human",
                content="Quick check",
                display_content="Quick check",
                created_at=base_time + timedelta(days=2),
                turn_classification="good",
            ),
            ChatMessageRecord(
                role="ai",
                content="Sure",
                created_at=base_time + timedelta(days=2),
            ),
        ],
        friction_progress=0,
        session_mode="friction",
        last_prompt="friction",
    )

    chat_repository.save_session(session_one)
    chat_repository.save_session(session_two)

    response = await async_client.get("/analytics/chats")
    assert response.status_code == 200
    body = response.json()

    assert body["session_count"] == 2
    assert body["total_messages"] == len(session_one.messages) + len(session_two.messages)
    assert body["classified_turns"] == 3
    assert body["totals"]["good"] == 2
    assert body["totals"]["needs_focusing"] == 1
    assert body["average_turns_per_session"] == 2.5
    assert body["classification_rate"] == pytest.approx(0.6, rel=1e-6)

    sessions = {item["session_id"]: item for item in body["sessions"]}
    assert sessions["chat-1"]["good_turns"] == 1
    assert sessions["chat-1"]["needs_focusing_turns"] == 1
    assert sessions["chat-2"]["good_turns"] == 1
    assert sessions["chat-2"]["needs_focusing_turns"] == 0

    trend = {entry["date"]: entry for entry in body["daily_trend"]}
    assert trend["2024-09-01"]["good"] == 1
    assert trend["2024-09-02"]["needs_focusing"] == 1
    assert trend["2024-09-03"]["good"] == 1
