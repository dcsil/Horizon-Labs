"""FastAPI application that exposes chat and quiz APIs backed by LLMService and QuizService.
Handles chat streaming, document ingestion, quiz lifecycle management, and analytics with
FastAPI routing, CORS middleware, and optional lightweight telemetry hooks."""

from __future__ import annotations

import json
from typing import AsyncGenerator, Dict, List

import logging

from fastapi import Depends, FastAPI, HTTPException, UploadFile, File, Form, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, Response

from clients.llm import LLMService, get_llm_service
from clients.llm.settings import get_settings
from clients.quiz import (
    QuizDefinitionNotFoundError,
    QuizGenerationError,
    QuizQuestionNotFoundError,
    QuizService,
    QuizSessionClosedError,
    QuizSessionConflictError,
    QuizSessionNotFoundError,
    get_quiz_service,
)

from .schemas import (
    ChatAnalyticsResponse,
    ChatHistoryResponse,
    ChatResetRequest,
    ChatSessionListResponse,
    ChatStreamRequest,
    QuizAnalyticsResponse,
    QuizAnswerRequest,
    QuizAnswerResponse,
    QuizDefinitionRequest,
    QuizDefinitionResponse,
    QuizDifficultyLiteral,
    QuizQuestionResponse,
    QuizAttemptReviewResponse,
    QuizSessionHistoryItem,
    QuizSessionHistoryResponse,
    QuizSessionResponse,
    QuizSessionReviewResponse,
    QuizStartRequest,
    QuizSummaryResponse,
    TopicPerformance,
)

# Set up logging early so LLMService can use it during initialization.
_TELEMETRY_ENABLED = False

try:
    _TELEMETRY_ENABLED = get_settings().telemetry_enabled
except RuntimeError:
    # Settings may fail to load during startup before env vars are ready; defer logging setup.
    _TELEMETRY_ENABLED = False

if _TELEMETRY_ENABLED:
    if not logging.getLogger().handlers:
        logging.basicConfig(
            level=logging.INFO,
            format="%(asctime)s %(name)s %(levelname)s %(message)s",
        )

    logging.getLogger("telemetry").setLevel(logging.INFO)

# FastAPI app and CORS setup
app = FastAPI(title="Horizon Labs Chat API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Try to mount a lightweight ping app if it exists in the backend directory. This
# keeps the /ping warmup endpoint separate from the heavy LLM startup and is
# optional — if the module isn't present we just log and continue.
try:
    import ping_app  # type: ignore

    app.mount("/ping", ping_app.app)
    logging.getLogger("uvicorn.error").info("Mounted lightweight ping_app at /ping")
except Exception as exc:  # pragma: no cover - optional runtime component
    logging.getLogger("uvicorn.error").info("ping_app not mounted: %s", exc)


@app.get("/health")
def healthcheck() -> dict[str, str]:
    """Simple uptime probe for orchestrators and frontend checks."""
    return {"status": "ok"}


@app.get("/")
def root() -> dict[str, str]:
    """Mirror of /health for platform health checks and browser probes."""
    return {"status": "ok"}


@app.head("/health")
def health_head() -> Response:
    """Respond to HEAD probes for /health without a body payload."""
    return Response(status_code=200)


@app.head("/")
def root_head() -> Response:
    """Respond to HEAD probes for root path without a body payload."""
    return Response(status_code=200)


@app.post("/chat/stream")
async def chat_stream(
    request: ChatStreamRequest,
    llm_service: LLMService = Depends(get_llm_service),
) -> StreamingResponse:
    """Stream chat responses from LLMService via SSE for a given session/message payload."""
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="message cannot be empty")

    async def event_generator() -> AsyncGenerator[str, None]:
        try:
            async for chunk in llm_service.stream_chat(
                session_id=request.session_id,
                question=request.message,
                context=request.context,
                metadata=request.metadata,
                use_guidance=request.use_guidance,
            ):
                payload = json.dumps({"type": "token", "data": chunk})
                yield f"data: {payload}\n\n"
        except Exception as exc:  # pragma: no cover - safety net for streaming
            error_payload = json.dumps({"type": "error", "message": str(exc)})
            yield f"event: error\ndata: {error_payload}\n\n"
        finally:
            yield "event: end\ndata: {}\n\n"

    headers = {
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        "Connection": "keep-alive",
    }

    return StreamingResponse(event_generator(), media_type="text/event-stream", headers=headers)


@app.post("/chat/reset")
async def chat_reset(
    request: ChatResetRequest,
    llm_service: LLMService = Depends(get_llm_service),
) -> dict[str, str]:
    """Clear stored chat state for a session using LLMService."""
    llm_service.reset_session(request.session_id)
    return {"status": "reset"}


@app.get("/chat/history", response_model=ChatHistoryResponse)
async def chat_history(
    session_id: str = Query(..., description="Session identifier to fetch"),
    llm_service: LLMService = Depends(get_llm_service),
) -> ChatHistoryResponse:
    """Return persisted chat turns for the requested session from LLMService."""
    history = llm_service.get_chat_history(session_id)
    return ChatHistoryResponse(**history)


@app.get("/chat/sessions", response_model=ChatSessionListResponse)
def chat_sessions(
    llm_service: LLMService = Depends(get_llm_service),
) -> ChatSessionListResponse:
    """List all chat sessions known to LLMService."""
    sessions = llm_service.list_sessions()
    return ChatSessionListResponse(sessions=sessions)


@app.get("/analytics/chats", response_model=ChatAnalyticsResponse)
def get_chat_analytics(
    quiz_id: str | None = Query(default=None),
    user_id: str | None = Query(default=None),
    llm_service: LLMService = Depends(get_llm_service),
) -> ChatAnalyticsResponse:
    """Aggregate chat usage analytics from LLMService, optionally scoped by quiz/user."""
    data = llm_service.get_analytics(quiz_id=quiz_id, user_id=user_id)
    return ChatAnalyticsResponse(**data)


@app.get("/analytics/quizzes", response_model=QuizAnalyticsResponse)
def get_quiz_analytics(
    quiz_id: str | None = Query(default=None),
    user_id: str | None = Query(default=None),
    quiz_service: QuizService = Depends(get_quiz_service),
) -> QuizAnalyticsResponse:
    """Return quiz analytics from QuizService, filtered by quiz or learner when provided."""
    data = quiz_service.get_quiz_analytics(quiz_id=quiz_id, user_id=user_id)
    return QuizAnalyticsResponse(**data)


@app.get("/debug/friction-state")
def friction_state(
    session_id: str = Query(..., description="Session to inspect"),
    llm_service: LLMService = Depends(get_llm_service),
) -> dict[str, object]:
    """Expose internal LLMService session state for debugging friction cases."""
    state = llm_service.get_session_state(session_id)
    return {"session_id": session_id, **state}


@app.post("/ingest/upload")
async def ingest_upload(
    *,
    session_id: str = Form(..., description="Chat session to associate with the upload"),
    file: UploadFile = File(..., description="Document to ingest"),
    metadata: str | None = Form(None, description="Optional JSON metadata for the document"),
    llm_service: LLMService = Depends(get_llm_service),
) -> dict[str, object]:
    """Upload a document for LLMService ingestion into the vector index for chat grounding."""

    metadata_dict = None
    if metadata:
        try:
            metadata_dict = json.loads(metadata)
        except json.JSONDecodeError as exc:  # pragma: no cover - pending full implementation
            raise HTTPException(status_code=400, detail=f"Invalid metadata JSON: {exc}")

    file_bytes = await file.read()

    try:
        result = await llm_service.ingest_upload(
            session_id=session_id,
            file_bytes=file_bytes,
            filename=file.filename or "upload.bin",
            metadata=metadata_dict,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    return {
        "status": "indexed",
        "document_id": result.document_id,
        "slide_count": result.slide_count,
        "chunk_count": result.chunk_count,
        "namespace": result.namespace,
    }


@app.delete("/ingest/document/{document_id}")
async def ingest_delete_document(
    document_id: str,
    llm_service: LLMService = Depends(get_llm_service),
) -> dict[str, str]:
    """Delete an ingested document from the vector index via LLMService."""
    try:
        await llm_service.delete_document(document_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    return {"status": "deleted", "document_id": document_id}


@app.post("/quiz/definitions", response_model=QuizDefinitionResponse)
def quiz_upsert_definition(
    request: QuizDefinitionRequest,
    quiz_service: QuizService = Depends(get_quiz_service),
) -> QuizDefinitionResponse:
    """Create or update a quiz definition in QuizService, validating generation inputs."""
    try:
        record = quiz_service.upsert_quiz_definition(
            quiz_id=request.quiz_id,
            name=request.name,
            topics=request.topics,
            default_mode=request.default_mode,
            initial_difficulty=request.initial_difficulty,
            assessment_num_questions=request.assessment_num_questions,
            assessment_time_limit_minutes=request.assessment_time_limit_minutes,
            assessment_max_attempts=request.assessment_max_attempts,
            embedding_document_id=request.embedding_document_id,
            source_filename=request.source_filename,
            is_published=request.is_published,
            metadata=request.metadata,
        )
    except QuizGenerationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return _serialize_quiz_definition(record)


@app.get("/quiz/definitions/{quiz_id}", response_model=QuizDefinitionResponse)
def quiz_get_definition(
    quiz_id: str,
    quiz_service: QuizService = Depends(get_quiz_service),
) -> QuizDefinitionResponse:
    """Fetch a single quiz definition by id from QuizService."""
    try:
        record = quiz_service.get_quiz_definition(quiz_id)
    except QuizDefinitionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return _serialize_quiz_definition(record)


@app.get("/quiz/definitions", response_model=List[QuizDefinitionResponse])
def quiz_list_definitions(
    quiz_service: QuizService = Depends(get_quiz_service),
) -> List[QuizDefinitionResponse]:
    """List all quiz definitions available in QuizService."""
    records = quiz_service.list_quiz_definitions()
    return [_serialize_quiz_definition(record) for record in records]


@app.get("/quiz/definitions/{quiz_id}/sessions", response_model=QuizSessionHistoryResponse)
def quiz_list_sessions(
    quiz_id: str,
    user_id: str = Query(..., description="Learner identifier to scope sessions"),
    limit: int = Query(10, ge=1, le=100, description="Maximum number of sessions to return"),
    quiz_service: QuizService = Depends(get_quiz_service),
) -> QuizSessionHistoryResponse:
    """Return recent session summaries for a learner and quiz id from QuizService."""
    summaries = quiz_service.list_session_history(quiz_id=quiz_id, user_id=user_id, limit=limit)
    items = [_serialize_history_item(summary) for summary in summaries]
    return QuizSessionHistoryResponse(sessions=items)


@app.delete("/quiz/definitions/{quiz_id}")
async def quiz_delete_definition(
    quiz_id: str,
    quiz_service: QuizService = Depends(get_quiz_service),
    llm_service: LLMService = Depends(get_llm_service),
) -> dict[str, str]:
    """Delete a quiz definition and its associated embedding document if present."""
    try:
        definition = quiz_service.get_quiz_definition(quiz_id)
    except QuizDefinitionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    embedding_document_id = definition.embedding_document_id
    quiz_service.delete_quiz_definition(quiz_id)

    if embedding_document_id:
        try:
            await llm_service.delete_document(embedding_document_id)
        except Exception as exc:  # pragma: no cover - defensive logging
            logging.getLogger("uvicorn.error").warning(
                "Unable to delete embedding document %s for quiz %s: %s",
                embedding_document_id,
                quiz_id,
                exc,
            )

    return {"status": "deleted", "quiz_id": quiz_id}


@app.post("/quiz/session/start", response_model=QuizSessionResponse)
def quiz_start_session(
    request: QuizStartRequest,
    quiz_service: QuizService = Depends(get_quiz_service),
) -> QuizSessionResponse:
    """Start a quiz session for a learner using QuizService with optional preview mode."""
    try:
        record = quiz_service.start_session(
            session_id=request.session_id,
            quiz_id=request.quiz_id,
            user_id=request.user_id,
            mode=request.mode,
            initial_difficulty=request.initial_difficulty,
            is_preview=request.is_preview,
        )
    except QuizDefinitionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except QuizGenerationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except QuizSessionConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    return _serialize_quiz_session(record)


@app.get("/quiz/session/{session_id}/next", response_model=QuizQuestionResponse)
def quiz_next_question(
    session_id: str,
    topic: str | None = Query(default=None, description="Optional topic override for the next question"),
    difficulty: QuizDifficultyLiteral | None = Query(
        default=None,
        description="Optional difficulty override for the next question",
    ),
    quiz_service: QuizService = Depends(get_quiz_service),
) -> QuizQuestionResponse:
    """Serve the next quiz question from QuizService, allowing topic/difficulty overrides."""
    try:
        question = quiz_service.get_next_question(
            session_id,
            topic_override=topic,
            difficulty_override=difficulty,
        )
    except QuizSessionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except QuizSessionClosedError as exc:
        raise HTTPException(status_code=410, detail=str(exc))
    except QuizGenerationError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    return QuizQuestionResponse(
        session_id=session_id,
        question_id=question.question_id,
        prompt=question.prompt,
        choices=question.choices,
        topic=question.topic,
        difficulty=question.difficulty,
        order=question.order,
        source_metadata=question.source_metadata or None,
    )


@app.post("/quiz/session/{session_id}/answer", response_model=QuizAnswerResponse)
def quiz_submit_answer(
    session_id: str,
    request: QuizAnswerRequest,
    quiz_service: QuizService = Depends(get_quiz_service),
) -> QuizAnswerResponse:
    """Submit an answer to QuizService and return correctness plus optional session summary."""
    try:
        outcome = quiz_service.submit_answer(
            session_id=session_id,
            question_id=request.question_id,
            selected_answer=request.selected_answer,
        )
    except QuizSessionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except QuizSessionClosedError as exc:
        raise HTTPException(status_code=410, detail=str(exc))
    except QuizQuestionNotFoundError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    summary_payload = outcome.get("summary")
    summary = _serialize_quiz_summary(summary_payload) if summary_payload else None
    return QuizAnswerResponse(
        question_id=str(outcome["question_id"]),
        is_correct=bool(outcome["is_correct"]),
        selected_answer=str(outcome["selected_answer"]),
        correct_answer=str(outcome["correct_answer"]),
        rationale=str(outcome["rationale"]),
        correct_rationale=str(outcome["correct_rationale"]),
        incorrect_rationales=dict(outcome["incorrect_rationales"]),
        topic=str(outcome["topic"]),
        difficulty=str(outcome["difficulty"]),
        current_difficulty=str(outcome["current_difficulty"]),
        session_completed=bool(outcome["session_completed"]),
        response_ms=outcome.get("response_ms"),
        summary=summary,
    )


@app.post("/quiz/session/{session_id}/end", response_model=QuizSummaryResponse)
def quiz_end_session(
    session_id: str,
    quiz_service: QuizService = Depends(get_quiz_service),
) -> QuizSummaryResponse:
    """Force-complete a quiz session and return aggregated performance metrics."""
    try:
        summary = quiz_service.end_session(session_id)
    except QuizSessionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    return _serialize_quiz_summary(summary)


@app.get("/quiz/session/{session_id}", response_model=QuizSessionReviewResponse)
def quiz_get_session(
    session_id: str,
    user_id: str = Query(..., description="Learner identifier requesting the review"),
    quiz_service: QuizService = Depends(get_quiz_service),
) -> QuizSessionReviewResponse:
    """Return a completed session review with attempts for the requesting learner."""
    try:
        result = quiz_service.get_session_review(session_id, user_id=user_id)
    except QuizSessionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except QuizSessionConflictError as exc:
        raise HTTPException(status_code=403, detail=str(exc))

    summary = _serialize_quiz_summary(result["summary"])
    attempts = [_serialize_attempt_detail(payload) for payload in result.get("attempts", [])]
    return QuizSessionReviewResponse(summary=summary, attempts=attempts)


@app.delete("/quiz/session/{session_id}")
def quiz_delete_session(
    session_id: str,
    user_id: str | None = Query(
        default=None,
        description="Provide a learner identifier to delete a completed session; omit for preview sessions.",
    ),
    quiz_service: QuizService = Depends(get_quiz_service),
) -> dict[str, str]:
    """Delete a quiz session; uses learner id for completed sessions or preview deletion otherwise."""
    try:
        if user_id:
            quiz_service.delete_session_record(session_id, user_id=user_id)
        else:
            quiz_service.delete_preview_session(session_id)
    except QuizSessionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except QuizSessionConflictError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    return {"status": "deleted", "session_id": session_id}


def _serialize_quiz_definition(record) -> QuizDefinitionResponse:
    """Map QuizService definition model to API response schema."""
    return QuizDefinitionResponse(
        quiz_id=record.quiz_id,
        name=record.name,
        topics=record.topics,
        default_mode=record.default_mode,
        initial_difficulty=record.initial_difficulty,
        assessment_num_questions=record.assessment_num_questions,
        assessment_time_limit_minutes=record.assessment_time_limit_minutes,
        assessment_max_attempts=record.assessment_max_attempts,
        embedding_document_id=record.embedding_document_id,
        source_filename=record.source_filename,
        is_published=record.is_published,
        metadata=record.metadata or None,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


def _serialize_quiz_session(record) -> QuizSessionResponse:
    """Map QuizService session model to API response schema."""
    return QuizSessionResponse(
        session_id=record.session_id,
        quiz_id=record.quiz_id,
        user_id=record.user_id,
        mode=record.mode,
        status=record.status,
        topics=record.topics,
        current_difficulty=record.current_difficulty,
        questions_answered=len(record.attempts),
        started_at=record.started_at,
        completed_at=record.completed_at,
        deadline=record.deadline,
    )


def _serialize_quiz_summary(summary: Dict[str, object]) -> QuizSummaryResponse:
    """Normalize summary payloads from QuizService into the public response model."""
    topics_payload = {
        topic: TopicPerformance(**metrics)
        for topic, metrics in (summary.get("topics", {}) or {}).items()
    }

    return QuizSummaryResponse(
        session_id=str(summary.get("session_id")),
        quiz_id=str(summary.get("quiz_id")),
        user_id=str(summary.get("user_id")),
        mode=str(summary.get("mode")),
        status=str(summary.get("status")),
        total_questions=int(summary.get("total_questions", 0)),
        correct_answers=int(summary.get("correct_answers", 0)),
        accuracy=float(summary.get("accuracy", 0.0)),
        topics=topics_payload,
        total_time_ms=int(summary.get("total_time_ms", 0)),
        average_response_ms=summary.get("average_response_ms"),
        duration_ms=summary.get("duration_ms"),
        max_correct_streak=int(summary.get("max_correct_streak", 0)),
        max_incorrect_streak=int(summary.get("max_incorrect_streak", 0)),
        started_at=summary.get("started_at"),
        completed_at=summary.get("completed_at"),
    )


def _serialize_history_item(summary: Dict[str, object]) -> QuizSessionHistoryItem:
    """Transform a stored session summary dict into a history list item."""
    return QuizSessionHistoryItem(
        session_id=str(summary.get("session_id")),
        quiz_id=str(summary.get("quiz_id")),
        user_id=str(summary.get("user_id")),
        mode=str(summary.get("mode")),
        status=str(summary.get("status")),
        total_questions=int(summary.get("total_questions", 0)),
        correct_answers=int(summary.get("correct_answers", 0)),
        accuracy=float(summary.get("accuracy", 0.0)),
        duration_ms=summary.get("duration_ms"),
        max_correct_streak=int(summary.get("max_correct_streak", 0)),
        started_at=summary.get("started_at"),
        completed_at=summary.get("completed_at"),
    )


def _serialize_attempt_detail(payload: Dict[str, object]) -> QuizAttemptReviewResponse:
    """Shape a raw attempt payload from QuizService into the review response schema."""
    return QuizAttemptReviewResponse(
        question_id=str(payload.get("question_id")),
        prompt=str(payload.get("prompt", "")),
        choices=list(payload.get("choices", []) or []),
        topic=str(payload.get("topic", "")),
        difficulty=str(payload.get("difficulty", "medium")),  # type: ignore[arg-type]
        selected_answer=str(payload.get("selected_answer", "")),
        correct_answer=str(payload.get("correct_answer", "")),
        is_correct=bool(payload.get("is_correct", False)),
        rationale=payload.get("rationale"),
        correct_rationale=str(payload.get("correct_rationale", "")),
        incorrect_rationales=dict(payload.get("incorrect_rationales", {}) or {}),
        source_metadata=payload.get("source_metadata"),
        submitted_at=payload.get("submitted_at"),
        response_ms=payload.get("response_ms"),
    )
