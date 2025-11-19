from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from clients.database.quiz_repository import (
    QuizAttemptRecord,
    QuizDefinitionRecord,
    QuizQuestionRecord,
    QuizSessionRecord,
)


async def _create_quiz_definition(async_client, quiz_id: str, topics: list[str]) -> None:
    payload = {
        "quiz_id": quiz_id,
        "name": f"{quiz_id}-name",
        "topics": topics,
        "default_mode": "practice",
        "initial_difficulty": "medium",
        "assessment_num_questions": 2,
        "assessment_time_limit_minutes": 5,
        "assessment_max_attempts": 3,
    }
    response = await async_client.post("/quiz/definitions", json=payload)
    assert response.status_code == 200


@pytest.mark.anyio
async def test_cannot_start_without_definition(async_client):
    payload = {
        "session_id": "missing-def-session",
        "quiz_id": "missing-quiz",
        "user_id": "user-1",
    }
    response = await async_client.post("/quiz/session/start", json=payload)
    assert response.status_code == 404


@pytest.mark.anyio
async def test_assessment_quiz_flow(async_client):
    quiz_id = "algebra-quiz"
    await _create_quiz_definition(async_client, quiz_id, ["algebra"])

    session_id = "assessment-101"
    payload = {
        "session_id": session_id,
        "quiz_id": quiz_id,
        "user_id": "learner-1",
        "mode": "assessment",
        "initial_difficulty": "easy",
    }
    start_response = await async_client.post("/quiz/session/start", json=payload)
    assert start_response.status_code == 200
    body = start_response.json()
    assert body["status"] == "in_progress"
    assert body["mode"] == "assessment"
    assert body["quiz_id"] == quiz_id

    # First question
    question_response = await async_client.get(f"/quiz/session/{session_id}/next")
    assert question_response.status_code == 200
    question = question_response.json()
    answer_payload = {
        "question_id": question["question_id"],
        "selected_answer": question["choices"][0],
    }
    submit_response = await async_client.post(
        f"/quiz/session/{session_id}/answer",
        json=answer_payload,
    )
    assert submit_response.status_code == 200
    body = submit_response.json()
    assert body["is_correct"] is True
    assert body["session_completed"] is False

    # Second question completes the assessment (definition caps at 2 questions)
    second_question = await async_client.get(f"/quiz/session/{session_id}/next")
    assert second_question.status_code == 200
    question2 = second_question.json()
    submit_response_2 = await async_client.post(
        f"/quiz/session/{session_id}/answer",
        json={
            "question_id": question2["question_id"],
            "selected_answer": question2["choices"][0],
        },
    )
    assert submit_response_2.status_code == 200
    body2 = submit_response_2.json()
    assert body2["session_completed"] is True
    assert body2["summary"]["status"] in {"completed", "timed_out"}
    assert body2["summary"]["total_questions"] == 2

    # No more questions after completion
    closed_response = await async_client.get(f"/quiz/session/{session_id}/next")
    assert closed_response.status_code == 410


@pytest.mark.anyio
async def test_practice_adapts_difficulty(async_client):
    quiz_id = "loops-quiz"
    await _create_quiz_definition(async_client, quiz_id, ["loops"])

    session_id = "practice-55"
    payload = {
        "session_id": session_id,
        "quiz_id": quiz_id,
        "user_id": "learner-2",
        "mode": "practice",
        "initial_difficulty": "medium",
    }
    start_response = await async_client.post("/quiz/session/start", json=payload)
    assert start_response.status_code == 200
    assert start_response.json()["current_difficulty"] == "medium"

    # First correct answer keeps difficulty the same.
    question = await async_client.get(f"/quiz/session/{session_id}/next")
    q1 = question.json()
    result = await async_client.post(
        f"/quiz/session/{session_id}/answer",
        json={
            "question_id": q1["question_id"],
            "selected_answer": q1["choices"][0],
        },
    )
    assert result.status_code == 200
    assert result.json()["current_difficulty"] == "medium"

    # Second consecutive correct answer should increase difficulty.
    question2 = await async_client.get(f"/quiz/session/{session_id}/next")
    q2 = question2.json()
    result2 = await async_client.post(
        f"/quiz/session/{session_id}/answer",
        json={
            "question_id": q2["question_id"],
            "selected_answer": q2["choices"][0],
        },
    )
    assert result2.status_code == 200
    assert result2.json()["current_difficulty"] == "medium"
    assert result2.json()["session_completed"] is False

    # Third consecutive correct answer satisfies the new default streak requirement.
    question3 = await async_client.get(f"/quiz/session/{session_id}/next")
    assert question3.status_code == 200
    q3 = question3.json()
    result3 = await async_client.post(
        f"/quiz/session/{session_id}/answer",
        json={
            "question_id": q3["question_id"],
            "selected_answer": q3["choices"][0],
        },
    )
    assert result3.status_code == 200
    assert result3.json()["current_difficulty"] == "hard"
    assert result3.json()["session_completed"] is False
