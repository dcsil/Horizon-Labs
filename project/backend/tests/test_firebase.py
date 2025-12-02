from __future__ import annotations

"""Guards Firestore client construction and required environment validation."""

import types

import pytest

from clients.database import firebase


class _DummyClient:
    def __init__(self, **kwargs):
        self.kwargs = kwargs


def _install_dummy_firestore(monkeypatch: pytest.MonkeyPatch, *, raise_on_init: bool = False) -> type[_DummyClient]:
    captured = {}

    class DummyClient(_DummyClient):
        def __init__(self, **kwargs):
            if raise_on_init:
                raise ValueError("boom")
            captured.update(kwargs)
            super().__init__(**kwargs)

    dummy_module = types.SimpleNamespace(Client=DummyClient)
    monkeypatch.setattr(firebase, "firestore", dummy_module)
    return DummyClient, captured


def test_get_firestore_requires_dependency(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(firebase, "firestore", None)
    with pytest.raises(RuntimeError, match="google-cloud-firestore is not installed"):
        firebase.get_firestore()


def test_get_firestore_requires_project_id(monkeypatch: pytest.MonkeyPatch) -> None:
    _install_dummy_firestore(monkeypatch)
    monkeypatch.delenv("FIREBASE_PROJECT_ID", raising=False)
    with pytest.raises(RuntimeError, match="FIREBASE_PROJECT_ID"):
        firebase.get_firestore()


def test_get_firestore_uses_explicit_project(monkeypatch: pytest.MonkeyPatch) -> None:
    dummy_client, captured = _install_dummy_firestore(monkeypatch)
    monkeypatch.setenv("FIREBASE_PROJECT_ID", "project-123")

    client = firebase.get_firestore()

    assert isinstance(client, dummy_client)
    assert captured["project"] == "project-123"


def test_get_firestore_wraps_initialization_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    _install_dummy_firestore(monkeypatch, raise_on_init=True)
    monkeypatch.setenv("FIREBASE_PROJECT_ID", "project-xyz")

    with pytest.raises(RuntimeError, match="Failed to initialize Firestore client"):
        firebase.get_firestore()
