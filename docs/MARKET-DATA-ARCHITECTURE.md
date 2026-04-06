# Bitrium Market Data Architecture

> Last updated: 2026-04-04
> Status: Living document
> Owner: Platform Engineering

---

## Table of Contents

1. [Current Strengths](#1-current-strengths)
2. [Current Weaknesses](#2-current-weaknesses)
3. [Target Architecture](#3-target-architecture)
4. [Data Type Designs](#4-data-type-designs)
5. [Event Pipeline Recommendation](#5-event-pipeline-recommendation)
6. [Replayability & Auditability](#6-replayability--auditability)
7. [Recovery & Resync Model](#7-recovery--resync-model)
8. [Exchange Disconnect Handling](#8-exchange-disconnect-handling)
9. [Rate Limit & Ban Prevention](#9-rate-limit--ban-prevention)
10. [Horizontal Scaling](#10-horizontal-scaling)
11. [Message Schemas](#11-message-schemas)
12. [Caching TTL Strategy](#12-caching-ttl-strategy)
13. [Backpressure Strategy](#13-backpressure-strategy)

---

## 1. Current Strengths

The existing market data pipeline was hardened through a 12-commit rate limit resolution series that eliminated all 418 IP bans and brought steady-state weight consumption down to ~50 weight/min against an 800w budget.

| Capability | Detail |
|------------|--------|
| **WS-first architecture** | All exchanges (Binance Futures, Gate.io, Bybit, OKX) connect via WebSocket as the primary data source. REST is used only for initial snapshots and recovery. |
| **Recovery state machine** | A well-defined SM (INIT -> SYNCING -> READY -> DESYNC_SUSPECTED -> RECOVERING -> COOLDOWN -> BLOCKED) handles every failure mode with deterministic transitions. |
| **Budget engine with tiers** | 3-tier system (Global 800w, per-endpoint, per-tier A/B/C) prevents rate limit violations. Critical requests always pass; optional requests are shed first under pressure. |
| **Single acquisition owner** | Dedicated `market-hub` PM2 process (`HUB_EXTERNAL=true`) is the sole data acquirer. No worker contention, no duplicate REST calls, no weight competition. |
| **Redis distribution** | Redis pub/sub distributes normalized data to all server workers with sub-millisecond latency within the same host. |

**Current operational metrics:**

- Steady-state weight: ~50w/min (budget: 800w/min)
- 418 bans: 0 (target: 0)
- 429 throttles: 0 (target: 0)
- Exchange coverage: Binance Futures, Gate.io, Bybit, OKX

---

## 2. Current Weaknesses

| Weakness | Impact | Severity |
|----------|--------|----------|
| **No market data persistence** | Cannot replay events, no audit trail, no backtesting from live data | High |
| **No message sequence tracking with gap logging** | Gaps in orderbook deltas are detected only by symptoms (stale book), not by sequence number analysis | High |
| **No per-symbol health metrics exposed** | Cannot identify which specific symbols are degraded without log diving | Medium |
| **No backpressure mechanism** | If a consumer is slow, it silently drops messages via Redis pub/sub fire-and-forget semantics | Medium |
| **Single market-hub instance (no failover)** | If the hub process crashes, all market data stops until PM2 restarts it (~5-10s gap) | High |
| **JSON serialization overhead on internal WS** | Every message is JSON.stringify/parse on both ends; binary formats (MessagePack, Protobuf) would cut CPU and bandwidth | Low |
| **No dead letter queue for failed processing** | Messages that fail to process in a consumer are lost forever with no way to retry or inspect them | Medium |

---

## 3. Target Architecture

```
Exchanges (WS + REST)
       │
       ▼
┌──────────────────────┐
│     Market-Hub       │  (Active instance)
│   ┌── Connector      │  Per-exchange WS/REST client
│   ├── Normalizer     │  Unified schema across exchanges
│   ├── StateEngine    │  Recovery state machine per symbol
│   ├── BudgetEngine   │  Rate limit budgets & enforcement
│   └── Publisher      │  Fan-out to message bus
└──────────┬───────────┘
           │
      ┌────▼─────┐
      │ Message  │  Phase 1: Redis Pub/Sub  (current)
      │   Bus    │  Phase 2: NATS JetStream (10K-50K users)
      │          │  Phase 3: Kafka          (50K+ users, if needed)
      └────┬─────┘
           │
      ┌────▼──────────────────────┐
      │  Consumers                │
      │  ├── API Servers (3x)     │  Serve real-time data to clients
      │  ├── AI Engine            │  Signal generation, pattern detection
      │  ├── Scanner              │  Opportunity detection, alerts
      │  └── Persistence Layer    │  JSONL logs + TimescaleDB writes
      └──────────────────────────┘
```

### Key Design Principles

1. **Single writer, many readers** -- only market-hub acquires data from exchanges.
2. **Normalize once, distribute normalized** -- every consumer receives the same schema regardless of exchange source.
3. **Graceful degradation** -- each exchange and symbol operates independently; one exchange failure does not cascade.
4. **Cost of correctness < cost of speed** -- prefer a 100ms delay with correct data over instant delivery of a potentially stale book.

---

## 4. Data Type Designs

### 4.1 Order Book Depth

| Aspect | Design |
|--------|--------|
| **WS stream** | Incremental deltas (bid/ask price-qty pairs) |
| **Snapshot** | REST fetch on INIT and RECOVERING states only |
| **Local book** | Sorted price levels (bids descending, asks ascending), sequence tracked per symbol |
| **Distribution** | Full book on snapshot events, deltas on incremental updates |
| **Integrity** | Checksum validation where exchange supports it (Binance, OKX) |
| **Redis key** | `mdc:depth:{exchange}:{symbol}` -- JSON, top 20 bid/ask levels |

**Sequence tracking flow:**

```
1. Receive snapshot -> store lastUpdateId
2. Receive delta -> check delta.firstUpdateId <= lastUpdateId + 1
3. If gap detected -> transition to DESYNC_SUSPECTED
4. If contiguous -> apply delta, update lastUpdateId
5. Log gaps: { symbol, expected, received, gap_size, timestamp }
```

### 4.2 Klines / Candles

| Aspect | Design |
|--------|--------|
| **WS stream** | Real-time candle updates (open candle pushed on every trade) |
| **REST backfill** | On startup, fetch last 500 candles per active timeframe |
| **Cache** | Redis with timeframe-specific TTLs (see Section 12) |
| **Persistence** | PostgreSQL with TimescaleDB extension for time-series replay |
| **Redis key** | `mdc:klines:{exchange}:{symbol}:{tf}` |

**TTL by timeframe:**

| Timeframe | Redis TTL |
|-----------|-----------|
| 1m | 60s |
| 15m | 300s |
| 1H | 600s |
| 4H | 1800s |
| 1D | 3600s |

### 4.3 Tickers

| Aspect | Design |
|--------|--------|
| **WS stream** | Continuous 24hr ticker updates |
| **Cache** | Redis with 5s TTL |
| **Redis key** | `mdc:ticker:{exchange}:{symbol}` |

Tickers are high-frequency, low-importance data. Consumers should tolerate staleness up to 10s without concern.

### 4.4 Symbol Metadata

| Aspect | Design |
|--------|--------|
| **Source** | REST fetch once on startup |
| **Cache** | Redis with 3600s TTL (1 hour) |
| **Redis key** | `mdc:meta:{exchange}:{symbol}` |
| **Contents** | Lot size, tick size, min notional, contract type, margin requirements, status |

Metadata changes are rare (exchange listing/delisting events). A 1-hour cache is sufficient with an optional force-refresh endpoint.

---

## 5. Event Pipeline Recommendation

### Phase 1: Redis Pub/Sub (Current -- 0-10K users)

| Aspect | Detail |
|--------|--------|
| **Pros** | Already working, sub-millisecond latency, zero additional infrastructure |
| **Cons** | No persistence, no replay, fire-and-forget, no consumer acknowledgment |
| **Verdict** | Sufficient for current scale. Focus engineering effort on persistence layer (Section 6) rather than replacing the bus. |

### Phase 2: NATS JetStream (10K-50K users)

| Aspect | Detail |
|--------|--------|
| **Pros** | Persistent streams, replay from any point, lightweight (~50MB RAM), consumer groups with load distribution, built-in backpressure |
| **Cons** | New infrastructure component, operational learning curve |
| **Subject hierarchy** | `market.{exchange}.{type}.{symbol}` |
| **Examples** | `market.binance.depth.BTCUSDT`, `market.gate.kline.ETHUSDT` |

**Why NATS over Kafka at this stage:**

- ~10x less resource consumption than Kafka
- No JVM dependency (single Go binary)
- Native WebSocket support for direct browser streaming (future)
- Consumer groups for horizontal consumer scaling
- Replay capability for new consumers or crash recovery

### Phase 3: Kafka (50K+ users, only if needed)

| Aspect | Detail |
|--------|--------|
| **When** | Only if NATS throughput becomes insufficient (>100K msg/s sustained) |
| **Topics** | `market-depth`, `market-klines`, `market-ticker` |
| **Partition key** | `{exchange}:{symbol}` for ordering guarantees |
| **Retention** | 7 days in Kafka, offloaded to cold storage after |

**Decision criteria for Phase 2 -> Phase 3 migration:**

- NATS consumer lag consistently >500ms under normal load
- Message throughput exceeds 100K msg/s sustained
- Need for multi-datacenter replication with exactly-once semantics

---

## 6. Replayability & Auditability

### 6.1 Append-Only Log (File-based)

```
/var/log/bitrium/market/
  2026-04-05/
    depth-binance.jsonl.gz
    depth-gate.jsonl.gz
    klines-binance.jsonl.gz
    klines-gate.jsonl.gz
    ticker-binance.jsonl.gz
    ticker-gate.jsonl.gz
```

**Specifications:**

| Aspect | Detail |
|--------|--------|
| **Format** | JSONL (one JSON object per line) |
| **Compression** | gzip, rotated daily at 00:00 UTC |
| **Upload** | S3-compatible storage (DO Spaces) via cron after rotation |
| **Retention** | 90 days hot (local SSD), 1 year cold (object storage) |
| **Use cases** | Debugging, backtesting, compliance audit, incident replay |

**Writer implementation notes:**

- Buffered writes (flush every 1s or 1000 events, whichever comes first)
- Separate write stream per exchange per data type to avoid lock contention
- fsync on flush for durability
- If write fails, log error but never block the main pipeline

### 6.2 Database Persistence (TimescaleDB)

```sql
CREATE TABLE market_events (
  id          BIGSERIAL,
  exchange    TEXT        NOT NULL,
  symbol      TEXT        NOT NULL,
  event_type  TEXT        NOT NULL,  -- depth_delta, depth_snapshot, kline, ticker
  data        JSONB       NOT NULL,
  sequence    BIGINT,
  received_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id, received_at)
) PARTITION BY RANGE (received_at);

-- Auto-create daily partitions
SELECT create_hypertable('market_events', 'received_at',
  chunk_time_interval => INTERVAL '1 day');

-- Index for replay queries
CREATE INDEX idx_market_events_lookup
  ON market_events (exchange, symbol, event_type, received_at DESC);

-- Compression policy: compress chunks older than 7 days
SELECT add_compression_policy('market_events', INTERVAL '7 days');

-- Retention policy: drop chunks older than 90 days
SELECT add_retention_policy('market_events', INTERVAL '90 days');
```

**Event types:**

| event_type | Description |
|------------|-------------|
| `depth_delta` | Incremental orderbook update |
| `depth_snapshot` | Full orderbook snapshot |
| `kline` | Candle update (open or closed) |
| `ticker` | 24hr ticker update |

---

## 7. Recovery & Resync Model

### 7.1 State Machine (Current, with proposed improvements)

```
INIT ──────────────► SYNCING
                       │
                       ├── snapshot success ──► READY
                       └── snapshot fail ────► COOLDOWN

READY ─────────────► DESYNC_SUSPECTED (triggers):
                       • Sequence gap detected
                       • Checksum mismatch
                       • No delta received for 60s
                       │
                       ├── Deltas resume within 10s ──► READY (false alarm)
                       └── Confirmed after 10s ────────► RECOVERING

READY ─────────────► DEGRADED (new state, triggers):
                       • WS connected but delta latency >5s
                       • Intermittent gaps (>3 in 60s)
                       │
                       ├── Latency normalizes ──► READY
                       └── Worsens ─────────────► DESYNC_SUSPECTED

RECOVERING ─────────► Snapshot attempt
                       │
                       ├── success ──► READY (reset attempt counter)
                       └── fail ────► COOLDOWN

COOLDOWN ───────────► Backoff expired ──► RECOVERING
                       └── 4+ consecutive fails ──► BLOCKED

BLOCKED ────────────► After 10 minutes ──► INIT (full fresh start)
```

### 7.2 Proposed Improvements

**New DEGRADED state:**

The current SM jumps directly from READY to DESYNC_SUSPECTED. Adding a DEGRADED state handles the common case where the WebSocket is connected but experiencing high latency (>5s behind real-time). In DEGRADED mode:

- Data continues flowing to consumers (stale is better than nothing)
- Metrics are flagged to alert operators
- If latency exceeds 30s, transition to DESYNC_SUSPECTED

**Per-symbol metrics:**

```
{
  "symbol": "BTCUSDT",
  "exchange": "binance",
  "state": "READY",
  "last_delta_at": 1712275200000,
  "gap_count": 0,
  "recovery_count": 2,
  "avg_latency_ms": 45,
  "uptime_pct_24h": 99.97
}
```

**Automatic symbol demotion:**

Symbols that repeatedly fail recovery (>5 recoveries in 1 hour) are demoted:

1. Reduce update frequency (skip every other delta)
2. Log warning for operator review
3. After 1 hour of stability, restore full frequency

**Health API:**

```
GET /api/market-hub/health

Response:
{
  "status": "healthy",
  "uptime_seconds": 86400,
  "exchanges": {
    "binance": {
      "ws_connected": true,
      "symbols_ready": 45,
      "symbols_degraded": 1,
      "symbols_recovering": 0,
      "symbols_blocked": 0,
      "weight_used": 48,
      "weight_budget": 800
    }
  },
  "symbols": {
    "binance:BTCUSDT": { "state": "READY", "latency_ms": 42 },
    "binance:ETHUSDT": { "state": "DEGRADED", "latency_ms": 5200 }
  }
}
```

---

## 8. Exchange Disconnect Handling

| Scenario | Detection | Action | Recovery Time |
|----------|-----------|--------|---------------|
| **WS disconnect** | `close` event on WebSocket | Reconnect with exponential backoff (1s, 2s, 4s, 8s, max 30s) | 1-30s |
| **Partial desync** | Sequence gap in delta stream | DESYNC_SUSPECTED -> confirm 10s -> RECOVERING (snapshot) | 10-20s |
| **Stale book** | No delta received for 60s | DESYNC_SUSPECTED -> RECOVERING | 60-70s |
| **Snapshot failure** | HTTP error or timeout on REST | COOLDOWN with exponential backoff | 30s-10m |
| **Exchange 418** | HTTP 418 response status | BLOCKED for all symbols on that exchange, 10-minute freeze | 10m |
| **Exchange 429** | HTTP 429 response status | COOLDOWN for the specific endpoint, 2-minute freeze | 2m |
| **Exchange maintenance** | WS message or status page | BLOCKED, poll status every 5 minutes | Variable |
| **DNS failure** | Connection error | Retry with backoff, alert if >5 minutes | 1-30s |
| **TLS error** | Handshake failure | Log, retry with backoff, alert if persistent | 1-30s |

**Reconnection backoff formula:**

```
delay = min(base * 2^attempt, maxDelay) + jitter
where:
  base = 1000ms
  maxDelay = 30000ms
  jitter = random(0, 500ms)
```

---

## 9. Rate Limit & Ban Prevention

### 9.1 Current System (Working Well)

| Component | Configuration |
|-----------|---------------|
| **Global budget** | 800 / 1200 weight per minute (66% utilization ceiling) |
| **Per-endpoint caps** | depth: 50w, klines: 30w, exchangeInfo: 10w |
| **Tier system** | Critical (always), Important (>50% budget remaining), Optional (>70% remaining) |
| **Backoff progression** | 30s -> 2m -> 5m -> 10m -> BLOCKED |
| **Steady-state** | ~50w/min consumed |

### 9.2 Proposed Improvements

**Sliding window with sub-second resolution:**

Replace the 1-minute fixed window with a sliding window using 100ms buckets. This prevents burst scenarios where two batches of requests straddle a window boundary and appear compliant individually but violate limits in aggregate.

```
Window: 60 seconds = 600 buckets of 100ms each
Weight check: sum(buckets[now - 60s : now])
```

**Request coalescing:**

If multiple consumers request the same data within a short window, coalesce into a single REST call:

```
Consumer A requests depth:BTCUSDT  -> queue
Consumer B requests depth:BTCUSDT  -> coalesce with A
Consumer C requests depth:ETHUSDT  -> separate request
After 50ms coalesce window:
  -> 1 request for BTCUSDT (serves A + B)
  -> 1 request for ETHUSDT (serves C)
```

**Predictive throttling:**

Monitor weight consumption trend. If linear extrapolation predicts hitting 600w within the next 30 seconds, preemptively reduce request rate by deferring Optional-tier requests.

```
current_rate = weight_last_10s * 6  // extrapolate to 1 minute
if (current_rate > 600) {
  defer_optional_requests()
}
if (current_rate > 700) {
  defer_important_requests()
}
```

**Per-exchange budget isolation:**

Each exchange maintains its own independent budget. Binance heavy usage does not reduce available budget for Gate.io requests.

```
budgets: {
  binance: { limit: 800, used: 48, window: 60s },
  gate:    { limit: 200, used: 12, window: 60s },
  bybit:   { limit: 300, used: 15, window: 60s },
  okx:     { limit: 200, used: 10, window: 60s }
}
```

**Circuit breaker metrics:**

Track circuit breaker state transitions for each exchange endpoint to identify patterns:

```
{
  "exchange": "binance",
  "endpoint": "/fapi/v1/depth",
  "circuit_state": "closed",
  "opens_24h": 2,
  "closes_24h": 2,
  "half_opens_24h": 4,
  "last_open_reason": "429_response",
  "last_open_at": "2026-04-04T12:30:00Z"
}
```

---

## 10. Horizontal Scaling

### 10.1 Active-Passive (Recommended for Phase 1-2)

```
┌─────────────────┐          ┌─────────────────┐
│  Hub-Primary     │          │  Hub-Standby     │
│  (ACTIVE)        │          │  (PASSIVE)       │
│                  │          │                  │
│  Ingests data    │          │  Monitors lock   │
│  Writes to Redis │          │  WS connected    │
│  Publishes msgs  │          │  but not writing  │
└────────┬─────────┘          └────────┬─────────┘
         │                             │
         └──── Redis Lock (SETNX) ─────┘
               Key: bitrium:market-hub:leader
               TTL: 30s, refresh every 10s
```

**Leader election protocol:**

1. Primary acquires lock: `SET bitrium:market-hub:leader {instanceId} NX EX 30`
2. Primary refreshes lock every 10s: `SET bitrium:market-hub:leader {instanceId} XX EX 30`
3. Standby checks lock every 5s: `GET bitrium:market-hub:leader`
4. If lock absent or expired, standby promotes:
   - Acquires lock
   - Transitions all symbols to INIT state
   - Begins snapshot + WS subscription sequence
5. Failover time: 15-30 seconds (lock expiry + detection + INIT)

**Standby behavior:**

- Maintains WS connections to all exchanges (subscribed but not processing)
- Does not write to Redis or publish messages
- Monitors primary health via lock presence
- On promotion: begins processing immediately, no cold-start delay

### 10.2 Active-Active (Phase 3, if needed)

```
┌─────────────────┐          ┌─────────────────┐
│  Hub-1           │          │  Hub-2           │
│  Symbols: A-M    │          │  Symbols: N-Z    │
│  (ACTIVE)        │          │  (ACTIVE)        │
└────────┬─────────┘          └────────┬─────────┘
         │                             │
         └──── Redis (assignments) ────┘
               Key: bitrium:hub:assignments
               Hash: { symbol -> instanceId }
```

**Symbol partitioning:**

- Consistent hashing of symbol names across hub instances
- Each hub owns a distinct subset of symbols
- On hub failure: remaining hubs absorb orphaned symbols
- On hub addition: rebalance via hash ring adjustment
- Eliminates SPOF completely but adds coordination complexity

**Decision criteria for Active-Passive -> Active-Active:**

- Single hub cannot handle subscription count (>500 symbols)
- Single hub CPU utilization consistently >70%
- Failover time of 15-30s is unacceptable for business requirements

---

## 11. Message Schemas

All messages follow a normalized schema regardless of source exchange. String types are used for all numeric values to preserve decimal precision.

### 11.1 Normalized Depth Delta

```json
{
  "type": "depth_delta",
  "exchange": "binance",
  "symbol": "BTCUSDT",
  "timestamp": 1712275200000,
  "sequence": 12345678,
  "bids": [
    ["67000.00", "1.500"],
    ["66999.50", "0.000"]
  ],
  "asks": [
    ["67001.00", "2.300"]
  ],
  "checksum": "abc123"
}
```

**Notes:**

- `bids`/`asks`: array of `[price, quantity]` pairs as strings
- Quantity `"0.000"` means remove that price level
- `sequence` is exchange-native (e.g., Binance `lastUpdateId`)
- `checksum` is present only for exchanges that provide it

### 11.2 Normalized Depth Snapshot

```json
{
  "type": "depth_snapshot",
  "exchange": "binance",
  "symbol": "BTCUSDT",
  "timestamp": 1712275200000,
  "sequence": 12345670,
  "bids": [
    ["67000.00", "1.500"],
    ["66999.50", "3.200"]
  ],
  "asks": [
    ["67001.00", "2.300"],
    ["67001.50", "0.800"]
  ],
  "levels": 20
}
```

### 11.3 Normalized Kline

```json
{
  "type": "kline",
  "exchange": "binance",
  "symbol": "BTCUSDT",
  "timeframe": "1m",
  "openTime": 1712275200000,
  "closeTime": 1712275259999,
  "open": "67000.00",
  "high": "67050.00",
  "low": "66980.00",
  "close": "67020.00",
  "volume": "125.500",
  "quoteVolume": "8407500.00",
  "trades": 1842,
  "closed": false
}
```

**Notes:**

- `closed: false` indicates the candle is still forming (live update)
- `closed: true` indicates the candle is finalized
- Consumers should only persist candles where `closed: true`

### 11.4 Normalized Ticker

```json
{
  "type": "ticker",
  "exchange": "binance",
  "symbol": "BTCUSDT",
  "timestamp": 1712275200000,
  "last": "67020.00",
  "bid": "67019.50",
  "ask": "67020.50",
  "high24h": "67500.00",
  "low24h": "66200.00",
  "volume24h": "45230.120",
  "quoteVolume24h": "3025000000.00",
  "change24h": "-1.25",
  "changePercent24h": "-0.0186"
}
```

### 11.5 Symbol Metadata

```json
{
  "type": "metadata",
  "exchange": "binance",
  "symbol": "BTCUSDT",
  "baseAsset": "BTC",
  "quoteAsset": "USDT",
  "contractType": "PERPETUAL",
  "tickSize": "0.10",
  "lotSize": "0.001",
  "minNotional": "5.00",
  "maxLeverage": 125,
  "status": "TRADING",
  "fetchedAt": 1712275200000
}
```

---

## 12. Caching TTL Strategy

| Data Type | Redis Key Pattern | TTL | Refresh Source | Notes |
|-----------|-------------------|-----|----------------|-------|
| Depth (full book) | `mdc:depth:{exchange}:{symbol}` | No expiry | Real-time WS deltas | Maintained in-memory, written to Redis on every update |
| Depth (snapshot) | `mdc:depth:snap:{exchange}:{symbol}` | 60s | REST on recovery | Overwritten on each snapshot fetch |
| Klines 1m | `mdc:klines:{exchange}:{symbol}:1m` | 60s | Real-time WS | Short TTL, frequently refreshed |
| Klines 15m | `mdc:klines:{exchange}:{symbol}:15m` | 300s | Real-time WS | |
| Klines 1H | `mdc:klines:{exchange}:{symbol}:1H` | 600s | Real-time WS | |
| Klines 4H | `mdc:klines:{exchange}:{symbol}:4H` | 1800s | Real-time WS | |
| Klines 1D | `mdc:klines:{exchange}:{symbol}:1D` | 3600s | Real-time WS | |
| Ticker | `mdc:ticker:{exchange}:{symbol}` | 5s | Real-time WS | High frequency, short-lived |
| Exchange Info | `mdc:meta:{exchange}:{symbol}` | 3600s | Periodic REST | Rarely changes |
| Symbol List | `mdc:symbols:{exchange}` | 3600s | Periodic REST | Full symbol list per exchange |
| Hub Health | `mdc:health:{exchange}` | 10s | Market-hub heartbeat | Used by consumers to check data freshness |

**TTL design rationale:**

- TTLs act as a safety net, not the primary refresh mechanism
- If WS is healthy, data is refreshed well before TTL expiry
- If WS disconnects, TTL ensures stale data eventually disappears rather than being served indefinitely
- Consumers seeing a cache miss know the data is stale and can act accordingly

---

## 13. Backpressure Strategy

### Phase 1: Redis Pub/Sub (Current)

Redis pub/sub is inherently fire-and-forget. There is no built-in backpressure. The strategy is to accept this limitation and build resilience around it.

**Consumer lag detection:**

```
Per consumer, track:
  last_processed_at: timestamp of last successfully processed message
  lag_ms: now() - last_processed_at
```

**Lag response tiers:**

| Consumer Lag | Action |
|-------------|--------|
| < 1s | Normal operation |
| 1-5s | Log warning, monitor |
| 5-30s | Log error, skip stale messages, process only latest |
| > 30s | Reset consumer state, fetch latest from Redis cache |

**Design principle:** Market-hub publishes at exchange rate and never throttles inbound data. The bus is a real-time stream, not a queue. Consumers must be fast or accept data loss. This is acceptable for real-time market data where only the latest state matters.

### Phase 2: NATS JetStream

NATS provides native backpressure through consumer acknowledgment.

| Setting | Value | Rationale |
|---------|-------|-----------|
| **Max pending** | 1000 messages per consumer | Prevents unbounded memory growth |
| **Ack wait** | 5s | Consumer must ack within 5s or message is redelivered |
| **Max deliver** | 3 | After 3 failed deliveries, move to dead letter |
| **Dead letter subject** | `market.dlq.{consumer}` | Failed messages stored for inspection |
| **Replay policy** | Instant | New consumers can replay from any point |

**Consumer recovery flow:**

1. Consumer crashes
2. Consumer restarts, reconnects to NATS
3. NATS delivers from last acknowledged message
4. Consumer processes backlog at full speed
5. Once caught up, resumes real-time processing

**Dead letter queue processing:**

Messages in the DLQ are inspected periodically (every 5 minutes). Common failure reasons:

- Malformed message (log and discard)
- Consumer bug (alert, hold for retry after fix)
- Transient error (retry up to 3 more times)

---

## Appendix A: Implementation Priority

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| **P0** | Per-symbol health metrics + health API | 1 week | Observability |
| **P0** | Sequence tracking with gap logging | 1 week | Data integrity |
| **P1** | JSONL append-only log (file-based persistence) | 1 week | Auditability |
| **P1** | Active-Passive failover with Redis lock | 2 weeks | Reliability |
| **P1** | DEGRADED state in recovery SM | 3 days | Accuracy |
| **P2** | TimescaleDB persistence layer | 2 weeks | Replay/backtest |
| **P2** | Backpressure detection + consumer lag metrics | 1 week | Stability |
| **P2** | Request coalescing | 1 week | Efficiency |
| **P3** | NATS JetStream migration | 3 weeks | Scale |
| **P3** | Binary serialization (MessagePack) | 1 week | Performance |
| **P3** | Predictive throttling | 1 week | Prevention |

## Appendix B: Monitoring & Alerting

| Metric | Warning Threshold | Critical Threshold | Action |
|--------|-------------------|---------------------|--------|
| Weight consumption | >400w/min (50%) | >600w/min (75%) | Investigate, shed optional requests |
| Symbol in RECOVERING | >3 recoveries/hour | >10 recoveries/hour | Check exchange status, review symbol |
| Symbol in BLOCKED | Any | >5 symbols blocked | Exchange issue, check status page |
| Consumer lag | >5s | >30s | Scale consumer, check for bugs |
| WS reconnect rate | >3/hour | >10/hour | Network issue, check connectivity |
| 429 responses | Any | >3/hour | Review budget config, reduce requests |
| 418 responses | -- | Any | Immediate alert, all requests frozen |
| Hub heartbeat missed | 1 missed | 3 consecutive missed | Standby promotion check |
