## ADR 004: Backend Deployment — Railway

### Context
 We need a cloud deployment platform for hosting our FastAPI backend. The platform should provide simple deployment pipelines, environment variable management, and scalability as usage grows. Since our team is small and focused on rapid iteration, we want minimal DevOps overhead, easy CI/CD integration with GitHub, and support for scaling APIs that connect to Firebase, Pinecone, and LLM services.

### Options
**Railway**: Developer-friendly deployment platform with seamless GitHub integration, simple environment management, per-service isolation, and auto-scaling. Provides free tier for early development.

**Vercel**: Optimized for frontend (Next.js), limited support for long-running backend services.

**Heroku**: Mature PaaS, easy to use, but more expensive and with less generous free tiers.

**AWS (ECS/Lambda/EC2)**: Highly scalable and flexible, but requires significant DevOps setup and maintenance.

**Fly.io**: Good balance of simplicity and performance, supports global deployment, but ecosystem is smaller than Railway’s.

### Decision
 We chose Railway for its simplicity, GitHub integration, and low-ops experience. It provides a fast path to deploying our FastAPI backend with environment variables, monitoring, and scaling handled with minimal configuration, making it ideal for MVP and early production.

### Status
 Accepted — stands for MVP and initial production deployment.

### Consequences
**Positive:**
1. Minimal DevOps overhead, developer-friendly platform.
2. One-click deployments with GitHub integration.
3. Built-in environment variable and secret management.
4. Scales with demand without complex setup.

**Negative / Risks:**
1. Less granular control compared to AWS or GCP.
2. Pricing may increase significantly at scale.
3. Ecosystem and community are smaller than Heroku’s or AWS’s.
