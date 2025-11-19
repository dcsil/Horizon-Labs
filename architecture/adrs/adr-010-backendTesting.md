## ADR 009: Backend Testing Framework — pytest

### Context
Our backend requires a unified testing framework that supports both fast unit tests and higher-level integration flows (chat, ingestion, quiz). We also must maintain ≥65% coverage and surface that metric in CI.

### Options
**pytest:** Python’s dominant testing framework with async support, fixtures, parametrization, and a strong plugin ecosystem (pytest-asyncio, pytest-cov, etc.).

**unittest + coverage.py:** Built-in, minimal dependencies, but verbose and weak async/fixture ergonomics.

**nose2:** Simple runner compatible with unittest-style tests; diminishing maintenance and weaker plugin ecosystem.

**BDD frameworks (Behave/Cucumber):** Human-readable specs; heavy for service-level tests and poor fit for repository-level logic.

### Decision
We chose pytest as the backend testing framework because it provides simple test discovery, fixtures, parametrization, and clear assertions. We use pytest-asyncio for async FastAPI routes and pytest-cov for terminal and XML coverage reports, with optional plugins (e.g., pytest-recording, pytest-socket, syrupy, pytest-benchmark, codspeed) available when needed. All tests run using a single command:

pytest --cov=app --cov=clients --cov=tests --cov-report=term-missing --cov-report=xml


GitHub Actions runs this command on every backend push/PR and uploads the resulting coverage.xml as an artifact.

### Status
 Accepted.

### Consequences
**Positive:**
1. Single, unified runner for unit + integration tests.
2. Async-first support simplifies FastAPI endpoint and SSE testing.
3. Built-in coverage gating via pytest-cov enables meeting the 65% requirement.
4. Rich fixture system allows reusable Pinecone/Firestore/LLM doubles, reducing flakiness.

**Negative / Risks:**
1. Contributors must understand pytest-style fixtures and marks.
2. Plugin sprawl increases dependency maintenance.
3. Tests relying on pytest-specific features reduce portability to other runners.
