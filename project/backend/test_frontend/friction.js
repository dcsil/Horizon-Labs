const $backendUrl = document.querySelector('#backend-url');
const $sessionId = document.querySelector('#session-id');
const $randomSession = document.querySelector('#random-session');
const $message = document.querySelector('#message');
const $wordCount = document.querySelector('#word-count');
const $sendBtn = document.querySelector('#send-btn');
const $resetBtn = document.querySelector('#reset-btn');
const $refreshBtn = document.querySelector('#refresh-state');
const $log = document.querySelector('#stream-log');

const $stateNextPrompt = document.querySelector('#state-next-prompt');
const $stateLastPrompt = document.querySelector('#state-last-prompt');
const $stateAttempts = document.querySelector('#state-attempts');
const $stateThreshold = document.querySelector('#state-threshold');
const $stateRemaining = document.querySelector('#state-remaining');
const $stateMinWords = document.querySelector('#state-min-words');

const decoder = new TextDecoder('utf-8');
let abortController = null;

function trimTrailingSlash(url) {
  return url.replace(/\/$/, '');
}

function ensureSessionId() {
  if ($sessionId.value.trim()) {
    return $sessionId.value.trim();
  }
  const id = crypto.randomUUID();
  $sessionId.value = id;
  return id;
}

function updateWordCount() {
  const words = $message.value.trim().split(/\s+/).filter(Boolean);
  $wordCount.textContent = `Word count: ${words.length}`;
}

async function refreshState() {
  const base = trimTrailingSlash($backendUrl.value.trim() || 'http://localhost:8000');
  const sessionId = ensureSessionId();

  try {
    const response = await fetch(`${base}/debug/friction-state?session_id=${encodeURIComponent(sessionId)}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch state: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    renderState(data);
  } catch (err) {
    renderState(null);
    appendToLog(`State error: ${err.message}\n`, true);
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
    return;
  }

  const nextPrompt = data.next_prompt || 'friction';
  const lastPrompt = data.last_prompt || 'friction';
  const attempts = Number(data.friction_attempts ?? 0);
  const threshold = Number(data.friction_threshold ?? 0);
  const remaining = Number(data.responses_needed ?? Math.max(threshold - attempts, 0));

  $stateNextPrompt.textContent = nextPrompt;
  $stateLastPrompt.textContent = lastPrompt;
  $stateAttempts.textContent = attempts;
  $stateThreshold.textContent = threshold;
  $stateRemaining.textContent = remaining;
  $stateMinWords.textContent = data.min_words ?? '--';
}

function appendToLog(text, isError = false) {
  $log.textContent += text;
  if (isError) {
    $log.classList.add('error');
  } else {
    $log.classList.remove('error');
  }
  $log.scrollTop = $log.scrollHeight;
}

function processEvent(rawEvent) {
  if (!rawEvent) return;

  const lines = rawEvent.split('\n');
  let eventType = 'message';
  let dataLine = '';

  for (const line of lines) {
    if (line.startsWith('event:')) {
      eventType = line.replace('event:', '').trim();
    }
    if (line.startsWith('data:')) {
      dataLine = line.replace('data:', '').trim();
    }
  }

  if (!dataLine) return;

  try {
    const payload = JSON.parse(dataLine);
    if (eventType === 'error') {
      appendToLog(`\n[error] ${payload.message}\n`, true);
      if (abortController) abortController.abort();
      return;
    }
    if (eventType === 'end') {
      appendToLog('\n[stream complete]\n');
      refreshState();
      return;
    }
    if (payload.type === 'token') {
      appendToLog(payload.data);
    }
  } catch (err) {
    appendToLog(`\nFailed to parse event payload: ${err.message}\n`, true);
    if (abortController) abortController.abort();
  }
}

async function sendMessage() {
  if (abortController) {
    appendToLog('A stream is already in progress.\n', true);
    return;
  }

  const base = trimTrailingSlash($backendUrl.value.trim() || 'http://localhost:8000');
  const sessionId = ensureSessionId();
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

  await refreshState();

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

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';
      for (const event of events) {
        processEvent(event.trim());
      }
    }

    if (buffer.trim()) {
      processEvent(buffer.trim());
    }
  } catch (err) {
    if (!(abortController && abortController.signal.aborted)) {
      appendToLog(`\nStreaming error: ${err.message}\n`, true);
      await refreshState();
    }
  } finally {
    abortController = null;
    $sendBtn.disabled = false;
    $resetBtn.disabled = false;
    $refreshBtn.disabled = false;
  }
}

async function resetSession() {
  const base = trimTrailingSlash($backendUrl.value.trim() || 'http://localhost:8000');
  const sessionId = $sessionId.value.trim();
  if (!sessionId) {
    appendToLog('Set a session id before resetting.\n', true);
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
    await refreshState();
  } catch (err) {
    appendToLog(`Reset error: ${err.message}\n`, true);
  }
}

$message.addEventListener('input', updateWordCount);
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

$randomSession.addEventListener('click', (event) => {
  event.preventDefault();
  const id = crypto.randomUUID();
  $sessionId.value = id;
  refreshState();
});

window.addEventListener('load', () => {
  ensureSessionId();
  updateWordCount();
  refreshState();
});
