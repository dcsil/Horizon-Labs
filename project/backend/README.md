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

## Local Development Setup

1. **Install prerequisites**
   - Python 3.10+ (the project is tested with Python 3.11).
   - Optional: `pipx` or another virtual-env manager.
   - Optional: `google-cloud-firestore` credentials if you want persistence beyond the in-memory store.

2. **Create and activate a virtual environment**
   ```bash
   cd backend
   python3 -m venv .venv
   source .venv/bin/activate  # Windows: .venv\Scripts\activate
   ```

3. **Install dependencies**
   ```bash
   pip install --upgrade pip
   pip install -r requirements.txt
   ```

4. **Create your environment file**
   ```bash
   cp .env.example .env
   ```
   Open `.env` and replace the placeholder values. At minimum you must supply a valid `OPENROUTER_API_KEY`. Commit the real key to a secure secret manager—never to git.

5. **(Optional) Configure Firestore persistence**
   - Visit the Firebase console for your project and create a service account with Firestore access.
   - Download the JSON key file (e.g., `horizon-labs-xxxx.json`) and save it inside `backend/` or another secure directory that is ignored by git.
   - In `.env`, set:
     ```bash
     FIREBASE_PROJECT_ID=<your-project-id>
     GOOGLE_APPLICATION_CREDENTIALS=backend/<service-account-file>.json  # or an absolute path
     ```
   - If you skip this step the backend falls back to the in-memory repository, which is fine for quick local testing but does not persist sessions across restarts.

6. **Run the API**
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```

Once the server is running you can call `http://localhost:8000/health` or open `http://localhost:8000/docs` for interactive Swagger docs.

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
- `FIREBASE_PROJECT_ID` / `GOOGLE_APPLICATION_CREDENTIALS` (optional): only required when using the Firestore chat repository.
- `TURN_CLASSIFIER_ENABLED` (optional): enable the learner turn classification service (default `true`).
- `TURN_CLASSIFIER_MODEL` (optional): override the classification model (defaults to the main chat model).
- `TURN_CLASSIFIER_TEMPERATURE` / `TURN_CLASSIFIER_TIMEOUT_SECONDS` (optional): adjust sampling behaviour and timeout for the classifier.
- `EMBEDDING_MODEL_NAME` (optional): embedding model used for document ingestion (default `text-embedding-3-large`).
- `PINECONE_API_KEY` (required for ingestion): API key for the Pinecone vector index.
- `PINECONE_INDEX_NAME` (required for ingestion): name of the Pinecone index to upsert slide chunks into.
- `PINECONE_ENVIRONMENT` (optional): Pinecone project/environment identifier when required by the account type.
- `PINECONE_NAMESPACE` (optional): namespace used when writing vectors (defaults to `slides`).

`backend/clients/llm/settings.py` loads these values once per process using `dotenv` and `pydantic`.

## LLM Service

`backend/clients/llm/service.py` wraps a single LangChain `ChatOpenAI` client:

- Maintains per-service system prompts (friction vs. guidance vs. quiz) to shape model behaviour.
- Applies an adaptive friction gate, requiring a configurable number of substantive learner responses before direct answers are given.
- Runs a lightweight turn classifier on every learner message (`good` vs. `needs_focusing`) to inform the friction gate and persist coaching metadata.
- Persists chat transcripts to Firestore when the optional dependency is configured; otherwise falls back to an in-memory repository for local development.
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
- `GET /chat/history` – Returns the persisted transcript for a session so clients can restore the UI after refreshes.
- `GET /chat/sessions` – Lists all known chat sessions with last-updated timestamps and message counts.
- `POST /ingest/upload` – Accepts a slide deck (`.pptx`) and metadata, runs the ingestion pipeline, and returns counts for parsed slides and indexed chunks.
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
- If `google-cloud-firestore` is not installed or credentials are missing, the backend falls back to an in-memory chat repository suitable for local development. Provide `FIREBASE_PROJECT_ID` and service account credentials for persistence.

## Chat Persistence

- Provide a Firebase project (`FIREBASE_PROJECT_ID`) and service account credentials (`GOOGLE_APPLICATION_CREDENTIALS`) so the backend can write to Cloud Firestore. The path can be relative (inside `backend/`) or absolute.
- Each chat session is stored under the `chat_sessions` collection with the following document shape:
  - `messages`: ordered array of `{ role, content, display_content, created_at }` records.
  - `friction_progress`, `session_mode`, `last_prompt`: friction state needed for continuum gating.
- Missing or invalid credentials will cause the API to fall back to the in-memory repository; install `google-cloud-firestore` and configure credentials to enable persistence.

## Slide Ingestion Pipeline (M2.5-02)

Uploading a `.pptx` deck or `.pdf` handout to `POST /ingest/upload` now triggers the **parse → chunk → index** pipeline:

1. **Parse** – `python-pptx` extracts per-slide titles and body text while preserving slide numbers.
   - For PDF uploads, `pypdf` extracts page-level text (`Page N`) so downstream citations can reference page numbers.
2. **Chunk** – slide text is split into semantic chunks (controlled via `chunk_size`/`chunk_overlap`) but chained to the original slide number for citations.
3. **Embed** – each chunk is embedded with the configured OpenRouter-compatible embedding model (default `text-embedding-3-large`).
4. **Index** – vectors are upserted into Pinecone with metadata `{ document_id, slide_number, page_number?, chunk_index, slide_title, source_type, text, … }` so responses can cite `doc → slide/page` origins.

### Configure Pinecone

1. Create a Pinecone account and generate an API key (`Console → API Keys`).
2. Create an index named to match `PINECONE_INDEX_NAME` with:
   - **Dimension:** `3072` (matches `text-embedding-3-large`).
   - **Metric:** `cosine`.
   - **Pods/replicas:** adjust for your workload; start with the serverless default.
3. Export the following environment variables in `backend/.env`:

   ```bash
   PINECONE_API_KEY=pcn_xxxxxxxxxxxxxxxxx
   PINECONE_INDEX_NAME=horizon-slides
   # Optional if your key is tied to a specific project/environment
   PINECONE_ENVIRONMENT=us-east-1-aws
   PINECONE_NAMESPACE=slides
   EMBEDDING_MODEL_NAME=text-embedding-3-large
   ```

If any of the required Pinecone values are missing, the ingestion endpoint will return an HTTP 500 with guidance.

### Client Workflow

```bash
curl -X POST http://localhost:8000/ingest/upload \
   -F "session_id=abc123" \
   -F "file=@slides/week1.pptx" \
   -F 'metadata={"document_id": "week1", "course": "algebra"}'
```

Successful uploads respond with:

```json
{
   "status": "indexed",
   "document_id": "week1",
   "slide_count": 10,
   "chunk_count": 42,
   "namespace": "slides"
}
```

Use the returned `document_id` and stored `slide_number` / `chunk_index` metadata to ground citations in chat responses.
