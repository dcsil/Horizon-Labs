from __future__ import annotations

"""Integration coverage for quiz definition CRUD and session flows."""

import pytest


def _build_definition_payload(quiz_id: str) -> dict[str, object]:
    return {
        "quiz_id": quiz_id,
        "name": f"{quiz_id}-name",
        "topics": ["algebra", "geometry"],
        "default_mode": "practice",
        "initial_difficulty": "medium",
        "assessment_num_questions": 3,
        "assessment_time_limit_minutes": 5,
        "assessment_max_attempts": 2,
        "is_published": True,
        "metadata": {"grade_level": "middle"},
    }


@pytest.mark.anyio
async def test_quiz_definition_crud_flow(async_client):
    quiz_id = "quiz-crud-1"
    create_payload = _build_definition_payload(quiz_id)
    created = await async_client.post("/quiz/definitions", json=create_payload)
    assert created.status_code == 200
    assert created.json()["quiz_id"] == quiz_id

    fetched = await async_client.get(f"/quiz/definitions/{quiz_id}")
    assert fetched.status_code == 200
    assert fetched.json()["metadata"]["grade_level"] == "middle"

    listing = await async_client.get("/quiz/definitions")
    assert listing.status_code == 200
    assert any(item["quiz_id"] == quiz_id for item in listing.json())

    deleted = await async_client.delete(f"/quiz/definitions/{quiz_id}")
    assert deleted.status_code == 200
    assert deleted.json() == {"status": "deleted", "quiz_id": quiz_id}

    missing = await async_client.get(f"/quiz/definitions/{quiz_id}")
    assert missing.status_code == 404


@pytest.mark.anyio
async def test_quiz_session_conflict_and_preview_cleanup(async_client):
    quiz_id = "quiz-session-1"
    create_payload = _build_definition_payload(quiz_id)
    await async_client.post("/quiz/definitions", json=create_payload)

    session_payload = {
        "session_id": "preview-1",
        "quiz_id": quiz_id,
        "user_id": "learner-1",
        "mode": "practice",
        "initial_difficulty": "easy",
        "is_preview": True,
    }
    first_start = await async_client.post("/quiz/session/start", json=session_payload)
    assert first_start.status_code == 200

    conflict = await async_client.post("/quiz/session/start", json=session_payload)
    assert conflict.status_code == 409

    cleanup = await async_client.delete("/quiz/session/preview-1")
    assert cleanup.status_code == 200
    assert cleanup.json() == {"status": "deleted", "session_id": "preview-1"}

    retry = await async_client.post("/quiz/session/start", json=session_payload)
    assert retry.status_code == 200


@pytest.mark.anyio
async def test_quiz_end_session_requires_existing_session(async_client):
    response = await async_client.post("/quiz/session/nonexistent/end")
    assert response.status_code == 404


@pytest.mark.anyio
async def test_quiz_next_requires_existing_session(async_client):
    response = await async_client.get("/quiz/session/unknown/next")
    assert response.status_code == 404


@pytest.mark.anyio
async def test_quiz_answer_requires_known_question(async_client):
    quiz_id = "quiz-answer-1"
    await async_client.post("/quiz/definitions", json=_build_definition_payload(quiz_id))

    session_payload = {
        "session_id": "answer-session",
        "quiz_id": quiz_id,
        "user_id": "learner-ans",
    }
    start = await async_client.post("/quiz/session/start", json=session_payload)
    assert start.status_code == 200

    response = await async_client.post(
        f"/quiz/session/{session_payload['session_id']}/answer",
        json={"question_id": "bogus", "selected_answer": "A"},
    )
    assert response.status_code == 400


@pytest.mark.anyio
async def test_quiz_end_session_returns_summary(async_client):
    quiz_id = "quiz-summary-1"
    await async_client.post("/quiz/definitions", json=_build_definition_payload(quiz_id))

    session_id = "summary-session"
    payload = {
        "session_id": session_id,
        "quiz_id": quiz_id,
        "user_id": "learner-sum",
        "mode": "assessment",
        "initial_difficulty": "easy",
    }
    start = await async_client.post("/quiz/session/start", json=payload)
    assert start.status_code == 200

    question = await async_client.get(f"/quiz/session/{session_id}/next")
    assert question.status_code == 200
    q_payload = question.json()

    await async_client.post(
        f"/quiz/session/{session_id}/answer",
        json={
            "question_id": q_payload["question_id"],
            "selected_answer": q_payload["choices"][0],
        },
    )

    summary = await async_client.post(f"/quiz/session/{session_id}/end")
    assert summary.status_code == 200
    summary_payload = summary.json()
    assert summary_payload["session_id"] == session_id
    assert summary_payload["quiz_id"] == quiz_id
    assert summary_payload["total_questions"] >= 1


@pytest.mark.anyio
async def test_delete_session_rejects_non_preview(async_client):
    quiz_id = "quiz-delete-1"
    await async_client.post("/quiz/definitions", json=_build_definition_payload(quiz_id))

    session_id = "regular-session"
    start = await async_client.post(
        "/quiz/session/start",
        json={"session_id": session_id, "quiz_id": quiz_id, "user_id": "learner"},
    )
    assert start.status_code == 200

    response = await async_client.delete(f"/quiz/session/{session_id}")
    assert response.status_code == 403
