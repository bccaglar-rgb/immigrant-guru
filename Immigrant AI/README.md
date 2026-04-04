# Immigrant AI Monorepo

Immigrant AI is an AI-powered immigration decision and action platform. This monorepo provides the production-grade foundation for the web app, backend API, worker service, shared documentation, and local infrastructure.

## Repository Layout

```text
immigrant-ai/
  apps/
    api/       # FastAPI backend
    web/       # Next.js frontend
    worker/    # Python background worker
  packages/
    docs/      # Shared product and architecture documentation
  infra/
    docker/    # Service Dockerfiles
  docker-compose.yml
  Makefile
  README.md
```

## Prerequisites

- Node.js 20+
- npm 10+
- Python 3.12+
- Docker and Docker Compose

## Quick Start

1. Start local infrastructure:

   ```bash
   make infra-up
   ```

2. Create local environment files:

   ```bash
   cp apps/web/.env.example apps/web/.env.local
   cp apps/api/.env.example apps/api/.env
   cp apps/worker/.env.example apps/worker/.env
   ```

3. Install the web app dependencies:

   ```bash
   cd apps/web
   npm install
   ```

4. Install the API dependencies:

   ```bash
   cd apps/api
   python3 -m venv .venv
   source .venv/bin/activate
   pip install --upgrade pip
   pip install -e ".[dev]"
   ```

   Run the API locally with:

   ```bash
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

   To enable the first AI orchestration endpoint, configure these variables in
   `apps/api/.env`:

   ```bash
   AI_PROVIDER=openai
   OPENAI_API_KEY=your-openai-api-key
   OPENAI_MODEL=gpt-4o-mini
   ```

   `POST /api/v1/ai/strategy` uses the authenticated user's case and profile
   context plus OpenAI Structured Outputs to return a typed strategy payload.

   Case documents are stored through a local storage abstraction by default.
   Configure these variables in `apps/api/.env` as needed:

   ```bash
   LOCAL_STORAGE_ROOT=./storage
   DOCUMENT_MAX_UPLOAD_BYTES=26214400
   KNOWLEDGE_RETRIEVAL_BACKEND=lexical
   KNOWLEDGE_SEARCH_CANDIDATE_LIMIT=50
   ADMIN_EMAILS=["admin@example.com"]
   ```

   Replace `JWT_SECRET_KEY` with a strong value before running in staging or
   production. The API now refuses the default development secret outside local
   development-style environments.

   Create a first Alembic migration when models change:

   ```bash
   cd apps/api
   alembic revision --autogenerate -m "init"
   alembic upgrade head
   ```

   Recent model additions such as document storage, knowledge base tables, and
   audit logs require a new migration before using those features against a real
   database.

5. Install the worker dependencies:

   ```bash
   cd apps/worker
   python3 -m venv .venv
   source .venv/bin/activate
   pip install --upgrade pip
   pip install -e ".[dev]"
   ```

6. Run the applications in separate terminals:

   ```bash
   make dev-web
   make dev-api
   make dev-worker
   ```

   The worker consumes document-processing jobs from Redis after case document
   uploads. Ensure `apps/api/.env` and `apps/worker/.env` use compatible
   `DATABASE_URL`, `REDIS_URL`, `LOCAL_STORAGE_ROOT`, and
   `DOCUMENT_PROCESSING_QUEUE_NAME` values. `DOCUMENT_PROCESSING_MAX_RETRIES`
   controls how many times the worker will retry an unexpected document
   processing failure before marking the document as failed.

## Local Services

- Web: [http://localhost:3000](http://localhost:3000)
- API: [http://localhost:8000](http://localhost:8000)
- API Health: [http://localhost:8000/api/v1/health](http://localhost:8000/api/v1/health)
- Postgres: `localhost:5432`
- Redis: `localhost:6379`

## Useful Commands

```bash
make infra-up
make infra-down
make infra-logs
make dev-web
make dev-api
make dev-worker
make test-api
```

## Docker

`docker-compose.yml` provisions local Postgres and Redis. Dockerfiles for the application services live under `infra/docker/` and can be used later for containerized development or deployment workflows.
