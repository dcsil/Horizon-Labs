from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, Iterable, List, Literal, Optional, Protocol

try:
    from google.cloud import firestore  # type: ignore[import]
except Exception as exc:  # pragma: no cover - fail fast when dependency missing
    raise RuntimeError(
        "google-cloud-firestore is required for chat persistence. Install the package and "
        "ensure service account credentials are configured."
    ) from exc

from .firebase import get_firestore

ChatRole = Literal["human", "ai", "system"]


@dataclass(frozen=True)
class ChatMessageRecord:
    """Serializable representation of an individual turn in a chat session."""

    role: ChatRole
    content: str
    created_at: datetime
    display_content: Optional[str] = None

    def to_dict(self) -> Dict[str, str]:
        payload = {
            "role": self.role,
            "content": self.content,
            "created_at": self.created_at.isoformat(),
        }
        if self.display_content is not None:
            payload["display_content"] = self.display_content
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
        payload["updated_at"] = firestore.SERVER_TIMESTAMP
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


class ChatRepository(Protocol):
    """Persistence operations required by the LLM service."""

    def load_session(self, session_id: str) -> Optional[ChatSessionRecord]:
        ...

    def save_session(self, record: ChatSessionRecord) -> None:
        ...

    def delete_session(self, session_id: str) -> None:
        ...


class FirestoreChatRepository:
    """Firestore-backed implementation used in production."""

    def __init__(self, *, collection_name: str = "chat_sessions") -> None:
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


def serialize_messages(messages: Iterable[ChatMessageRecord]) -> List[Dict[str, str]]:
    return [message.to_dict() for message in messages]
