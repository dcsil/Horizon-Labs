from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class ChatStreamRequest(BaseModel):
    session_id: str = Field(..., description="Identifier for the chat session")
    message: str = Field(..., description="User's chat prompt")
    context: Optional[str] = Field(
        default=None, description="Optional context to ground the response"
    )
    metadata: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Arbitrary key-value pairs forwarded to the prompt",
    )


class ChatResetRequest(BaseModel):
    session_id: str = Field(..., description="Identifier for the chat session to clear")


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"] = Field(..., description="Speaker of the message")
    content: str = Field(..., description="Human-readable message text")
    created_at: datetime = Field(..., description="Timestamp when the message was recorded")


class ChatHistoryResponse(BaseModel):
    session_id: str = Field(..., description="Chat session identifier")
    messages: List[ChatMessage] = Field(default_factory=list, description="Ordered chat transcript")


class ChatSessionSummary(BaseModel):
    session_id: str = Field(..., description="Unique chat session identifier")
    updated_at: datetime = Field(..., description="When the session was last updated")
    message_count: int = Field(..., ge=0, description="Number of persisted user/assistant messages")


class ChatSessionListResponse(BaseModel):
    sessions: List[ChatSessionSummary] = Field(default_factory=list, description="Available chat sessions")


class QuizStreamRequest(BaseModel):
    session_id: str = Field(..., description="Identifier for the chat session")
    topic: str = Field(..., description="Subject area the quiz should cover")
    difficulty: Optional[str] = Field(
        default=None,
        description="Optional difficulty hint for the quiz generator",
    )
    num_questions: int = Field(
        default=5,
        ge=1,
        le=20,
        description="Number of questions to request from the generator",
    )
