from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from pydantic import BaseModel, Field

class Settings(BaseModel):
    """Minimal configuration needed to talk to OpenRouter."""

    openrouter_api_key: str = Field(..., description="API key for OpenRouter")
    openrouter_base_url: str = Field(
        default="https://openrouter.ai/api/v1",
        description="Base URL for the OpenRouter compatible API",
    )
    model_name: str = Field(
        default="google/gemini-2.0-flash-exp:free",
        description="LLM used for every request",
    )
    # temperature: float = Field(0.0, ge=0.0, le=1.0, description="Sampling temperature for responses")
    request_timeout_seconds: int = Field(40, ge=1, le=600)
    telemetry_enabled: bool = Field(
        default=True,
        description="Whether telemetry events are recorded",
    )
    telemetry_sample_rate: float = Field(
        default=1.0,
        ge=0.0,
        le=1.0,
        description="Fraction of requests to log (1.0 = always)",
    )
    friction_attempts_required: int = Field(
        default=3,
        ge=1,
        description="Number of qualifying learner responses required before guidance is provided",
    )
    friction_min_words: int = Field(
        default=15,
        ge=1,
        description="Minimum learner word count for a response to count toward the friction gate",
    )
    turn_classifier_enabled: bool = Field(
        default=True,
        description="Enable the turn-classification service for learner responses",
    )
    turn_classifier_model: str = Field(
        default="google/gemini-2.0-flash-exp:free",
        description="Model used to classify learner turns",
    )
    turn_classifier_temperature: float = Field(
        default=0.0,
        ge=0.0,
        le=1.0,
        description="Temperature for the classifier prompt",
    )
    turn_classifier_timeout_seconds: int = Field(
        default=20,
        ge=1,
        le=120,
        description="Timeout for classifier model calls",
    )
    embedding_model_name: str = Field(
        default="text-embedding-3-large",
        description="Embedding model used for document ingestion",
    )
    google_api_key: str | None = Field(
        default=None,
        description="API key for Google Generative AI embeddings",
    )
    google_embeddings_model_name: str = Field(
        default="models/gemini-embedding-001",
        description="Gemini embedding model used for RAG workflows",
    )
    pinecone_api_key: str | None = Field(
        default=None,
        description="Pinecone API key for vector indexing",
    )
    pinecone_index_name: str | None = Field(
        default=None,
        description="Pinecone index name where document chunks are stored",
    )
    pinecone_environment: str | None = Field(
        default=None,
        description="(Optional) Pinecone environment or project to target",
    )
    pinecone_namespace: str = Field(
        default="slides",
        description="Pinecone namespace used for uploaded slide decks",
    )
    pinecone_index_dimension: Optional[int] = Field(
        default=None,
        description="Expected dimensionality of vectors stored in the Pinecone index",
    )
    max_cached_sessions: int = Field(
        default=200,
        ge=0,
        description="Maximum number of chat sessions to keep in memory (0 disables eviction)",
    )
    ingest_batch_size: int = Field(
        default=64,
        ge=1,
        description="Number of chunks to embed/index per batch during ingestion",
    )


@lru_cache
def get_settings() -> Settings:
    env_path = Path(__file__).resolve().parents[2] / ".env"
    load_dotenv(env_path)

    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY is required but missing")

    cache_limit_raw = os.environ.get("LLM_MAX_CACHED_SESSIONS")
    cache_limit = int(cache_limit_raw) if cache_limit_raw is not None else 200
    if cache_limit < 0:
        cache_limit = 0
    ingest_batch_size = int(os.environ.get("INGEST_BATCH_SIZE", "64"))
    if ingest_batch_size < 1:
        ingest_batch_size = 64

    return Settings(
        openrouter_api_key=api_key,
        openrouter_base_url=os.environ.get("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
        model_name=os.environ.get("OPENROUTER_MODEL_NAME", "google/gemini-2.0-flash-exp:free"),
        request_timeout_seconds=int(os.environ.get("OPENROUTER_TIMEOUT_SECONDS", "40")),
        telemetry_enabled=os.environ.get("TELEMETRY_ENABLED", "true").lower() == "true",
        telemetry_sample_rate=float(os.environ.get("TELEMETRY_SAMPLE_RATE", "1.0")),
        friction_attempts_required=int(os.environ.get("FRICTION_ATTEMPTS_REQUIRED", "3")),
        friction_min_words=int(os.environ.get("FRICTION_MIN_WORDS", "15")),
        turn_classifier_enabled=os.environ.get("TURN_CLASSIFIER_ENABLED", "true").lower() == "true",
        turn_classifier_model=os.environ.get("TURN_CLASSIFIER_MODEL", "google/gemini-2.0-flash-exp:free"),
        turn_classifier_temperature=float(os.environ.get("TURN_CLASSIFIER_TEMPERATURE", "0.0")),
        turn_classifier_timeout_seconds=int(os.environ.get("TURN_CLASSIFIER_TIMEOUT_SECONDS", "20")),
        embedding_model_name=os.environ.get("EMBEDDING_MODEL_NAME", "text-embedding-3-large"),
        google_api_key=os.environ.get("GOOGLE_API_KEY"),
        google_embeddings_model_name=os.environ.get("GOOGLE_EMBEDDING_MODEL_NAME", "models/gemini-embedding-001"),
        pinecone_api_key=os.environ.get("PINECONE_API_KEY"),
        pinecone_index_name=os.environ.get("PINECONE_INDEX_NAME"),
        pinecone_environment=os.environ.get("PINECONE_ENVIRONMENT"),
        pinecone_namespace=os.environ.get("PINECONE_NAMESPACE", "slides"),
        pinecone_index_dimension=(
            int(os.environ["PINECONE_INDEX_DIMENSION"]) if os.environ.get("PINECONE_INDEX_DIMENSION") else None
        ),
        max_cached_sessions=cache_limit,
        ingest_batch_size=ingest_batch_size,
    )
