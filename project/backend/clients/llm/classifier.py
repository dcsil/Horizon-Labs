"""Learner turn classifier for chat sessions with heuristic fallback when the model is disabled.
Uses OpenRouter/OpenAI-compatible ChatOpenAI via LangChain when configured."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Iterable, Optional

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

try:  # pragma: no cover - dependency optional in some deployments
    from langchain_openai import ChatOpenAI as _ChatOpenAI  # type: ignore
except ModuleNotFoundError:  # pragma: no cover - executed when package missing
    _ChatOpenAI = None  # type: ignore[assignment]

from .settings import Settings

ChatOpenAI = _ChatOpenAI

logger = logging.getLogger(__name__)


@dataclass
class ClassificationResult:
    label: Optional[str]
    rationale: Optional[str]
    used_model: bool
    raw_output: Optional[str] = None


class TurnClassifier:
    """Classifies learner turns as {good | needs_focusing} with heuristic fallback."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._enabled = settings.turn_classifier_enabled
        self._model_name = settings.turn_classifier_model
        self._temperature = settings.turn_classifier_temperature
        self._timeout = settings.turn_classifier_timeout_seconds

    async def classify(
        self,
        *,
        session_id: str,
        learner_text: str,
        conversation: Iterable[SystemMessage | HumanMessage | AIMessage],
        min_words: int,
    ) -> ClassificationResult:
        """Classify a learner turn using the model if enabled; otherwise fall back to heuristics."""
        heuristic = self._heuristic_label(learner_text, min_words)
        if not self._enabled:
            return heuristic

        raw_response_text: Optional[str] = None
        try:
            if ChatOpenAI is None:
                raise RuntimeError(
                    "langchain-openai is required to run the turn classifier. Install the dependency to continue."
                )

            # LLM-backed classification path (uses OpenRouter/OpenAI compatible ChatOpenAI).
            # OpenRouter credentials/base URL come from Settings (openrouter_api_key/base_url).
            llm = ChatOpenAI(
                model=self._model_name,
                temperature=self._temperature,
                timeout=self._timeout,
                openai_api_key=self._settings.openrouter_api_key,
                openai_api_base=self._settings.openrouter_base_url,
            )

            history_excerpt = self._summarise_history(conversation)
            prompt = self._build_prompt(history_excerpt, learner_text)
            # Invoke model to get JSON label/rationale; falls back to heuristic on failure.
            response = await llm.ainvoke(prompt)
            raw_response_text = response.content
            parsed = self._parse_response(raw_response_text)
            if parsed:
                return ClassificationResult(
                    label=parsed["label"],
                    rationale=parsed.get("rationale"),
                    used_model=True,
                    raw_output=response.content,
                )

            logger.warning("Classifier returned unparsable output for session %s", session_id)
        except Exception as exc:  # pragma: no cover - defensive
            logger.exception("Classifier LLM call failed for session %s: %s", session_id, exc)

        if raw_response_text:
            heuristic.raw_output = raw_response_text
        return heuristic

    @staticmethod
    def _heuristic_label(text: str, min_words: int) -> ClassificationResult:
        """Lightweight rule-based classifier used when the model is disabled/unavailable."""
        clean = text.strip()
        word_count = len([word for word in clean.split() if word])
        has_reasoning = any(
            keyword in clean.lower()
            for keyword in ("because", "therefore", "first", "next", "step", "reason", "explain")
        )

        if word_count >= max(5, min_words // 2) and has_reasoning:
            return ClassificationResult(
                label="good",
                rationale="Heuristic: contains reasoning language and sufficient detail.",
                used_model=False,
                raw_output=None,
            )
        if word_count >= min_words:
            return ClassificationResult(
                label="good",
                rationale=f"Heuristic: response meets minimum word count ({min_words}).",
                used_model=False,
                raw_output=None,
            )
        return ClassificationResult(
            label="needs_focusing",
            rationale="Heuristic: response appears brief or lacks reasoning cues.",
            used_model=False,
            raw_output=None,
        )

    @staticmethod
    def _summarise_history(messages: Iterable[SystemMessage | HumanMessage | AIMessage]) -> str:
        """Compact the recent conversation into a small excerpt for the classifier prompt."""
        turns = []
        for message in messages:
            role = "User" if isinstance(message, HumanMessage) else "Assistant" if isinstance(message, AIMessage) else "System"
            turns.append(f"{role}: {message.content}")
        excerpt = "\n".join(turns[-6:])  # most recent context
        return excerpt or "[no prior conversation]"

    @staticmethod
    def _build_prompt(history: str, learner_text: str) -> list[SystemMessage | HumanMessage]:
        """Build a constrained JSON-only prompt instructing the classifier model."""
        system_instruction = SystemMessage(
            content=(
                "You are an instructional coach evaluating the learner's latest message.\n"
                "Classify the turn as:\n"
                '- "good" when the learner demonstrates effort, reasoning, or detailed reflection.\n'
                '- "needs_focusing" when the learner gives a very short answer, guesses randomly, or needs redirection.\n'
                "Always respond with a single JSON object: {\"label\": \"good\" | \"needs_focusing\", \"rationale\": \"...\"}.\n"
                "Do not include extra commentary."
            )
        )
        user_prompt = HumanMessage(
            content=(
                "Recent conversation:\n"
                f"{history}\n\n"
                "Learner's latest message:\n"
                f"{learner_text}\n\n"
                "Return JSON only."
            )
        )
        return [system_instruction, user_prompt]

    @staticmethod
    def _parse_response(raw: str) -> Optional[dict[str, str]]:
        """Parse model JSON output robustly, handling fenced code blocks and noisy wrappers."""
        def _attempt(candidate: str) -> Optional[dict[str, str]]:
            parsed = json.loads(candidate)
            label = parsed.get("label")
            if label not in {"good", "needs_focusing"}:
                return None
            rationale = parsed.get("rationale")
            if rationale and not isinstance(rationale, str):
                rationale = None
            return {"label": label, "rationale": rationale}

        raw = raw.strip()
        candidates: list[str] = [raw]

        if raw.startswith("```"):
            lines = raw.splitlines()
            if lines:
                lines = lines[1:]
            while lines and lines[-1].strip().startswith("```"):
                lines = lines[:-1]
            fenced = "\n".join(lines).strip()
            if fenced:
                candidates.append(fenced)

        bracket_start = raw.find("{")
        bracket_end = raw.rfind("}")
        if bracket_start != -1 and bracket_end != -1 and bracket_start < bracket_end:
            candidates.append(raw[bracket_start : bracket_end + 1])

        seen: set[str] = set()
        for candidate in candidates:
            candidate = candidate.strip()
            if not candidate or candidate in seen:
                continue
            seen.add(candidate)
            try:
                result = _attempt(candidate)
            except json.JSONDecodeError:
                continue
            if result:
                return result
        return None
