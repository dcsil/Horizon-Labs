from __future__ import annotations

import logging
from typing import Any, Dict, Sequence, List, Optional

from pinecone import Pinecone

from clients.llm.settings import Settings

logger = logging.getLogger(__name__)


class PineconeRepository:
    """Thin wrapper around Pinecone vector operations used by the ingestion pipeline."""

    def __init__(self, settings: Settings) -> None:
        if not settings.pinecone_api_key:
            raise RuntimeError("PINECONE_API_KEY is required to ingest documents")
        if not settings.pinecone_index_name:
            raise RuntimeError("PINECONE_INDEX_NAME is required to ingest documents")

        self.namespace = settings.pinecone_namespace
        self._index_name = settings.pinecone_index_name
        self._declared_dimension = settings.pinecone_index_dimension
        self._client = Pinecone(
            api_key=settings.pinecone_api_key,
            environment=settings.pinecone_environment,
        )

        try:
            self._index = self._client.Index(self._index_name)
            fetched = self._fetch_index_dimension()
            self.dimension = self._resolve_dimension(fetched)
        except Exception as exc:  # pragma: no cover - depends on remote state
            logger.exception("Unable to access Pinecone index '%s'", self._index_name)
            raise RuntimeError(
                "Failed to initialise Pinecone index. Ensure the index exists and credentials are correct."
            ) from exc

    def _fetch_index_dimension(self) -> int | None:
        try:
            description = self._client.describe_index(self._index_name)
        except Exception:  # pragma: no cover - best-effort log
            logger.warning("Unable to describe Pinecone index '%s' to determine dimension.", self._index_name)
            return None

        # Different SDK versions may return objects or dicts.
        if isinstance(description, dict):
            return description.get("dimension")
        return getattr(description, "dimension", None)

    def _resolve_dimension(self, fetched: Optional[int]) -> Optional[int]:
        declared = self._declared_dimension
        if declared and fetched and declared != fetched:
            raise RuntimeError(
                f"PINECONE_INDEX_DIMENSION={declared} does not match the actual Pinecone index dimension {fetched}. "
                "Update the environment variable or recreate the index so the dimensions match."
            )
        return declared or fetched

    def _normalize_vectors(self, items: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
        if not items or not self.dimension:
            return list(items)

        normalized: List[Dict[str, Any]] = []
        for item in items:
            values = list(item.get("values") or [])
            if not values:
                continue
            adjusted = self._match_dimension(values)
            if adjusted is None:
                continue
            normalized.append({**item, "values": adjusted})

        return normalized

    def _match_dimension(self, values: Sequence[float]) -> Optional[List[float]]:
        if not self.dimension:
            return list(values)
        if not values:
            return None
        if len(values) == self.dimension:
            return list(values)
        if len(values) > self.dimension:
            return list(values[: self.dimension])
        padding = [0.0] * (self.dimension - len(values))
        return list(values) + padding

    def upsert(self, items: Sequence[Dict[str, Any]]) -> None:
        if not items:
            return
        prepared = self._normalize_vectors(items)
        if not prepared:
            return
        self._index.upsert(vectors=prepared, namespace=self.namespace)

    def delete_document(self, document_id: str) -> None:
        if not document_id:
            return
        try:
            self._index.delete(
                namespace=self.namespace,
                filter={"document_id": document_id},
            )
        except Exception as exc:  # pragma: no cover - depends on remote state
            logger.exception("Unable to delete document %s from Pinecone", document_id)
            raise RuntimeError("Failed to delete document from vector index") from exc

    def query(
        self,
        *,
        vector: Sequence[float],
        top_k: int = 5,
        document_id: Optional[str] = None,
        include_metadata: bool = True,
        metadata_filter: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        if not vector:
            return {}
        try:
            query_filter: Optional[Dict[str, Any]] = {}
            if metadata_filter:
                query_filter.update(metadata_filter)
            if document_id:
                query_filter["document_id"] = document_id
            if not query_filter:
                query_filter = None
            prepared = self._match_dimension(vector)
            if prepared is None:
                raise RuntimeError("Query vector is empty; cannot perform similarity search.")
            return self._index.query(
                namespace=self.namespace,
                vector=prepared,
                top_k=top_k,
                include_metadata=include_metadata,
                include_values=False,
                filter=query_filter,
            )
        except Exception as exc:  # pragma: no cover - depends on remote state
            logger.exception("Vector query failed for document %s", document_id)
            raise RuntimeError("Failed to query vector index") from exc
