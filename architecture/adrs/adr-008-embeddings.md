## ADR 008: Embeddings Provider — Google Generative AI (Gemini)

### Context
 We need high-quality embeddings for semantic search and RAG. Embeddings should be consistent, cost-effective, and well-supported in LangChain.

### Options
**OpenAI Embeddings (text-embedding-3-small/large)**: High accuracy, widely supported, cost-effective.

**Cohere**: Competitive embeddings, but less ecosystem adoption.

**Google Generative AI (Gemini Embeddings)**:  Provides advanced multilingual and multimodal embeddings, optimized for integration with Gemini models. Offers free monthly usage quotas under the Google Generative AI API, making it cost-effective for development and testing. Integrates directly with LangChain. 

**Self-hosted (Sentence Transformers, etc.)**: Flexible but requires GPU infra.

### Decision
 We selected Gemini embeddings due to their balance of quality, cost, and ecosystem support.

### Status
 Accepted.

### Consequences
**Positive:**
1. Seamless compatibility with Gemini models and LangChain pipelines.
2. Unified provider for both LLM and embedding services, simplifying authentication and monitoring.
3. Strong multilingual and multimodal semantic understanding.
**Negative / Risks:**
1. Vendor lock-in within the Google Cloud ecosystem.
2. Limited transparency into embedding dimensionality and update frequency.
3. Smaller open-source community and fewer external benchmarks compared to OpenAI embeddings.
