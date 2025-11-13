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
from clients.database.quiz_repository import InMemoryQuizRepository as InMemoryQuizRepo
from clients.quiz import QuizSettings, get_quiz_service
from clients.quiz.service import QuizService
from clients.quiz.generator import GeneratedQuestion
import clients.quiz.service as quiz_service_module


@pytest.fixture(scope="session")
def anyio_backend() -> str:
    """Force anyio-based tests to run under asyncio backend."""
    return "asyncio"


class StubQuizQuestionGenerator:
    """Deterministic question generator used for tests."""

    def __init__(self) -> None:
        self._counter = 0

    def generate(
        self,
        *,
        topic: str,
        difficulty: str,
        order: int,
        contexts: list[dict[str, object]] | None = None,
    ) -> GeneratedQuestion:
        self._counter += 1
        correct = f"{topic} concept #{self._counter}"
        distractors = [
            f"{topic} misconception #{self._counter}",
            f"{topic} tangent #{self._counter}",
            f"{topic} trivia #{self._counter}",
        ]
        incorrect_rationales = {choice: "Not the main concept being tested." for choice in distractors}
        return GeneratedQuestion(
            prompt=f"Test question about {topic} ({difficulty}).",
            choices=[correct, *distractors],
            correct_answer=correct,
            rationale=f"{correct} captures the core idea of {topic}.",
            incorrect_rationales=incorrect_rationales,
            source_metadata=(contexts[0].get("metadata") if contexts else None),
        )


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


@pytest.fixture(autouse=True)
def _reset_quiz_singleton() -> Iterator[None]:
    original = quiz_service_module._quiz_service
    quiz_service_module._quiz_service = None
    try:
        yield
    finally:
        quiz_service_module._quiz_service = original


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
def quiz_repository() -> InMemoryQuizRepo:
    return InMemoryQuizRepo()


@pytest.fixture()
def test_quiz_service(quiz_repository: InMemoryQuizRepo) -> QuizService:
    generator = StubQuizQuestionGenerator()
    quiz_settings = QuizSettings()
    return QuizService(repository=quiz_repository, settings=quiz_settings, generator=generator)


@pytest.fixture()
def test_app(test_llm_service: LLMService, test_quiz_service: QuizService) -> Iterator[FastAPI]:
    """FastAPI app with the LLM dependency overridden for isolated testing."""
    def _override() -> LLMService:
        return test_llm_service

    def _override_quiz() -> QuizService:
        return test_quiz_service

    fastapi_app.dependency_overrides[get_llm_service] = _override
    fastapi_app.dependency_overrides[get_quiz_service] = _override_quiz
    try:
        yield fastapi_app
    finally:
        fastapi_app.dependency_overrides.pop(get_llm_service, None)
        fastapi_app.dependency_overrides.pop(get_quiz_service, None)


@pytest.fixture()
async def async_client(test_app: FastAPI) -> AsyncIterator[AsyncClient]:
    """Async HTTP client bound to the FastAPI app for integration tests."""
    transport = httpx.ASGITransport(app=test_app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client
