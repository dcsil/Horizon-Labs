from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence

import pytest

from clients.llm.settings import Settings
from clients.rag.retriever import RetrievedContext, SlideContextRetriever


class _DummyEmbedder:
	def __init__(self) -> None:
		self.queries: List[str] = []

	def embed_query(self, text: str) -> List[float]:
		self.queries.append(text)
		return [float(len(text))]


class _DummyRepository:
	def __init__(
		self,
		*,
		first_matches: Optional[Sequence[Dict[str, Any]]] = None,
		fallback_matches: Optional[Sequence[Dict[str, Any]]] = None,
	) -> None:
		self.first_matches = list(first_matches or [])
		self.fallback_matches = list(fallback_matches) if fallback_matches is not None else None
		self.queries: List[Dict[str, Any]] = []

	def query(self, **kwargs: Any) -> Dict[str, Any]:
		self.queries.append(kwargs)
		if len(self.queries) == 1 or self.fallback_matches is None:
			return {"matches": list(self.first_matches)}
		return {"matches": list(self.fallback_matches)}


def _make_settings(**overrides: Any) -> Settings:
	base = dict(
		openrouter_api_key="test-openrouter",
		pinecone_api_key="pc-test",
		pinecone_index_name="idx-test",
		google_api_key="fake-google",
	)
	base.update(overrides)
	return Settings(**base)


def test_fetch_returns_empty_when_document_missing() -> None:
	embedder = _DummyEmbedder()
	repository = _DummyRepository()
	retriever = SlideContextRetriever(_make_settings(), repository=repository, embedder=embedder)

	contexts, reset = retriever.fetch(document_id="", topic="math", difficulty="easy")

	assert contexts == []
	assert reset is False
	assert repository.queries == []  # repository never hit when document id missing
	assert embedder.queries == []


def test_fetch_returns_contexts_and_filter_applied() -> None:
	matches = [
		{"metadata": {"text": "First chunk", "slide_id": "s-1"}, "score": 0.9},
		{"metadata": {"text": "Second chunk", "slide_id": "s-2"}, "score": 0.7},
	]
	embedder = _DummyEmbedder()
	repository = _DummyRepository(first_matches=matches)
	retriever = SlideContextRetriever(_make_settings(), repository=repository, embedder=embedder)

	contexts, reset = retriever.fetch(
		document_id="doc-abc",
		topic="graphs",
		difficulty="medium",
		exclude_slide_ids=["skip-me"],
		sample_size=4,
	)

	assert reset is False
	assert {ctx.text for ctx in contexts} == {"First chunk", "Second chunk"}
	assert isinstance(contexts[0], RetrievedContext)
	assert len(embedder.queries) == 1
	assert repository.queries[0]["metadata_filter"] is not None


def test_fetch_triggers_reset_when_filtered_query_empty() -> None:
	repository = _DummyRepository(
		first_matches=[],
		fallback_matches=[{"metadata": {"text": "Fallback chunk"}, "score": 0.5}],
	)
	retriever = SlideContextRetriever(_make_settings(), repository=repository, embedder=_DummyEmbedder())

	contexts, reset = retriever.fetch(
		document_id="deck-1",
		topic="trees",
		difficulty="easy",
		exclude_slide_ids=["s1"],
	)

	assert reset is True  # fallback query triggered reset
	assert [ctx.text for ctx in contexts] == ["Fallback chunk"]
	assert len(repository.queries) == 2
	assert "metadata_filter" not in repository.queries[1]


@pytest.mark.parametrize(
	"exclude_ids,total,threshold,expected_reset",
	[
		([], None, 0.5, False),
		(["s1", "s2"], 2, 0.8, True),
	],
)
def test_fetch_resets_when_coverage_threshold_met(
	exclude_ids: Sequence[str], total: Optional[int], threshold: float, expected_reset: bool
) -> None:
	matches = [{"metadata": {"text": "any"}, "score": 0.9}]
	retriever = SlideContextRetriever(_make_settings(), repository=_DummyRepository(first_matches=matches), embedder=_DummyEmbedder())

	contexts, reset = retriever.fetch(
		document_id="deck-2",
		topic="probability",
		difficulty="hard",
		exclude_slide_ids=list(exclude_ids),
		total_slide_count=total,
		coverage_threshold=threshold,
	)

	assert [ctx.text for ctx in contexts] == ["any"]
	assert reset is expected_reset


def test_fetch_limits_sample_size() -> None:
	matches = [
		{"metadata": {"text": f"Chunk {idx}"}, "score": 1.0}
		for idx in range(10)
	]
	retriever = SlideContextRetriever(_make_settings(), repository=_DummyRepository(first_matches=matches), embedder=_DummyEmbedder())

	contexts, _ = retriever.fetch(
		document_id="doc-1",
		topic="algebra",
		difficulty="hard",
		limit=10,
		sample_size=3,
	)

	assert len(contexts) == 3
