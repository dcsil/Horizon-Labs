const state = { sessions: [] };

const $backendUrl = document.querySelector('#backend-url');
const $sessionSelect = document.querySelector('#session-select');
const $useSessionBtn = document.querySelector('#use-session');
const $newSessionBtn = document.querySelector('#new-session');
const $sessionId = document.querySelector('#session-id');
const $message = document.querySelector('#message');
const $wordCount = document.querySelector('#word-count');
const $sendBtn = document.querySelector('#send-btn');
const $resetBtn = document.querySelector('#reset-btn');
const $refreshBtn = document.querySelector('#refresh-state');
const $historyBtn = document.querySelector('#load-history');
const $log = document.querySelector('#stream-log');
const $historyLog = document.querySelector('#history-log');
const $stateNextPrompt = document.querySelector('#state-next-prompt');
const $stateLastPrompt = document.querySelector('#state-last-prompt');
const $stateAttempts = document.querySelector('#state-attempts');
const $stateThreshold = document.querySelector('#state-threshold');
const $stateRemaining = document.querySelector('#state-remaining');
const $stateMinWords = document.querySelector('#state-min-words');
const $stateClassificationLabel = document.querySelector('#state-classification-label');
const $stateClassificationSource = document.querySelector('#state-classification-source');
const $stateClassificationRationale = document.querySelector('#state-classification-rationale');
const $stateClassificationLLM = document.querySelector('#state-classification-llm');
const $stateClassificationRaw = document.querySelector('#state-classification-raw');
const $useGuidanceToggle = document.querySelector('#use-guidance');
const $guidanceStatus = document.querySelector('#guidance-status');
const $stateGuidanceReady = document.querySelector('#state-guidance-ready');
const $stateMicrocheckPending = document.querySelector('#state-microcheck-pending');
const $stateMicrocheckRemaining = document.querySelector('#state-microcheck-remaining');
const $stateTopicsList = document.querySelector('#state-topics-list');
const $microcheckOverlay = document.querySelector('#microcheck-overlay');
const $microcheckForm = document.querySelector('#microcheck-form');
const $microcheckSubmit = document.querySelector('#microcheck-submit');
const $microcheckLater = document.querySelector('#microcheck-later');
const $microcheckClose = document.querySelector('#microcheck-close');
const $microcheckBanner = document.querySelector('#microcheck-banner');
const $microcheckOpen = document.querySelector('#microcheck-open');
const $microcheckFeedback = document.querySelector('#microcheck-feedback');
const $microcheckSubtitle = document.querySelector('#microcheck-subtitle');

const GUIDANCE_LOCKED_TEXT = 'Guidance unlocks after you meet the attempt threshold.';
const GUIDANCE_READY_TEXT = 'Guidance unlocked — check the box to receive direct guidance.';

const microcheckState = {
  pending: false,
  data: null,
  answers: new Map(),
  dismissed: false,
};

const decoder = new TextDecoder('utf-8');
let abortController = null;

const trimTrailingSlash = (url) => url.replace(/\/$/, '');

function appendToLog(text, isError = false) {
  $log.textContent += text;
  if (isError) {
    $log.classList.add('error');
  } else {
    $log.classList.remove('error');
  }
  $log.scrollTop = $log.scrollHeight;
}

function updateWordCount() {
  const words = $message.value.trim().split(/\s+/).filter(Boolean);
  $wordCount.textContent = `Word count: ${words.length}`;
}

function renderHistory(messages) {
  if (!messages || messages.length === 0) {
    $historyLog.textContent = 'No persisted history found for this session.';
    return;
  }

  const lines = messages.map((entry) => {
    const ts = entry.created_at ? new Date(entry.created_at).toLocaleString() : 'unknown time';
    const role = entry.role === 'assistant' ? 'AI' : entry.role === 'user' ? 'User' : 'System';
    const sourceSuffix = entry.classification_source
      ? entry.classification_source === 'model'
        ? ' (LLM)'
        : ' (heuristic)'
      : '';
    const label = entry.turn_classification ? ` [${entry.turn_classification}${sourceSuffix}]` : '';
    const rationale = entry.classification_rationale ? ` — ${entry.classification_rationale}` : '';
    return `[${ts}] ${role}${label}: ${entry.content ?? ''}${rationale}`;
  });

  $historyLog.textContent = lines.join('\n');
}

function renderSessions(activeId) {
  const currentActive = activeId || $sessionId.value.trim();
  $sessionSelect.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '-- Select existing session --';
  $sessionSelect.appendChild(placeholder);

  let resolvedId = '';
  state.sessions.forEach((session) => {
    const option = document.createElement('option');
    option.value = session.session_id;

    const parts = [session.session_id];
    if (typeof session.message_count === 'number') {
      parts.push(`msgs: ${session.message_count}`);
    }
    if (session.updated_at) {
      const parsed = new Date(session.updated_at);
      if (!Number.isNaN(parsed.getTime())) {
        parts.push(`updated ${parsed.toLocaleString()}`);
      }
    }

    option.textContent = parts.join(' • ');
    if (!resolvedId && currentActive && session.session_id === currentActive) {
      resolvedId = currentActive;
      option.selected = true;
    }
    $sessionSelect.appendChild(option);
  });

  if (!resolvedId && state.sessions.length > 0) {
    resolvedId = state.sessions[0].session_id;
    const option = [...$sessionSelect.options].find((opt) => opt.value === resolvedId);
    if (option) option.selected = true;
  }

  if (resolvedId) {
    $sessionId.value = resolvedId;
  } else {
    $sessionSelect.value = '';
    $sessionId.value = '';
  }
}

async function refreshSessionsList(preferredId) {
  const base = trimTrailingSlash($backendUrl.value.trim() || 'http://localhost:8000');
  try {
    const response = await fetch(`${base}/chat/sessions`);
    if (!response.ok) {
      throw new Error(`Failed to load sessions: ${response.status} ${response.statusText}`);
    }
    const payload = await response.json();
    let sessions = Array.isArray(payload.sessions) ? payload.sessions : [];
    if (preferredId && !sessions.some((session) => session.session_id === preferredId)) {
      sessions = [
        {
          session_id: preferredId,
          updated_at: new Date().toISOString(),
          message_count: 0,
        },
        ...sessions,
      ];
    }
    state.sessions = sessions;
  } catch (err) {
    appendToLog(`Session list error: ${err instanceof Error ? err.message : String(err)}\n`, true);
    if (preferredId && !state.sessions.some((session) => session.session_id === preferredId)) {
      state.sessions = [
        { session_id: preferredId, updated_at: new Date().toISOString(), message_count: 0 },
        ...state.sessions,
      ];
    }
  }
  renderSessions(preferredId);
}

function ensureSessionId() {
  const current = $sessionId.value.trim();
  if (current) return current;
  if (state.sessions.length > 0) {
    const first = state.sessions[0].session_id;
    $sessionId.value = first;
    $sessionSelect.value = first;
    return first;
  }
  return '';
}

async function refreshState() {
  const base = trimTrailingSlash($backendUrl.value.trim() || 'http://localhost:8000');
  const sessionId = ensureSessionId();
  if (!sessionId) {
    renderState(null);
    hideMicrocheckBanner();
    return;
  }

  try {
    const response = await fetch(`${base}/debug/friction-state?session_id=${encodeURIComponent(sessionId)}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch state: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    renderState(data);
    await syncMicrocheckUI(data);
  } catch (err) {
    renderState(null);
    appendToLog(`State error: ${err instanceof Error ? err.message : String(err)}\n`, true);
    await syncMicrocheckUI(null);
  }
}

function resetClassificationDisplay() {
  $stateClassificationLabel.textContent = '--';
  $stateClassificationSource.textContent = '--';
  $stateClassificationSource.classList.remove('source-model', 'source-heuristic', 'source-unknown');
  $stateClassificationSource.classList.add('source-unknown');
  $stateClassificationLLM.textContent = '--';
  $stateClassificationRationale.textContent = '--';
  $stateClassificationRaw.textContent = '--';
}

function describeSource(sourceRaw) {
  if (sourceRaw === 'model') return 'LLM (model)';
  if (sourceRaw === 'heuristic') return 'Heuristic fallback';
  return '--';
}

function describeLLMUsage(sourceRaw, label) {
  if (sourceRaw === 'model') return 'Yes';
  if (sourceRaw === 'heuristic') return label !== '--' ? 'No – heuristic used' : '--';
  return '--';
}

function applySourceBadgeClass(sourceRaw) {
  $stateClassificationSource.classList.remove('source-model', 'source-heuristic', 'source-unknown');
  if (sourceRaw === 'model') {
    $stateClassificationSource.classList.add('source-model');
  } else if (sourceRaw === 'heuristic') {
    $stateClassificationSource.classList.add('source-heuristic');
  } else {
    $stateClassificationSource.classList.add('source-unknown');
  }
}

function formatRawOutput(sourceRaw, rawValue, label) {
  if (typeof rawValue === 'string' && rawValue.trim().length > 0) {
    const trimmed = rawValue.trim();
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch {
      return trimmed;
    }
  }
  if (sourceRaw === 'heuristic' && label !== '--') {
    return 'Heuristic used – no LLM response.';
  }
  return '--';
}

function renderTopics(topics) {
  $stateTopicsList.innerHTML = '';
  if (!topics || topics.length === 0) {
    const li = document.createElement('li');
    li.className = 'placeholder';
    li.textContent = 'No topics detected yet.';
    $stateTopicsList.appendChild(li);
    return;
  }

  topics.forEach((topic) => {
    const li = document.createElement('li');
    const mastery = typeof topic.mastery === 'number' ? Math.round(topic.mastery * 100) : null;
    const name = topic.topic_name || topic.topicId || topic.topic_id || 'Topic';
    const parts = [`${name}`];
    if (typeof topic.message_count === 'number') {
      parts.push(`turns: ${topic.message_count}`);
    }
    if (mastery !== null && !Number.isNaN(mastery)) {
      parts.push(`mastery: ${mastery}%`);
    }
    li.textContent = parts.join(' • ');
    $stateTopicsList.appendChild(li);
  });
}

function hideMicrocheckBanner() {
  $microcheckBanner.classList.add('hidden');
}

function showMicrocheckBanner() {
  $microcheckBanner.classList.remove('hidden');
}

function applyMicrocheckLock() {
  if (microcheckState.pending) {
    $message.disabled = true;
    $sendBtn.disabled = true;
  } else if (!abortController) {
    $message.disabled = false;
    $sendBtn.disabled = false;
  }
}

function renderMicrocheck(data) {
  if (!data) {
    return;
  }
  $microcheckForm.innerHTML = '';
  data.questions.forEach((question, index) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'microcheck-question';

    const heading = document.createElement('h4');
    heading.textContent = `Q${index + 1}. ${question.prompt}`;
    wrapper.appendChild(heading);

    if (question.topic_name) {
      const topicLabel = document.createElement('p');
      topicLabel.className = 'microcheck-topic';
      topicLabel.textContent = `Topic: ${question.topic_name}`;
      wrapper.appendChild(topicLabel);
    }

    (question.options || []).forEach((option) => {
      const label = document.createElement('label');
      label.className = 'microcheck-option';

      const input = document.createElement('input');
      input.type = 'radio';
      input.name = `microcheck-${question.question_id}`;
      input.value = option.id;
      input.dataset.questionId = question.question_id;
      if (microcheckState.answers.get(question.question_id) === option.id) {
        input.checked = true;
      }

      label.appendChild(input);
      label.appendChild(document.createTextNode(option.text));
      wrapper.appendChild(label);
    });

    $microcheckForm.appendChild(wrapper);
  });

  const totalQuestions = data.questions ? data.questions.length : 0;
  $microcheckSubtitle.textContent = totalQuestions
    ? `Answer ${totalQuestions} question${totalQuestions === 1 ? '' : 's'} to continue.`
    : 'Complete this quick check to continue chatting.';
  $microcheckFeedback.classList.add('hidden');
}

async function openMicrocheck(forceFetch = false) {
  const sessionId = ensureSessionId();
  if (!sessionId) {
    return;
  }

  if (!microcheckState.data || forceFetch) {
    const payload = await fetchMicrocheck(sessionId);
    if (!payload) {
      clearMicrocheckState();
      return;
    }
    microcheckState.data = payload;
    microcheckState.answers = new Map();
  }

  microcheckState.dismissed = false;
  renderMicrocheck(microcheckState.data);
  hideMicrocheckBanner();
  $microcheckOverlay.classList.remove('hidden');
  applyMicrocheckLock();
}

function closeMicrocheck(keepPending = true) {
  $microcheckOverlay.classList.add('hidden');
  if (keepPending && microcheckState.pending) {
    microcheckState.dismissed = true;
    showMicrocheckBanner();
  } else {
    microcheckState.dismissed = false;
    hideMicrocheckBanner();
  }
  applyMicrocheckLock();
}

function clearMicrocheckState() {
  microcheckState.pending = false;
  microcheckState.data = null;
  microcheckState.answers = new Map();
  microcheckState.dismissed = false;
  $microcheckForm.innerHTML = '';
  $microcheckFeedback.classList.add('hidden');
  closeMicrocheck(false);
}

function handleMicrocheckOptionChange(event) {
  if (event.target && event.target.matches("input[type='radio'][data-question-id]")) {
    microcheckState.answers.set(event.target.dataset.questionId, event.target.value);
  }
}

async function fetchMicrocheck(sessionId) {
  const base = trimTrailingSlash($backendUrl.value.trim() || 'http://localhost:8000');
  try {
    const response = await fetch(`${base}/microchecks/pending?session_id=${encodeURIComponent(sessionId)}`);
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`Failed to fetch microcheck: ${response.status} ${response.statusText}`);
    }
    const payload = await response.json();
    return payload;
  } catch (err) {
    appendToLog(`Microcheck fetch error: ${err instanceof Error ? err.message : String(err)}\n`, true);
    return null;
  }
}

async function syncMicrocheckUI(state) {
  const pending = Boolean(state && state.microcheck_pending);
  if (!pending) {
    clearMicrocheckState();
    applyMicrocheckLock();
    return;
  }

  const sessionId = ensureSessionId();
  if (!sessionId) {
    return;
  }

  microcheckState.pending = true;
  if (!microcheckState.data) {
    const payload = await fetchMicrocheck(sessionId);
    if (!payload) {
      clearMicrocheckState();
      return;
    }
    microcheckState.data = payload;
    microcheckState.answers = new Map();
  }

  if (microcheckState.dismissed) {
    showMicrocheckBanner();
    $microcheckOverlay.classList.add('hidden');
  } else {
    await openMicrocheck();
  }
  applyMicrocheckLock();
}

async function submitMicrocheck() {
  if (!microcheckState.data) {
    return;
  }

  const unanswered = (microcheckState.data.questions || []).filter(
    (question) => !microcheckState.answers.has(question.question_id),
  );
  if (unanswered.length > 0) {
    appendToLog('Please answer every microcheck question before submitting.\n', true);
    return;
  }

  const sessionId = ensureSessionId();
  const base = trimTrailingSlash($backendUrl.value.trim() || 'http://localhost:8000');
  const payload = {
    session_id: sessionId,
    microcheck_id: microcheckState.data.microcheck_id,
    answers: microcheckState.data.questions.map((question) => ({
      question_id: question.question_id,
      selected_option_id: microcheckState.answers.get(question.question_id) || '',
    })),
  };

  try {
    const response = await fetch(`${base}/microchecks/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `Submit failed (${response.status})`);
    }

    const result = await response.json();
    appendToLog(`\n[Microcheck feedback]\n${result.feedback}\n`);
    microcheckState.pending = false;
    microcheckState.data = null;
    microcheckState.answers.clear();
    microcheckState.dismissed = false;
    $microcheckFeedback.textContent = result.feedback || 'Thanks!';
    $microcheckFeedback.classList.remove('hidden');
    closeMicrocheck(false);
    applyMicrocheckLock();
    await refreshState();
    await loadHistory();
  } catch (err) {
    appendToLog(`Microcheck submit error: ${err instanceof Error ? err.message : String(err)}\n`, true);
  }
}

function renderState(data) {
  if (!data) {
    $stateNextPrompt.textContent = '--';
    $stateLastPrompt.textContent = '--';
    $stateAttempts.textContent = '0';
    $stateThreshold.textContent = '0';
    $stateRemaining.textContent = '--';
    $stateMinWords.textContent = '--';
    resetClassificationDisplay();
    $stateGuidanceReady.textContent = '--';
    $useGuidanceToggle.checked = false;
    $useGuidanceToggle.disabled = true;
    $guidanceStatus.textContent = GUIDANCE_LOCKED_TEXT;
    $stateMicrocheckPending.textContent = '--';
    $stateMicrocheckRemaining.textContent = '--';
    renderTopics([]);
    return;
  }

  const nextPrompt = data.next_prompt || 'friction';
  const lastPrompt = data.last_prompt || 'friction';
  const attempts = Number(data.friction_attempts ?? 0);
  const threshold = Number(data.friction_threshold ?? 0);
  const remaining = Number(data.responses_needed ?? Math.max(threshold - attempts, 0));
  const guidanceReady = Boolean(data.guidance_ready);
  const microcheckPending = Boolean(data.microcheck_pending);
  const microcheckRemaining = Number(data.microcheck_turns_remaining ?? 0);
  const topics = Array.isArray(data.topics) ? data.topics : [];
  const label = data.classification_label || '--';
  const sourceRaw = data.classification_source || '';
  const rationale = data.classification_rationale && data.classification_rationale.trim().length > 0
    ? data.classification_rationale
    : null;
  const sourceDisplay = describeSource(sourceRaw);
  const llmUsage = describeLLMUsage(sourceRaw, label);
  applySourceBadgeClass(sourceRaw || (label !== '--' ? 'unknown' : ''));
  const rawOutputDisplay = formatRawOutput(sourceRaw, data.classification_raw, label);

  $stateNextPrompt.textContent = nextPrompt;
  $stateLastPrompt.textContent = lastPrompt;
  $stateAttempts.textContent = attempts;
  $stateThreshold.textContent = threshold;
  $stateRemaining.textContent = remaining;
  $stateMinWords.textContent = data.min_words ?? '--';
  $stateGuidanceReady.textContent = guidanceReady ? 'Yes' : 'No';
  $stateMicrocheckPending.textContent = microcheckPending ? 'Yes' : 'No';
  $stateMicrocheckRemaining.textContent = microcheckPending ? '0' : microcheckRemaining;
  renderTopics(topics);
  $stateClassificationLabel.textContent = label;
  $stateClassificationSource.textContent = sourceDisplay;
  $stateClassificationLLM.textContent = llmUsage;
  $stateClassificationRationale.textContent = rationale ?? '--';
  $stateClassificationRaw.textContent = rawOutputDisplay;

  if (guidanceReady) {
    $useGuidanceToggle.disabled = false;
    $guidanceStatus.textContent = GUIDANCE_READY_TEXT;
  } else {
    $useGuidanceToggle.checked = false;
    $useGuidanceToggle.disabled = true;
    $guidanceStatus.textContent = GUIDANCE_LOCKED_TEXT;
  }
}

async function loadHistory() {
  const base = trimTrailingSlash($backendUrl.value.trim() || 'http://localhost:8000');
  const sessionId = ensureSessionId();
  if (!sessionId) {
    renderHistory([]);
    return;
  }

  try {
    const response = await fetch(`${base}/chat/history?session_id=${encodeURIComponent(sessionId)}`);
    if (response.status === 404) {
      renderHistory([]);
      return;
    }
    if (!response.ok) {
      throw new Error(`Failed to load history: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    renderHistory(data.messages || []);
  } catch (err) {
    $historyLog.textContent = `History error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function setActiveSession(sessionId) {
  if (!sessionId) return;
  $sessionId.value = sessionId;
  clearMicrocheckState();
  await refreshSessionsList(sessionId);
  await refreshState();
  await loadHistory();
}

async function sendMessage() {
  if (abortController) {
    appendToLog('A stream is already in progress.\n', true);
    return;
  }

  if (microcheckState.pending) {
    appendToLog('Complete the pending microcheck before sending another message.\n', true);
    microcheckState.dismissed = false;
    openMicrocheck();
    return;
  }

  const base = trimTrailingSlash($backendUrl.value.trim() || 'http://localhost:8000');
  let sessionId = ensureSessionId();
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    state.sessions = [
      { session_id: sessionId, updated_at: new Date().toISOString(), message_count: 0 },
      ...state.sessions,
    ];
    renderSessions(sessionId);
  }

  const input = $message.value.trim();
  if (!input) {
    appendToLog('Please enter a learner message before sending.\n', true);
    return;
  }

  const useGuidance = Boolean($useGuidanceToggle.checked && !$useGuidanceToggle.disabled);

  $log.textContent = '';
  $log.classList.remove('error');
  $sendBtn.disabled = true;
  $resetBtn.disabled = true;
  $refreshBtn.disabled = true;
  $historyBtn.disabled = true;

  let encounteredError = false;
  abortController = new AbortController();

  try {
    const response = await fetch(`${base}/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        message: input,
        use_guidance: useGuidance,
      }),
      signal: abortController.signal,
    });

    if (!response.ok || !response.body) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`);
    }

    const reader = response.body.getReader();
    let buffer = '';

    const processEvent = (rawEvent) => {
      if (!rawEvent) return;

      const lines = rawEvent.split('\n');
      let eventType = 'message';
      let dataLine = '';

      lines.forEach((line) => {
        if (line.startsWith('event:')) eventType = line.replace('event:', '').trim();
        if (line.startsWith('data:')) dataLine = line.replace('data:', '').trim();
      });

      if (!dataLine) return;

      try {
        const payload = JSON.parse(dataLine);
        if (eventType === 'error') {
          encounteredError = true;
          appendToLog(`\n[error] ${payload.message}\n`, true);
          abortController.abort();
          return;
        }
        if (eventType === 'end') {
          appendToLog('\n[stream complete]\n');
          return;
        }
        if (payload.type === 'token') {
          appendToLog(payload.data);
        }
      } catch (err) {
        encounteredError = true;
        appendToLog(`\nFailed to parse event payload: ${err instanceof Error ? err.message : String(err)}\n`, true);
        abortController.abort();
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';
      events.forEach((event) => processEvent(event.trim()));
    }

    if (buffer.trim()) {
      processEvent(buffer.trim());
    }

    if (!encounteredError) {
      await refreshState();
      await loadHistory();
      await refreshSessionsList(sessionId);
    }
  } catch (err) {
    if (!(abortController && abortController.signal.aborted)) {
      appendToLog(`\nStreaming error: ${err instanceof Error ? err.message : String(err)}\n`, true);
      await refreshState();
      await loadHistory();
    }
  } finally {
    abortController = null;
    $resetBtn.disabled = false;
    $refreshBtn.disabled = false;
    $historyBtn.disabled = false;
    if (!$useGuidanceToggle.disabled) {
      $useGuidanceToggle.checked = false;
    }
    if (microcheckState.pending) {
      applyMicrocheckLock();
    } else {
      $sendBtn.disabled = false;
      $message.disabled = false;
    }
  }
}

async function resetSession() {
  const base = trimTrailingSlash($backendUrl.value.trim() || 'http://localhost:8000');
  const sessionId = $sessionId.value.trim();
  if (!sessionId) {
    appendToLog('Select or create a session before resetting.\n', true);
    return;
  }

  try {
    const response = await fetch(`${base}/chat/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    });
    if (!response.ok) {
      throw new Error(`Reset failed: ${response.status} ${response.statusText}`);
    }
    $log.textContent = '[session cleared]\n';
    state.sessions = state.sessions.filter((session) => session.session_id !== sessionId);
    await refreshSessionsList();
    renderState(null);
    renderHistory([]);
    $sessionId.value = '';
    clearMicrocheckState();
  } catch (err) {
    appendToLog(`Reset error: ${err instanceof Error ? err.message : String(err)}\n`, true);
  }
}

async function createNewSession() {
  const id = crypto.randomUUID();
  state.sessions = [
    { session_id: id, updated_at: new Date().toISOString(), message_count: 0 },
    ...state.sessions.filter((session) => session.session_id !== id),
  ];
  renderSessions(id);
  renderState(null);
  renderHistory([]);
  clearMicrocheckState();
}

$sendBtn.addEventListener('click', (event) => {
  event.preventDefault();
  sendMessage();
});

$resetBtn.addEventListener('click', (event) => {
  event.preventDefault();
  resetSession();
});

$refreshBtn.addEventListener('click', (event) => {
  event.preventDefault();
  refreshState();
});

$historyBtn.addEventListener('click', (event) => {
  event.preventDefault();
  loadHistory();
});

$microcheckForm.addEventListener('change', handleMicrocheckOptionChange);
$microcheckSubmit.addEventListener('click', (event) => {
  event.preventDefault();
  submitMicrocheck();
});
$microcheckLater.addEventListener('click', (event) => {
  event.preventDefault();
  closeMicrocheck(true);
});
$microcheckClose.addEventListener('click', (event) => {
  event.preventDefault();
  closeMicrocheck(true);
});
$microcheckOpen.addEventListener('click', async (event) => {
  event.preventDefault();
  microcheckState.dismissed = false;
  await openMicrocheck(true);
});

$newSessionBtn.addEventListener('click', (event) => {
  event.preventDefault();
  createNewSession();
});

$useSessionBtn.addEventListener('click', (event) => {
  event.preventDefault();
  const selected = $sessionSelect.value;
  if (!selected) {
    appendToLog('Select a session from the dropdown first.\n', true);
    return;
  }
  setActiveSession(selected);
});

$sessionSelect.addEventListener('change', () => {
  const selected = $sessionSelect.value;
  if (selected) {
    $sessionId.value = selected;
  }
});

$message.addEventListener('input', updateWordCount);

window.addEventListener('load', () => {
  updateWordCount();
  (async () => {
    await refreshSessionsList();
    const active = ensureSessionId();
    if (active) {
      await setActiveSession(active);
    } else {
      renderState(null);
      renderHistory([]);
    }
  })();
});
