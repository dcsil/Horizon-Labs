# Horizon Labs Frontend (Next.js)

Next.js + React UI for student chat/quizzes and instructor ingestion/analytics. For platform overview, see `../README.md`.

## Directory & Tech Map (file-level)
```
frontend/
├── app/
│   ├── layout.jsx                  # Next.js app shell
│   ├── page.jsx                    # Role chooser
│   ├── Student/
│   │   ├── chat/page.jsx           # Chat UI calling FastAPI chat endpoints
│   │   ├── Quizzes/...             # Quiz UIs calling FastAPI quiz endpoints
│   │   └── HomePage/page.jsx       # Student landing
│   ├── Instructor/
│   │   ├── QuizGenerator/page.jsx  # Upload/ingest UI (calls /ingest)
│   │   ├── Dashboard/page.jsx      # Analytics UI (calls /analytics)
│   │   └── Practice|Assessment/... # Quiz launch UIs
│   └── components/                # Layout wrappers, shared UI (App Router co-location)
├── components/                    # Shared React components (e.g., RoleSwitch)
├── lib/                           # Feature flags/helpers (e.g., lib/flag.js)
├── public/                        # Static assets
├── postcss.config.mjs             # Tailwind via @tailwindcss/postcss
├── tsconfig.json                  # TypeScript config
├── eslint.config.mjs              # ESLint (eslint-config-next)
├── next.config.ts                 # Next.js/Babel presets
├── jest.config.js / jest.setup.js # Jest config/setup
└── package.json                   # Scripts/deps
```

## Configuration
- Create `frontend/.env.local` with `NEXT_PUBLIC_BACKEND_URL` pointing to the running FastAPI base URL (e.g., `http://localhost:8000` or your deployed API).

## Setup
```bash
cd project_code/frontend
npm install
```

## Run
```bash
npm run dev   # http://localhost:3000
```

## Tests
```bash
npm test      # Jest tests co-located with pages/components
```

## Where to change things
- Chat UI/logic: `app/Student/chat/page.jsx` (message handling, SSE wire-up); diagnostics/toggles live here.
- Quiz UI flow: `app/Student/Quizzes/...` (start session, render questions, submit answers); instructor launch flows in `app/Instructor/Practice|Assessment/...`.
- Ingestion UI: `app/Instructor/QuizGenerator/page.jsx` (uploads to `/ingest/upload`).
- Analytics UI: `app/Instructor/Dashboard/page.jsx` (calls `/analytics/chats` and `/analytics/quizzes`).
- Shared UI and flags: `components/` for reusable pieces; `lib/flag.js` for feature flags (e.g., instructor banner).
- Tailwind/global styles: `app/globals.css` (Tailwind via PostCSS plugin).
- API base URL: set via `NEXT_PUBLIC_BACKEND_URL` in `.env.local`.

## Links
- Project overview: [../README.md](../README.md)
- Backend docs: [../backend/README.md](../backend/README.md)
