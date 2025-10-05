# Horizon Labs Backend

A lightweight FastAPI service that streams chat responses from an OpenRouter-hosted language model. The service maintains in-memory conversation state keyed by session id and exposes a static test client for manual verification.

## Project Structure

```
backend/
├── app/
│   ├── main.py             # FastAPI application and API routes
│   └── schemas.py          # Pydantic request models shared by endpoints
├── llm/
│   ├── __init__.py
│   ├── service.py          # LangChain-based chat service with session memory
│   └── settings.py         # Environment-driven configuration loader
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
- `OPENROUTER_MODEL_NAME` (optional): defaults to `meta-llama/Meta-Llama-3.1-8B-Instruct`.
- `OPENROUTER_TIMEOUT_SECONDS` (optional): request timeout in seconds (default `40`).

`backend/llm/settings.py` loads these values once per process using `dotenv` and `pydantic`.

## LLM Service

`backend/llm/service.py` wraps a single LangChain `ChatOpenAI` client:

- Builds a system prompt that keeps responses concise and helpful.
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
- No persistence layer is configured yet—consider plugging the session store into Redis or a database if you need durability or multi-worker support.
