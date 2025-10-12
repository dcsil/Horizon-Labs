const $backendUrl = document.querySelector('#backend-url');
const $sessionId = document.querySelector('#session-id');
const $context = document.querySelector('#context');
const $metadata = document.querySelector('#metadata');
const $message = document.querySelector('#message');
const $sendBtn = document.querySelector('#send-btn');
const $resetBtn = document.querySelector('#reset-btn');
const $historyBtn = document.querySelector('#history-btn');
const $log = document.querySelector('#stream-log');
const $historyLog = document.querySelector('#history-log');

const decoder = new TextDecoder('utf-8');

function ensureSessionId() {
  if ($sessionId.value.trim()) return $sessionId.value.trim();
  const randomId = crypto.randomUUID();
  $sessionId.value = randomId;
  return randomId;
}

function appendToLog(text, { isError = false } = {}) {
  $log.textContent += text;
  if (isError) {
    $log.classList.add('error');
  } else {
    $log.classList.remove('error');
  }
  $log.scrollTop = $log.scrollHeight;
}

async function sendMessage() {
  $sendBtn.disabled = true;
  $resetBtn.disabled = true;
  $log.textContent = '';

  let parsedMetadata;
  if ($metadata.value.trim()) {
    try {
      parsedMetadata = JSON.parse($metadata.value);
    } catch (err) {
      appendToLog(`Invalid metadata JSON: ${err.message}\n`, { isError: true });
      $sendBtn.disabled = false;
      return;
    }
  }

  const payload = {
    session_id: ensureSessionId(),
    message: $message.value,
    context: $context.value || undefined,
    metadata: parsedMetadata,
  };

  try {
    const response = await fetch($backendUrl.value, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok || !response.body) {
      appendToLog(`Request failed: ${response.status} ${response.statusText}\n`, {
        isError: true,
      });
      return;
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

    await loadHistory();
  } catch (err) {
    appendToLog(`Network error: ${err.message}\n`, { isError: true });
  } finally {
    $sendBtn.disabled = false;
    $resetBtn.disabled = false;
  }
}

function buildEndpointUrl(endpoint, queryParams = null) {
  try {
    const url = new URL($backendUrl.value);
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length === 0) {
      segments.push('chat', endpoint);
    } else {
      segments[segments.length - 1] = endpoint;
    }
    url.pathname = `/${segments.join('/')}`;
    url.search = '';
    if (queryParams) {
      const search = new URLSearchParams(queryParams);
      url.search = search.toString();
    }
    return url.toString();
  } catch (err) {
    appendToLog(`\nInvalid backend URL: ${err.message}\n`, { isError: true });
    throw err;
  }
}

async function resetSession() {
  const sessionId = $sessionId.value.trim();
  if (!sessionId) {
    appendToLog('Set a session id before resetting.\n', { isError: true });
    return;
  }

  $resetBtn.disabled = true;
  $log.textContent = '';
  $log.classList.remove('error');

  try {
    const response = await fetch(buildEndpointUrl('reset'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ session_id: sessionId }),
    });

    if (!response.ok) {
      appendToLog(
        `\nReset failed: ${response.status} ${response.statusText}\n`,
        { isError: true },
      );
      return;
    }

    $log.textContent = '[session cleared]\n';
    $log.classList.remove('error');
  } catch (err) {
    appendToLog(`\nReset error: ${err.message}\n`, { isError: true });
  } finally {
    $resetBtn.disabled = false;
  }
}

function renderHistory(messages) {
  if (!messages || messages.length === 0) {
    $historyLog.textContent = 'No persisted history found for this session.';
    return;
  }

  const lines = messages.map((entry) => {
    const timestamp = new Date(entry.created_at || Date.now()).toLocaleTimeString();
    const role = entry.role === 'assistant' ? 'AI' : 'User';
    return `[${timestamp}] ${role}: ${entry.content}`;
  });

  $historyLog.textContent = lines.join('\n');
}

async function loadHistory() {
  const sessionId = ensureSessionId();

  try {
    const historyUrl = buildEndpointUrl('history', { session_id: sessionId });
    const response = await fetch(historyUrl);
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    renderHistory(data.messages || []);
  } catch (err) {
    $historyLog.textContent = `Failed to load history: ${err.message}`;
  }
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
      appendToLog(`\n[error] ${payload.message}\n`, { isError: true });
      return;
    }
    if (eventType === 'end') {
      appendToLog('\n[conversation complete]\n');
      return;
    }
    if (payload.type === 'token') {
      appendToLog(payload.data);
    }
  } catch (err) {
    appendToLog(`\nFailed to parse event payload: ${err.message}\n`, {
      isError: true,
    });
  }
}

$sendBtn.addEventListener('click', (event) => {
  event.preventDefault();
  if (!$message.value.trim()) {
    appendToLog('Please enter a message before sending.\n', { isError: true });
    return;
  }
  sendMessage();
});

$resetBtn.addEventListener('click', (event) => {
  event.preventDefault();
  resetSession();
});

$historyBtn.addEventListener('click', (event) => {
  event.preventDefault();
  loadHistory();
});

$message.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    sendMessage();
  }
});

appendToLog('Ready. Click "Send Message" to begin.\n');
