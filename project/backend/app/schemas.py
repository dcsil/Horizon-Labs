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
    use_guidance: bool = Field(
        default=False,
        description="When true, request the guidance prompt for this turn (if unlocked)",
    )


class ChatResetRequest(BaseModel):
    session_id: str = Field(..., description="Identifier for the chat session to clear")


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"] = Field(..., description="Speaker of the message")
    content: str = Field(..., description="Human-readable message text")
    created_at: datetime = Field(..., description="Timestamp when the message was recorded")
    turn_classification: Optional[Literal["good", "needs_focusing"]] = Field(
        default=None,
        description="Classifier label assigned to the learner turn",
    )
    classification_rationale: Optional[str] = Field(
        default=None,
        description="Brief justification for the assigned turn classification",
    )
    topic_id: Optional[str] = Field(default=None, description="Identifier for the topic assigned to the turn")
    topic_name: Optional[str] = Field(default=None, description="Human readable topic label")


class ChatHistoryResponse(BaseModel):
    session_id: str = Field(..., description="Chat session identifier")
    messages: List[ChatMessage] = Field(default_factory=list, description="Ordered chat transcript")


class ChatSessionSummary(BaseModel):
    session_id: str = Field(..., description="Unique chat session identifier")
    updated_at: datetime = Field(..., description="When the session was last updated")
    message_count: int = Field(..., ge=0, description="Number of persisted user/assistant messages")


class ChatSessionListResponse(BaseModel):
    sessions: List[ChatSessionSummary] = Field(default_factory=list, description="Available chat sessions")


class MicrocheckOption(BaseModel):
    id: str = Field(..., description="Unique identifier for the answer option")
    text: str = Field(..., description="Display text for the option")


class MicrocheckQuestion(BaseModel):
    question_id: str = Field(..., description="Question identifier")
    prompt: str = Field(..., description="Microcheck question prompt")
    topic_id: Optional[str] = Field(default=None, description="Topic identifier linked to the question")
    topic_name: Optional[str] = Field(default=None, description="Topic label linked to the question")
    options: List[MicrocheckOption] = Field(default_factory=list, description="Available answer options")


class PendingMicrocheckResponse(BaseModel):
    microcheck_id: str = Field(..., description="Identifier for the pending microcheck")
    created_at: datetime = Field(..., description="ISO timestamp when the microcheck was generated")
    questions: List[MicrocheckQuestion] = Field(..., description="Questions to complete")


class MicrocheckSubmitAnswer(BaseModel):
    question_id: str = Field(..., description="Question identifier")
    selected_option_id: str = Field(..., description="Option chosen by the learner")


class MicrocheckSubmitRequest(BaseModel):
    session_id: str = Field(..., description="Session that owns the microcheck")
    microcheck_id: str = Field(..., description="Identifier of the microcheck being submitted")
    answers: List[MicrocheckSubmitAnswer] = Field(..., description="Answers keyed by question id")


class MicrocheckResultDetail(BaseModel):
    question_id: str = Field(..., description="Question identifier")
    selected_option_id: str = Field(..., description="Learner's selected option")
    correct: bool = Field(..., description="Whether the learner answered correctly")
    topic_id: Optional[str] = Field(default=None, description="Topic identifier for the question")
    topic_name: Optional[str] = Field(default=None, description="Topic label for the question")


class MicrocheckMasteryUpdate(BaseModel):
    topic_id: str = Field(..., description="Topic identifier")
    topic_name: str = Field(..., description="Topic label")
    mastery: float = Field(..., ge=0.0, le=1.0, description="Updated mastery score in [0,1]")
    correct: bool = Field(..., description="Whether the learner answered correctly for this topic")


class MicrocheckSubmitResponse(BaseModel):
    microcheck_id: str = Field(..., description="Identifier of the graded microcheck")
    feedback: str = Field(..., description="General feedback message for the learner")
    results: List[MicrocheckResultDetail] = Field(..., description="Per-question grading details")
    mastery_updates: List[MicrocheckMasteryUpdate] = Field(default_factory=list, description="Topic mastery adjustments")


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
