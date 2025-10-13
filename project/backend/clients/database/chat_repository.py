from __future__ import annotations

from dataclasses import dataclass
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
        )


@dataclass(frozen=True)
class ChatSessionRecord:
    """Aggregate payload for a persisted chat session."""

    session_id: str
    messages: List[ChatMessageRecord]
    friction_progress: int
    session_mode: str
    last_prompt: str

    def to_dict(self) -> Dict[str, object]:
        payload = {
            "session_id": self.session_id,
            "messages": [msg.to_dict() for msg in self.messages],
            "friction_progress": self.friction_progress,
            "session_mode": self.session_mode,
            "last_prompt": self.last_prompt,
        }
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
