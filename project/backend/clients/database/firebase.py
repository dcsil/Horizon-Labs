"""Firestore client bootstrapper."""

from __future__ import annotations

import os

try:  # pragma: no cover - optional dependency
    from google.cloud import firestore  # type: ignore[import]
except Exception:  # pragma: no cover - optional dependency missing
    firestore = None  # type: ignore[assignment]


def get_firestore():
    """Return a Firestore client using your Firebase project credentials."""

    if firestore is None:
        raise RuntimeError(
            "google-cloud-firestore is not installed. Install the package or configure the application "
            "to use an in-memory chat repository."
        )

    project_id = os.getenv("FIREBASE_PROJECT_ID")

    if not project_id:
        raise RuntimeError(
            "FIREBASE_PROJECT_ID environment variable not set. "
            "Please set it to your Firebase project ID."
        )

    try:
        # Uses credentials from GOOGLE_APPLICATION_CREDENTIALS env var
        return firestore.Client(project=project_id)
    except Exception as e:
        raise RuntimeError(
            f"Failed to initialize Firestore client: {e}. "
            "Ensure GOOGLE_APPLICATION_CREDENTIALS points to your service account key JSON."
        )
