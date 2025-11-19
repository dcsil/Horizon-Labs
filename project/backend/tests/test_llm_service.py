from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from clients.database.chat_repository import (
    ChatMessageRecord,
    ChatSessionRecord,
    InMemoryChatRepository,
)
from clients.ingestion import IngestionResult
from clients.llm.classifier import ClassificationResult
from clients.llm.service import LLMService
from clients.llm.settings import Settings


def _settings_with_pinecone() -> Settings:
    return Settings(
        openrouter_api_key="test-key",
        openrouter_base_url="http://localhost",
        model_name="test-model",
        request_timeout_seconds=5,
        telemetry_enabled=False,
        telemetry_sample_rate=0.0,
        friction_attempts_required=1,
        friction_min_words=1,
        turn_classifier_enabled=False,
        turn_classifier_model="test-model",
        turn_classifier_temperature=0.0,
        turn_classifier_timeout_seconds=5,
        embedding_model_name="text-embedding-3-large",
        pinecone_api_key="pcn-test",
        pinecone_index_name="test-index",
        pinecone_environment=None,
        pinecone_namespace="test-namespace",
    )


@pytest.mark.asyncio
async def test_ingest_upload_merges_metadata(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = _settings_with_pinecone()
    service = LLMService(settings, repository=InMemoryChatRepository())

    captured: dict[str, object] = {}

    class StubPipeline:
        async def ingest(self, **kwargs: object) -> IngestionResult:
            captured.update(kwargs)
            return IngestionResult(
                document_id=kwargs["document_id"],
                slide_count=3,
                chunk_count=7,
                namespace="test-namespace",
            )

    monkeypatch.setattr(service, "_get_ingestion_pipeline", lambda: StubPipeline())

    result = await service.ingest_upload(
        session_id="SESSION-123",
        file_bytes=b"binary-data",
        filename="Week 1 Intro.pptx",
        metadata={"course": "math"},
    )

    assert captured["metadata"] == {
        "course": "math",
        "session_id": "SESSION-123",
        "source_filename": "Week 1 Intro.pptx",
    }
    assert captured["document_id"] == result.document_id
    assert result.chunk_count == 7
    assert result.slide_count == 3
    assert result.namespace == "test-namespace"


def test_get_ingestion_pipeline_cached(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = _settings_with_pinecone()
    service = LLMService(settings, repository=InMemoryChatRepository())

    created: list[object] = []

    def _fake_pipeline(_settings: Settings) -> object:
        instance = object()
        created.append(instance)
        return instance

    monkeypatch.setattr("clients.llm.service.SlideIngestionPipeline", _fake_pipeline)

    first = service._get_ingestion_pipeline()
    second = service._get_ingestion_pipeline()

    assert first is second
    assert len(created) == 1


def test_get_ingestion_pipeline_wraps_runtime_error(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = _settings_with_pinecone()
    service = LLMService(settings, repository=InMemoryChatRepository())

    def _boom(_settings: Settings) -> object:
        raise RuntimeError("configure Pinecone")

    monkeypatch.setattr("clients.llm.service.SlideIngestionPipeline", _boom)

    with pytest.raises(RuntimeError, match="configure Pinecone"):
        service._get_ingestion_pipeline()


def test_derive_document_id_slugifies() -> None:
    slug = LLMService._derive_document_id(filename="Week 1 Intro!.pptx", session_id="Session ABC")
    assert slug.startswith("week-1-intro-session-abc")
    assert "!" not in slug


def test_build_prompt_includes_optional_sections() -> None:
    prompt = LLMService._build_prompt(
        "What is the derivative?",
        "Review the prior lesson",
        {"chapter": 3, "section": "limits"},
    )
    assert "Context:\nReview the prior lesson" in prompt
    assert "Metadata:\n- chapter: 3" in prompt
    assert prompt.endswith("Question:\nWhat is the derivative?")


def test_count_words_handles_excess_whitespace() -> None:
    assert LLMService._count_words("  many   spaces here  ") == 3


def test_reset_session_clears_cached_state(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = _settings_with_pinecone()

    class TrackingRepo(InMemoryChatRepository):
        def __init__(self) -> None:
            super().__init__()
            self.deleted: list[str] = []

        def delete_session(self, session_id: str) -> None:  # type: ignore[override]
            super().delete_session(session_id)
            self.deleted.append(session_id)

    repository = TrackingRepo()
    service = LLMService(settings, repository=repository)

    session_id = "session-reset"
    service._conversations[session_id] = []
    service._session_modes[session_id] = "friction"
    service._last_prompts[session_id] = "guidance"
    service._friction_progress[session_id] = 2
    service._guidance_ready[session_id] = True
    service._last_classifications[session_id] = ClassificationResult(
        label="good",
        rationale="solid",
        used_model=False,
    )

    service.reset_session(session_id)

    assert repository.deleted == [session_id]
    assert session_id not in service._conversations
    assert session_id not in service._session_modes
    assert session_id not in service._last_prompts
    assert session_id not in service._friction_progress
    assert session_id not in service._guidance_ready
    assert session_id not in service._last_classifications


def test_get_analytics_summarises_sessions() -> None:
    settings = _settings_with_pinecone()
    repository = InMemoryChatRepository()
    service = LLMService(settings, repository=repository)

    base_time = datetime(2024, 9, 1, 12, 0, tzinfo=timezone.utc)

    session_one = ChatSessionRecord(
        session_id="session-1",
        messages=[
            ChatMessageRecord(
                role="human",
                content="Hello coach",
                created_at=base_time,
                turn_classification="good",
            ),
            ChatMessageRecord(
                role="ai",
                content="Hi there",
                created_at=base_time,
            ),
            ChatMessageRecord(
                role="human",
                content="Still confused",
                created_at=base_time + timedelta(days=1),
                turn_classification="needs_focusing",
            ),
        ],
        friction_progress=0,
        session_mode="friction",
        last_prompt="friction",
    )

    session_two = ChatSessionRecord(
        session_id="session-2",
        messages=[
            ChatMessageRecord(
                role="human",
                content="Quick check",
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

    repository.save_session(session_one)
    repository.save_session(session_two)

    analytics = service.get_analytics()

    assert analytics["session_count"] == 2
    assert analytics["total_messages"] == len(session_one.messages) + len(session_two.messages)
    assert analytics["classified_turns"] == 3
    assert analytics["totals"] == {"good": 2, "needs_focusing": 1}
    assert analytics["average_turns_per_session"] == 2.5
    assert analytics["classification_rate"] == pytest.approx(0.6, rel=1e-6)

    sessions = {item["session_id"]: item for item in analytics["sessions"]}
    first = sessions["session-1"]
    assert first["good_turns"] == 1
    assert first["needs_focusing_turns"] == 1
    second = sessions["session-2"]
    assert second["good_turns"] == 1
    assert second["needs_focusing_turns"] == 0

    trend = {point["date"]: point for point in analytics["daily_trend"]}
    assert trend["2024-09-01"]["good"] == 1
    assert trend["2024-09-02"]["needs_focusing"] == 1
    assert trend["2024-09-03"]["good"] == 1
