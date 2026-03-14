# Trader Hub Architecture (Isolated Microservice Pattern)

## Goal
- Keep trader execution isolated from core app flows.
- If Trader Hub fails, market dashboards and other APIs continue.
- Prepare for high-cardinality scale (many users, many traders).

## Current Implementation in This Repo
- `server/src/services/traderHub/*`
  - `traderHubStore.ts`: persistent registry (`server/data/trader_hub.json`)
  - `traderHubEngine.ts`: isolated scheduler + execution loop
  - `types.ts`: strict contracts
- `server/src/routes/traderHub.ts`
  - `POST /api/trader-hub/traders`
  - `GET /api/trader-hub/traders`
  - `POST /api/trader-hub/traders/:id/status`
  - `DELETE /api/trader-hub/traders/:id`
  - `GET /api/trader-hub/state`

## Isolation Design
- Per-trader execution is wrapped in `try/catch`.
- A failing trader increments `failStreak` and can move to `ERROR` without stopping the engine.
- Engine has bounded concurrency (`maxConcurrentJobs`).
- Engine uses shard hashing for fair scheduling (`shardCount`).

## Exchange Routing
- Trader selects `AUTO | BINANCE | GATEIO`.
- `AUTO` uses Binance primary and Gate fallback through `ExchangeMarketHub`.
- If live feed is stale/unavailable, decision returns `N/A` (no fake trades).

## Scaling Plan (100k users / high trader count)
- Split Trader Hub into dedicated process/container (separate deploy).
- Move storage from JSON to Postgres + Redis:
  - Postgres: trader definitions + immutable run logs
  - Redis: due queue + distributed locks + hot state
- Horizontal workers:
  - shard by `trader_id % N`
  - one queue partition per shard
  - autoscale workers by queue depth and lag
- Backpressure:
  - cap in-flight jobs per worker
  - adaptive interval jitter for burst smoothing
- Reliability:
  - circuit-breaker by exchange/provider
  - dead-letter queue for repeated failures
  - metrics + alerts (`p95 lag`, `run fail ratio`, `queue depth`)

## Frontend
- `/ai-trader/dashboard` now creates and controls real traders via Trader Hub APIs.
- Status and latest decision are polled every 3 seconds.

