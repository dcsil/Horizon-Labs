# Final Submission - LearnLLM by Horizon Labs
This document contains the written portion of our final submission for CSC491, detailing our product, development process, and technical implementation.

***Disclaimer**: This code in the "project" folder is a copy of the production code which can be found in Horizon Labs' [code repository](https://github.com/oliviaw12/horizon-labs-code). This document and the code here is provided to centralize all project-related material for ease of access to markers and reviewers. The repository where we made the code changes and hosted the live application is separate and linked in this disclaimer.*

## Key Links
**Link to the hosted application:** [LearnLLM by Horizon Labs](https://horizon-labs-code.vercel.app/)

**Link to the demo video:** [LearnLLM MVP Demo](https://youtu.be/od7IbT6mm-k)

**Link to the code repository:** [Horizon Labs Code Repository](https://github.com/oliviaw12/horizon-labs-code)

# Table of Contents
1. [Product Overview](#1-product-overview)
2. [MVP Development Justification](#2-mvp-development-justification)
3. [Functional and Dynamic MVP (Description and Demo Video)](#3-functional-and-dynamic-mvp-description-and-demo-video)
4. [Code Quality & Test Coverage](#4-code-quality--test-coverage)
5. [Deployment Documentation](#5-deployment-documentation)
6. [Updated Architecture Diagram](#6-updated-architecture-diagram)

## 1. Product Overview
[↑ Back to Table of Contents](#table-of-contents)
### TL;DR
Horizon Labs strives to break down the invisible barrier in educational institutions between instructors and students' use of AI. Our solution to this is Learn LLM, an AI powered education platform combining a learning first AI chat and quizzes grounded in course material, with a dashboard giving instructors the ability to see where learners struggle and how they use AI. The result is AI that supports the end-to-end learning experience.

### JTBDs
- **As a university student**, when engaging with course material* (often using digital aids), I want to surface and close my knowledge gaps effectively while staying within institution policies, so I can save time, retain concepts long-term, and apply them confidently on assessments.
- **As a professor/teacher**, when running a course where students may use AI aids, I want to define allowable use and identify misconceptions across topics, so I can maintain academic standards and adjust instruction to improve learning outcomes.

*Course material includes lecture notes, textbooks, slides, assignments, and other resources provided by the instructor or institution. Our platform focuses and currently supports pptx and pdf based materials in the first phase.

Our JTBDs have not changed massively since the beginning of the semester. However what has changed is our understanding of *why* these are our JTBDs and how our solution should solve them. This will be explored further in the following section.
### MVP CUJs
1. **Core CUJs:** These CUJs have been **dynamically** implemented and are ready for use in our MVP.
   - Student CUJ 1 — Start a adaptive learning focused chat
   - Instructor CUJ 1 — Course Material Upload & Quiz Setup (connected to Student CUJ 2)
   - Student CUJ 2 — Start a slide based dynamic practice quiz session
   - Instructor CUJ 2 — Diagnose class understanding with Analytics Dashboard v1
2. **Future CUJs:** These CUJs are implemented **statically** in our MVP and show the future direction of our product.
   - Student CUJ 3 — Self-directed Flashcard generation & review
   - Instructor CUJ 3 — Configure LLM course policies & content scope

#### Completed CUJs:
#### Student CUJ 1 — Start a adaptive learning focused chat
**Statement:** Begin a chat session that helps me learn a topic, with adaptive guidance and friction to keep me focused.
**User path:**
1. Student creates a new adaptive chat session.
2. Student asks a question about a course topic. 
3. LLM does not provide a direct answer if the question is too broad or is asking for a direct answer. Instead, it guides the user towards the answer by breaking down the problem and having the user reflect or paraphrase (`friction` mode).
4. Student answers the follow-up questions, LLM checks and clarifies any misunderstandings before continuing to guide the user through the topic.
5. After each response, the LLM classifies the turn as `good` or `needs_focusing` based on the quality of the student's input based on the chat context. Good turns are those that show understanding and engagement with the topic, while needs_focusing turns indicate a lack of clarity or depth in the student's input (e.g., vague questions, off-topic, superficial engagement, or fishing for answers).
6. If the user is stuck, but has provided enough `good` turns (default 3), the next LLM turn can be switched from `friction` mode to `guidance` mode, where the LLM provides more direct explanations and examples to help the student understand the concept.
7. Repeat steps 2–6 until the student feels they have a good grasp of the topic.
8. At any point, the student can ask for a summary of the key points discussed in the chat session to reinforce their understanding.

*Future Work: These next steps may be added in a later phase and are based on [previous versions](use_cases_archive/use_cases_v1.md) of the CUJ.*
9. After each LLM response, the system offers a quick micro-check (MCQ or short answer) to test understanding of the concept just discussed.
10.  When the student returns to the chat later, the LLM first asks about topics that were mentioned in the last session focusing on problem topics.
11.  If the student has not engaged with the material for a while, the LLM can prompt them with a review question to reactivate their memory.

#### Instructor CUJ 1 — Course Material Upload & Quiz Setup (connected to Student CUJ 2)
**Statement:** Upload course materials and set up adaptive quizzes (generated from the material) that students can access. 

(This outlines the practice quiz workflow, which is the path that is dynamically implemented. Assessment quizzes are only statically implemented.)
**User path:**
1. Instructor opens Quiz Generator → Create a Quiz.
2. Clicks Upload Slide/Notes and selects a pdf/pptx file then clicks Ingest File.
3. System ingests the file (parse → chunk → index) and allows user to click next.
4. Instructor can then set Quiz title, description, and configure topics (e.g., what subtopics within the slides to focus on).
5. Instructor can then save, delete, or preview the quiz.
6. In preview mode, the instructor can generate and view sample questions one at a time, choosing the difficulty and topic for each question.
7. Once the user is satisfied with the quiz, they can publish it to make it available to students.
8. All of the quizzes created by the instructor are listed in the Quiz Dashboard, allowing them to edit and manage existing quizzes.

*Future work: The current implementation/UI currently shows a practice and assessment quiz option, but the MVP only implments the practice quiz functionality connected to Student CUJ 2. In future phases we may implement the assessment quiz option as well, which allows finer control over quiz settings such as time limits, number of attempts, and specific predictable/editable questions. In the future we would also like to allow for multiple sources and formats of course materials to be used for quiz generation (e.g., multiple pdfs, pptx, text/image input).*

#### Student CUJ 2 — Start a slide based dynamic practice quiz session
**Statement:** Choose from instructor defined quizzes and take an adaptive, citation-backed quiz that tests understanding.
**User path:**
1. Student opens Assessment & Practice Quizzes → selects a quiz from the list of instructor published quizzes.
2. Loads page showing quiz details (title, description, topics covered) and a list of previous attempts.
3. When Student clicks Start New Attempt, the system begins a new session and generates the first question from the quiz material/details set by the instructor.
4. Questions are presented one at a time, as the student answers → system grades instantly, shows a brief explanation with \[slide N] citation, and records correctness.
5. The quiz adapts: easier/harder items, previous questions (answered incorrectly), and topic mix adjust based on recent performance. 
6. When the user feels they are done, they can click End Session to see a summary of their performance. This summary and the session is saved to their quiz history.
7. Based on the summary, the student can then use the chat feature (Student CUJ 1) to study specific topics they struggled with during the quiz and test their understanding further. (This completes the learning → practice → learning loop.)

*Future work: The following steps may be added in a later phase and are based on [previous versions](use_cases_archive/use_cases_v1.md) of the CUJ.*
Direct Quiz to Study Handoff (similar to NotebookLM - see [Competitive CUJ Analysis](comp_cuj/README.md)):
8. If rolling accuracy drops (e.g., <60% across last 10 items) or repeated misses on a concept, the system recommends Switch to Study Session (Student CUJ 1), listing the problem topic(s) and starting a chat session to focus on those areas.
*Note on citations: There is currently a bug in the MVP where some of the citations may be inaccurate. Generation still happens based on the uploaded material but it may be incorrectly cited.*

#### Instructor CUJ 2 — Diagnose class understanding with Analytics Dashboard v1
**Statement:** View how students are performing on quizzes and trends in how well they are using the adaptive chat to identify misconceptions, and adjust instruction accordingly.
**User path:**
1. Instructor opens → Analytics Dashboard shows tiles: quiz stats, chat stats.
2. Open the Quiz Analytics tab → show and sort results by quiz and performance per topic.
3. Open the Chat Analytics tab → shows comparison of queries by type (good vs needs_focusing) and trends over time.
4. Utilizing this information, the instructor can create new practice quizzes to focus student practice on the most challenging topics. Or the instructor can create assessment quizzes to formally evaluate student understanding over a proper spread of strong and weak topics.
5. Instructor can then use this information externally to adjust course plans (i.e. tutorials) and can recommend topics of study to students during next class.


*Future work: This dashboard is a v1 version and will be expanded in future phases to include more analytics and more in-platform actions for the instructor to take based on the data. Another future addition when more student data is available is the LLM TA feature, which allows instructors to ask natural language questions about class performance and get data-backed answers.*

#### Future CUJs:
#### Student CUJ 3 — Self-directed Flashcard generation & review
**Statement:** Generate flashcards from course materials and review them to practice active recall and reinforce learning.
**User path:**
1. Student opens Flashcards → Create Flashcards. This view will also contain a list of previously created flashcard decks.
2. Uploads course material (pdf/pptx) and clicks Ingest File.
3. System ingests the file (parse → chunk → index) and allows the user to click next.
4. Student can then set Flashcard deck title, description, and optionally configure topics and number of cards.
5. System generates flashcards (question + answer) from the ingested material and displays them for review.
6. Student can then start a review session, where flashcards are presented one at a time.
7. For each flashcard, the student attempts to recall the answer before revealing it. After revealing, the user can mark whether they got it right or wrong.
8. The system tracks performance and shows flashcards until all were marked correct in a session. Cards that were marked wrong are prioritized for review in subsequent sessions.

#### Instructor CUJ 3 — Configure LLM course policies & content scope
**Statement:** Set course-level AI policy and choose what knowledge sources are allowed so students stay on-policy and aligned to instructional goals.
**User path:**
1. Instructor opens Course → Policy & Sources.
2. Set Site-wide policy windows allowing the instructor to pick time windows and decide which learner modules on the student side are unavailable.
3. Set guidance & friction settings allowing the instructor to control how many focused attempts unlock guided help and how strict the checks are.
4. Manage Content Scope, instructor can choose exactly what the adaptive chat can use in generation.
   a. Upload and select materials the assistant should prioritize when answering students.
   b. Upload and select files the assistant should avoid using to shape responses. 
5. Runs a policy check/preview (test prompt): graded-work request is blocked; concept help follows friction rules; answers cite only allowed sources. Instructors can iterate on settings based on preview results.
6. Presses publish updated and pushing policies to the student side.

---

## 2. MVP Development Justification
[↑ Back to Table of Contents](#table-of-contents)
### **Initial Hypothesis**
We started from the problem that GenAI makes it very easy for students to shortcut learning by copy-pasting answers, while instructors lose visibility into how AI is being used in their courses.

Our initial idea was a policy-aligned AI study companion that sat alongside course materials, refused to give direct answers on graded work, and instead walked students through reasoning steps aligned with course and academic integrity policies.

Early CUJs and requirements (see [product_research/use_cases.md](product_research/use_cases.md) and earlier drafts in [use_cases_v1](product_research/use_cases_archive/use_cases_v1.md) / [use_cases_v2](product_research/use_cases_archive/use_cases_v2.md)) reflected a broad, guardrail-first vision where compliant study chat was the core experience, with planned extensions for instructor policy editors, quiz generation, and analytics. We assumed that students would accept stricter, course-monitored AI if it still felt genuinely helpful, and that instructors primarily needed guardrails that blocked direct answers/cheating rather than deeper support for learning analytics, assessment design, and ongoing course adjustments.

### **Key Learnings and Pivots**
As we moved into instructor interviews, course research, and user studies, we learned that simply blocking answers was not enough and could even backfire.

The informal interview with a UofT CS professor ([research notes](product_research/research_notes/instructor_interview_1.md)) highlighted a strong pattern: assignment marks were very high, but test performance on similar material dropped, suggesting that students were using AI to complete assignments without actually learning the concepts. The professor responded by shifting toward more in-person assessments and reducing take-home work, which increased workload for the teaching team and reduced flexibility for students.

Across conversations, instructors emphasized wanting tools that fit their existing workflow around slides, quizzes, and grading and that gave them visibility into how students were learning with AI, not just whether answers were being hidden. They also worried that overly strict blocking would drive students back to unsanctioned tools.

At the same time, feedback on the chat CUJs and early demos suggested that students appreciated step-by-step guidance and friction that pushed them to think, as long as it still helped them make progress. This validated the core idea of coaching rather than answering, but shifted our focus toward supporting genuine learning instead of primarily enforcing rules.

In response, we reframed our goal from preventing cheating to supporting real learning with AI while staying on-policy, split the original quiz CUJ into separate quiz creation and results dashboard flows, and reorganized use cases and milestones around one realistic end-to-end quiz plus chat loop. Richer policy tooling and student-facing flashcards were moved into future CUJs or static prototypes so we could deliver a smaller but coherent and testable MVP.

### **Justification of Final MVP**
For our final MVP, we decided to focus on one clear learning loop instead of many partially implemented features: instructors upload slides, configure a practice quiz from those materials, students take adaptive citation-backed quizzes, instructors view results and trends, and students return to a policy-aligned study chat to close their knowledge gaps.

Within this loop, the study chat emphasizes reasoning and reflection over answers, introduces friction, refuses direct solutions on graded work, and guides students through substeps and paraphrasing so they stay within course and institutional policies. The quiz experience is tied tightly to instructor-uploaded slides, and questions cite specific slides so practice is transparently grounded in course content.

Students can take quizzes and review feedback but cannot create or edit quizzes, which keeps practice aligned with instructor goals rather than turning into an answer-generation tool. The initial analytics dashboard gives instructors an early view into how students are performing on quizzes, what concepts they are struggling with, and how they are using the adaptive chat, so instructors can adjust teaching.

We chose to emphasize this loop because it offers the most learning impact and instructor value within our realistic scope. Instructors get a practical way to bring responsible AI into their course by uploading slides, generating quizzes, and seeing results through a dashboard, while students get structured support that makes shortcutting less appealing by combining coaching chat, slide-grounded quizzes, and feedback that points them back to targeted study instead of generic AI answers. This prioritization maps directly to the CUJs summarized in [product_research/use_cases.md](product_research/use_cases.md) and the research insights above.

In addition, we chose to show a static prototype of the policy editor and flashcard generation CUJs as they represent important future directions for the product. The policy editor gives instructors more control over how AI is used in their course and how the platform should act in an institutional context, while flashcards support active recall and spaced repetition, which are proven learning techniques that work better than quizzes as a self-serve study tool. While these CUJs are not dynamically implemented in the MVP, they demonstrate our vision for a comprehensive platform that extends students personalized learning support and instructor course management within institutional policies.


## 3. Functional and Dynamic MVP (Description and Demo Video)
[↑ Back to Table of Contents](#table-of-contents)

*Note this section contains "Part 5: Demo Recording and In Class Live Demo" of the original assignment instructions.*

- Demo video covering all MVP CUJs: [LearnLLM MVP Demo](https://youtu.be/od7IbT6mm-k)  
  - Walkthrough order: adaptive chat → instructor quiz creation from slides → student adaptive quiz attempt with citations → analytics dashboard → future additions.
- Link to the hosted application: [LearnLLM by Horizon Labs](https://horizon-labs-code.vercel.app/)  
    - Please be aware because we are using Render to host our backend, the first request to the backend may take up to 30 seconds due to Render's free tier cold starts. The Vercel hosted frontend will respond immediately, but you will need to wait for the backend to wake from the first request for full functionality. Once the backend is awake, subsequent requests will be fast.

### Accompanying write-up (how to test the MVP)
- Start at Login → choose Instructor or Student (no credentials required).
- Instructor path: Quiz Generator → upload small pdf/pptx → Ingest → set title/topics → Preview a question → Publish. Then Analytics Dashboard to view quiz/chat tiles.
- Student path: Adaptive Chat → ask a course-style question → observe friction/guidance and diagnostics. Then Assessment & Practice Quizzes → pick the published quiz → Start New Attempt → answer a few items → check citations/explanations → End Session for summary/history.
- Loop: From quiz summary, switch back to Adaptive Chat to study missed topics; instructors can refresh Analytics to see trends.
- Static prototypes: Flashcards and Policy are UI-only demos; Assessment mode buttons are placeholders.

### Dynamic functionality (core CUJs)
- **Student CUJ 1 — Adaptive learning chat:** Start a session, get friction/guidance to avoid direct answers, turn-level diagnostics (`good` vs `needs_focusing`), and request summaries. Chat diagnostic component reflects on the session below the chat.
- **Instructor CUJ 1 — Course material upload & quiz setup:** Upload pptx/pdf slides, ingest (parse → chunk → index), configure topics/difficulty, preview, and publish practice quizzes for students.
- **Student CUJ 2 — Slide-based practice quiz:** Select a published quiz, adaptive item sequencing by performance, instant grading with brief explanations and slide citations, session history, and end-of-session summary to feed back into chat study.
- **Instructor CUJ 2 — Analytics dashboard v1:** View quiz performance by topic and chat usage trends (good vs needs_focusing turns) to identify misconceptions and guide course adjustments.

### Static elements and limitations
- **Auth placeholder:** Login screen is static; no credential checks (open access). Student quiz flows run under a single shared `student-demo` user id.
- **Assessment quiz option:** UI present but non-functional; only practice quizzes are wired end-to-end. Assessment Save/Publish/Delete/Preview buttons are placeholders.
- **Flashcards (Student CUJ 3 prototype):** Upload/ingest flow is simulated locally; deck contents use pre-seeded data after “upload” to demo create/review; spaced repetition logic not live.
- **Policy & content scope (Instructor CUJ 3 prototype):** UI only; does not enforce scope/policies in the MVP.
- **Known limitations:**  
  - Slide citations may be inaccurate even though questions are generated from uploaded material (see backend notes: [project/backend/README.md](project/backend/README.md)).  
  - If Firestore/Pinecone/Google embeddings env vars are missing, chat and quiz state fall back to in-memory (resets on restart) and ingestion/RAG will fail; quiz generation may be ungrounded or error.  
  - Large pptx/pdf files may take long to ingest; smaller decks are recommended within current compute limits.

## 4. Code Quality & Test Coverage
[↑ Back to Table of Contents](#table-of-contents)
- Latest passing CI with coverage artifacts: https://github.com/oliviaw12/horizon-labs-code/actions/runs/19875406290  
  - Backend line coverage: **78.11%** (pytest + pytest-cov)  
  - Frontend line coverage: **68.08%** (Jest --coverage)

- Code quality & tooling:
  - Backend: FastAPI/Python with `pytest`, `pytest-asyncio`, `pytest-cov`; type-safe schemas via Pydantic.
  - Frontend: Next.js/React with `eslint` (eslint-config-next) and `jest` + Testing Library in jsdom.
  - CI (GitHub Actions): separate backend and frontend jobs install deps, run lint/tests, and upload coverage reports; coverage gates are visible in the run above.

- What we test:
  - Backend: LLM chat friction/classifier flow, ingestion pipeline (PDF/PPTX parsing, chunking, embeddings), Pinecone wrapper, quiz generator/adaptive session logic, API endpoints (chat, ingest, quiz lifecycle, analytics), Firestore fallbacks.
  - Frontend: Page/component rendering for student/instructor dashboards, quiz generator/selector flows, chat shell, analytics dashboard, flashcard walkthrough, login/headers; routing and fetch mocks to validate UX paths.

- Reproduce locally:
  - Backend: `cd project/backend && pytest --cov=.`  
  - Frontend: `cd project/frontend && npm install && npm run lint && npm test`

- Notable gaps/exceptions:
  - Backend linting not enforced in CI (tests/coverage are).  
  - Some UI prototypes (assessment builder, policy UI, flashcards) are partially static and covered lightly; dynamic quiz/chat paths carry the bulk of frontend tests.

## 5. Deployment Documentation
[↑ Back to Table of Contents](#table-of-contents)
- Key READMEs: [project/README.md](project/README.md) · [project/backend/README.md](project/backend/README.md) · [project/frontend/README.md](project/frontend/README.md)
- Production web URL: https://horizon-labs-code.vercel.app/ (Render backend may cold-start for ~30s on first request; login screen is static/open access, no credentials required)

### Running locally
- Prereqs: Python 3.11+; Node.js 18+ / npm.
- Backend: `cd project/backend && cp .env.example .env` then fill env vars (see list below) → `pip install -r requirements.txt` → `uvicorn app.main:app --reload --port 8000`.
- Frontend: `cd project/frontend && npm install` → `npm run dev` (set `NEXT_PUBLIC_BACKEND_URL=http://localhost:8000`) → open http://localhost:3000/chat for the streaming demo.
- Tests: backend `pytest -q`; frontend `npm test` (Jest) and `npm run lint`.

### Env vars
- `FIREBASE_PROJECT_ID=horizon-labs-ce7d8`
- `FRICTION_ATTEMPTS_REQUIRED=3`
- `FRICTION_MIN_WORDS=15`
- `GOOGLE_API_KEY=<See Google API Key steps>`
- `GOOGLE_APPLICATION_CREDENTIALS=<See Google Application Credentials file steps>`
- `OPENROUTER_API_KEY=<See OpenRouter API Key steps>`
- `PINECONE_API_KEY=<See Pinecone API Key steps>`
- `PINECONE_ENVIRONMENT=us-east-1`
- `PINECONE_INDEX_DIMENSION=3072`
- `PINECONE_INDEX_NAME=horizon-labs-embeddings`
- `PINECONE_NAMESPACE=slides`
- `QUIZ_PRACTICE_DECREASE_STREAK=2`
- `QUIZ_PRACTICE_INCREASE_STREAK=2`
- `TURN_CLASSIFIER_ENABLED=true`
- `TURN_CLASSIFIER_MODEL=google/gemini-2.0-flash-exp:free`
- `TURN_CLASSIFIER_TEMPERATURE=0.0`
- `TURN_CLASSIFIER_TIMEOUT_SECONDS=20`

### API key setup
- Google API Key (Gemini embeddings): Cloud Console → APIs & Services → Credentials → Create API key → set `GOOGLE_API_KEY` in Render.
- OpenRouter API Key: https://openrouter.ai → account → API Keys → create/copy → set `OPENROUTER_API_KEY`.
- Pinecone API Key: https://app.pinecone.io → API Keys → create/copy; record environment/index → set `PINECONE_*`.
- Google Application Credentials (Firestore): Cloud Console → IAM & Admin → Service Accounts → create/select → Keys → Add Key (JSON) → download → upload to Render as Secret File (e.g., `/etc/secrets/<file>.json`) → set `GOOGLE_APPLICATION_CREDENTIALS` to that path.

### Deploying on Vercel (frontend)
1. Log in with GitHub; clone our repo to your account.  
2. Create a Vercel project from `project/frontend`.  
3. Set `NEXT_PUBLIC_BACKEND_URL` to the Render backend URL.  
4. Deploy main branch; production domain is under “Domains” (e.g., https://your-app.vercel.app). Custom domains also show here; ensure marked Production and copy the URL.

### Deploying on Render (backend)
1. Log in with GitHub; clone our repo to your account.  
2. Create a Render “Web Service” from `project/backend` (Python/FastAPI).  
3. Start command: `uvicorn app.main:app --host 0.0.0.0 --port 10000`.  
4. Add env vars listed above in Render → Environment.  
5. Copy the public Render URL from the service Settings/Info (e.g., https://your-service.onrender.com) and use it for `NEXT_PUBLIC_BACKEND_URL`. Custom domains appear there once verified.

### Services & data
- Firestore (chat/quiz data), Pinecone (embeddings), OpenRouter LLM, Gemini embeddings (ingestion), Render (API), Vercel (web).  
- If env keys are missing, backend falls back to in-memory stores and ingestion/grounding will fail; app still boots but without RAG/persistence.


## 6. Updated Architecture Diagram
[↑ Back to Table of Contents](#table-of-contents)

Here is the updated architecture diagram reflecting our final MVP implementation:  
![Final MVP Architecture Diagram](path/to/final-architecture-diagram.png) <!-- Replace path with actual file when added -->

### Integration mapping (code links)
- Student adaptive chat UI → [project/frontend/app/Student/Chat/page.jsx](project/frontend/app/Student/Chat/page.jsx): streams chat via `/chat/stream`, shows friction/guidance state, diagnostics, and session history.
- Quiz generation/upload UI → [project/frontend/app/Instructor/QuizGenerator/page.jsx](project/frontend/app/Instructor/QuizGenerator/page.jsx): uploads pptx/pdf, ingests via `/ingest/upload`, seeds quiz definitions, and navigates to practice builder.
- Practice quiz runner → [project/frontend/app/Student/Quizzes/[quizId]/sessions/[sessionId]/page.jsx](project/frontend/app/Student/Quizzes/%5BquizId%5D/sessions/%5BsessionId%5D/page.jsx): starts/answers quiz sessions, shows explanations/citations, saves history via quiz APIs.
- Analytics dashboard → [project/frontend/app/Instructor/Dashboard/page.jsx](project/frontend/app/Instructor/Dashboard/page.jsx): fetches quiz and chat analytics from `/analytics/quizzes` and `/analytics/chats`.
- FastAPI routes → [project/backend/app/main.py](project/backend/app/main.py): exposes chat, ingest, quiz lifecycle, and analytics endpoints consumed by the frontend.
- LLM/chat service → [project/backend/clients/llm/service.py](project/backend/clients/llm/service.py): handles chat streaming, friction/guidance, turn classification, and ingestion into vector store.
- Quiz service → [project/backend/clients/quiz/service.py](project/backend/clients/quiz/service.py): manages quiz definitions, adaptive sessions, question generation, and analytics; uses retriever/generator.
- Question generator → [project/backend/clients/quiz/generator.py](project/backend/clients/quiz/generator.py): LangChain ChatOpenAI question synthesis grounded on retrieved slide chunks.
- Ingestion pipeline → [project/backend/clients/ingestion/pipeline.py](project/backend/clients/ingestion/pipeline.py): extracts/embeds slides (PDF/PPTX) and upserts to Pinecone.
- Persistence/services → [project/backend/clients/database/chat_repository.py](project/backend/clients/database/chat_repository.py), [project/backend/clients/database/quiz_repository.py](project/backend/clients/database/quiz_repository.py), [project/backend/clients/database/pinecone.py](project/backend/clients/database/pinecone.py), [project/backend/clients/database/firebase.py](project/backend/clients/database/firebase.py): Firestore storage for chat/quizzes and Pinecone vector index wiring.

*Below is a copy of the architecture diagram in `ARCHITECTURE_MAP.md`, showing how each core technology is used at a file level in our codebase. This can be helpful for understanding where exactly each library/framework is integrated.*

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
