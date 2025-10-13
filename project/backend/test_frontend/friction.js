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
    return;
  }

  try {
    const response = await fetch(`${base}/debug/friction-state?session_id=${encodeURIComponent(sessionId)}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch state: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    renderState(data);
  } catch (err) {
    renderState(null);
    appendToLog(`State error: ${err instanceof Error ? err.message : String(err)}\n`, true);
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

function renderState(data) {
  if (!data) {
    $stateNextPrompt.textContent = '--';
    $stateLastPrompt.textContent = '--';
    $stateAttempts.textContent = '0';
    $stateThreshold.textContent = '0';
    $stateRemaining.textContent = '--';
    $stateMinWords.textContent = '--';
    resetClassificationDisplay();
    return;
  }

  const nextPrompt = data.next_prompt || 'friction';
  const lastPrompt = data.last_prompt || 'friction';
  const attempts = Number(data.friction_attempts ?? 0);
  const threshold = Number(data.friction_threshold ?? 0);
  const remaining = Number(data.responses_needed ?? Math.max(threshold - attempts, 0));
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
  $stateClassificationLabel.textContent = label;
  $stateClassificationSource.textContent = sourceDisplay;
  $stateClassificationLLM.textContent = llmUsage;
  $stateClassificationRationale.textContent = rationale ?? '--';
  $stateClassificationRaw.textContent = rawOutputDisplay;
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
  await refreshSessionsList(sessionId);
  await refreshState();
  await loadHistory();
}

async function sendMessage() {
  if (abortController) {
    appendToLog('A stream is already in progress.\n', true);
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
      body: JSON.stringify({ session_id: sessionId, message: input }),
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
    $sendBtn.disabled = false;
    $resetBtn.disabled = false;
    $refreshBtn.disabled = false;
    $historyBtn.disabled = false;
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
