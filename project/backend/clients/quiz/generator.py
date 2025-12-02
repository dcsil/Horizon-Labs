"""Quiz question generator: uses ChatOpenAI (OpenRouter/OpenAI compatible) to create MCQs
grounded in retrieved slide/page contexts."""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from typing import Dict, List, Optional, Sequence

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

from clients.llm.settings import Settings, get_settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class GeneratedQuestion:
    prompt: str
    choices: List[str]
    correct_answer: str
    rationale: str
    incorrect_rationales: Dict[str, str]
    source_metadata: Optional[Dict[str, object]] = None


class QuizQuestionGenerationError(RuntimeError):
    pass


class QuizQuestionGenerator:
    """Produces multiple-choice questions using the configured LLM."""

    def __init__(
        self,
        *,
        llm_settings: Optional[Settings] = None,
        temperature: float = 0.4,
    ) -> None:
        settings = llm_settings or get_settings()
        # Initialize OpenRouter/OpenAI-compatible ChatOpenAI client for question generation.
        self._model = ChatOpenAI(
            model=settings.model_name,
            temperature=temperature,
            openai_api_key=settings.openrouter_api_key,
            openai_api_base=settings.openrouter_base_url,
            timeout=settings.request_timeout_seconds,
        )

    def generate(
        self,
        *,
        topic: str,
        difficulty: str,
        order: int,
        contexts: Optional[Sequence[Dict[str, object]]] = None,
    ) -> GeneratedQuestion:
        """Generate a single MCQ grounded (when provided) in retrieved slide/page contexts."""
        instructions = (
            "You are an instructional design assistant. "
            "Write a single multiple-choice question that checks conceptual understanding. "
            "Return ONLY a JSON object with keys: prompt (string), choices (array of 4 distinct strings), "
            "correct_answer (string exactly matching one choice), correct_rationale (string), "
            "incorrect_rationales (object keyed by choice with short explanation).\n"
            "Keep the distractors plausible but definitively incorrect. "
            "Do not include any text before or after the JSON object and do not wrap it in Markdown fences."
        )
        context_block = self._render_context_block(contexts)
        if context_block:
            instructions += (
                "\nGround every fact in the provided source material. "
                "If multiple snippets are provided, prefer the most relevant passage."
            )
        learner_prompt = (
            f"Topic: {topic}\n"
            f"Difficulty: {difficulty}\n"
            f"Question Number: {order}\n"
            "Follow the format instructions strictly."
        )
        if context_block:
            learner_prompt += f"\n\nSource Material:\n{context_block}"

        # Core LLM call: synthesize a grounded MCQ from topic/difficulty and retrieved contexts.
        response = self._model.invoke(
            [
                SystemMessage(content=instructions),
                HumanMessage(content=learner_prompt),
            ]
        )
        content = getattr(response, "content", "")
        try:
            payload = _parse_model_response(content)
        except QuizQuestionGenerationError:
            raise
        except Exception as exc:  # pragma: no cover - defensive branch
            logger.warning("Failed to parse quiz question JSON (%.160s): %s", content, exc)
            raise QuizQuestionGenerationError("Model returned invalid question format") from exc

        prompt = str(payload.get("prompt", "")).strip()
        choices = [str(choice).strip() for choice in payload.get("choices", []) if str(choice).strip()]
        if len(choices) < 2:
            raise QuizQuestionGenerationError("Question generator returned insufficient choices")

        correct_answer = str(payload.get("correct_answer", "")).strip()
        if correct_answer not in choices:
            raise QuizQuestionGenerationError("Correct answer missing from choices")

        correct_rationale = str(payload.get("correct_rationale", "")).strip()
        incorrect_raw = payload.get("incorrect_rationales", {}) or {}
        incorrect_rationales = {
            str(choice): str(explanation).strip()
            for choice, explanation in incorrect_raw.items()
            if str(choice) in choices
        }

        # Ensure every distractor has a rationale; if missing, supply a generic one.
        for choice in choices:
            if choice == correct_answer:
                continue
            if choice not in incorrect_rationales:
                incorrect_rationales[choice] = "This option does not correctly address the prompt."

        return GeneratedQuestion(
            prompt=prompt,
            choices=choices,
            correct_answer=correct_answer,
            rationale=correct_rationale or f"The correct choice best represents the topic {topic}.",
            incorrect_rationales=incorrect_rationales,
            source_metadata=(contexts[0].get("metadata") if contexts else None),
        )

    @staticmethod
    def _render_context_block(contexts: Optional[Sequence[Dict[str, object]]]) -> str:
        """Format retrieved contexts (slide/page excerpts) for inclusion in the prompt."""
        if not contexts:
            return ""
        rendered: List[str] = []
        for idx, ctx in enumerate(contexts, start=1):
            text = str(ctx.get("text") or "").strip()
            if not text:
                continue
            metadata = ctx.get("metadata") or {}
            location_parts: List[str] = []
            slide_number = metadata.get("slide_number")
            if slide_number:
                location_parts.append(f"Slide {slide_number}")
            slide_title = metadata.get("slide_title")
            if slide_title:
                location_parts.append(str(slide_title))
            location = " - ".join(location_parts) if location_parts else "Slide excerpt"
            rendered.append(f"Source {idx} ({location}):\n{text}")
        return "\n\n".join(rendered)


def _parse_model_response(content: str) -> Dict[str, object]:
    text = content.strip()
    if not text:
        raise QuizQuestionGenerationError("Model returned an empty response")

    if text.startswith("```"):
        text = _strip_markdown_fence(text)

    start = text.find("{")
    end = text.rfind("}")
    candidate = None
    if start != -1 and end != -1 and end > start:
        candidate = text[start : end + 1]

    for snippet in filter(None, [candidate, text]):
        try:
            return json.loads(snippet)
        except json.JSONDecodeError:
            continue

    raise QuizQuestionGenerationError("Model returned invalid question format")


def _strip_markdown_fence(raw: str) -> str:
    text = raw.strip()
    # Remove leading fence with optional language tag
    text = re.sub(r"^```[a-zA-Z0-9_-]*\s*", "", text)
    if "```" in text:
        text = text[: text.rfind("```")]
    return text.strip()
