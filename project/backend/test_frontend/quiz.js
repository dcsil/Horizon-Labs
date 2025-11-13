const selectors = {
  baseUrl: document.getElementById("quiz-backend-url"),
  quizId: document.getElementById("quiz-id"),
  sessionId: document.getElementById("quiz-session-id"),
  userId: document.getElementById("quiz-user-id"),
  topics: document.getElementById("quiz-topics"),
  mode: document.getElementById("quiz-mode"),
  difficulty: document.getElementById("quiz-difficulty"),
  numQuestions: document.getElementById("quiz-num-questions"),
  timeLimit: document.getElementById("quiz-time-limit"),
  maxAttempts: document.getElementById("quiz-max-attempts"),
  assessmentOptions: document.getElementById("assessment-options"),
  startButton: document.getElementById("quiz-start-btn"),
  endButton: document.getElementById("quiz-end-btn"),
  nextButton: document.getElementById("quiz-next-btn"),
  submitButton: document.getElementById("quiz-submit-btn"),
  status: document.getElementById("quiz-status"),
  questionArea: document.getElementById("quiz-question-area"),
  summary: document.getElementById("quiz-summary"),
};

const state = {
  sessionActive: false,
  sessionId: null,
  quizId: null,
  userId: null,
  mode: "practice",
  currentQuestion: null,
  lastSummary: null,
};

selectors.mode.addEventListener("change", () => {
  if (selectors.mode.value === "assessment") {
    selectors.assessmentOptions.classList.remove("hidden");
  } else {
    selectors.assessmentOptions.classList.add("hidden");
  }
});

selectors.startButton.addEventListener("click", startQuiz);
selectors.nextButton.addEventListener("click", loadNextQuestion);
selectors.submitButton.addEventListener("click", submitAnswer);
selectors.endButton.addEventListener("click", endSession);

function parseTopics(raw) {
  return raw
    .split(",")
    .map((topic) => topic.trim())
    .filter(Boolean);
}

function toNullableNumber(raw) {
  if (raw === null || raw === undefined) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildEndpoint(path) {
  const base = selectors.baseUrl.value.replace(/\/$/, "");
  return `${base}${path}`;
}

function renderStatus(message, type = "info") {
  selectors.status.textContent = message;
  selectors.status.dataset.type = type;
}

function renderQuestion(question) {
  state.currentQuestion = question;
  selectors.questionArea.innerHTML = `
    <h3>Question ${question.order}</h3>
    <p class="prompt">${question.prompt}</p>
    <form id="quiz-answer-form">
      ${question.choices
        .map((choice, index) => {
          const encodedValue = encodeURIComponent(choice);
          return `
          <label class="choice">
            <input type="radio" name="quiz-choice" value="${encodedValue}" ${index === 0 ? "checked" : ""} />
            <span>${encodeHTML(choice)}</span>
          </label>
        `;
        })
        .join("")}
    </form>
  `;
  selectors.submitButton.disabled = false;
  selectors.nextButton.disabled = true;
}

function encodeHTML(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getSelectedAnswer() {
  const form = document.getElementById("quiz-answer-form");
  if (!form) return null;
  const selected = form.querySelector("input[name='quiz-choice']:checked");
  return selected ? decodeURIComponent(selected.value) : null;
}

function renderSummary(summary) {
  if (!summary) {
    selectors.summary.textContent = "No attempts recorded yet.";
    return;
  }
  const topicDetails = Object.entries(summary.topics || {})
    .map(
      ([topic, stats]) =>
        `<li><strong>${encodeHTML(topic)}:</strong> ${stats.correct} / ${stats.attempted} correct</li>`
    )
    .join("");
  selectors.summary.innerHTML = `
    <p><strong>Quiz ID:</strong> ${encodeHTML(summary.quiz_id)}</p>
    <p><strong>User ID:</strong> ${encodeHTML(summary.user_id)}</p>
    <p><strong>Status:</strong> ${encodeHTML(summary.status)}</p>
    <p><strong>Total Questions:</strong> ${summary.total_questions}</p>
    <p><strong>Correct Answers:</strong> ${summary.correct_answers}</p>
    <p><strong>Accuracy:</strong> ${(summary.accuracy * 100).toFixed(0)}%</p>
    <p><strong>Total Time:</strong> ${(summary.total_time_ms / 1000).toFixed(1)}s</p>
    <p><strong>Started:</strong> ${summary.started_at ?? "—"}</p>
    <p><strong>Completed:</strong> ${summary.completed_at ?? "—"}</p>
    <ul>${topicDetails || "<li>No topic breakdown recorded.</li>"}</ul>
  `;
}

async function startQuiz() {
  const rawQuizId = selectors.quizId.value.trim();
  const quizId = rawQuizId || `quiz-${Date.now()}`;
  selectors.quizId.value = quizId;

  const rawSessionId = selectors.sessionId.value.trim();
  const sessionId = rawSessionId || `${quizId}-session-${Date.now()}`;
  selectors.sessionId.value = sessionId;

  const rawUserId = selectors.userId.value.trim();
  const userId = rawUserId || `learner-${Date.now()}`;
  selectors.userId.value = userId;

  const mode = selectors.mode.value;
  const topics = parseTopics(selectors.topics.value);
  if (topics.length === 0) {
    renderStatus("Enter at least one topic to build the quiz bank.", "error");
    return;
  }

  const definitionPayload = {
    quiz_id: quizId,
    name: quizId,
    topics,
    default_mode: mode,
    initial_difficulty: selectors.difficulty.value,
    assessment_num_questions: toNullableNumber(selectors.numQuestions.value),
    assessment_time_limit_minutes: toNullableNumber(selectors.timeLimit.value),
    assessment_max_attempts: toNullableNumber(selectors.maxAttempts.value),
  };

  const sessionPayload = {
    session_id: sessionId,
    quiz_id: quizId,
    user_id: userId,
    mode,
    initial_difficulty: selectors.difficulty.value,
  };

  try {
    renderStatus("Saving quiz definition…");
    const defResponse = await fetch(buildEndpoint("/quiz/definitions"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(definitionPayload),
    });
    if (!defResponse.ok) {
      const error = await defResponse.json();
      renderStatus(error.detail || "Failed to persist quiz definition.", "error");
      return;
    }

    renderStatus("Starting quiz session…");
    const response = await fetch(buildEndpoint("/quiz/session/start"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sessionPayload),
    });
    if (!response.ok) {
      const error = await response.json();
      renderStatus(error.detail || "Failed to start quiz session.", "error");
      return;
    }
    const data = await response.json();
    state.sessionActive = true;
    state.sessionId = data.session_id;
    state.quizId = data.quiz_id;
    state.userId = data.user_id;
    state.mode = data.mode;
    state.lastSummary = null;
    renderSummary(null);
    selectors.submitButton.disabled = true;
    selectors.nextButton.disabled = false;
    selectors.endButton.disabled = false;
    renderStatus(`Session ${state.sessionId} started in ${state.mode} mode.`);
    await loadNextQuestion();
  } catch (err) {
    renderStatus(err.message || "Unexpected error starting quiz.", "error");
  }
}

async function loadNextQuestion() {
  if (!state.sessionActive || !state.sessionId) {
    renderStatus("Start a session before requesting questions.", "error");
    return;
  }
  selectors.submitButton.disabled = true;
  selectors.nextButton.disabled = true;
  try {
    const response = await fetch(buildEndpoint(`/quiz/session/${state.sessionId}/next`));
    if (response.status === 410) {
      const body = await response.json();
      renderStatus(body.detail || "Session no longer active.", "warning");
      selectors.submitButton.disabled = true;
      selectors.nextButton.disabled = true;
      return;
    }
    if (!response.ok) {
      const error = await response.json();
      renderStatus(error.detail || "Failed to load next question.", "error");
      return;
    }
    const question = await response.json();
    renderQuestion(question);
    renderStatus(`Loaded question ${question.order} (${question.difficulty}).`);
  } catch (err) {
    renderStatus(err.message || "Unexpected error loading question.", "error");
  }
}

async function submitAnswer() {
  if (!state.sessionActive || !state.currentQuestion) {
    renderStatus("No active question to submit.", "error");
    return;
  }
  const selectedAnswer = getSelectedAnswer();
  if (!selectedAnswer) {
    renderStatus("Choose an answer before submitting.", "error");
    return;
  }

  try {
    selectors.submitButton.disabled = true;
    const response = await fetch(buildEndpoint(`/quiz/session/${state.sessionId}/answer`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question_id: state.currentQuestion.question_id,
        selected_answer: selectedAnswer,
      }),
    });
    if (!response.ok) {
      const error = await response.json();
      renderStatus(error.detail || "Failed to submit answer.", "error");
      selectors.submitButton.disabled = false;
      return;
    }
    const result = await response.json();
    const responseSeconds =
      typeof result.response_ms === "number"
        ? `${(result.response_ms / 1000).toFixed(2)}s`
        : "—";
    const summaryBlock = document.createElement("div");
    summaryBlock.classList.add("quiz-feedback");
    summaryBlock.innerHTML = `
      <p><strong>${result.is_correct ? "Correct!" : "Incorrect."}</strong></p>
      <p><strong>Answer:</strong> ${encodeHTML(result.correct_answer)}</p>
      <p><strong>Rationale:</strong> ${encodeHTML(result.rationale)}</p>
      <p><strong>Next Difficulty:</strong> ${encodeHTML(result.current_difficulty)}</p>
      <p><strong>Response Time:</strong> ${responseSeconds}</p>
    `;
    selectors.questionArea.appendChild(summaryBlock);
    selectors.nextButton.disabled = false;

    if (result.summary) {
      state.lastSummary = result.summary;
      renderSummary(result.summary);
      renderStatus(`Session ${state.sessionId} finished (${result.summary.status}).`, "success");
      selectors.nextButton.disabled = true;
      selectors.endButton.disabled = true;
      state.sessionActive = false;
    } else {
      renderStatus("Answer recorded. Load the next question when ready.", "success");
    }
  } catch (err) {
    renderStatus(err.message || "Unexpected error submitting answer.", "error");
    selectors.submitButton.disabled = false;
  }
}

async function endSession() {
  if (!state.sessionId) {
    renderStatus("No active session to end.", "error");
    return;
  }
  try {
    const response = await fetch(buildEndpoint(`/quiz/session/${state.sessionId}/end`), {
      method: "POST",
    });
    if (!response.ok) {
      const error = await response.json();
      renderStatus(error.detail || "Failed to end session.", "error");
      return;
    }
    const result = await response.json();
    state.lastSummary = result;
    renderSummary(result);
    renderStatus(`Session ${state.sessionId} closed (${result.status}).`, "success");
  } catch (err) {
    renderStatus(err.message || "Unexpected error ending session.", "error");
  } finally {
    state.sessionActive = false;
    state.currentQuestion = null;
    state.quizId = null;
    state.userId = null;
    selectors.submitButton.disabled = true;
    selectors.nextButton.disabled = true;
    selectors.endButton.disabled = true;
  }
}
