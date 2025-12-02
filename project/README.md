# Horizon Labs Platform

***DISCLAIMER**: This repository DOES NOT host the live application, this happens in a separate repository linked in this disclaimer. The code in this folder ("project") is a copy of the production code which can be found in Horizon Labs' [code repository](https://github.com/oliviaw12/horizon-labs-code), which contains the CLI runs, GitHub workflows, and actual hosting.*

*This repository and the copy of the code here is provided to centralize all project-related material for ease of access to markers and reviewers. This code was last synced with the production repository on December 2, 2025 and represents the state of our Final Submission for CSC491.*

FastAPI backend and Next.js frontend for chat, ingestion, and adaptive quizzes powered by LLMs.

## Features
- Streaming chat with friction/guidance modes, turn classification, and telemetry.
- Quiz lifecycle: definitions, session management, adaptive difficulty, missed-question review.
- Document ingestion (PPTX/PDF) to Pinecone via Gemini embeddings for retrieval-grounded questions.
- Analytics for chat and quizzes.
- Frontend UIs for students (chat/quizzes) and instructors (ingestion, dashboard).

## Directory & Tech Map
```
project_code/
├── backend/  (Python FastAPI)
│   ├── app/
│   │   ├── main.py                     # FastAPI routes (chat, ingest, quiz, analytics)
│   │   └── schemas.py                  # Pydantic request/response models
│   ├── clients/
│   │   ├── llm/                        # Chat streaming, turn classifier (OpenRouter ChatOpenAI), settings, telemetry
│   │   ├── quiz/                       # Quiz lifecycle, question generator (ChatOpenAI), quiz settings
│   │   ├── ingestion/                  # PPTX/PDF extract → chunk → Gemini embeddings → Pinecone upsert
│   │   ├── rag/                        # Retrieval (Gemini embeddings) + Pinecone search
│   │   └── database/                   # Firestore repos (chat/quiz), Pinecone wrapper, Firebase bootstrap
│   ├── tests/                          # pytest suite
│   ├── test_frontend/                  # HTML/JS harness for backend during early dev (not frontend tests)
│   └── ping_app.py                     # Lightweight /ping app
├── frontend/  (Next.js + React)
│   ├── app/                            # Student/Instructor routes (chat, quizzes, ingestion, dashboard)
│   ├── components/                     # Shared UI
│   ├── lib/                            # Feature flags/helpers
│   ├── postcss.config.mjs              # Tailwind via @tailwindcss/postcss
│   ├── tsconfig.json                   # TypeScript config
│   ├── eslint.config.mjs               # ESLint (eslint-config-next)
│   ├── next.config.ts                  # Next.js/Babel presets
│   ├── jest.config.js / jest.setup.js  # Jest setup for frontend tests
├── product_research/                   # Discovery notes and artifacts
├── architecture/                       # System diagrams/designs
└── team/                               # Planning docs and process
```

## Tech Stack
- Frontend: Next.js (App Router), React, Tailwind (via PostCSS), TypeScript, ESLint (eslint-config-next), Jest.
- Backend: Python FastAPI, Pydantic; pytest.
- LLM/AI: LangChain ChatOpenAI via OpenRouter (chat, classifier, quiz generator); langchain-google-genai (Gemini embeddings) for ingestion/retrieval.
- Data/services: Google Cloud Firestore (chat/quiz storage), Pinecone (vector index).

## Configuration
- Backend `.env` (see `backend/.env.example`):
  - `OPENROUTER_API_KEY` and `OPENROUTER_BASE_URL` (from OpenRouter)
  - `OPENROUTER_MODEL_NAME` (e.g., `google/gemini-2.0-flash-exp:free`)
  - `GOOGLE_API_KEY` (for Gemini embeddings via langchain-google-genai)
  - `PINECONE_API_KEY`, `PINECONE_INDEX_NAME`, `PINECONE_ENVIRONMENT`, optional `PINECONE_INDEX_DIMENSION`
  - Firestore/Firebase: `GOOGLE_APPLICATION_CREDENTIALS` pointing to a service account JSON with Firestore access, and `FIREBASE_PROJECT_ID`
  - Friction/classifier/ingest tuning: `FRICTION_*`, `TURN_CLASSIFIER_*`, `INGEST_BATCH_SIZE`, etc.
- Frontend `.env.local`:
  - `NEXT_PUBLIC_BACKEND_URL` pointing to the running FastAPI base URL (e.g., `http://localhost:8000` or your deployed API)

## Setup
```bash
# install frontend deps
cd project_code/frontend
npm install

# install backend deps
cd ../backend
pip install -r requirements.txt
```

## Run Locally
```bash
# backend (http://localhost:8000)
cd project_code/backend
uvicorn app.main:app --reload --port 8000

# frontend (http://localhost:3000)
cd ../frontend
npm run dev
```

## Tests
```bash
# backend
cd project_code/backend
pytest -q

# frontend
cd ../frontend
npm test
```

## Deployment
- Frontend: deployable to Vercel (Next.js). Backend: deployable to Render/other FastAPI hosts. Configure env vars per above.

## CI / GitHub Workflows
- Workflow file: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).
- Triggers: `push` to `main`, `demo-2`, `demo-3`, `feature/**`; all `pull_request`; manual `workflow_dispatch`.
- Jobs:
  - **backend**: Python 3.11, installs `project_code/backend` deps, runs `pytest` with coverage, uploads `coverage.xml` and summary artifacts.
  - **frontend**: Node 20, installs `project_code/frontend` deps (`npm ci`), runs `npm run lint`, `npm run build`, `npm run test:ci`, uploads Jest coverage artifacts if present.
- To edit: modify `ci.yml` directly; keep `working-directory` paths pointing to `project_code/backend` and `project_code/frontend` for commands, and update branch filters or steps as needed.

## Notes
- The `backend/test_frontend` harness is a lightweight HTML/JS tool used to exercise backend APIs while the UI was in progress; not a frontend test suite.
- More detail: see [backend/README.md](backend/README.md) for backend specifics and [frontend/README.md](frontend/README.md) for frontend specifics.
- Architecture reference: see [ARCHITECTURE_MAP.md](ARCHITECTURE_MAP.md) for a file-level tech usage map showing where each core library/service is wired.
