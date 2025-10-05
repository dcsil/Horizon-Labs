from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

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
        default="meta-llama/Meta-Llama-3.1-8B-Instruct",
        description="LLM used for every request",
    )
    request_timeout_seconds: int = Field(40, ge=1, le=600)


@lru_cache
def get_settings() -> Settings:
    env_path = Path(__file__).resolve().parents[1] / ".env"
    load_dotenv(env_path)

    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY is required but missing")

    return Settings(
        openrouter_api_key=api_key,
        openrouter_base_url=os.environ.get("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
        model_name=os.environ.get("OPENROUTER_MODEL_NAME", "meta-llama/Meta-Llama-3.1-8B-Instruct"),
        request_timeout_seconds=int(os.environ.get("OPENROUTER_TIMEOUT_SECONDS", "40")),
    )
