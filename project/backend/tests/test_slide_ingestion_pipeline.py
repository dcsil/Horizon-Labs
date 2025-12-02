from __future__ import annotations

"""Covers slide ingestion pipeline wiring with stubbed extractors and repository."""

import asyncio
from types import SimpleNamespace

import pytest

from clients.ingestion.pipeline import (
    PDFExtractor,
    SlideChunk,
    SlideExtractor,
    SlideIngestionPipeline,
)


class _StubRepository:
    def __init__(self, dimension: int | None = 3) -> None:
        self.dimension = dimension
        self.namespace = "test-namespace"
        self.items: list[list[dict]] = []
        self.deleted: list[str] = []

    def upsert(self, items):
        self.items.append(items)

    def delete_document(self, document_id: str) -> None:
        self.deleted.append(document_id)


class _StubExtractor(SlideExtractor):
    def __init__(self, slides: list[SlideChunk]) -> None:
        self._slides = slides

    def extract(self, file_bytes: bytes):  # pragma: no cover - trivial
        return list(self._slides)


class _StubChunker:
    def __init__(self, chunks: list[SlideChunk]) -> None:
        self._chunks = chunks

    def chunk(self, slides):  # pragma: no cover - trivial
        return list(self._chunks)


class _StubEmbedder:
    def __init__(self, vectors: list[list[float]]) -> None:
        self._vectors = list(vectors)

    async def embed(self, texts):  # pragma: no cover - trivial
        return list(self._vectors)


@pytest.mark.asyncio
async def test_ingest_indexes_chunks_and_validates_dimension():
    slides = [
        SlideChunk(slide_number=1, text="Intro text", slide_title="Intro", chunk_index=0),
    ]
    chunked = [
        SlideChunk(slide_number=1, text="Chunk A", slide_title="Intro", chunk_index=0),
        SlideChunk(slide_number=1, text="Chunk B", slide_title="Intro", chunk_index=1),
    ]
    vectors = [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]]
    repo = _StubRepository(dimension=3)
    pipeline = SlideIngestionPipeline(
        settings=SimpleNamespace(ingest_batch_size=10),
        repository=repo,
        extractor=_StubExtractor(slides),
        pdf_extractor=PDFExtractor(),
        chunker=_StubChunker(chunked),
        embedding_service=_StubEmbedder(vectors),
    )

    result = await pipeline.ingest(document_id="deck-1", file_bytes=b"bytes", filename="slides.pptx")

    assert result.chunk_count == 2
    assert len(repo.items) == 1
    stored = repo.items[0]
    assert stored[0]["metadata"]["document_id"] == "deck-1"
    assert stored[0]["values"] == vectors[0]


@pytest.mark.asyncio
async def test_ingest_raises_on_dimension_mismatch():
    slides = [SlideChunk(slide_number=1, text="Intro", slide_title=None, chunk_index=0)]
    chunked = [SlideChunk(slide_number=1, text="Chunk", slide_title=None, chunk_index=0)]
    repo = _StubRepository(dimension=4)
    pipeline = SlideIngestionPipeline(
        settings=SimpleNamespace(ingest_batch_size=1),
        repository=repo,
        extractor=_StubExtractor(slides),
        pdf_extractor=PDFExtractor(),
        chunker=_StubChunker(chunked),
        embedding_service=_StubEmbedder([[0.1, 0.2, 0.3]]),
    )

    with pytest.raises(RuntimeError, match="dimension"):
        await pipeline.ingest(document_id="deck", file_bytes=b"bytes", filename="slides.pptx")


def test_select_extractor_prefers_pdf_extension():
    repo = _StubRepository()
    pipeline = SlideIngestionPipeline(
        settings=SimpleNamespace(ingest_batch_size=1),
        repository=repo,
        extractor=_StubExtractor([]),
        pdf_extractor=PDFExtractor(),
        chunker=_StubChunker([]),
        embedding_service=_StubEmbedder([]),
    )

    assert isinstance(pipeline._select_extractor("report.pdf"), PDFExtractor)


def test_batched_respects_chunk_size():
    slides = [SlideChunk(slide_number=1, text="a", slide_title=None, chunk_index=i) for i in range(5)]
    batches = list(SlideIngestionPipeline._batched(slides, batch_size=2))
    assert len(batches) == 3
    assert sum(len(batch) for batch in batches) == 5
