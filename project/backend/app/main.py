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
    ChatHistoryResponse,
    ChatResetRequest,
    ChatSessionListResponse,
    ChatStreamRequest,
    QuizAnswerRequest,
    QuizAnswerResponse,
    QuizDefinitionRequest,
    QuizDefinitionResponse,
    QuizQuestionResponse,
    QuizDifficultyLiteral,
    QuizSessionResponse,
    QuizStartRequest,
    TopicPerformance,
    QuizSummaryResponse,
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
    # Simple uptime probe for orchestrators and frontend checks.
    return {"status": "ok"}


@app.get("/")
def root() -> dict[str, str]:
    """Root endpoint. Returns the same payload as /health so GET / doesn't 404 on platforms
    (Render, Vercel health checks, or browser requests).
    """
    return {"status": "ok"}


@app.head("/health")
def health_head() -> Response:
    """Respond to HEAD probes for /health."""
    return Response(status_code=200)


@app.head("/")
def root_head() -> Response:
    """Respond to HEAD probes for root path."""
    return Response(status_code=200)


@app.post("/chat/stream")
async def chat_stream(
    request: ChatStreamRequest,
    llm_service: LLMService = Depends(get_llm_service),
) -> StreamingResponse:
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
    llm_service.reset_session(request.session_id)
    return {"status": "reset"}


@app.get("/chat/history", response_model=ChatHistoryResponse)
async def chat_history(
    session_id: str = Query(..., description="Session identifier to fetch"),
    llm_service: LLMService = Depends(get_llm_service),
) -> ChatHistoryResponse:
    """Return persisted chat turns for the requested session."""
    history = llm_service.get_chat_history(session_id)
    return ChatHistoryResponse(**history)


@app.get("/chat/sessions", response_model=ChatSessionListResponse)
def chat_sessions(
    llm_service: LLMService = Depends(get_llm_service),
) -> ChatSessionListResponse:
    """Return all known chat sessions."""
    sessions = llm_service.list_sessions()
    return ChatSessionListResponse(sessions=sessions)


@app.get("/debug/friction-state")
def friction_state(
    session_id: str = Query(..., description="Session to inspect"),
    llm_service: LLMService = Depends(get_llm_service),
) -> dict[str, object]:
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
    """Upload a slide deck for ingestion into the vector index."""

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
    try:
        record = quiz_service.get_quiz_definition(quiz_id)
    except QuizDefinitionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return _serialize_quiz_definition(record)


@app.get("/quiz/definitions", response_model=List[QuizDefinitionResponse])
def quiz_list_definitions(
    quiz_service: QuizService = Depends(get_quiz_service),
) -> List[QuizDefinitionResponse]:
    records = quiz_service.list_quiz_definitions()
    return [_serialize_quiz_definition(record) for record in records]


@app.delete("/quiz/definitions/{quiz_id}")
def quiz_delete_definition(
    quiz_id: str,
    quiz_service: QuizService = Depends(get_quiz_service),
) -> dict[str, str]:
    quiz_service.delete_quiz_definition(quiz_id)
    return {"status": "deleted", "quiz_id": quiz_id}


@app.post("/quiz/session/start", response_model=QuizSessionResponse)
def quiz_start_session(
    request: QuizStartRequest,
    quiz_service: QuizService = Depends(get_quiz_service),
) -> QuizSessionResponse:
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
    try:
        summary = quiz_service.end_session(session_id)
    except QuizSessionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    return _serialize_quiz_summary(summary)


@app.delete("/quiz/session/{session_id}")
def quiz_delete_session(
    session_id: str,
    quiz_service: QuizService = Depends(get_quiz_service),
) -> dict[str, str]:
    try:
        quiz_service.delete_preview_session(session_id)
    except QuizSessionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except QuizSessionConflictError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"status": "deleted", "session_id": session_id}


def _serialize_quiz_definition(record) -> QuizDefinitionResponse:
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
        started_at=summary.get("started_at"),
        completed_at=summary.get("completed_at"),
    )
