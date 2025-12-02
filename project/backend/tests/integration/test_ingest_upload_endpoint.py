from __future__ import annotations

"""Integration test for ingest upload endpoint wiring through the pipeline."""

import json
from typing import Any, Dict, List

import pytest

from clients.ingestion.pipeline import IngestionResult
from clients.llm.service import LLMService


@pytest.mark.asyncio
async def test_ingest_upload_endpoint_returns_ingestion_summary(
    async_client,
    test_llm_service: LLMService,
) -> None:
    class StubPipeline:
        def __init__(self) -> None:
            self.calls: List[Dict[str, Any]] = []

        async def ingest(self, **kwargs: Any) -> IngestionResult:
            self.calls.append(kwargs)
            return IngestionResult(
                document_id=kwargs["document_id"],
                slide_count=4,
                chunk_count=10,
                namespace="slides",
            )

    stub = StubPipeline()
    test_llm_service._ingestion_pipeline = stub  # type: ignore[attr-defined]

    metadata = json.dumps({"document_id": "deck-123", "course": "math"})

    response = await async_client.post(
        "/ingest/upload",
        data={"session_id": "session-1", "metadata": metadata},
        files={"file": ("Lesson.pptx", b"binary-data", "application/vnd.ms-powerpoint")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "indexed"
    assert payload["document_id"] == "deck-123"
    assert payload["chunk_count"] == 10
    assert payload["slide_count"] == 4
    assert payload["namespace"] == "slides"
    assert stub.calls, "pipeline was not invoked"
    call = stub.calls[0]
    assert call["filename"] == "Lesson.pptx"
    assert call["metadata"]["session_id"] == "session-1"
    assert call["metadata"]["document_id"] == "deck-123"


@pytest.mark.asyncio
async def test_ingest_upload_endpoint_rejects_bad_metadata(async_client) -> None:
    response = await async_client.post(
        "/ingest/upload",
        data={"session_id": "session-2", "metadata": "not-json"},
        files={"file": ("Lesson.pptx", b"binary-data", "application/vnd.ms-powerpoint")},
    )

    assert response.status_code == 400
    assert "Invalid metadata JSON" in response.json()["detail"]


@pytest.mark.asyncio
async def test_ingest_upload_endpoint_handles_pipeline_error(
    async_client,
    test_llm_service: LLMService,
) -> None:
    class FailingPipeline:
        async def ingest(self, **_: Any) -> IngestionResult:  # pragma: no cover - stub error path
            raise RuntimeError("pipeline exploded")

    test_llm_service._ingestion_pipeline = FailingPipeline()  # type: ignore[attr-defined]

    response = await async_client.post(
        "/ingest/upload",
        data={"session_id": "session-3"},
        files={"file": ("Lesson.pptx", b"binary-data", "application/vnd.ms-powerpoint")},
    )

    assert response.status_code == 500
    assert response.json()["detail"] == "pipeline exploded"


@pytest.mark.asyncio
async def test_ingest_delete_document_invokes_pipeline(
    async_client,
    test_llm_service: LLMService,
) -> None:
    class DeletingPipeline:
        def __init__(self) -> None:
            self.deleted: list[str] = []

        async def ingest(self, **_: Any) -> IngestionResult:  # pragma: no cover - unused in delete test
            raise AssertionError("ingest should not be called")

        def delete_document(self, document_id: str) -> None:
            self.deleted.append(document_id)

    pipeline = DeletingPipeline()
    test_llm_service._ingestion_pipeline = pipeline  # type: ignore[attr-defined]

    response = await async_client.delete("/ingest/document/doc-42")

    assert response.status_code == 200
    assert response.json() == {"status": "deleted", "document_id": "doc-42"}
    assert pipeline.deleted == ["doc-42"]
