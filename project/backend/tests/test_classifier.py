from __future__ import annotations

"""Covers turn classification heuristics vs model-backed classifier behavior."""

from types import SimpleNamespace

import pytest

from clients.llm.classifier import TurnClassifier
from clients.llm.settings import Settings


def _base_settings(**overrides: object) -> Settings:
    params = dict(
        openrouter_api_key="test-key",
        openrouter_base_url="http://localhost",
        model_name="test-model",
        request_timeout_seconds=5,
        telemetry_enabled=False,
        telemetry_sample_rate=0.0,
        friction_attempts_required=1,
        friction_min_words=8,
        turn_classifier_enabled=False,
        turn_classifier_model="test-model",
        turn_classifier_temperature=0.0,
        turn_classifier_timeout_seconds=5,
    )
    params.update(overrides)
    return Settings(**params)


@pytest.mark.asyncio
async def test_classify_returns_heuristic_when_disabled() -> None:
    classifier = TurnClassifier(_base_settings(turn_classifier_enabled=False))

    result = await classifier.classify(
        session_id="session-1",
        learner_text="I think because first you combine like terms, then divide.",
        conversation=[],
        min_words=8,
    )

    assert result.label == "good"
    assert result.used_model is False
    assert result.rationale == "Heuristic: contains reasoning language and sufficient detail."


def test_heuristic_flag_short_response() -> None:
    result = TurnClassifier._heuristic_label("too short", min_words=10)
    assert result.label == "needs_focusing"
    assert result.used_model is False


def test_heuristic_labels_min_word_count() -> None:
    text = "This answer has plenty of detail without keywords"
    result = TurnClassifier._heuristic_label(text, min_words=5)
    assert result.label == "good"
    assert "minimum word count" in (result.rationale or "")
    assert result.used_model is False


def test_parse_response_handles_fenced_json() -> None:
    raw = """```json\n{\"label\": \"good\", \"rationale\": \"Detailed reasoning\"}\n```"""
    parsed = TurnClassifier._parse_response(raw)
    assert parsed == {"label": "good", "rationale": "Detailed reasoning"}


@pytest.mark.asyncio
async def test_classifier_falls_back_on_invalid_model_output(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = _base_settings(turn_classifier_enabled=True)
    classifier = TurnClassifier(settings)

    class StubModel:
        def __init__(self, *_, **__):
            pass

        async def ainvoke(self, _prompt):
            return SimpleNamespace(content="not-json-response")

    monkeypatch.setattr("clients.llm.classifier.ChatOpenAI", StubModel)

    result = await classifier.classify(
        session_id="session-2",
        learner_text="idk",
        conversation=[],
        min_words=5,
    )

    assert result.label == "needs_focusing"
    assert result.used_model is False
    assert result.raw_output == "not-json-response"
