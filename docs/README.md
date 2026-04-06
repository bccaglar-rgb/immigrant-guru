# Bitrium Architecture Documentation

> Comprehensive architecture documents for the Bitrium crypto trading platform.
> Last Updated: 2026-04-04

---

## Documents

| Document | Description |
|----------|-------------|
| [REALTIME-ARCHITECTURE.md](REALTIME-ARCHITECTURE.md) | WebSocket architecture: dedicated gateway (uWebSockets.js), channel/topic design, auth model, Redis adapter, horizontal scaling, reconnection, and abuse prevention. |
| [DATABASE-ARCHITECTURE.md](DATABASE-ARCHITECTURE.md) | PostgreSQL scaling strategy, read replicas, table partitioning, TimescaleDB for market data, Redis data split, cache invalidation, connection pooling (pgBouncer), backup/recovery, and index strategy. |
| [SECURITY-HARDENING.md](SECURITY-HARDENING.md) | Threat model, vulnerability assessment ranked by severity, AES-256-GCM API key encryption, refresh token auth redesign, RBAC, SSRF/CSRF/XSS prevention, audit trail, and incident response. |
| [PAYMENT-ARCHITECTURE.md](PAYMENT-ARCHITECTURE.md) | TRON USDT TRC-20 payment lifecycle state machine, double-entry ledger, idempotency, chain reorg handling, under/overpayment, refund flows, reconciliation, and multi-chain support plan. |
| [AI-ENGINE-ARCHITECTURE.md](AI-ENGINE-ARCHITECTURE.md) | Provider abstraction layer (OpenAI/Claude/Qwen), prompt routing, two-stage screening pipeline, caching, fallback chains, circuit breaker, cost control, output validation, and confidence scoring. |
| [INFRASTRUCTURE.md](INFRASTRUCTURE.md) | DigitalOcean infrastructure plan, Docker Compose containerization, load balancing, blue/green zero-downtime deploy, staging/prod separation, disaster recovery, networking topology, and phased cost plan. |
| [OBSERVABILITY.md](OBSERVABILITY.md) | Structured logging (pino), Prometheus metrics, OpenTelemetry tracing, Sentry error monitoring, Grafana dashboards, alerting strategy, SLI/SLO targets, and runbook checklists. |
| [FRONTEND-ARCHITECTURE.md](FRONTEND-ARCHITECTURE.md) | React module structure, Zustand + TanStack Query state management, routing/access control, real-time data handling, chart optimization, code splitting, error boundaries, and design system. |
| [MIGRATION-ROADMAP.md](MIGRATION-ROADMAP.md) | Five-phase execution plan (Foundation, Reliability, Scale, Performance, Enterprise) with week-by-week calendar, feature flags, shadow traffic testing, rollback plans, dependencies, and exit criteria. |

---

## Reading Order

For a comprehensive understanding, read in this order:

1. **MIGRATION-ROADMAP.md** -- Start here for the big picture and execution timeline.
2. **SECURITY-HARDENING.md** -- Understand the most critical vulnerabilities first.
3. **DATABASE-ARCHITECTURE.md** -- Data is the foundation.
4. **PAYMENT-ARCHITECTURE.md** -- Critical business logic.
5. **REALTIME-ARCHITECTURE.md** -- Primary user-facing data delivery.
6. **AI-ENGINE-ARCHITECTURE.md** -- Core differentiator.
7. **INFRASTRUCTURE.md** -- How it all runs.
8. **OBSERVABILITY.md** -- How to know it is running correctly.
9. **FRONTEND-ARCHITECTURE.md** -- User experience layer.

---

## Platform Summary

| Component | Technology |
|-----------|-----------|
| Frontend | React 18, Vite, TailwindCSS, Zustand, React Router v6 |
| Backend | Node.js 22, Express, PM2 (3 workers + market-hub) |
| Database | PostgreSQL, Redis |
| Market Data | WebSocket-first from Binance, Bybit, OKX, Gate.io |
| Payments | TRON USDT TRC-20 |
| AI Engine | OpenAI, Claude, Qwen |
| Auth | JWT, pbkdf2, TOTP 2FA |
| Infrastructure | DigitalOcean, Nginx, GitHub Actions CI/CD |
| Tiers | Explorer ($10), Trader ($20), Titan ($30) |
