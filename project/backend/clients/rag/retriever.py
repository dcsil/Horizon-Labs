from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence, Tuple

from langchain_google_genai import GoogleGenerativeAIEmbeddings

from clients.database.pinecone import PineconeRepository
from clients.llm.settings import Settings


@dataclass(frozen=True)
class RetrievedContext:
    """Chunk of source material returned from the vector index."""

    text: str
    metadata: Dict[str, Any]
    score: Optional[float] = None


class SlideContextRetriever:
    """Fetches the most relevant slide/page chunks for quiz generation."""

    def __init__(
        self,
        settings: Settings,
        repository: Optional[PineconeRepository] = None,
        embedder: Optional[GoogleGenerativeAIEmbeddings] = None,
    ) -> None:
        if not settings.google_api_key:
            raise RuntimeError(
                "GOOGLE_API_KEY is required for context retrieval. Please set it in the backend .env file."
            )
        self._repository = repository or PineconeRepository(settings)
        self._embedder = embedder or GoogleGenerativeAIEmbeddings(
            model=settings.google_embeddings_model_name,
            google_api_key=settings.google_api_key,
        )

    def fetch(
        self,
        *,
        document_id: str,
        topic: str,
        difficulty: str,
        limit: int = 20,
        exclude_slide_ids: Optional[Sequence[str]] = None,
        total_slide_count: Optional[int] = None,
        coverage_threshold: float = 0.7,
        sample_size: int = 4,
    ) -> Tuple[List[RetrievedContext], bool]:
        if not document_id:
            return ([], False)

        query = self._build_query(topic=topic, difficulty=difficulty)
        vector = self._embedder.embed_query(query)
        exclude_set = {value for value in (exclude_slide_ids or []) if value}
        ratio = None
        if total_slide_count and total_slide_count > 0:
            ratio = min(1.0, len(exclude_set) / float(total_slide_count))

        apply_filter = bool(exclude_set) and (ratio is None or ratio < coverage_threshold)
        coverage_reset_needed = False

        def _build_filter() -> Optional[Dict[str, Any]]:
            if not apply_filter:
                return None
            # Pinecone filters have practical limits; cap the list.
            max_ids = 100
            clipped = list(exclude_set)[:max_ids]
            if not clipped:
                return None
            return {"slide_id": {"$nin": clipped}}

        response = self._repository.query(
            vector=vector,
            top_k=limit,
            document_id=document_id,
            metadata_filter=_build_filter(),
        )
        matches = (response or {}).get("matches") or []

        if not matches and apply_filter:
            coverage_reset_needed = True
            response = self._repository.query(
                vector=vector,
                top_k=limit,
                document_id=document_id,
            )
            matches = (response or {}).get("matches") or []

        if ratio is not None and ratio >= coverage_threshold:
            coverage_reset_needed = True

        if len(matches) > sample_size > 0:
            matches = random.sample(matches, sample_size)

        contexts: List[RetrievedContext] = []
        for match in matches:
            metadata = match.get("metadata") or {}
            text = str(metadata.get("text") or "").strip()
            if not text:
                continue
            contexts.append(
                RetrievedContext(
                    text=text,
                    metadata=metadata,
                    score=match.get("score"),
                )
            )
        return contexts, coverage_reset_needed

    @staticmethod
    def _build_query(*, topic: str, difficulty: str) -> str:
        base_topic = topic or "general computer science"
        base_difficulty = difficulty or "medium"
        return (
            f"{base_topic} key ideas suitable for a {base_difficulty} difficulty question. "
            "Return the most informative passages."
        )
