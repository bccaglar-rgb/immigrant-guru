# Architecture Overview

## Applications

- `apps/web`: Next.js App Router frontend for user onboarding, visa comparisons, document workflows, and expert handoff experiences.
- `apps/api`: FastAPI backend for product APIs, orchestration, document processing, and decision-support services.
- `apps/worker`: asynchronous background worker for queued jobs, ingestion pipelines, notifications, and AI task execution.

## Infrastructure

- Postgres stores transactional application data and relational domain models.
- Redis supports caching, pub/sub, and future queue-backed worker patterns.
- Docker Compose provides local infrastructure bootstrapping.

## Design Principles

- Modular service boundaries with environment-based configuration.
- Type-safe schemas and validated settings at application boundaries.
- Explicit logging and health surfaces for local development and production operations.
- Monorepo structure that can evolve without forcing tight coupling across runtimes.
