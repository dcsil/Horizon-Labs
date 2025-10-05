from __future__ import annotations

import json
from typing import AsyncGenerator

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from llm import LLMService, get_llm_service

from .schemas import ChatResetRequest, ChatStreamRequest

app = FastAPI(title="Horizon Labs Chat API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
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
