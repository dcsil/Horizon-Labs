## ADRs
For any architectural/engineering decisions we make, we will create an ADR (Architectural Design Record) to keep track of what decision we made and why. This allows us to refer back to decisions in the future and see if the reasons we made a choice still holds true. This also allows for others to more easily understand the code.

**ADRs will follow this process:**
* They will live in the repo, under a directory architecture/adrs
* They will be written in markdown
* They will follow the naming convention adr-NNN-<decision-title>.md
* NNN will just be a counter starting at 001 and will allow us easily keep the records in chronological order.

**The common sections that each ADR should have are:**
* Title, Context, Decision, Status, Consequences
* Use this article as a reference: https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions

**Current ADRs:**
The following ADRs have been accepted and are in effect for the project, these will be revisted and updated throughout the development process as needed.
- [ADR 001: Backend Framework — FastAPI](adr-001-backend.md)
- [ADR 002: Frontend Framework — Next.js (with React)](adr-002-frontend.md)
- [ADR 003: Frontend Hosting — Vercel](adr-003-frontend-hosting.md)
- [ADR 004: Backend Deployment — Render](adr-004-backendHosting.md)
- [ADR 005: Primary Database - Firestore](adr-005-database.md)
- [ADR 006: Vector Store — Pinecone](adr-006-vectorDatabase.md)
- [ADR 007: Monitoring — Sentry + Google Analytics](adr-007-monitoring.md)
- [ADR 008: Embeddings Provider — Google Generative AI (Gemini)](adr-008-embeddings.md)
- [ADR 009: LLM Provider — OpenRouter](adr-009-LLM.md)
- [ADR 010: Backend Testing - pytest](adr-010-backendTesting.md)
- [ADR 011: Frontend Testing - jest](adr-011-frontendTesting.md)

### History of Changes
- **October 8, 2025:** Backend deployment updated from Railway to Render to address free-tier limitations.
- **November 12, 2025:** Embeddings Provider updated from OpenAI to Google Generative AI (Gemini) due to free plan.
- **November 19, 2025:** Added pytest as the backend testing framework and jest as the frontend testing framework. 
