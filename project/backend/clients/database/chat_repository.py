from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, Iterable, List, Literal, Optional, Protocol

try:  # pragma: no cover - optional dependency
    from google.cloud import firestore  # type: ignore[import]
except Exception:  # pragma: no cover - optional dependency missing
    firestore = None  # type: ignore[assignment]

from .firebase import get_firestore

ChatRole = Literal["human", "ai", "system"]


@dataclass(frozen=True)
class ChatMessageRecord:
    """Serializable representation of an individual turn in a chat session."""

    role: ChatRole
    content: str
    created_at: datetime
    display_content: Optional[str] = None
    turn_classification: Optional[str] = None  # "good" | "needs_focusing"
    classification_rationale: Optional[str] = None
    classification_source: Optional[str] = None  # "model" | "heuristic"
    classification_raw: Optional[str] = None
    topic_id: Optional[str] = None

    def to_dict(self) -> Dict[str, str]:
        payload = {
            "role": self.role,
            "content": self.content,
            "created_at": self.created_at.isoformat(),
        }
        if self.display_content is not None:
            payload["display_content"] = self.display_content
        if self.turn_classification is not None:
            payload["turn_classification"] = self.turn_classification
        if self.classification_rationale is not None:
            payload["classification_rationale"] = self.classification_rationale
        if self.classification_source is not None:
            payload["classification_source"] = self.classification_source
        if self.classification_raw is not None:
            payload["classification_raw"] = self.classification_raw
        if self.topic_id is not None:
            payload["topic_id"] = self.topic_id
        return payload

    @staticmethod
    def from_dict(payload: Dict[str, str]) -> "ChatMessageRecord":
        timestamp = payload.get("created_at")
        parsed_at = (
            datetime.fromisoformat(timestamp) if timestamp else datetime.now(timezone.utc)
        )
        return ChatMessageRecord(
            role=payload.get("role", "human"),
            content=payload.get("content", ""),
            created_at=parsed_at,
            display_content=payload.get("display_content"),
            turn_classification=payload.get("turn_classification"),
            classification_rationale=payload.get("classification_rationale"),
            classification_source=payload.get("classification_source"),
            classification_raw=payload.get("classification_raw"),
            topic_id=payload.get("topic_id"),
        )


@dataclass(frozen=True)
class TopicRecord:
    topic_id: str
    name: str
    keywords: List[str]
    message_count: int
    mastery: float

    def to_dict(self) -> Dict[str, object]:
        return {
            "topic_id": self.topic_id,
            "name": self.name,
            "keywords": list(self.keywords),
            "message_count": self.message_count,
            "mastery": self.mastery,
        }

    @staticmethod
    def from_dict(payload: Dict[str, object]) -> "TopicRecord":
        keywords = payload.get("keywords") or []
        if not isinstance(keywords, list):
            keywords = []
        return TopicRecord(
            topic_id=str(payload.get("topic_id", "")),
            name=str(payload.get("name", "Topic")),
            keywords=[str(keyword) for keyword in keywords],
            message_count=int(payload.get("message_count", 0)),
            mastery=float(payload.get("mastery", 0.0)),
        )


@dataclass(frozen=True)
class MicrocheckQuestionRecord:
    question_id: str
    prompt: str
    options: List[Dict[str, str]]
    correct_option_id: str
    topic_id: str

    def to_dict(self) -> Dict[str, object]:
        return {
            "question_id": self.question_id,
            "prompt": self.prompt,
            "options": list(self.options),
            "correct_option_id": self.correct_option_id,
            "topic_id": self.topic_id,
        }

    @staticmethod
    def from_dict(payload: Dict[str, object]) -> "MicrocheckQuestionRecord":
        options = payload.get("options") or []
        if not isinstance(options, list):
            options = []
        safe_options: List[Dict[str, str]] = []
        for option in options:
            if isinstance(option, dict):
                option_id = str(option.get("id", ""))
                text = str(option.get("text", ""))
                safe_options.append({"id": option_id, "text": text})
        return MicrocheckQuestionRecord(
            question_id=str(payload.get("question_id", "")),
            prompt=str(payload.get("prompt", "")),
            options=safe_options,
            correct_option_id=str(payload.get("correct_option_id", "")),
            topic_id=str(payload.get("topic_id", "")),
        )


@dataclass(frozen=True)
class MicrocheckResultRecord:
    question_id: str
    selected_option_id: str
    correct: bool
    topic_id: str

    def to_dict(self) -> Dict[str, object]:
        return {
            "question_id": self.question_id,
            "selected_option_id": self.selected_option_id,
            "correct": self.correct,
            "topic_id": self.topic_id,
        }

    @staticmethod
    def from_dict(payload: Dict[str, object]) -> "MicrocheckResultRecord":
        return MicrocheckResultRecord(
            question_id=str(payload.get("question_id", "")),
            selected_option_id=str(payload.get("selected_option_id", "")),
            correct=bool(payload.get("correct", False)),
            topic_id=str(payload.get("topic_id", "")),
        )


@dataclass(frozen=True)
class MicrocheckAttemptRecord:
    microcheck_id: str
    created_at: datetime
    completed_at: datetime
    results: List[MicrocheckResultRecord]
    feedback: str

    def to_dict(self) -> Dict[str, object]:
        return {
            "microcheck_id": self.microcheck_id,
            "created_at": self.created_at.isoformat(),
            "completed_at": self.completed_at.isoformat(),
            "results": [result.to_dict() for result in self.results],
            "feedback": self.feedback,
        }

    @staticmethod
    def from_dict(payload: Dict[str, object]) -> "MicrocheckAttemptRecord":
        created_at_raw = payload.get("created_at")
        completed_at_raw = payload.get("completed_at")
        created_at = (
            datetime.fromisoformat(created_at_raw) if isinstance(created_at_raw, str) else datetime.now(timezone.utc)
        )
        completed_at = (
            datetime.fromisoformat(completed_at_raw) if isinstance(completed_at_raw, str) else datetime.now(timezone.utc)
        )
        raw_results = payload.get("results") or []
        results = [
            MicrocheckResultRecord.from_dict(item)
            for item in raw_results
            if isinstance(item, dict)
        ]
        return MicrocheckAttemptRecord(
            microcheck_id=str(payload.get("microcheck_id", "")),
            created_at=created_at,
            completed_at=completed_at,
            results=results,
            feedback=str(payload.get("feedback", "")),
        )


@dataclass(frozen=True)
class PendingMicrocheckRecord:
    microcheck_id: str
    created_at: datetime
    questions: List[MicrocheckQuestionRecord]

    def to_dict(self) -> Dict[str, object]:
        return {
            "microcheck_id": self.microcheck_id,
            "created_at": self.created_at.isoformat(),
            "questions": [question.to_dict() for question in self.questions],
        }

    @staticmethod
    def from_dict(payload: Dict[str, object]) -> "PendingMicrocheckRecord":
        created_at_raw = payload.get("created_at")
        created_at = (
            datetime.fromisoformat(created_at_raw) if isinstance(created_at_raw, str) else datetime.now(timezone.utc)
        )
        raw_questions = payload.get("questions") or []
        questions = [
            MicrocheckQuestionRecord.from_dict(question)
            for question in raw_questions
            if isinstance(question, dict)
        ]
        return PendingMicrocheckRecord(
            microcheck_id=str(payload.get("microcheck_id", "")),
            created_at=created_at,
            questions=questions,
        )


@dataclass(frozen=True)
class ChatSessionRecord:
    """Aggregate payload for a persisted chat session."""

    session_id: str
    messages: List[ChatMessageRecord]
    friction_progress: int
    session_mode: str
    last_prompt: str
    guidance_ready: bool = False
    topics: List[TopicRecord] = field(default_factory=list)
    microcheck_history: List[MicrocheckAttemptRecord] = field(default_factory=list)
    pending_microcheck: Optional[PendingMicrocheckRecord] = None
    turns_since_microcheck: int = 0

    def to_dict(self) -> Dict[str, object]:
        topics = self.topics or []
        history = self.microcheck_history or []
        payload = {
            "session_id": self.session_id,
            "messages": [msg.to_dict() for msg in self.messages],
            "friction_progress": self.friction_progress,
            "session_mode": self.session_mode,
            "last_prompt": self.last_prompt,
            "guidance_ready": self.guidance_ready,
            "topics": [topic.to_dict() for topic in topics],
            "microcheck_history": [attempt.to_dict() for attempt in history],
            "turns_since_microcheck": self.turns_since_microcheck,
        }
        if self.pending_microcheck is not None:
            payload["pending_microcheck"] = self.pending_microcheck.to_dict()
        payload["updated_at"] = _firestore_timestamp()
        return payload

    @staticmethod
    def from_dict(session_id: str, payload: Dict[str, object]) -> "ChatSessionRecord":
        raw_messages = payload.get("messages", []) or []
        messages = [
            ChatMessageRecord.from_dict(message)
            for message in raw_messages
            if isinstance(message, dict)
        ]
        return ChatSessionRecord(
            session_id=session_id,
            messages=messages,
            friction_progress=int(payload.get("friction_progress", 0)),
            session_mode=str(payload.get("session_mode", "friction")),
            last_prompt=str(payload.get("last_prompt", "friction")),
            guidance_ready=bool(payload.get("guidance_ready", False)),
            topics=[
                TopicRecord.from_dict(topic)
                for topic in (payload.get("topics") or [])
                if isinstance(topic, dict)
            ],
            microcheck_history=[
                MicrocheckAttemptRecord.from_dict(attempt)
                for attempt in (payload.get("microcheck_history") or [])
                if isinstance(attempt, dict)
            ],
            pending_microcheck=PendingMicrocheckRecord.from_dict(payload["pending_microcheck"])
            if isinstance(payload.get("pending_microcheck"), dict)
            else None,
            turns_since_microcheck=int(payload.get("turns_since_microcheck", 0)),
        )


@dataclass(frozen=True)
class ChatSessionSummary:
    session_id: str
    updated_at: datetime
    message_count: int


class ChatRepository(Protocol):
    """Persistence operations required by the LLM service."""

    def load_session(self, session_id: str) -> Optional[ChatSessionRecord]:
        ...

    def save_session(self, record: ChatSessionRecord) -> None:
        ...

    def delete_session(self, session_id: str) -> None:
        ...

    def list_sessions(self) -> List[ChatSessionSummary]:
        ...


class FirestoreChatRepository:
    """Firestore-backed implementation used in production."""

    def __init__(self, *, collection_name: str = "chat_sessions") -> None:
        if not _firestore_available():
            raise RuntimeError(
                "google-cloud-firestore is required for FirestoreChatRepository. Install the package "
                "and configure credentials, or use InMemoryChatRepository instead."
            )
        self._client = get_firestore()
        self._collection = self._client.collection(collection_name)

    def load_session(self, session_id: str) -> Optional[ChatSessionRecord]:
        doc = self._collection.document(session_id).get()
        if not doc.exists:
            return None
        data = doc.to_dict() or {}
        return ChatSessionRecord.from_dict(session_id, data)

    def save_session(self, record: ChatSessionRecord) -> None:
        doc_ref = self._collection.document(record.session_id)
        doc_ref.set(record.to_dict(), merge=True)

    def delete_session(self, session_id: str) -> None:
        self._collection.document(session_id).delete()

    def list_sessions(self) -> List[ChatSessionSummary]:
        summaries: List[ChatSessionSummary] = []
        for doc in self._collection.stream():
            data = doc.to_dict() or {}
            updated_at = data.get("updated_at")
            if hasattr(updated_at, "to_datetime"):
                updated = updated_at.to_datetime()
            elif isinstance(updated_at, datetime):
                updated = updated_at
            else:
                updated = datetime.now(timezone.utc)
            messages = data.get("messages", []) or []
            summaries.append(
                ChatSessionSummary(
                    session_id=doc.id,
                    updated_at=updated,
                    message_count=len(messages),
                )
            )
        summaries.sort(key=lambda item: item.updated_at, reverse=True)
        return summaries


class InMemoryChatRepository:
    """Fallback repository that keeps chat state in-process for testing/local dev."""

    def __init__(self) -> None:
        self._store: Dict[str, Dict[str, object]] = {}

    def load_session(self, session_id: str) -> Optional[ChatSessionRecord]:
        payload = self._store.get(session_id)
        if not payload:
            return None
        return ChatSessionRecord.from_dict(session_id, payload)

    def save_session(self, record: ChatSessionRecord) -> None:
        self._store[record.session_id] = record.to_dict()

    def delete_session(self, session_id: str) -> None:
        self._store.pop(session_id, None)

    def list_sessions(self) -> List[ChatSessionSummary]:
        summaries: List[ChatSessionSummary] = []
        for session_id, payload in self._store.items():
            messages = payload.get("messages", []) or []
            updated_at = payload.get("updated_at")
            if isinstance(updated_at, datetime):
                updated = updated_at
            elif hasattr(updated_at, "to_datetime"):
                updated = updated_at.to_datetime()
            else:
                updated = datetime.now(timezone.utc)
            summaries.append(
                ChatSessionSummary(
                    session_id=session_id,
                    updated_at=updated,
                    message_count=len(messages),
                )
            )
        summaries.sort(key=lambda item: item.updated_at, reverse=True)
        return summaries


def serialize_messages(messages: Iterable[ChatMessageRecord]) -> List[Dict[str, str]]:
    return [message.to_dict() for message in messages]


def _firestore_available() -> bool:
    return firestore is not None


def _firestore_timestamp():
    if firestore is not None:
        return firestore.SERVER_TIMESTAMP
    return datetime.now(timezone.utc)
