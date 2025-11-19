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


QuizModeLiteral = Literal["assessment", "practice"]
QuizDifficultyLiteral = Literal["easy", "medium", "hard"]
QuizStatusLiteral = Literal["in_progress", "completed", "timed_out"]


class QuizDefinitionRequest(BaseModel):
    quiz_id: Optional[str] = Field(
        default=None,
        description="Stable identifier for the quiz. Leave blank to auto-generate a new quiz.",
    )
    name: Optional[str] = Field(default=None, description="Human-friendly quiz name")
    topics: List[str] = Field(..., description="Topics or tags drawn from the source material")
    default_mode: QuizModeLiteral = Field(..., description="Default mode learners will use when starting sessions")
    initial_difficulty: QuizDifficultyLiteral = Field(
        default="medium",
        description="Difficulty level to seed new sessions",
    )
    assessment_num_questions: Optional[int] = Field(
        default=None,
        ge=1,
        le=200,
        description="Total questions served when running in assessment mode",
    )
    assessment_time_limit_minutes: Optional[int] = Field(
        default=None,
        ge=1,
        le=480,
        description="Time limit applied to assessment sessions (minutes)",
    )
    assessment_max_attempts: Optional[int] = Field(
        default=None,
        ge=1,
        le=500,
        description="Maximum attempts permitted during assessment sessions",
    )
    embedding_document_id: Optional[str] = Field(
        default=None,
        description="Identifier of the ingested document backing this quiz",
    )
    source_filename: Optional[str] = Field(
        default=None,
        description="Original filename for the uploaded material",
    )
    is_published: bool = Field(
        default=False,
        description="Whether this quiz is published and visible to learners",
    )
    metadata: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Additional configuration metadata specific to the quiz builder",
    )


class QuizDefinitionResponse(BaseModel):
    quiz_id: str
    name: Optional[str]
    topics: List[str]
    default_mode: QuizModeLiteral
    initial_difficulty: QuizDifficultyLiteral
    assessment_num_questions: Optional[int]
    assessment_time_limit_minutes: Optional[int]
    assessment_max_attempts: Optional[int]
    embedding_document_id: Optional[str]
    source_filename: Optional[str]
    is_published: bool
    metadata: Optional[Dict[str, Any]]
    created_at: datetime
    updated_at: datetime


class QuizStartRequest(BaseModel):
    session_id: str = Field(..., description="Unique identifier for the learner session")
    quiz_id: str = Field(..., description="Quiz definition to attach this session to")
    user_id: str = Field(..., description="Learner identifier")
    mode: Optional[QuizModeLiteral] = Field(
        default=None,
        description="Optional override of the default mode",
    )
    initial_difficulty: Optional[QuizDifficultyLiteral] = Field(
        default=None,
        description="Optional override of the default starting difficulty",
    )
    is_preview: bool = Field(
        default=False,
        description="Flag preview sessions that should be purged when finished",
    )


class QuizSessionResponse(BaseModel):
    session_id: str
    quiz_id: str
    user_id: str
    mode: QuizModeLiteral
    status: QuizStatusLiteral
    topics: List[str]
    current_difficulty: QuizDifficultyLiteral
    questions_answered: int
    started_at: datetime
    completed_at: Optional[datetime]
    deadline: Optional[datetime]


class QuizQuestionResponse(BaseModel):
    session_id: str
    question_id: str
    prompt: str
    choices: List[str]
    topic: str
    difficulty: QuizDifficultyLiteral
    order: int
    source_metadata: Optional[Dict[str, Any]] = None


class QuizAnswerRequest(BaseModel):
    question_id: str = Field(..., description="Question the learner is answering")
    selected_answer: str = Field(..., description="Learner's selected response")


class TopicPerformance(BaseModel):
    attempted: int = Field(..., ge=0)
    correct: int = Field(..., ge=0)


class QuizSummaryResponse(BaseModel):
    session_id: str
    quiz_id: str
    user_id: str
    mode: QuizModeLiteral
    status: QuizStatusLiteral
    total_questions: int
    correct_answers: int
    accuracy: float
    topics: Dict[str, TopicPerformance]
    total_time_ms: int
    average_response_ms: Optional[int]
    duration_ms: Optional[int]
    max_correct_streak: int
    max_incorrect_streak: int
    started_at: datetime
    completed_at: Optional[datetime]


class QuizAnswerResponse(BaseModel):
    question_id: str
    is_correct: bool
    selected_answer: str
    correct_answer: str
    rationale: str
    correct_rationale: str
    incorrect_rationales: Dict[str, str]
    topic: str
    difficulty: QuizDifficultyLiteral
    current_difficulty: QuizDifficultyLiteral
    session_completed: bool
    response_ms: Optional[int]
    summary: Optional[QuizSummaryResponse] = None


class ChatClassificationTotals(BaseModel):
    good: int = Field(..., ge=0, description="Count of learner turns labelled 'good'")
    needs_focusing: int = Field(..., ge=0, description="Count of learner turns labelled 'needs_focusing'")


class ChatTrendPoint(BaseModel):
    date: str = Field(..., description="UTC date bucket in YYYY-MM-DD format")
    good: int = Field(..., ge=0, description="Number of good turns on this date")
    needs_focusing: int = Field(..., ge=0, description="Number of needs_focusing turns on this date")
    total: int = Field(..., ge=0, description="Total classified turns on this date")


class ChatSessionAnalytics(BaseModel):
    session_id: str = Field(..., description="Unique chat session identifier")
    turns: int = Field(..., ge=0, description="Total messages in the session")
    classified_turns: int = Field(..., ge=0, description="Learner turns with classifier output")
    good_turns: int = Field(..., ge=0, description="Learner turns classified as good")
    needs_focusing_turns: int = Field(..., ge=0, description="Learner turns classified as needs focusing")
    last_activity_at: datetime = Field(..., description="Timestamp of the most recent persisted update")


class ChatAnalyticsResponse(BaseModel):
    session_count: int = Field(..., ge=0, description="Number of chat sessions considered")
    total_messages: int = Field(..., ge=0, description="Total persisted chat messages across sessions")
    classified_turns: int = Field(..., ge=0, description="Total learner turns with a classification")
    totals: ChatClassificationTotals = Field(..., description="Aggregate classification counts")
    daily_trend: List[ChatTrendPoint] = Field(..., description="Per-day trend of learner classifications")
    sessions: List[ChatSessionAnalytics] = Field(..., description="Per-session analytics breakdown")
    average_turns_per_session: float = Field(..., ge=0, description="Average message count per session")
    classification_rate: float = Field(..., ge=0, description="Fraction of messages that are classified learner turns")


class QuizTopicInsight(BaseModel):
    topic: str = Field(..., description="Topic name")
    attempted: int = Field(..., ge=0, description="Number of attempts for this topic")
    correct: int = Field(..., ge=0, description="Number of correct answers for this topic")
    accuracy: float = Field(..., ge=0, description="Ratio of correct answers to attempts")


class QuizAnalyticsSummary(BaseModel):
    quiz_id: str = Field(..., description="Quiz identifier")
    name: Optional[str] = Field(default=None, description="Human-friendly quiz name")
    total_sessions: int = Field(..., ge=0, description="Total learner sessions for this quiz")
    completed_sessions: int = Field(..., ge=0, description="Sessions completed by learners")
    in_progress_sessions: int = Field(..., ge=0, description="Sessions still in progress")
    unique_learners: int = Field(..., ge=0, description="Unique learners who have attempted the quiz")
    average_accuracy: float = Field(..., ge=0, description="Average accuracy across sessions")
    average_questions: float = Field(..., ge=0, description="Average number of questions per session")
    average_response_ms: int = Field(..., ge=0, description="Average response time in milliseconds")
    last_session_at: Optional[datetime] = Field(default=None, description="Timestamp of the latest session activity")
    topics: List[QuizTopicInsight] = Field(default_factory=list, description="Topic performance for this quiz")


class QuizAnalyticsResponse(BaseModel):
    total_sessions: int = Field(..., ge=0, description="Total learner quiz sessions considered")
    unique_learners: int = Field(..., ge=0, description="Unique learners across all quizzes")
    average_accuracy: float = Field(..., ge=0, description="Average accuracy across all sessions")
    average_questions: float = Field(..., ge=0, description="Average questions attempted per session")
    average_response_ms: int = Field(..., ge=0, description="Average response time across sessions")
    quizzes: List[QuizAnalyticsSummary] = Field(default_factory=list, description="Per-quiz analytics summaries")
    overall_topics: List[QuizTopicInsight] = Field(default_factory=list, description="Topic-level performance across all quizzes")
class QuizSessionHistoryItem(BaseModel):
    session_id: str
    quiz_id: str
    user_id: str
    mode: QuizModeLiteral
    status: QuizStatusLiteral
    total_questions: int
    correct_answers: int
    accuracy: float
    duration_ms: Optional[int]
    max_correct_streak: int
    started_at: datetime
    completed_at: Optional[datetime]


class QuizSessionHistoryResponse(BaseModel):
    sessions: List[QuizSessionHistoryItem]


class QuizAttemptReviewResponse(BaseModel):
    question_id: str
    prompt: str
    choices: List[str]
    topic: str
    difficulty: QuizDifficultyLiteral
    selected_answer: str
    correct_answer: str
    is_correct: bool
    rationale: Optional[str]
    correct_rationale: Optional[str]
    incorrect_rationales: Dict[str, str]
    source_metadata: Optional[Dict[str, Any]]
    submitted_at: datetime
    response_ms: Optional[int]


class QuizSessionReviewResponse(BaseModel):
    summary: QuizSummaryResponse
    attempts: List[QuizAttemptReviewResponse]
