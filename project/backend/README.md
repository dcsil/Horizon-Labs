# Horizon Labs Backend

A lightweight FastAPI service that streams chat responses from an OpenRouter-hosted language model. The service maintains in-memory conversation state keyed by session id and exposes a static test client for manual verification.

## Project Structure

```
backend/
├── app/
│   ├── main.py             # FastAPI application and API routes
│   └── schemas.py          # Pydantic request models shared by endpoints
├── clients/
│   ├── database/
│   │   ├── firebase.py
│   │   └── pinecone.py
│   └── llm/
│       ├── __init__.py
│       ├── service.py      # LangChain-based chat service with session memory
│       ├── settings.py     # Environment-driven configuration loader
│       └── telemetry.py    # Structured logging helper
├── test_frontend/          # Minimal static UI for local testing
│   ├── index.html
│   ├── script.js
│   ├── styles.css
│   └── README.md
├── requirements.txt
└── .env (local)            # API keys and model configuration (not committed)
```

## Configuration

The service reads the following environment variables (populate `backend/.env`):

- `OPENROUTER_API_KEY` (required): key for the OpenRouter API.
- `OPENROUTER_BASE_URL` (optional): defaults to `https://openrouter.ai/api/v1`.
- `OPENROUTER_MODEL_NAME` (optional): defaults to `google/gemini-2.0-flash-exp:free`.
- `OPENROUTER_TIMEOUT_SECONDS` (optional): request timeout in seconds (default `40`).
- `TELEMETRY_ENABLED` (optional): `true` to emit usage logs (default `true`).
- `TELEMETRY_SAMPLE_RATE` (optional): fraction `0–1` of requests to log (default `1.0`).
- `FRICTION_ATTEMPTS_REQUIRED` (optional): number of qualifying learner responses before direct guidance is unlocked (default `3`).
- `FRICTION_MIN_WORDS` (optional): minimum learner word count for a response to count toward the friction gate (default `15`).

`backend/clients/llm/settings.py` loads these values once per process using `dotenv` and `pydantic`.

## LLM Service

`backend/clients/llm/service.py` wraps a single LangChain `ChatOpenAI` client:

- Maintains per-service system prompts (friction vs. guidance vs. quiz) to shape model behaviour.
- Applies an adaptive friction gate, requiring a configurable number of substantive learner responses before direct answers are given.
- Maintains `HumanMessage` / `AIMessage` history per `session_id` in memory.
- Streams model tokens via `llm.astream(...)`, yielding each chunk to callers.
- Appends both user input and model output to the session history for continuity.
- Records telemetry events (latency, token usage, estimated cost) via structured logging when enabled.
- Provides `reset_session(session_id)` to clear stored turns.

> Because memory is in-process, conversation history resets when the server restarts or if multiple workers are used.

## API Endpoints

Defined in `backend/app/main.py`:

- `GET /health` – Simple liveness probe.
- `POST /chat/stream` – Accepts `ChatStreamRequest` and returns an SSE stream of tokens (`text/event-stream`).
  - Request body: `{ session_id, message, context?, metadata? }`.
  - Response format: `data:` lines with `{ "type": "token", "data": "..." }`, followed by an `event: end` sentinel.
- `POST /chat/reset` – Clears in-memory history for a given session id.
- `POST /ingest/upload` – Skeleton accepting a file + metadata and returning HTTP 501 until the ingestion pipeline is implemented.
- `POST /quiz/stream` – SSE scaffold for quiz generation; currently returns an `event: error` noting the feature is pending.
- `GET /debug/friction-state` – Development helper that returns the adaptive friction counters for a given `session_id`.

FastAPI’s dependency injection (`Depends(get_llm_service)`) ensures a single `LLMService` instance is reused per process.

## Running the API

```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

Visit Swagger docs at `http://localhost:8000/docs` for interactive requests. When invoking `/chat/stream`, use a streaming-capable HTTP client (curl with `-N`, Postman SSE, etc.) to observe incremental tokens.

## Test Frontend

`backend/test_frontend` contains a static HTML page that interacts with the API through the browser:

1. Serve the assets:
   ```bash
   cd backend/test_frontend
   python3 -m http.server 3001
   ```
2. Ensure the backend is running (default `http://localhost:8000`).
3. Open `http://localhost:3001/index.html`.
4. Fill in the message, optional context/metadata, and click **Send Message**. Tokens stream into the log panel.
5. Use **Reset Session** to clear both the visible transcript and the backend memory for the current `session_id`.

## Development Notes

- CORS is fully open (`allow_origins="*"`) for ease of local testing; tighten before production use.
- The SSE streaming response wraps errors in an `event: error` message and always emits `event: end` to let clients clean up.
- Telemetry logging initialises only when `TELEMETRY_ENABLED=true`; events appear as JSON at INFO level on the `telemetry` logger.
- No persistence layer is configured yet—consider plugging the session store into Redis or a database if you need durability or multi-worker support.
