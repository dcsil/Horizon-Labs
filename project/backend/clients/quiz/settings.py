from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from pydantic import BaseModel, Field


class QuizSettings(BaseModel):
    """Configuration parameters for quiz delivery."""

    practice_increase_streak: int = Field(
        default=3,
        ge=1,
        description="Consecutive correct answers required to increase practice difficulty",
    )
    practice_decrease_streak: int = Field(
        default=2,
        ge=1,
        description="Consecutive incorrect answers required to decrease practice difficulty",
    )
    slide_coverage_threshold: float = Field(
        default=0.7,
        ge=0.1,
        le=1.0,
        description="Fraction of slides to cover before resetting the exclusion filter",
    )
    retriever_context_sample_size: int = Field(
        default=4,
        ge=1,
        le=10,
        description="How many contexts to sample randomly for question generation",
    )
    retriever_top_k: int = Field(
        default=20,
        ge=4,
        description="How many matches to request from the vector store before sampling",
    )
    missed_question_review_gap: int = Field(
        default=2,
        ge=1,
        description="Minimum number of new questions before re-serving a missed one",
    )


@lru_cache
def get_quiz_settings() -> QuizSettings:
    """Load quiz settings from the shared .env file."""
    env_path = Path(__file__).resolve().parents[2] / ".env"
    load_dotenv(env_path)

    increase = int(os.environ.get("QUIZ_PRACTICE_INCREASE_STREAK", "3"))
    decrease = int(os.environ.get("QUIZ_PRACTICE_DECREASE_STREAK", "3"))
    coverage_threshold = float(os.environ.get("QUIZ_SLIDE_COVERAGE_THRESHOLD", "0.7"))
    context_sample_size = int(os.environ.get("QUIZ_RETRIEVER_CONTEXT_SAMPLE_SIZE", "4"))
    retriever_top_k = int(os.environ.get("QUIZ_RETRIEVER_TOP_K", "20"))
    missed_gap = int(os.environ.get("QUIZ_MISSED_QUESTION_REVIEW_GAP", "5"))

    return QuizSettings(
        practice_increase_streak=max(increase, 1),
        practice_decrease_streak=max(decrease, 1),
        slide_coverage_threshold=min(max(coverage_threshold, 0.1), 1.0),
        retriever_context_sample_size=max(context_sample_size, 1),
        retriever_top_k=max(retriever_top_k, 4),
        missed_question_review_gap=max(missed_gap, 1),
    )
