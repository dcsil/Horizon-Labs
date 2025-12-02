# Horizon Labs Backend (FastAPI)

FastAPI service providing streaming chat, ingestion, and quiz APIs. For overall context, see `project_code/README.md`.

## Directory & Tech Map (file-level)
```
backend/
├── app/
│   ├── main.py             # FastAPI routes (chat, ingest, quiz, analytics, health)
│   └── schemas.py          # Pydantic request/response models
├── clients/
│   ├── llm/
│   │   ├── service.py      # Chat streaming (LangChain ChatOpenAI via OpenRouter)
│   │   ├── classifier.py   # Turn classification (ChatOpenAI via OpenRouter)
│   │   ├── settings.py     # OpenRouter/Gemini/Pinecone/env config
│   │   └── telemetry.py    # Structured usage logging
│   ├── quiz/
│   │   ├── service.py      # Quiz lifecycle (sessions, grading, analytics)
│   │   ├── generator.py    # Quiz MCQ generation (ChatOpenAI via OpenRouter)
│   │   └── settings.py     # Quiz tuning (streaks, retrieval sampling)
│   ├── ingestion/
│   │   └── pipeline.py     # PPTX/PDF extract → chunk → Gemini embeddings → Pinecone upsert
│   ├── rag/
│   │   └── retriever.py    # Pinecone retrieval using Gemini embeddings for queries
│   └── database/
│       ├── chat_repository.py   # Firestore chat persistence (fallback in-memory)
│       ├── quiz_repository.py   # Firestore quiz defs/sessions/questions (fallback in-memory)
│       ├── pinecone.py          # Pinecone client wrapper
│       └── firebase.py          # Firestore client bootstrap
├── test_frontend/          # HTML/JS harness used to exercise APIs (not frontend tests)
├── tests/                  # pytest suite
├── ping_app.py             # Lightweight /ping app
├── requirements.txt        # Python dependencies
└── .env.example            # Sample environment variables
```

## Configuration (backend/.env)
- OpenRouter LLM: `OPENROUTER_API_KEY` (required), `OPENROUTER_BASE_URL`, `OPENROUTER_MODEL_NAME`, `OPENROUTER_TIMEOUT_SECONDS`.
- Gemini embeddings: `GOOGLE_API_KEY` (required for ingestion/retrieval).
- Pinecone: `PINECONE_API_KEY`, `PINECONE_INDEX_NAME`, `PINECONE_ENVIRONMENT` (if needed), `PINECONE_NAMESPACE`, optional `PINECONE_INDEX_DIMENSION`.
- Firestore: `FIREBASE_PROJECT_ID`, `GOOGLE_APPLICATION_CREDENTIALS` (service account JSON path).
- Friction/classifier/ingestion tuning: `FRICTION_*`, `TURN_CLASSIFIER_*`, `INGEST_BATCH_SIZE`.
- Quiz tuning: `QUIZ_*` in `clients/quiz/settings.py` (see defaults there).

## Setup
```bash
cd project_code/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in required keys
```

## Run
```bash
uvicorn app.main:app --reload --port 8000
# docs: http://localhost:8000/docs
```

## Tests
```bash
cd project_code/backend
pytest -q
```

## Key Behaviors (where to look)
- Chat streaming (`POST /chat/stream`): `clients/llm/service.py` builds prompts (friction/guidance), classifies the learner turn, streams via ChatOpenAI. Persists to Firestore if configured (`clients/database/chat_repository.py`), otherwise in-memory.
- Turn classification: `clients/llm/classifier.py` (ChatOpenAI) with heuristic fallback; guided by `turn_classifier_*` settings.
- Ingestion (`POST /ingest/upload`): `clients/ingestion/pipeline.py` parses PPTX/PDF, chunks, embeds with Gemini, and upserts to Pinecone (`clients/database/pinecone.py`); configure in `clients/llm/settings.py`.
- Retrieval + quiz generation: `clients/rag/retriever.py` queries Pinecone with Gemini embeddings; `clients/quiz/generator.py` uses ChatOpenAI to generate MCQs from retrieved contexts; orchestrated by `clients/quiz/service.py`.
- Quiz lifecycle: `clients/quiz/service.py` manages sessions, difficulty adaptation, missed-question review, analytics; persistence in `clients/database/quiz_repository.py` (Firestore or in-memory).

## Known Bugs
- **Incorrect citations on quiz questions**: Retrieval shuffles Pinecone matches for coverage (`clients/rag/retriever.py`), but `clients/quiz/service.py` stamps the question’s `source_metadata` with only the first (shuffled) context. This can point citations to the wrong slide/page. Potential fix: keep the shuffle but persist all contexts (or model-tagged one) on the question and render citations from that list; or stop shuffling and use score order if you only want the top match.

## Links
- Project overview: [../README.md](../README.md)
- Frontend docs: [../frontend/README.md](../frontend/README.md)
