# Immigrant AI Prompt Coverage Backlog

This file reflects the current state of the large prompt backlog more accurately.
It separates foundation work that is already in the codebase from prompt areas
that are still incomplete or only partially implemented.

## Implemented Foundations

- Monorepo structure, Docker/local setup, README, and app scaffolding.
- FastAPI modular backend foundation with config, logging, errors, health, version.
- PostgreSQL/SQLAlchemy data layer foundation with Alembic-ready structure.
- Auth foundation: register, login, `/auth/me`, JWT, password hashing.
- User profile CRUD foundation.
- Immigration case CRUD foundation.
- Deterministic scoring foundation and case score endpoint.
- Deterministic workspace layer for case health, document checklist, action roadmap,
  and next-best-action.
- AI strategy foundation with OpenAI provider wrapper.
- Plan A / Plan B / Plan C structured strategy output.
- Missing-information, confidence, and AI normalization layers.
- Grounded knowledge retrieval foundation and admin KB ingestion foundation.
- Document upload foundation with local storage abstraction.
- Background worker foundation and document post-upload processing skeleton.
- Audit logging foundation for key auth, case, document, and AI events.
- Frontend auth, profile, case, AI strategy, and document center flows.
- Dashboard shell, case detail workspace, and score rendering foundation.
- Core frontend stabilization, error handling, type/build/lint/test fixes.

## Still Missing Or Only Partially Implemented

### Product UX and Workflow

- Multi-step onboarding wizard tied to profile completion.
- Dashboard command-center upgrade with stronger readiness and action framing.
- Case detail workspace upgrade with clearer operational sections and sticky actions.
- Premium empty/loading/error state standardization beyond current baseline.
- Premium UI refinement and broader design-system hardening.
- Trust-oriented disclaimer system in strategy and case surfaces.
- Explainability rendering refinements for strategy outputs.
- Landing page trust/conversion upgrade beyond current baseline.
- Foundational SEO improvements for public routes.

### Product Intelligence

- Risk alert system.
- Scenario simulation.
- Rejection risk analysis.
- Multi-country strategy generation.
- Country comparison.
- City match.
- Immigration playbooks.
- Persistent AI memory.
- Digital twin aggregation layer.
- Case versioning.
- Score history tracking.
- Confidence breakdown visualization on the frontend.

### Documents and Async Processing

- Document quality scoring.
- Document-to-checklist matching.
- Deeper worker reliability features beyond the current skeleton.

### Admin, Monetization, and Internal Ops

- Admin review queue for AI outputs.
- Knowledge base versioning and verification operations.
- Subscription-aware feature gating.
- Contextual premium upgrade prompts.
- Analytics event tracking.

### Reliability and Broader Product Validation

- Dedicated full-stack API contract audit automation beyond current manual passes.
- Broader frontend test foundation.
- Broader end-to-end flow automation.
- More exhaustive auth break-test coverage.
- More exhaustive AI/document/dashboard scenario coverage.

## Notes

- The codebase is currently stable on the implemented surfaces: web lint/type/build
  passes, API tests pass, and worker tests pass.
- The remaining items above are not “hidden bugs”; they are prompt requests that
  are still unimplemented or only partially covered.
- Strategic product-scale roadmap items are tracked separately in
  `packages/docs/strategic-growth-todo.md`.
