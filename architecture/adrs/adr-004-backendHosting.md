## ADR 004: Backend Deployment — Render

### Context
 We need a cloud deployment platform for hosting our FastAPI backend. The platform should provide simple deployment pipelines, environment variable management, and scalability as usage grows. Since our team is small and focused on rapid iteration, we want minimal DevOps overhead, easy CI/CD integration with GitHub, and support for scaling APIs that connect to Firebase, Pinecone, and LLM services.

### Options
**Render**: Developer-friendly cloud platform with free tier support, GitHub integration, automatic deploys, and easy configuration for backend services. Provides simple dashboards for logs, environment variables, and scaling.

**Railway**: Similar simplicity and GitHub integration, but limited free credits and trial plan restricted our ability to continue development long-term.

**Vercel**: Optimized for frontend (Next.js), but limited support for AI backend services.

**Heroku**: Mature PaaS, easy to use, but more expensive and with less generous free tiers.

**AWS (ECS/Lambda/EC2)**: Highly scalable and flexible, but requires significant DevOps setup and maintenance.

**Fly.io**: Good balance of simplicity and performance, supports global deployment, but ecosystem is smaller than Railway’s.

### Decision
We chose Render for hosting our FastAPI backend due to its generous free tier, simplicity, and robust GitHub integration. It allows for one-click deployments, straightforward environment variable management, and reliable uptime. While Railway was initially considered, its limited credits and trial restrictions made Render a more sustainable choice for ongoing development.

### Status
 Accepted — stands for MVP and initial production deployment.

### Consequences
**Positive:**
1. Minimal DevOps overhead, developer-friendly platform.
2. One-click deployments with GitHub integration.
3. Built-in environment variable and secret management.
4. Free tier allows for experimentation and MVP testing.
5. Easy migration path to paid plans as usage grows.

**Negative / Risks:**
1. Cold start delays on free tier services.
2. Less granular infrastructure control compared to AWS or GCP.
3. Potential scaling and pricing limitations at higher workloads.
