# Core Tech Usage Map

This map shows, at a file level, where each core library/framework is connected.

## Directory & Tech Map

```
project_code/
├── frontend/  (Next.js + React)
│   ├── app/
│   │   ├── layout.jsx                  # Next.js app shell (React)
│   │   ├── page.jsx                    # Role chooser (React)
│   │   ├── Student/chat/page.jsx       # Chat UI calling FastAPI chat endpoints
│   │   ├── Student/Quizzes/...         # Quiz UIs calling FastAPI quiz endpoints
│   │   ├── Instructor/QuizGenerator/page.jsx   # Upload/ingest UI (calls /ingest)
│   │   ├── Instructor/Dashboard/page.jsx       # Analytics UI (calls /analytics)
│   │   └── Instructor/Practice|Assessment/...  # Quiz launch UIs
│   ├── components/                     # Shared React components
│   ├── app/globals.css                 # Tailwind-applied global styles
│   ├── postcss.config.mjs              # Tailwind via @tailwindcss/postcss
│   ├── tsconfig.json                   # TypeScript config
│   ├── eslint.config.mjs               # ESLint + eslint-config-next
│   ├── next.config.ts                  # Next.js/Babel presets (implicit)
│   ├── jest.config.js / jest.setup.js  # Jest setup for frontend tests
│   └── lib/flag.js                     # Client feature flags
├── backend/  (Python FastAPI)
│   ├── app/
│   │   ├── main.py                     # FastAPI routes (chat, ingest, quiz, analytics)
│   │   └── schemas.py                  # Pydantic request/response models
│   ├── clients/
│   │   ├── llm/
│   │   │   ├── service.py              # LangChain ChatOpenAI (OpenRouter) chat streaming
│   │   │   ├── classifier.py           # LangChain ChatOpenAI turn classifier
│   │   │   ├── settings.py             # OpenRouter creds/base URL, model names
│   │   │   └── telemetry.py            # Usage logging
│   │   ├── quiz/
│   │   │   ├── service.py              # Quiz lifecycle; calls retriever + generator
│   │   │   ├── generator.py            # LangChain ChatOpenAI question generation
│   │   │   └── settings.py             # Quiz tuning (streaks, retrieval sampling)
│   │   ├── ingestion/
│   │   │   └── pipeline.py             # LangChain GoogleGenerativeAIEmbeddings; Pinecone upsert
│   │   ├── rag/
│   │   │   └── retriever.py            # GoogleGenAI embeddings for queries; Pinecone search
│   │   └── database/
│   │       ├── chat_repository.py      # Firestore chat persistence
│   │       ├── quiz_repository.py      # Firestore quiz defs/sessions/questions
│   │       ├── pinecone.py             # Pinecone client wrapper
│   │       └── firebase.py             # Firestore client bootstrap
│   ├── ping_app.py                     # Lightweight /ping FastAPI app
│   └── tests/                          # pytest suite
└── ARCHITECTURE_MAP.md                 # (this file)
```

## How Each Technology Is Used

- **Next.js / React**: `frontend/app/*` pages/components render UI and call FastAPI endpoints for chat, ingestion, quizzes, and analytics.
- **Tailwind CSS**: Applied via PostCSS plugin (`frontend/postcss.config.mjs`) and `app/globals.css`.
- **TypeScript / ESLint / Babel (Next presets)**: TS config (`frontend/tsconfig.json`), lint (`frontend/eslint.config.mjs` with eslint-config-next), Next/Babel via `frontend/next.config.ts`.
- **Frontend testing (Jest)**: Config/setup in `frontend/jest.config.js` and `frontend/jest.setup.js`; tests alongside pages/components.
- **FastAPI backend**: Routes in `backend/app/main.py`, schemas in `backend/app/schemas.py`, optional ping app in `backend/ping_app.py`.
- **LLM/AI (LangChain, OpenAI/OpenRouter, LangChain Google GenAI)**:
  - Chat/streaming: `backend/clients/llm/service.py` (ChatOpenAI via OpenRouter).
  - Turn classification: `backend/clients/llm/classifier.py` (ChatOpenAI via OpenRouter).
  - Quiz generation: `backend/clients/quiz/generator.py` (ChatOpenAI via OpenRouter).
  - Embeddings: `backend/clients/ingestion/pipeline.py` and `backend/clients/rag/retriever.py` (GoogleGenerativeAIEmbeddings via langchain-google-genai).
  - Config (API keys, model names, base URLs): `backend/clients/llm/settings.py`.
- **Data / Services**:
  - Firestore: `backend/clients/database/chat_repository.py`, `quiz_repository.py`, bootstrap `firebase.py`.
  - Pinecone: `backend/clients/database/pinecone.py`; ingestion/upsert in `ingestion/pipeline.py`; retrieval in `rag/retriever.py`.
- **Backend testing (pytest)**: Config `backend/pytest.ini`; tests under `backend/tests/`.
