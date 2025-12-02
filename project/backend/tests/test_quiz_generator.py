from __future__ import annotations

"""Verifies quiz question generation JSON parsing and LLM interactions."""

import json
from types import SimpleNamespace

import pytest

from clients.quiz import generator
from clients.quiz.generator import (
    QuizQuestionGenerationError,
    QuizQuestionGenerator,
    _parse_model_response,
    _strip_markdown_fence,
)


class _StubLLM:
    """Deterministic stand-in for ChatOpenAI used in unit tests."""

    def __init__(self, response_text: str) -> None:
        self.response_text = response_text
        self.invocations: list[list] = []

    def invoke(self, messages):  # pragma: no cover - trivial passthrough
        self.invocations.append(messages)
        return SimpleNamespace(content=self.response_text)


def _make_generator(monkeypatch, response_text: str) -> QuizQuestionGenerator:
    stub = _StubLLM(response_text)

    def _fake_chat_openai(*_args, **_kwargs):  # pragma: no cover - deterministic factory
        return stub

    monkeypatch.setattr(generator, "ChatOpenAI", _fake_chat_openai)
    settings = SimpleNamespace(
        model_name="test-model",
        openrouter_api_key="sk-test",
        openrouter_base_url="https://example.com",
        request_timeout_seconds=5,
    )
    quiz_generator = QuizQuestionGenerator(llm_settings=settings)
    return quiz_generator


def test_generate_fills_missing_distractor_rationales(monkeypatch):
    payload = {
        "prompt": "What is 2 + 2?",
        "choices": ["1", "2", "3", "4"],
        "correct_answer": "4",
        "correct_rationale": "Basic arithmetic",
        "incorrect_rationales": {"1": "Too small"},
    }
    generator_instance = _make_generator(monkeypatch, json.dumps(payload))
    question = generator_instance.generate(
        topic="math",
        difficulty="easy",
        order=1,
        contexts=[{"text": "2+2=4", "metadata": {"slide_number": 3}}],
    )

    assert question.correct_answer == "4"
    # Every distractor should have rationale text even if the model omitted it.
    assert set(question.incorrect_rationales) == {"1", "2", "3"}
    # Context metadata should propagate for downstream attribution.
    assert question.source_metadata == {"slide_number": 3}


def test_generate_raises_when_choices_invalid(monkeypatch):
    payload = {
        "prompt": "Broken output",
        "choices": ["Yes"],
        "correct_answer": "Yes",
        "correct_rationale": "",
        "incorrect_rationales": {},
    }
    generator_instance = _make_generator(monkeypatch, json.dumps(payload))

    with pytest.raises(QuizQuestionGenerationError):
        generator_instance.generate(topic="science", difficulty="hard", order=2)


def test_parse_model_response_strips_markdown_fence():
    json_payload = json.dumps({"prompt": "Hi", "choices": ["a", "b"], "correct_answer": "a"})
    raw = f"```json\n{json_payload}\n```"
    parsed = _parse_model_response(raw)
    assert parsed["prompt"] == "Hi"


def test_parse_model_response_errors_on_empty_content():
    with pytest.raises(QuizQuestionGenerationError):
        _parse_model_response("   ")


def test_strip_markdown_fence_handles_language_tags():
    assert _strip_markdown_fence("```python\nprint('hi')\n```") == "print('hi')"


def test_render_context_block_includes_metadata():
    block = generator.QuizQuestionGenerator._render_context_block(
        [
            {"text": "Cells have nuclei.", "metadata": {"slide_number": 4, "slide_title": "Cells"}},
            {"text": "Mitochondria are powerhouses.", "metadata": {"slide_number": 5}},
        ]
    )
    assert "Source 1" in block and "Cells" in block
    assert "Source 2" in block and "powerhouses" in block
