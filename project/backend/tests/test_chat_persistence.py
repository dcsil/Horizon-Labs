from __future__ import annotations

import os
import sys
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import List

import pytest

# Ensure the backend package is importable when running the test in isolation.
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from clients.database.chat_repository import (
    ChatMessageRecord,
    ChatSessionRecord,
    InMemoryChatRepository,
)
from clients.llm.service import LLMService
from clients.llm.settings import Settings


class DummyLLM:
    """Minimal streaming stub that mimics ChatOpenAI for unit tests."""

    def __init__(self, *_, **__):
        pass

    async def astream(self, _messages: List[object]):
        yield SimpleNamespace(
            content="persisted response",
            usage_metadata={
                "input_tokens": 5,
                "output_tokens": 7,
                "total_tokens": 12,
                "total_cost": 0.0,
            },
        )


def test_inmemory_repository_roundtrip():
    repo = InMemoryChatRepository()
    record = ChatSessionRecord(
        session_id="abc",
        messages=[
            ChatMessageRecord(
                role="human",
                content="stored content",
                display_content="stored content",
                created_at=datetime.now(timezone.utc),
            )
        ],
        friction_progress=2,
        session_mode="guidance",
        last_prompt="guidance",
        guidance_ready=False,
    )

    repo.save_session(record)
    loaded = repo.load_session("abc")

    assert loaded is not None
    assert loaded.session_id == "abc"
    assert loaded.friction_progress == 2
    assert loaded.session_mode == "guidance"
    assert loaded.messages[0].display_content == "stored content"
    assert loaded.guidance_ready is False


@pytest.mark.asyncio
async def test_stream_chat_persists_turns(monkeypatch, test_settings: Settings):
    repo = InMemoryChatRepository()
    service = LLMService(test_settings, repository=repo)

    monkeypatch.setattr("clients.llm.service.ChatOpenAI", DummyLLM)

    chunks: List[str] = []
    async for part in service.stream_chat(session_id="session-1", question="Hello world"):
        chunks.append(part)

    record = repo.load_session("session-1")
    assert record is not None
    assert record.messages[0].display_content == "Hello world"
    assert record.messages[-1].display_content == "persisted response"
    assert "".join(chunks) == "persisted response"
