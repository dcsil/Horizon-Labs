from __future__ import annotations

import os
import sys
from collections.abc import AsyncIterator, Iterator
from pathlib import Path

import pytest
import httpx
from fastapi import FastAPI
from httpx import AsyncClient

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.main import app as fastapi_app
from clients.database.chat_repository import InMemoryChatRepository
from clients.llm import get_llm_service
from clients.llm.service import LLMService
from clients.llm.settings import Settings
import clients.llm.service as service_module


@pytest.fixture(autouse=True)
def _set_test_env(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Ensure a predictable environment for tests."""
    monkeypatch.setenv("OPENROUTER_API_KEY", os.environ.get("OPENROUTER_API_KEY", "test-key"))
    yield


@pytest.fixture(autouse=True)
def _reset_llm_singleton() -> Iterator[None]:
    """Clear the cached service between tests to avoid cross-test leakage."""
    original = service_module._llm_service
    service_module._llm_service = None
    try:
        yield
    finally:
        service_module._llm_service = original


@pytest.fixture()
def test_settings() -> Settings:
    """Minimal settings object that disables external side effects."""
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
    )


@pytest.fixture()
def chat_repository() -> InMemoryChatRepository:
    return InMemoryChatRepository()


@pytest.fixture()
def test_llm_service(test_settings: Settings, chat_repository: InMemoryChatRepository) -> LLMService:
    """Provide an LLM service wired to the in-memory repository."""
    return LLMService(test_settings, repository=chat_repository)


@pytest.fixture()
def test_app(test_llm_service: LLMService) -> Iterator[FastAPI]:
    """FastAPI app with the LLM dependency overridden for isolated testing."""
    def _override() -> LLMService:
        return test_llm_service

    fastapi_app.dependency_overrides[get_llm_service] = _override
    try:
        yield fastapi_app
    finally:
        fastapi_app.dependency_overrides.pop(get_llm_service, None)


@pytest.fixture()
async def async_client(test_app: FastAPI) -> AsyncIterator[AsyncClient]:
    """Async HTTP client bound to the FastAPI app for integration tests."""
    transport = httpx.ASGITransport(app=test_app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client
