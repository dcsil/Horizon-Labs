from __future__ import annotations

import logging
import uuid
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from clients.database.quiz_repository import (
    DifficultyLevel,
    InMemoryQuizRepository,
    QuizAttemptRecord,
    QuizDefinitionRecord,
    QuizMode,
    QuizQuestionRecord,
    QuizRepository,
    QuizSessionRecord,
)
from clients.rag.retriever import SlideContextRetriever
from .generator import GeneratedQuestion, QuizQuestionGenerationError, QuizQuestionGenerator
from .settings import QuizSettings, get_quiz_settings
from clients.llm.settings import get_settings as get_llm_settings

logger = logging.getLogger(__name__)

DifficultySequence: List[DifficultyLevel] = ["easy", "medium", "hard"]
DifficultyRank: Dict[DifficultyLevel, int] = {level: idx for idx, level in enumerate(DifficultySequence)}


class QuizDefinitionNotFoundError(RuntimeError):
    pass


class QuizSessionNotFoundError(RuntimeError):
    pass


class QuizSessionConflictError(RuntimeError):
    pass


class QuizSessionClosedError(RuntimeError):
    def __init__(self, message: str, *, status: str) -> None:
        super().__init__(message)
        self.status = status


class QuizQuestionNotFoundError(RuntimeError):
    pass


class QuizGenerationError(RuntimeError):
    pass


class QuizService:
    """Coordinates quiz lifecycle, question generation, and grading with shared question banks."""

    def __init__(
        self,
        repository: Optional[QuizRepository] = None,
        settings: Optional[QuizSettings] = None,
        generator: Optional[QuizQuestionGenerator] = None,
        context_retriever: Optional[SlideContextRetriever] = None,
    ) -> None:
        self._repository: QuizRepository = repository or self._select_repository()
        self._settings: QuizSettings = settings or get_quiz_settings()
        self._increase_threshold = max(self._settings.practice_increase_streak, 1)
        self._decrease_threshold = max(self._settings.practice_decrease_streak, 1)
        self._generator = generator or self._select_generator()
        self._context_retriever = context_retriever or self._select_retriever()
        self._coverage_threshold = getattr(self._settings, "slide_coverage_threshold", 0.7)
        self._retriever_sample_size = getattr(self._settings, "retriever_context_sample_size", 4)
        self._retriever_top_k = getattr(self._settings, "retriever_top_k", 20)
        if self._retriever_top_k < self._retriever_sample_size:
            self._retriever_top_k = self._retriever_sample_size
        self._missed_review_gap = getattr(self._settings, "missed_question_review_gap", 2)

    # ------------------------------------------------------------------
    # Quiz definition management
    # ------------------------------------------------------------------
    def upsert_quiz_definition(
        self,
        *,
        quiz_id: str,
        name: Optional[str],
        topics: List[str],
        default_mode: QuizMode,
        initial_difficulty: DifficultyLevel,
        assessment_num_questions: Optional[int],
        assessment_time_limit_minutes: Optional[int],
        assessment_max_attempts: Optional[int],
        embedding_document_id: Optional[str],
        source_filename: Optional[str],
        is_published: bool,
        metadata: Optional[Dict[str, object]],
    ) -> QuizDefinitionRecord:
        cleaned_topics = [topic.strip() for topic in topics if topic and topic.strip()]
        if not cleaned_topics:
            cleaned_topics = ["General"]

        if default_mode not in ("assessment", "practice"):
            raise QuizGenerationError("Unsupported default mode.")

        existing = self._repository.load_quiz_definition(quiz_id)
        created_at = existing.created_at if existing else datetime.now(timezone.utc)
        record = QuizDefinitionRecord(
            quiz_id=quiz_id,
            name=name,
            topics=cleaned_topics,
            default_mode=default_mode,
            initial_difficulty=initial_difficulty,
            assessment_num_questions=assessment_num_questions,
            assessment_time_limit_minutes=assessment_time_limit_minutes,
            assessment_max_attempts=assessment_max_attempts,
            embedding_document_id=embedding_document_id,
            source_filename=source_filename,
            is_published=is_published,
            metadata=metadata or {},
            created_at=created_at,
            updated_at=datetime.now(timezone.utc),
        )
        self._repository.save_quiz_definition(record)
        return record

    def get_quiz_definition(self, quiz_id: str) -> QuizDefinitionRecord:
        definition = self._repository.load_quiz_definition(quiz_id)
        if definition is None:
            raise QuizDefinitionNotFoundError(f"Quiz {quiz_id} not found.")
        return definition

    def list_quiz_definitions(self) -> List[QuizDefinitionRecord]:
        return self._repository.list_quiz_definitions()

    def delete_quiz_definition(self, quiz_id: str) -> None:
        self._repository.delete_quiz_definition(quiz_id)

    # ------------------------------------------------------------------
    # Session lifecycle
    # ------------------------------------------------------------------
    def start_session(
        self,
        *,
        session_id: str,
        quiz_id: str,
        user_id: str,
        mode: Optional[QuizMode] = None,
        initial_difficulty: Optional[DifficultyLevel] = None,
        is_preview: bool = False,
    ) -> QuizSessionRecord:
        existing = self._repository.load_session(session_id)
        if existing and existing.status == "in_progress":
            raise QuizSessionConflictError("A quiz session with this identifier is already in progress.")

        definition = self.get_quiz_definition(quiz_id)

        selected_mode = mode or definition.default_mode
        if selected_mode not in ("assessment", "practice"):
            raise QuizGenerationError("Unsupported quiz mode requested.")

        difficulty = initial_difficulty or definition.initial_difficulty
        now = datetime.now(timezone.utc)
        deadline = None
        if selected_mode == "assessment":
            if definition.assessment_num_questions is None:
                raise QuizGenerationError(
                    "Quiz definition is missing an assessment question count."
                )
            if definition.assessment_time_limit_minutes:
                deadline = now + timedelta(minutes=definition.assessment_time_limit_minutes)

        record = QuizSessionRecord(
            session_id=session_id,
            quiz_id=quiz_id,
            user_id=user_id,
            mode=selected_mode,
            status="in_progress",
            current_difficulty=difficulty,
            correct_streak=0,
            incorrect_streak=0,
            attempts_used=0,
            topics=definition.topics,
            asked_question_ids=[],
            active_question_id=None,
            active_question_served_at=None,
            started_at=now,
            completed_at=None,
            deadline=deadline,
            attempts=[],
            is_preview=is_preview,
            preview_question_ids=[],
            used_slide_ids=[],
            missed_question_ids=[],
            questions_since_review=0,
            total_slide_count=self._extract_total_slide_count(definition.metadata),
            coverage_cycle=0,
        )
        self._repository.save_session(record)
        return record

    def get_next_question(
        self,
        session_id: str,
        *,
        topic_override: Optional[str] = None,
        difficulty_override: Optional[DifficultyLevel] = None,
    ) -> QuizQuestionRecord:
        record = self._load_session(session_id)
        record = self._enforce_time_constraints(record)

        if record.status != "in_progress":
            raise QuizSessionClosedError("Quiz session is no longer active.", status=record.status)

        if record.active_question_id:
            existing = self._repository.get_quiz_question(
                record.active_question_id,
                quiz_id=record.quiz_id,
            )
            if existing is not None:
                return existing
            logger.warning(
                "Active question %s missing from repository; generating replacement.",
                record.active_question_id,
            )
            record = replace(record, active_question_id=None, active_question_served_at=None)

        review_question, record = self._serve_missed_question_if_ready(record)
        if review_question is not None:
            return review_question

        definition = self.get_quiz_definition(record.quiz_id)
        question_bank = self._repository.list_quiz_questions(record.quiz_id)
        seen = set(record.asked_question_ids)
        selected: Optional[QuizQuestionRecord] = None

        if not record.is_preview:
            for question in question_bank:
                if question.question_id not in seen:
                    selected = question
                    break

        effective_difficulty = difficulty_override or record.current_difficulty
        if selected is None:
            selected, record = self._create_question(
                record,
                definition,
                question_bank,
                topic_override=topic_override,
                difficulty_override=effective_difficulty,
            )
        else:
            record = self._register_slide_usage(record, selected)

        now = datetime.now(timezone.utc)
        next_difficulty_state = record.current_difficulty
        if record.is_preview and selected:
            next_difficulty_state = selected.difficulty

        preview_question_ids = record.preview_question_ids
        if record.is_preview and selected and selected.source_session_id == record.session_id:
            if selected.question_id not in preview_question_ids:
                preview_question_ids = [*preview_question_ids, selected.question_id]

        updated_record = replace(
            record,
            asked_question_ids=[*record.asked_question_ids, selected.question_id],
            active_question_id=selected.question_id,
            active_question_served_at=now,
            current_difficulty=next_difficulty_state,
            preview_question_ids=preview_question_ids,
            questions_since_review=record.questions_since_review + 1,
        )
        self._repository.save_session(updated_record)
        return selected

    def submit_answer(
        self,
        *,
        session_id: str,
        question_id: str,
        selected_answer: str,
    ) -> Dict[str, object]:
        record = self._load_session(session_id)
        record = self._enforce_time_constraints(record)

        if record.status != "in_progress":
            raise QuizSessionClosedError("Quiz session is no longer active.", status=record.status)

        question = self._repository.get_quiz_question(
            question_id,
            quiz_id=record.quiz_id,
        )
        if question is None:
            raise QuizQuestionNotFoundError("Question not found in the shared bank.")

        already_answered = any(attempt.question_id == question_id for attempt in record.attempts)
        if already_answered:
            raise QuizQuestionNotFoundError("This question has already been answered.")

        now = datetime.now(timezone.utc)
        is_correct = selected_answer == question.correct_answer
        rationale = (
            question.rationale if is_correct else question.incorrect_rationales.get(selected_answer)
        )

        response_ms = None
        presented_at = record.active_question_served_at
        if presented_at is not None:
            response_ms = max(0, int((now - presented_at).total_seconds() * 1000))

        attempt = QuizAttemptRecord(
            question_id=question.question_id,
            selected_answer=selected_answer,
            is_correct=is_correct,
            submitted_at=now,
            response_ms=response_ms,
            rationale=rationale,
            presented_at=presented_at,
        )

        attempts = [*record.attempts, attempt]
        correct_streak = record.correct_streak + 1 if is_correct else 0
        incorrect_streak = record.incorrect_streak + 1 if not is_correct else 0
        attempts_used = record.attempts_used + 1
        current_difficulty = record.current_difficulty
        missed_question_ids = record.missed_question_ids
        if is_correct and question.question_id in missed_question_ids:
            missed_question_ids = [qid for qid in missed_question_ids if qid != question.question_id]
        if not is_correct and question.question_id not in missed_question_ids:
            missed_question_ids = [*missed_question_ids, question.question_id]

        if record.mode == "practice":
            adapted_difficulty = self._adapt_difficulty(current_difficulty, correct_streak, incorrect_streak)
            if adapted_difficulty != current_difficulty:
                if DifficultyRank[adapted_difficulty] > DifficultyRank[current_difficulty]:
                    correct_streak = 0
                else:
                    incorrect_streak = 0
            current_difficulty = adapted_difficulty
            if is_correct:
                incorrect_streak = 0
            else:
                correct_streak = 0

        updated_record = replace(
            record,
            attempts=attempts,
            attempts_used=attempts_used,
            correct_streak=correct_streak,
            incorrect_streak=incorrect_streak,
            current_difficulty=current_difficulty,
            active_question_id=None,
            active_question_served_at=None,
            missed_question_ids=missed_question_ids,
        )

        # Assessment termination checks
        if record.mode == "assessment":
            definition = self.get_quiz_definition(record.quiz_id)
            completed = False
            if definition.assessment_num_questions and len(attempts) >= definition.assessment_num_questions:
                updated_record = self._mark_completed(updated_record, status="completed")
                completed = True
            if (
                definition.assessment_max_attempts is not None
                and updated_record.attempts_used >= definition.assessment_max_attempts
                and updated_record.status == "in_progress"
            ):
                updated_record = self._mark_completed(updated_record, status="completed")
                completed = True
            if not completed and updated_record.deadline and datetime.now(timezone.utc) > updated_record.deadline:
                updated_record = self._mark_completed(updated_record, status="timed_out")

        self._repository.save_session(updated_record)

        response: Dict[str, object] = {
            "question_id": question.question_id,
            "is_correct": is_correct,
            "selected_answer": selected_answer,
            "correct_answer": question.correct_answer,
            "rationale": rationale or question.rationale,
            "correct_rationale": question.rationale,
            "incorrect_rationales": question.incorrect_rationales,
            "topic": question.topic,
            "difficulty": question.difficulty,
            "session_completed": updated_record.status != "in_progress",
            "current_difficulty": updated_record.current_difficulty,
            "response_ms": response_ms,
        }
        if response["session_completed"]:
            response["summary"] = self._build_summary(updated_record)
        return response

    def end_session(self, session_id: str) -> Dict[str, object]:
        record = self._load_session(session_id)
        if record.status == "in_progress":
            record = self._mark_completed(record, status="completed")
            self._repository.save_session(record)
        summary = self._build_summary(record)
        if record.is_preview:
            self._cleanup_preview(record)
        return summary

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    def _create_question(
        self,
        session: QuizSessionRecord,
        definition: QuizDefinitionRecord,
        existing_questions: List[QuizQuestionRecord],
        *,
        topic_override: Optional[str] = None,
        difficulty_override: Optional[DifficultyLevel] = None,
    ) -> tuple[QuizQuestionRecord, QuizSessionRecord]:
        order = len(existing_questions) + 1
        if session.is_preview:
            order = len(session.asked_question_ids) + 1
        topics = definition.topics or ["General"]
        topic_index = (order - 1) % len(topics)
        topic = topic_override or topics[topic_index]
        difficulty = difficulty_override or session.current_difficulty

        generated: Optional[GeneratedQuestion] = None
        contexts_payload: List[Dict[str, object]] = []
        coverage_reset = False
        session_state = session
        if self._context_retriever and definition.embedding_document_id:
            try:
                contexts, coverage_reset = self._context_retriever.fetch(
                    document_id=definition.embedding_document_id,
                    topic=topic,
                    difficulty=difficulty,
                    limit=self._retriever_top_k,
                    exclude_slide_ids=session.used_slide_ids,
                    total_slide_count=session.total_slide_count,
                    coverage_threshold=self._coverage_threshold,
                    sample_size=self._retriever_sample_size,
                )
                contexts_payload = [
                    {
                        "text": ctx.text,
                        "metadata": ctx.metadata,
                    }
                    for ctx in contexts
                ]
            except Exception:
                logger.warning(
                    "Unable to retrieve slide context for quiz %s (document=%s)",
                    session.quiz_id,
                    definition.embedding_document_id,
                )

        generation_error: Optional[str] = None
        if self._generator is not None:
            try:
                generated = self._generator.generate(
                    topic=topic,
                    difficulty=difficulty,
                    order=order,
                    contexts=contexts_payload if contexts_payload else None,
                )
            except QuizQuestionGenerationError as exc:
                generation_error = str(exc)
                logger.warning(
                    "Quiz question generation failed for quiz %s (topic=%s, difficulty=%s): %s",
                    session.quiz_id,
                    topic,
                    difficulty,
                    exc,
                )
            except Exception as exc:  # pragma: no cover - defensive fallback
                generation_error = "Question generator is temporarily unavailable. Please try again."
                logger.exception(
                    "Unexpected error while generating quiz question for quiz %s (topic=%s)",
                    session.quiz_id,
                    topic,
                )

        if coverage_reset and session_state.used_slide_ids:
            session_state = replace(
                session_state,
                used_slide_ids=[],
                coverage_cycle=session_state.coverage_cycle + 1,
            )

        if generated is None:
            message = generation_error or "Question generator is temporarily unavailable. Please try again."
            raise QuizGenerationError(message)

        question_id = str(uuid.uuid4())
        source_metadata_payload: Dict[str, object] = (
            contexts_payload[0].get("metadata") if contexts_payload else {}
        )
        if generated.source_metadata:
            source_metadata_payload = generated.source_metadata

        prompt = generated.prompt
        choices = generated.choices
        correct_answer = generated.correct_answer
        rationale = generated.rationale
        incorrect_rationales = generated.incorrect_rationales

        record = QuizQuestionRecord(
            quiz_id=session.quiz_id,
            question_id=question_id,
            prompt=prompt,
            choices=choices,
            correct_answer=correct_answer,
            rationale=rationale,
            incorrect_rationales=incorrect_rationales,
            topic=topic,
            difficulty=difficulty,
            order=order,
            generated_at=datetime.now(timezone.utc),
            source_session_id=session.session_id if session.is_preview else None,
            source_document_id=definition.embedding_document_id,
            source_metadata=source_metadata_payload,
        )
        self._repository.save_quiz_question(record)

        slide_id = self._extract_slide_id(record.source_metadata)
        if slide_id:
            used = session_state.used_slide_ids
            if slide_id not in used:
                used = [*used, slide_id]
            session_state = replace(session_state, used_slide_ids=used)

        return record, session_state

    def _extract_total_slide_count(self, metadata: Optional[Dict[str, object]]) -> Optional[int]:
        if not metadata:
            return None
        for key in ("slide_count", "slides_count", "total_slides", "totalSlides", "slides", "numSlides"):
            value = metadata.get(key)
            if value in (None, ""):
                continue
            try:
                parsed = int(value)
                if parsed > 0:
                    return parsed
            except (TypeError, ValueError):
                continue
        return None

    def _extract_slide_id(self, metadata: Optional[Dict[str, object]]) -> Optional[str]:
        if not isinstance(metadata, dict):
            return None
        slide_id = metadata.get("slide_id")
        if slide_id:
            return str(slide_id)
        slide_number = metadata.get("slide_number")
        slide_title = metadata.get("slide_title") or metadata.get("title")
        if slide_number is None and slide_title is None:
            return None
        number_part = f"{slide_number}" if slide_number not in (None, "") else ""
        title_part = str(slide_title).strip() if slide_title else ""
        if number_part and title_part:
            return f"{number_part}:{title_part}"
        if number_part:
            return number_part
        if title_part:
            return title_part
        return None

    def _register_slide_usage(self, record: QuizSessionRecord, question: QuizQuestionRecord) -> QuizSessionRecord:
        slide_id = self._extract_slide_id(question.source_metadata)
        if not slide_id:
            return record
        if slide_id in record.used_slide_ids:
            return record
        return replace(record, used_slide_ids=[*record.used_slide_ids, slide_id])

    def _serve_missed_question_if_ready(
        self,
        record: QuizSessionRecord,
    ) -> tuple[Optional[QuizQuestionRecord], QuizSessionRecord]:
        if not record.missed_question_ids:
            return None, record
        if record.questions_since_review < self._missed_review_gap:
            return None, record

        queue = list(record.missed_question_ids)
        while queue:
            question_id = queue.pop(0)
            question = self._repository.get_quiz_question(question_id, quiz_id=record.quiz_id)
            if question is None:
                record = replace(record, missed_question_ids=queue)
                continue
            question = self._duplicate_question_for_review(question)
            now = datetime.now(timezone.utc)
            preview_question_ids = record.preview_question_ids
            if record.is_preview and question.question_id not in preview_question_ids:
                preview_question_ids = [*preview_question_ids, question.question_id]
            updated_record = replace(
                record,
                missed_question_ids=queue,
                questions_since_review=0,
                asked_question_ids=[*record.asked_question_ids, question.question_id],
                active_question_id=question.question_id,
                active_question_served_at=now,
                preview_question_ids=preview_question_ids,
            )
            self._repository.save_session(updated_record)
            return question, updated_record

        return None, record

    def _adapt_difficulty(
        self,
        current: DifficultyLevel,
        correct_streak: int,
        incorrect_streak: int,
    ) -> DifficultyLevel:
        index = DifficultyRank[current]
        if correct_streak >= self._increase_threshold and index < len(DifficultySequence) - 1:
            return DifficultySequence[index + 1]
        if incorrect_streak >= self._decrease_threshold and index > 0:
            return DifficultySequence[index - 1]
        return current

    def _enforce_time_constraints(self, record: QuizSessionRecord) -> QuizSessionRecord:
        if record.mode != "assessment":
            return record
        if record.status != "in_progress":
            return record
        if record.deadline and datetime.now(timezone.utc) > record.deadline:
            record = self._mark_completed(record, status="timed_out")
            self._repository.save_session(record)
        return record

    def _mark_completed(self, record: QuizSessionRecord, *, status: str) -> QuizSessionRecord:
        return replace(
            record,
            status=status,  # type: ignore[arg-type]
            completed_at=datetime.now(timezone.utc),
            active_question_id=None,
            active_question_served_at=None,
        )

    def _build_summary(self, record: QuizSessionRecord) -> Dict[str, object]:
        total_questions = len(record.attempts)
        correct_answers = sum(1 for attempt in record.attempts if attempt.is_correct)
        accuracy = (correct_answers / total_questions) if total_questions else 0.0
        total_time_ms = sum(attempt.response_ms or 0 for attempt in record.attempts)

        per_topic: Dict[str, Dict[str, int]] = {}
        for attempt in record.attempts:
            question = self._repository.get_quiz_question(
                attempt.question_id,
                quiz_id=record.quiz_id,
            )
            topic = question.topic if question else "general"
            stats = per_topic.setdefault(topic, {"attempted": 0, "correct": 0})
            stats["attempted"] += 1
            if attempt.is_correct:
                stats["correct"] += 1

        return {
            "session_id": record.session_id,
            "quiz_id": record.quiz_id,
            "user_id": record.user_id,
            "mode": record.mode,
            "status": record.status,
            "total_questions": total_questions,
            "correct_answers": correct_answers,
            "accuracy": round(accuracy, 2),
            "topics": per_topic,
            "total_time_ms": total_time_ms,
            "started_at": record.started_at,
            "completed_at": record.completed_at,
        }

    def _cleanup_preview(self, record: QuizSessionRecord) -> None:
        for question_id in record.preview_question_ids:
            self._repository.delete_quiz_question(question_id, quiz_id=record.quiz_id)
        self._repository.delete_session(record.session_id)

    def _duplicate_question_for_review(self, question: QuizQuestionRecord) -> QuizQuestionRecord:
        clone = QuizQuestionRecord(
            quiz_id=question.quiz_id,
            question_id=str(uuid.uuid4()),
            prompt=question.prompt,
            choices=list(question.choices),
            correct_answer=question.correct_answer,
            rationale=question.rationale,
            incorrect_rationales=dict(question.incorrect_rationales),
            topic=question.topic,
            difficulty=question.difficulty,
            order=question.order,
            generated_at=datetime.now(timezone.utc),
            source_session_id=question.source_session_id,
            source_document_id=question.source_document_id,
            source_metadata=dict(question.source_metadata or {}),
        )
        self._repository.save_quiz_question(clone)
        return clone

    def delete_preview_session(self, session_id: str) -> None:
        record = self._load_session(session_id)
        if not record.is_preview:
            raise QuizSessionConflictError("Only preview sessions can be deleted via this endpoint.")
        self._cleanup_preview(record)

    def _load_session(self, session_id: str) -> QuizSessionRecord:
        record = self._repository.load_session(session_id)
        if record is None:
            raise QuizSessionNotFoundError("Quiz session not found.")
        return record

    def _select_repository(self) -> QuizRepository:
        try:
            from clients.database.quiz_repository import FirestoreQuizRepository

            return FirestoreQuizRepository()
        except Exception:  # pragma: no cover - fallback for local dev
            logger.warning("Firestore unavailable; using in-memory quiz repository.")
            return InMemoryQuizRepository()

    def _select_generator(self) -> Optional[QuizQuestionGenerator]:
        try:
            return QuizQuestionGenerator()
        except Exception as exc:  # pragma: no cover - configuration fallback
            logger.warning(
                "Unable to initialise LLM quiz question generator; using static template fallback. Reason: %s",
                exc,
            )
            return None

    def _select_retriever(self) -> Optional[SlideContextRetriever]:
        try:
            settings = get_llm_settings()
            if not settings.google_api_key:
                logger.warning("GOOGLE_API_KEY not configured; slide retrieval disabled.")
                return None
            return SlideContextRetriever(settings)
        except Exception as exc:  # pragma: no cover - configuration fallback
            logger.warning(
                "Unable to initialise slide context retriever; continuing without RAG context. Reason: %s",
                exc,
            )
            return None


_quiz_service: Optional[QuizService] = None


def get_quiz_service() -> QuizService:
    global _quiz_service
    if _quiz_service is None:
        _quiz_service = QuizService()
    return _quiz_service
