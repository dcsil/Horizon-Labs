from __future__ import annotations

import json
from typing import AsyncGenerator

import logging

from fastapi import Depends, FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from llm import LLMService, get_llm_service
from llm.settings import get_settings

from .schemas import ChatResetRequest, ChatStreamRequest, QuizStreamRequest

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


@app.get("/health")
def healthcheck() -> dict[str, str]:
    # Simple uptime probe for orchestrators and frontend checks.
    return {"status": "ok"}


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


@app.post("/ingest/upload")
async def ingest_upload(
    *,
    session_id: str = Form(..., description="Chat session to associate with the upload"),
    file: UploadFile = File(..., description="Document to ingest"),
    metadata: str | None = Form(None, description="Optional JSON metadata for the document"),
    llm_service: LLMService = Depends(get_llm_service),
) -> dict[str, str]:
    """Skeleton endpoint for document ingestion.

    The actual pipeline (parsing, chunking, vector store upsert, etc.) still needs to be provided.
    """

    metadata_dict = None
    if metadata:
        try:
            metadata_dict = json.loads(metadata)
        except json.JSONDecodeError as exc:  # pragma: no cover - pending full implementation
            raise HTTPException(status_code=400, detail=f"Invalid metadata JSON: {exc}")

    file_bytes = await file.read()

    try:
        await llm_service.ingest_upload(
            session_id=session_id,
            file_bytes=file_bytes,
            filename=file.filename or "upload.bin",
            metadata=metadata_dict,
        )
    except NotImplementedError:
        raise HTTPException(status_code=501, detail="Document ingestion not yet implemented")

    return {"status": "accepted"}


@app.post("/quiz/stream")
async def quiz_stream(
    request: QuizStreamRequest,
    llm_service: LLMService = Depends(get_llm_service),
) -> StreamingResponse:
    """Skeleton SSE endpoint for quiz generation."""

    async def event_generator() -> AsyncGenerator[str, None]:
        try:
            async for chunk in llm_service.quiz_stream(
                session_id=request.session_id,
                topic=request.topic,
                difficulty=request.difficulty,
                num_questions=request.num_questions,
            ):
                payload = json.dumps({"type": "token", "data": chunk})
                yield f"data: {payload}\n\n"
        except NotImplementedError:
            error_payload = json.dumps(
                {
                    "type": "error",
                    "message": "Quiz streaming not yet implemented",
                }
            )
            yield f"event: error\ndata: {error_payload}\n\n"
        finally:
            yield "event: end\ndata: {}\n\n"

    headers = {
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        "Connection": "keep-alive",
    }

    return StreamingResponse(event_generator(), media_type="text/event-stream", headers=headers)
