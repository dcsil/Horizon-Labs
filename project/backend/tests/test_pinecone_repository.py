from __future__ import annotations

"""Exercises PineconeRepository upsert/delete/query normalization and error paths."""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import pytest

from clients.database import pinecone as pinecone_module
from clients.database.pinecone import PineconeRepository
from clients.llm.settings import Settings


@dataclass
class _DummyIndex:
    upserts: List[Dict[str, Any]] = field(default_factory=list)
    deletes: List[Dict[str, Any]] = field(default_factory=list)
    queries: List[Dict[str, Any]] = field(default_factory=list)
    delete_raises: Optional[Exception] = None
    query_raises: Optional[Exception] = None

    def upsert(self, *, vectors: List[Dict[str, Any]], namespace: str) -> None:
        self.upserts.append({"vectors": vectors, "namespace": namespace})

    def delete(self, *, namespace: str, filter: Dict[str, Any]) -> None:
        if self.delete_raises:
            raise self.delete_raises
        self.deletes.append({"namespace": namespace, "filter": filter})

    def query(self, **kwargs: Any) -> Dict[str, Any]:
        if self.query_raises:
            raise self.query_raises
        self.queries.append(kwargs)
        return {"matches": kwargs.get("mock_matches", [])}


class _DummyPineconeClient:
    def __init__(self, *, dimension: Optional[int] = 3) -> None:
        self.dimension = dimension
        self.index = _DummyIndex()

    def Index(self, name: str) -> _DummyIndex:  # noqa: N802 - keep SDK parity
        return self.index

    def describe_index(self, name: str):
        if self.dimension is None:
            return None
        return {"dimension": self.dimension}


def _make_settings(**overrides: Any) -> Settings:
    base = dict(
        openrouter_api_key="test-key",
        pinecone_api_key="pc-test",
        pinecone_index_name="idx-test",
        pinecone_environment="us-east-1",
        pinecone_index_dimension=3,
    )
    base.update(overrides)
    return Settings(**base)


def _install_dummy_client(monkeypatch: pytest.MonkeyPatch, *, dimension: Optional[int] = 3) -> _DummyIndex:
    dummy_client = _DummyPineconeClient(dimension=dimension)

    def _factory(**kwargs: Any) -> _DummyPineconeClient:
        return dummy_client

    monkeypatch.setattr(pinecone_module, "Pinecone", _factory)
    return dummy_client.index


def test_repository_raises_on_dimension_mismatch(monkeypatch: pytest.MonkeyPatch) -> None:
    _install_dummy_client(monkeypatch, dimension=64)
    settings = _make_settings(pinecone_index_dimension=32)
    with pytest.raises(RuntimeError, match="Failed to initialise Pinecone index") as excinfo:
        PineconeRepository(settings)

    cause = excinfo.value.__cause__
    assert cause is not None
    assert "does not match the actual Pinecone index dimension" in str(cause)


def test_upsert_normalizes_vectors(monkeypatch: pytest.MonkeyPatch) -> None:
    index = _install_dummy_client(monkeypatch, dimension=4)
    settings = _make_settings(pinecone_index_dimension=4)
    repo = PineconeRepository(settings)

    repo.upsert([
        {"id": "doc-1", "values": [1.0, 2.0]},
        {"id": "doc-2", "values": []},
    ])

    assert len(index.upserts) == 1
    upsert_payload = index.upserts[0]
    assert upsert_payload["namespace"] == settings.pinecone_namespace
    vectors = upsert_payload["vectors"]
    assert vectors[0]["values"] == [1.0, 2.0, 0.0, 0.0]


def test_delete_document_propagates_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    index = _install_dummy_client(monkeypatch)
    index.delete_raises = ValueError("nope")
    repo = PineconeRepository(_make_settings())

    with pytest.raises(RuntimeError, match="Failed to delete document"):
        repo.delete_document("doc-1")


def test_query_merges_filters_and_pads_vectors(monkeypatch: pytest.MonkeyPatch) -> None:
    index = _install_dummy_client(monkeypatch, dimension=3)
    repo = PineconeRepository(_make_settings(pinecone_index_dimension=3))

    response = repo.query(
        vector=[0.5],
        document_id="doc-123",
        metadata_filter={"slide_id": {"$nin": ["s-1"]}},
        top_k=10,
    )

    assert response == {"matches": []}
    assert len(index.queries) == 1
    query_payload = index.queries[0]
    assert query_payload["filter"] == {"slide_id": {"$nin": ["s-1"]}, "document_id": "doc-123"}
    assert query_payload["vector"] == [0.5, 0.0, 0.0]


def test_query_returns_empty_for_missing_vector(monkeypatch: pytest.MonkeyPatch) -> None:
    _install_dummy_client(monkeypatch)
    repo = PineconeRepository(_make_settings())
    assert repo.query(vector=[]) == {}
