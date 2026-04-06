# Bitrium Technical Architecture

> Crypto Trading SaaS Platform -- Technical Architecture & Evolution Plan
>
> **Version:** 2.0 | **Last Updated:** 2026-04-04 | **Status:** Active

---

## Table of Contents

1. [Critical Issues](#1-critical-issues)
2. [Target Architecture (V2)](#2-target-architecture-v2)
3. [Infrastructure Plan](#3-infrastructure-plan)
4. [Database Design Upgrade](#4-database-design-upgrade)
5. [Market Data System Improvements](#5-market-data-system-improvements)
6. [Security Hardening Plan](#6-security-hardening-plan)
7. [AI System Optimization](#7-ai-system-optimization)
8. [Deployment & CI/CD](#8-deployment--cicd)
9. [Observability](#9-observability)
10. [Step-by-Step Migration Plan](#10-step-by-step-migration-plan)

---

## Current Stack Summary

| Layer      | Technology                                                        |
|------------|-------------------------------------------------------------------|
| Frontend   | React 18 + Vite + TailwindCSS, Zustand, SPA with protected routes |
| Backend    | Node.js v22 + Express, PM2 (3 workers + 1 market-hub), WebSocket + REST |
| Data       | PostgreSQL + Redis                                                |
| Market     | Dedicated market-hub process, WS-first ingestion (Binance/Bybit/OKX/Gate), Redis pub/sub, rate limit system, recovery state machine |
| AI         | OpenAI / Claude / Qwen APIs, pipeline: candidates -> filter -> rank -> AI -> validate -> persist |
| Payments   | TRON USDT TRC-20, invoice + webhook                              |
| Deploy     | Single DigitalOcean droplet, Nginx, PM2                          |
| Security   | JWT, pbkdf2, 2FA TOTP, API keys in plaintext JSONB               |

---

## 1. CRITICAL ISSUES

### Security

| Risk | Severity | Impact |
|------|----------|--------|
| API keys stored **plaintext** in PostgreSQL JSONB | **CRITICAL** | Full compromise of user exchange accounts if DB is breached |
| No refresh token rotation | HIGH | Stolen JWT grants indefinite access until expiry |
| JWT with no key rotation | HIGH | Compromised signing key affects all sessions |
| No rate limiting on auth endpoints beyond basic | HIGH | Brute-force and credential stuffing attacks feasible |
| Single server = single point of failure | HIGH | Any failure takes down the entire platform |

### Scaling

| Risk | Severity | Impact |
|------|----------|--------|
| Single droplet architecture | HIGH | Cannot handle traffic spikes, no redundancy |
| No horizontal scaling | HIGH | CPU/memory ceiling on one machine |
| PM2 not container-aware | MEDIUM | No orchestration, no health-based rescheduling |
| All services co-located on one machine | HIGH | Noisy neighbor: market-hub CPU spike degrades API |
| PostgreSQL single instance, no replication | HIGH | DB failure = total outage, no read scaling |
| Redis single instance | HIGH | Redis crash = loss of pub/sub, sessions, cache simultaneously |

### Data

| Risk | Severity | Impact |
|------|----------|--------|
| No backup automation visible | **CRITICAL** | Data loss risk with no recovery path |
| No disaster recovery plan | **CRITICAL** | No documented procedure for catastrophic failure |
| Market data not persisted for replay | MEDIUM | Cannot backtest, audit, or debug historical events |

### Payments

| Risk | Severity | Impact |
|------|----------|--------|
| No cold wallet separation | HIGH | Hot wallet compromise exposes all funds |
| Deposit address reuse risk | MEDIUM | Privacy leak, potential double-credit exploits |

---

## 2. TARGET ARCHITECTURE (V2)

### Design Philosophy

Modular monolith evolving to microservices. Each module owns its data and communicates via well-defined interfaces (Redis pub/sub, BullMQ queues, REST). Services can be extracted to separate processes/containers without code rewrites.

### System Diagram

```
                        ┌─────────────────┐
                        │   CDN / Edge    │
                        │  (Cloudflare)   │
                        └────────┬────────┘
                                 │
                        ┌────────▼────────┐
                        │  API Gateway    │
                        │  (Nginx/Kong)   │
                        │  Rate Limit     │
                        │  Auth Verify    │
                        └───┬────┬────┬───┘
                            │    │    │
              ┌─────────────┤    │    ├─────────────┐
              │              │    │    │              │
    ┌─────────▼──┐  ┌───────▼──┐│  ┌─▼──────────┐  │
    │ API Server │  │ WS Server ││  │ Admin API  │  │
    │ (Stateless)│  │ (Sticky)  ││  │            │  │
    │ 3+ inst    │  │ 2+ inst   ││  │ 1 inst     │  │
    └─────┬──────┘  └─────┬─────┘│  └─────┬──────┘  │
          │               │      │        │          │
          └───────────────┼──────┼────────┘          │
                          │      │                   │
                    ┌─────▼──────▼───┐               │
                    │     Redis      │               │
                    │  Cluster/Sent  │               │
                    │  • Cache       │               │
                    │  • Pub/Sub     │               │
                    │  • Sessions    │               │
                    │  • Rate Limits │               │
                    └───────┬────────┘               │
                            │                        │
              ┌─────────────┼────────────┐           │
              │             │            │           │
    ┌─────────▼──┐  ┌──────▼─────┐  ┌──▼─────────┐
    │ PostgreSQL │  │ Market-Hub │  │ AI Service  │
    │ Primary +  │  │ (Dedicated)│  │ (Isolated)  │
    │ Read Replica│  │ WS Ingest │  │ Queue-based │
    └────────────┘  │ Recovery SM│  └─────────────┘
                    │ Budget Eng │
                    └────────────┘

    ┌─────────────┐
    │ Payment Svc │
    │ (Isolated)  │
    │ TRON/USDT   │
    └─────────────┘
```

### Service Breakdown

#### API Server
- **Role:** Stateless Express application handling all REST routes
- **Scaling:** Horizontally scalable behind load balancer, 3+ instances
- **State:** None -- all state in PostgreSQL and Redis
- **Communication:** Reads from PostgreSQL (primary for writes, replica for reads), Redis for cache/sessions

#### WS Server
- **Role:** Real-time market data fan-out to browser clients
- **Scaling:** 2+ instances with sticky sessions via IP hash at the load balancer
- **State:** In-memory connection registry per instance, backed by Redis pub/sub for cross-instance messaging
- **Communication:** Subscribes to Redis pub/sub channels published by Market-Hub

#### Market-Hub
- **Role:** Single leader instance responsible for exchange WebSocket ingestion
- **Components:** Recovery state machine, budget engine, rate limit tracker, symbol health monitor
- **Scaling:** Single active instance with standby for failover (leader election via Redis lock)
- **Communication:** Publishes normalized market data to Redis pub/sub

#### AI Service
- **Role:** Isolated processing of AI trade analysis pipeline
- **Queue:** BullMQ on Redis for job dispatch and result collection
- **Pipeline:** candidates -> filter -> rank -> AI evaluation -> validate -> persist
- **Scaling:** Independent worker instances, rate-limited per AI provider

#### Payment Service
- **Role:** Isolated handling of TRON/USDT TRC-20 transactions
- **Components:** Invoice management, webhook processing, wallet operations
- **Requirements:** Idempotent webhook processing, deposit address management
- **Scaling:** Single instance (low throughput), designed for extraction to separate deployment

#### Admin API
- **Role:** Administrative operations, analytics, user management
- **Access:** Restricted network access (VPN or IP whitelist)
- **Scaling:** Single instance, reads from PostgreSQL replica

---

## 3. INFRASTRUCTURE PLAN

### Phase 1: Current to Stable Production

**Goal:** Reliability and data safety without major architectural changes.

| Resource | Specification | Monthly Cost |
|----------|--------------|-------------|
| App Droplet | 1x Premium (8 vCPU, 16GB RAM) | ~$50 |
| Managed PostgreSQL | Basic plan, auto backups, 1 read replica | ~$15 |
| Managed Redis | Basic plan, persistence enabled, sentinel | ~$15 |
| **Total** | | **~$80-100** |

**Actions:**
- Migrate PostgreSQL to DigitalOcean Managed Database (automatic daily backups, point-in-time recovery)
- Migrate Redis to DigitalOcean Managed Redis (persistence, automatic failover)
- Docker Compose for local development and staging parity
- PM2 ecosystem file with proper environment separation (`dev`, `staging`, `prod`)

### Phase 2: Scale to 10K Users

**Goal:** Horizontal scaling, service separation, redundancy.

| Resource | Specification | Monthly Cost |
|----------|--------------|-------------|
| API Droplets | 3x (2 vCPU, 4GB each) | ~$60 |
| WS Droplets | 2x (2 vCPU, 4GB each) | ~$40 |
| Market-Hub | 1x dedicated (4 vCPU, 8GB) | ~$40 |
| AI Worker | 1x (2 vCPU, 4GB) | ~$20 |
| DO Load Balancer | 1x | ~$12 |
| Managed PostgreSQL | Production plan + read replica | ~$50 |
| Managed Redis | 3-node cluster | ~$45 |
| DO Spaces | S3-compatible backup storage | ~$5 |
| **Total** | | **~$270-300** |

### Phase 3: Scale to 100K+ Users

**Goal:** Auto-scaling, event streaming, multi-region readiness.

| Resource | Specification | Monthly Cost |
|----------|--------------|-------------|
| Kubernetes (DOKS or EKS) | Auto-scaling API pods (HPA) | ~$400 |
| Kafka / NATS | Market data distribution | ~$200 |
| TimescaleDB | Time-series for candles, trades | ~$100 |
| Multi-region CDN | Cloudflare Pro | ~$25 |
| WAF | Web Application Firewall | ~$50 |
| GPU Node | Local AI inference (Qwen/Llama) | ~$300 |
| Monitoring | Grafana Cloud or Datadog | ~$100 |
| **Total** | | **~$1,200-1,500+** |

### Failover Strategy

| Component | Strategy | RTO |
|-----------|----------|-----|
| PostgreSQL | Automatic failover via managed DB (standby promotion) | ~30s |
| Redis | Sentinel with automatic promotion to primary | ~15s |
| API Server | Health check + LB removes unhealthy instances automatically | ~5s |
| Market-Hub | Standby instance with leader election via Redis SETNX lock | ~10s |
| Payment Service | Idempotent webhook processing -- survives restarts without duplicate credits | 0 (at-least-once) |
| WS Server | Clients auto-reconnect; LB routes to healthy instance | ~3s client-side |

---

## 4. DATABASE DESIGN UPGRADE

### Replication Topology

```
  ┌──────────────────┐     async replication     ┌──────────────────┐
  │   PostgreSQL     │ ─────────────────────────► │   Read Replica   │
  │   Primary        │                            │                  │
  │                  │                            │  • Analytics     │
  │  • Auth writes   │                            │  • Admin dash    │
  │  • Payment writes│                            │  • Market queries│
  │  • Subscription  │                            │  • AI read-heavy │
  │    mutations     │                            │    queries       │
  └──────────────────┘                            └──────────────────┘
```

**Write Primary:** auth, payments, subscriptions, AI persist
**Read Replica:** analytics, admin dashboard, market data queries, AI read-heavy operations

### Table Partitioning

#### `payment_events` -- partition by month (range on `created_at`)

```sql
CREATE TABLE payment_events (
    id BIGSERIAL,
    user_id INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USDT',
    tx_hash TEXT,
    status TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Create monthly partitions
CREATE TABLE payment_events_2026_01 PARTITION OF payment_events
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE payment_events_2026_02 PARTITION OF payment_events
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
-- ... generate monthly via cron job or pg_partman
```

#### `market_candles` -- partition by `open_time` range

```sql
CREATE TABLE market_candles (
    symbol TEXT NOT NULL,
    timeframe TEXT NOT NULL,
    open_time TIMESTAMPTZ NOT NULL,
    open NUMERIC,
    high NUMERIC,
    low NUMERIC,
    close NUMERIC,
    volume NUMERIC,
    PRIMARY KEY (symbol, timeframe, open_time)
) PARTITION BY RANGE (open_time);

-- Weekly partitions for high-frequency data
CREATE TABLE market_candles_2026_w14 PARTITION OF market_candles
    FOR VALUES FROM ('2026-03-30') TO ('2026-04-06');
```

**Alternative:** Use TimescaleDB hypertable for automatic partitioning:

```sql
-- TimescaleDB automatic chunking
SELECT create_hypertable('market_candles', 'open_time',
    chunk_time_interval => INTERVAL '1 week');
```

#### `ai_trade_ideas` -- partition by `created_at` month

```sql
CREATE TABLE ai_trade_ideas (
    id BIGSERIAL,
    symbol TEXT NOT NULL,
    direction TEXT NOT NULL,
    confidence NUMERIC,
    model TEXT NOT NULL,
    analysis JSONB,
    tokens_in INTEGER,
    tokens_out INTEGER,
    cost_usd NUMERIC,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);
```

### Caching Strategy

| Data | Cache Location | TTL | Invalidation |
|------|---------------|-----|-------------|
| Exchange info | Redis | 1 hour | Manual on exchange update |
| Ticker data | Redis | 5 seconds | Overwrite on new tick |
| Order book depth | Redis (pub/sub) | Realtime | Continuous stream |
| Kline/candle data | Redis | 60 seconds | Overwrite on close |
| User sessions | Redis | 5 minutes | Refresh on activity |
| Admin analytics | Redis | 30 seconds | TTL expiry |
| AI prompt cache | Redis | 5 minutes | Hash-based key |

### Schema Improvements

#### 1. Encrypt API Keys

```sql
-- Add encrypted column alongside plaintext
ALTER TABLE user_exchange_keys ADD COLUMN encrypted_api_key TEXT;
ALTER TABLE user_exchange_keys ADD COLUMN encrypted_api_secret TEXT;
ALTER TABLE user_exchange_keys ADD COLUMN encryption_version INTEGER DEFAULT 1;

-- After migration, drop plaintext
-- ALTER TABLE user_exchange_keys DROP COLUMN api_key;
-- ALTER TABLE user_exchange_keys DROP COLUMN api_secret;
```

#### 2. Refresh Tokens Table

```sql
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    device_fingerprint TEXT,
    ip_address INET,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_refresh_tokens_expiry ON refresh_tokens(expires_at) WHERE revoked_at IS NULL;
```

#### 3. Audit Log Table

```sql
CREATE TABLE audit_log (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER,
    admin_id INTEGER,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    old_value JSONB,
    new_value JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_user ON audit_log(user_id, created_at DESC);
CREATE INDEX idx_audit_log_action ON audit_log(action, created_at DESC);
```

#### 4. Performance Indexes

```sql
-- Active subscriptions lookup
CREATE INDEX idx_subs_user_active
    ON subscriptions(user_id)
    WHERE status = 'active';

-- Payment events by user
CREATE INDEX idx_payments_user_created
    ON payment_events(user_id, created_at DESC);

-- AI trade ideas by symbol and recency
CREATE INDEX idx_ai_ideas_symbol_created
    ON ai_trade_ideas(symbol, created_at DESC);

-- Refresh tokens cleanup
CREATE INDEX idx_refresh_tokens_expired
    ON refresh_tokens(expires_at)
    WHERE revoked_at IS NULL;
```

---

## 5. MARKET DATA SYSTEM IMPROVEMENTS

### Current Strengths

The market data system already implements several robust patterns:

- **WS-first ingestion** with REST fallback
- **Recovery state machine** with well-defined state transitions
- **Budget engine** for rate limit tracking across exchanges
- **Redis pub/sub** for internal distribution

### Ingestion Reliability Enhancements

#### Message Sequence Tracking

```
Exchange WS Message
    │
    ├── Extract sequence/updateId
    ├── Compare with last known sequence
    │   ├── Sequential → process normally
    │   ├── Gap detected → log gap, trigger recovery
    │   └── Duplicate → discard, log warning
    └── Update last_sequence in Redis
```

#### Per-Symbol Health Metrics

```typescript
interface SymbolHealth {
  symbol: string;
  exchange: string;
  last_update_at: number;      // Unix timestamp
  gap_count: number;           // Gaps detected in last hour
  recovery_count: number;      // Recovery triggers in last hour
  avg_latency_ms: number;      // Average ingestion latency
  status: 'healthy' | 'degraded' | 'unhealthy';
}
```

Store in Redis hash: `symbol_health:{exchange}:{symbol}`

#### Automatic Symbol Demotion

| Condition | Action |
|-----------|--------|
| gap_count > 10 in 1 hour | Reduce poll frequency by 50% |
| recovery_count > 5 in 1 hour | Move to REST-only mode |
| No update for > 60s | Mark unhealthy, alert |
| Healthy for 30 min after demotion | Promote back to normal |

### Latency Optimization

| Optimization | Current | Target | Effort |
|-------------|---------|--------|--------|
| Internal protocol | JSON over Redis pub/sub | MessagePack binary | Medium |
| Serialization | `JSON.stringify` / `JSON.parse` | `msgpack.encode` / `msgpack.decode` | Low |
| Same-machine IPC | Redis pub/sub (~1-5ms) | SharedArrayBuffer (if co-located) | High |
| Client fan-out | Per-message serialize | Pre-serialized broadcast buffer | Medium |

### Replay Capability (New)

**Option A: PostgreSQL/TimescaleDB Persistence**
- Write every normalized market event to `market_candles` table
- TimescaleDB hypertable with automatic partitioning
- Retention policy: 90 days hot, archive to S3

**Option B: Append-Only Log Files**
- Write raw events to daily log files: `market_events_2026-04-04.jsonl`
- Rotate daily, compress, upload to S3/DO Spaces
- Lower storage cost, higher replay latency
- Suitable for backtesting and audit, not real-time replay

**Recommendation:** Start with Option B (simpler), migrate to Option A when TimescaleDB is adopted.

### Scaling Path

```
Phase 1 (Current)          Phase 2 (10K users)         Phase 3 (100K+ users)
┌──────────────┐           ┌──────────────┐            ┌──────────────┐
│ Redis Pub/Sub│           │ NATS JetStream│           │    Kafka     │
│              │           │              │            │              │
│ • Simple     │           │ • Persistent │            │ • Guaranteed │
│ • Fast       │    ──►    │ • Replay     │    ──►     │   delivery   │
│ • No persist │           │ • Lightweight│            │ • Partitioned│
│ • Good <10K  │           │ • Good <50K  │            │ • Good >50K  │
└──────────────┘           └──────────────┘            └──────────────┘
```

---

## 6. SECURITY HARDENING PLAN

### API Key Encryption

Replace plaintext storage with AES-256-GCM encryption using per-row IV:

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

// 32-byte master key from environment (NOT stored in code or .env on disk)
const MASTER_KEY = Buffer.from(process.env.ENCRYPTION_MASTER_KEY!, 'hex');

function encrypt(plaintext: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', MASTER_KEY, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();
  // Format: iv:authTag:ciphertext (all hex-encoded)
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(ciphertext: string): string {
  const [ivHex, tagHex, encHex] = ciphertext.split(':');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    MASTER_KEY,
    Buffer.from(ivHex, 'hex')
  );
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return decipher.update(Buffer.from(encHex, 'hex')) + decipher.final('utf8');
}
```

**Migration Strategy:**
1. Add `encrypted_api_key` and `encrypted_api_secret` columns
2. Deploy code that writes to both columns (dual-write)
3. Run batch migration script to encrypt existing plaintext keys
4. Deploy code that reads from encrypted column only
5. Verify all reads succeed from encrypted column
6. Drop plaintext columns

### Secrets Management

| Environment | Method |
|------------|--------|
| Development | `.env` files (git-ignored) |
| Staging | DigitalOcean App Platform environment variables |
| Production | DigitalOcean Secrets or HashiCorp Vault |

**Key Rotation Schedule:**
- `ENCRYPTION_MASTER_KEY`: Rotate quarterly with re-encryption migration
- `JWT_SECRET`: Rotate monthly (support previous key for grace period)
- Exchange API keys: User-managed, encourage rotation

### Auth Improvements

#### Refresh Token Rotation

```
Client                    Server
  │                         │
  ├── Login ───────────────►│
  │                         ├── Generate access_token (15min)
  │                         ├── Generate refresh_token (7 days)
  │◄── { access, refresh } ─┤
  │                         │
  │  ... 15 minutes later   │
  │                         │
  ├── POST /auth/refresh ──►│
  │    { refresh_token }    ├── Verify refresh_token
  │                         ├── Revoke old refresh_token
  │                         ├── Generate new access_token (15min)
  │                         ├── Generate new refresh_token (7 days)
  │◄── { access, refresh } ─┤
  │                         │
```

If a revoked refresh token is reused, revoke **all** tokens for that user (indicates token theft).

#### Login Anomaly Detection

| Signal | Action |
|--------|--------|
| New IP address | Log, allow (unless high risk) |
| New country | Email verification required |
| 5 failed logins | 15-minute lockout |
| 10 failed logins | 1-hour lockout |
| Impossible travel (login from 2 countries <1hr apart) | Block + email alert |

#### Device Fingerprinting

Bind refresh tokens to device fingerprint (browser UA + screen resolution hash). Reject refresh attempts from mismatched fingerprints.

### Anti-Abuse Measures

| Measure | Implementation |
|---------|---------------|
| Webhook replay protection | Timestamp + nonce + HMAC signature; reject if timestamp > 5 min old |
| API rate limiting per tier | Explorer: 60 req/min, Trader: 120 req/min, Titan: 300 req/min |
| Invoice amount validation | Reject amounts < $1 (prevent dust attacks) |
| Deposit address single-use | Generate new address per invoice, mark used after confirmation |
| Request signing | HMAC-SHA256 signature on API key requests with timestamp |

---

## 7. AI SYSTEM OPTIMIZATION

### Cost Reduction Strategies

#### Prompt Caching

```
Request arrives
    │
    ├── Hash prompt content (SHA-256)
    ├── Check Redis: prompt_cache:{hash}
    │   ├── HIT → return cached response (save API call)
    │   └── MISS → call AI provider
    │       ├── Store response: prompt_cache:{hash} TTL 300s
    │       └── Return response
    │
    └── Log: model, tokens_in, tokens_out, cost_usd, cache_hit
```

#### Tiered Model Selection

| Task | Model | Cost/1K tokens |
|------|-------|---------------|
| Initial screening (pass/fail) | gpt-4o-mini | $0.00015 |
| Technical analysis scoring | gpt-4o-mini | $0.00015 |
| Final evaluation + narrative | gpt-4o | $0.005 |
| Alternative final eval | claude-sonnet | $0.003 |
| Batch classification | Qwen (local, Phase 3) | ~$0 |

**Expected savings:** 40-50% by routing 80% of calls through mini models.

#### Batch Requests

Group up to 5 candidates per API call with structured output:

```typescript
// Instead of 5 separate calls:
const prompt = `Analyze these 5 trading candidates and return structured scores:
${candidates.map((c, i) => `${i+1}. ${c.symbol} - ${c.summary}`).join('\n')}

Return JSON array with: symbol, score (0-100), direction, confidence, reasoning.`;
```

#### Cost Tracking

```sql
-- Per-call logging
INSERT INTO ai_usage_log (
    model, provider, tokens_in, tokens_out,
    cost_usd, cache_hit, duration_ms, created_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW());

-- Daily cost report
SELECT
    DATE(created_at) as day,
    provider,
    model,
    COUNT(*) as calls,
    SUM(tokens_in) as total_tokens_in,
    SUM(tokens_out) as total_tokens_out,
    SUM(cost_usd) as total_cost,
    AVG(duration_ms) as avg_latency
FROM ai_usage_log
GROUP BY 1, 2, 3
ORDER BY 1 DESC, total_cost DESC;
```

### Latency Optimization

#### Queue-Based Processing (BullMQ)

```
HTTP Request (sync)              Background (async)
┌──────────────┐                ┌──────────────┐
│ POST /analyze│                │ BullMQ Worker│
│              │                │              │
│ 1. Validate  │                │ 1. Dequeue   │
│ 2. Enqueue   │──── Redis ────►│ 2. AI call   │
│ 3. Return    │    queue       │ 3. Validate  │
│    job_id    │                │ 4. Persist   │
│    (instant) │                │ 5. Notify    │──► WebSocket
└──────────────┘                └──────────────┘    push to client
```

#### Pre-Computation

- Run batch analysis during off-peak hours (02:00-06:00 UTC)
- Pre-compute analysis for top 50 symbols
- Store results with longer TTL (30 minutes)
- Serve pre-computed results instantly, trigger refresh in background

#### Response Streaming

- Use Server-Sent Events (SSE) for real-time AI output to the UI
- Stream partial analysis as tokens arrive from the AI provider
- Reduces perceived latency from 5-10s to first-token-in-500ms

### Caching Architecture

```
┌─────────────────────────────────────────────┐
│                 Cache Layers                │
├─────────────────────────────────────────────┤
│                                             │
│  L1: prompt_hash → response (TTL 300s)     │
│      Exact prompt match, highest hit rate   │
│                                             │
│  L2: symbol:timeframe:type → result (60s)  │
│      Symbol-level analysis cache            │
│                                             │
│  L3: pre_computed:{symbol} → analysis (30m)│
│      Batch pre-computation results          │
│                                             │
└─────────────────────────────────────────────┘
```

### Local Inference (Phase 3+)

| Aspect | Cloud API | Local Inference |
|--------|-----------|----------------|
| Models | GPT-4o, Claude, Qwen (API) | Qwen 7B, Llama 3 8B (local) |
| Use for | Final evaluation, narrative gen (Tier A) | Screening, scoring, classification (Tier B/C) |
| Hardware | N/A | 1x GPU droplet (A10 or similar) |
| Cost | ~$0.005/1K tokens | ~$0 marginal cost |
| Expected savings | Baseline | 60-70% cost reduction |

---

## 8. DEPLOYMENT & CI/CD

### Zero-Downtime Deployment

Blue/Green strategy using Nginx upstream switching:

```yaml
# GitHub Actions Workflow
name: Deploy Production
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Build
        run: |
          npm ci
          npm run build
          npm run typecheck

      - name: Upload to server
        run: |
          rsync -az --delete dist/ deploy@server:/app/releases/${{ github.sha }}/
          rsync -az server/ deploy@server:/app/releases/${{ github.sha }}/server/

      - name: Run smoke tests on staging
        run: |
          ssh deploy@server "cd /app/releases/${{ github.sha }} && npm test -- --smoke"

      - name: Switch traffic (zero-downtime)
        run: |
          ssh deploy@server "
            ln -sfn /app/releases/${{ github.sha }} /app/current-new
            mv -Tf /app/current-new /app/current
            pm2 reload ecosystem.config.cjs
            # Nginx picks up new upstream on reload (not restart)
            sudo nginx -s reload
          "

      - name: Verify deployment
        run: |
          sleep 5
          curl -f https://api.bitrium.com/health || exit 1

      - name: Cleanup old releases (keep last 3)
        run: |
          ssh deploy@server "
            cd /app/releases
            ls -t | tail -n +4 | xargs rm -rf
          "
```

### Rollback Procedure

```bash
# Instant rollback (< 1 second)
ssh deploy@server "
  PREVIOUS=$(ls -t /app/releases | sed -n '2p')
  ln -sfn /app/releases/$PREVIOUS /app/current-new
  mv -Tf /app/current-new /app/current
  pm2 reload ecosystem.config.cjs
  sudo nginx -s reload
"
```

### Database Migration Strategy

Use the **expand-contract** pattern to ensure backward compatibility:

```
Phase 1 (Expand):                Phase 2 (Contract):
┌──────────────┐                ┌──────────────┐
│ Add new column│               │ Drop old col  │
│ Add new table │               │ Remove compat │
│ Add new index │               │ code          │
│ Keep old code │               │               │
│ working       │               │ (next release)│
└──────────────┘                └──────────────┘
```

Rules:
- Never rename columns in a single deploy
- Never drop columns in the same deploy as the code change
- Migrations must be idempotent (safe to run twice)
- All migrations must have a corresponding rollback script

### Environment Separation

| Environment | Infrastructure | Database | Redis | Purpose |
|------------|---------------|----------|-------|---------|
| `dev` | Local Docker Compose | Local PG | Local Redis | Development |
| `staging` | DO Droplet | Staging managed DB | Staging managed Redis | Pre-production testing |
| `prod` | Production droplet(s) | Production managed DB | Production managed Redis | Live traffic |

### CI Pipeline

```
push to branch
    │
    ├── lint (ESLint)
    ├── typecheck (tsc --noEmit)
    ├── unit tests (Vitest)
    │
    └── on main branch:
        ├── build (Vite)
        ├── deploy to staging
        ├── smoke tests (health, auth, WS connect)
        ├── deploy to production
        └── post-deploy health check
```

---

## 9. OBSERVABILITY

### Logging

#### Structured JSON Logging (Pino)

```typescript
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: {
    service: process.env.SERVICE_NAME,
    version: process.env.APP_VERSION,
  },
});

// Usage -- produces structured JSON
logger.info({
  requestId: req.id,
  userId: req.user?.id,
  action: 'trade_idea_created',
  symbol: 'BTCUSDT',
  duration_ms: 1234,
}, 'AI trade idea generated');
```

**Output:**
```json
{
  "level": "info",
  "time": 1712188800000,
  "service": "api-server",
  "version": "2.1.0",
  "requestId": "req_abc123",
  "userId": 42,
  "action": "trade_idea_created",
  "symbol": "BTCUSDT",
  "duration_ms": 1234,
  "msg": "AI trade idea generated"
}
```

#### Log Shipping

| Destination | Use Case | Retention |
|-------------|----------|-----------|
| Grafana Loki (self-hosted) or Datadog | Hot search, dashboards | 30 days |
| S3 / DO Spaces | Cold archive | 1 year |

### Metrics (Prometheus + Grafana)

#### Key Metrics

```
# API Performance
api_request_duration_seconds{route, method, status}    histogram
api_requests_total{route, method, status}              counter

# WebSocket
ws_connections_active                                  gauge
ws_messages_sent_total{type}                           counter

# Exchange / Market-Hub
exchange_weight_used{exchange}                         gauge
exchange_weight_limit{exchange}                        gauge
exchange_requests_total{exchange, endpoint, status}    counter
recovery_state_transitions{symbol, from, to}           counter
symbol_health_status{exchange, symbol}                 gauge

# AI
ai_request_duration_seconds{provider, model}           histogram
ai_cost_usd{provider, model}                           counter
ai_cache_hits_total                                    counter
ai_cache_misses_total                                  counter

# Payments
payment_invoices_total{status}                         counter
payment_webhook_duration_seconds                       histogram
payment_webhook_failures_total                         counter

# Business
active_subscriptions{tier}                             gauge
active_users_daily                                     gauge
```

### Alerting Rules

| Alert | Condition | Severity | Channel |
|-------|-----------|----------|---------|
| Exchange weight high | `exchange_weight_used > 600` | WARNING | Slack |
| Exchange weight critical | `exchange_weight_used > 900` | CRITICAL | Slack + PagerDuty |
| IP ban detected | `418 or 429 count > 0 in 5min` | CRITICAL | Slack + PagerDuty |
| API error rate | `error_rate > 5% over 5min` | WARNING | Slack |
| API p99 latency | `p99 > 2s over 5min` | WARNING | Slack |
| WS connection drop | `connections drop > 20% in 1min` | CRITICAL | Slack + PagerDuty |
| Payment webhook failure | `any failure` | CRITICAL | Slack + PagerDuty + Email |
| Disk usage | `> 80%` | WARNING | Slack |
| DB replication lag | `> 10s` | WARNING | Slack |
| Redis memory | `> 80% maxmemory` | WARNING | Slack |

### Distributed Tracing (OpenTelemetry)

```
HTTP Request
    │
    ├── [Span] nginx.proxy (1ms)
    ├── [Span] express.middleware.auth (5ms)
    ├── [Span] redis.get session (2ms)
    ├── [Span] postgresql.query (15ms)
    ├── [Span] openai.chat.completion (3200ms)
    ├── [Span] redis.set cache (1ms)
    └── [Span] express.response (1ms)

Total: 3225ms -- clearly shows AI call is the bottleneck
```

**Sampling Strategy:**

| Environment | Sample Rate |
|-------------|-------------|
| Development | 100% |
| Staging | 100% |
| Production | 10% (normal), 100% (errors) |

---

## 10. STEP-BY-STEP MIGRATION PLAN

### Phase 1 -- Foundation (Week 1-2)

**Goal:** Zero downtime. Improve observability, security, and data safety.

| # | Task | Risk | Downtime |
|---|------|------|----------|
| 1 | Replace all `console.log` with Pino structured logging | None | None |
| 2 | Add `/health` endpoint with deep checks (DB, Redis, WS) | None | None |
| 3 | Encrypt API keys in DB (add column, dual-write, migrate, drop plaintext) | Low | None |
| 4 | Implement refresh token rotation | Low | None |
| 5 | Set up automated PostgreSQL backups (daily snapshot + WAL archiving) | None | None |
| 6 | Add Prometheus `/metrics` endpoint | None | None |
| 7 | Create Docker Compose for local dev | None | None |

**Exit Criteria:** All API keys encrypted, refresh tokens working, backups verified, structured logs shipping.

### Phase 2 -- Reliability (Week 3-4)

**Goal:** Eliminate single points of failure for data layer.

| # | Task | Risk | Downtime |
|---|------|------|----------|
| 1 | Migrate to managed PostgreSQL (DO Managed Database) | Medium | ~5min (planned) |
| 2 | Migrate to managed Redis (DO Managed Redis) | Medium | ~5min (planned) |
| 3 | Enable read replica for analytics queries | Low | None |
| 4 | Set up Grafana dashboard (weight, requests, errors, latency) | None | None |
| 5 | Configure alerting (Slack webhook + PagerDuty) | None | None |
| 6 | Implement zero-downtime deploy (blue/green Nginx) | Low | None |
| 7 | Create staging environment (separate droplet) | None | None |

**Exit Criteria:** Managed DB with auto-failover, managed Redis with sentinel, dashboards live, alerting active, staging env operational.

### Phase 3 -- Scale (Week 5-8)

**Goal:** Service separation and horizontal scaling.

| # | Task | Risk | Downtime |
|---|------|------|----------|
| 1 | Containerize all services (Docker: API, WS, market-hub, AI) | Medium | None |
| 2 | DO Load Balancer for API (2+ instances) | Low | None |
| 3 | Separate WS server from API server | Medium | Brief (~30s) |
| 4 | AI service isolation (BullMQ queue + dedicated worker) | Medium | None |
| 5 | Payment service isolation | Medium | None |
| 6 | Add market data persistence (append-only logs -> S3) | Low | None |

**Exit Criteria:** Services running in containers, API horizontally scaled, AI and Payment services isolated, market data persisted.

### Phase 4 -- Performance (Week 9-12)

**Goal:** Optimize latency, caching, and cost.

| # | Task | Risk | Downtime |
|---|------|------|----------|
| 1 | CDN for static assets (Cloudflare) | Low | None |
| 2 | Redis cluster (3 nodes) | Medium | ~1min (planned) |
| 3 | API response caching (Redis, route-level) | Low | None |
| 4 | MessagePack for internal WS communication | Medium | None |
| 5 | AI prompt caching (hash -> Redis) | Low | None |
| 6 | Rate limiting per user tier | Low | None |

**Exit Criteria:** Sub-100ms API p99, AI costs reduced 40%+, CDN serving static assets, per-tier rate limiting active.

### Phase 5 -- Enterprise (Month 4+)

**Goal:** Scale beyond 50K users, compliance, hardening.

| # | Task | Risk | Downtime |
|---|------|------|----------|
| 1 | Kubernetes migration (DOKS) | High | Planned maintenance |
| 2 | Multi-region deployment | High | None |
| 3 | Kafka/NATS for market data at scale | Medium | None |
| 4 | Local AI inference (GPU node) | Medium | None |
| 5 | SOC2 compliance preparation | None | None |
| 6 | Penetration testing (external firm) | None | None |

**Exit Criteria:** Auto-scaling infrastructure, multi-region readiness, compliance documentation, pentest report with remediations.

---

## COST ESTIMATION

| Phase | Monthly Cost | Users Supported | Key Infrastructure |
|-------|-------------|-----------------|-------------------|
| Current | ~$50 | 1-500 | 1 droplet, local PG + Redis |
| Phase 1-2 | ~$100 | 500-5K | Droplet + managed DB + managed Redis |
| Phase 3 | ~$300 | 5K-20K | 3 API + LB + managed services |
| Phase 4 | ~$600 | 20K-50K | Cluster + CDN + monitoring stack |
| Phase 5 | ~$1,500+ | 50K-100K+ | K8s + multi-region + GPU |

> **Note:** Costs scale linearly with user count. The managed database and Redis costs are fixed per tier. The primary variable cost drivers are compute instances and AI API usage.

---

## PERFORMANCE EXPECTATIONS

| Metric | Current | After Phase 2 | After Phase 4 |
|--------|---------|---------------|---------------|
| API p99 latency | ~200ms | ~100ms | ~50ms |
| WS fan-out latency | ~10ms | ~5ms | ~2ms |
| Max concurrent WS connections | ~500 | ~5,000 | ~50,000 |
| Exchange weight usage | 50/800 | 50/800 | 50/800 |
| Deploy downtime | ~10s | 0s | 0s |
| Recovery time (failure) | Manual | ~30s auto | ~10s auto |
| Market data retention | None | 30 days | 1 year+ |
| AI response (cached) | N/A | ~5ms | ~5ms |
| AI response (uncached) | ~5s | ~3s | ~1s (local) |
| Backup RPO | None | 24h | 1h (WAL) |
| Backup RTO | Unknown | ~30min | ~5min |

---

## APPENDIX: DECISION LOG

| Decision | Rationale | Date |
|----------|-----------|------|
| Stay on DigitalOcean (not AWS/GCP) | Cost efficiency, simpler managed services, sufficient for current scale | 2026-04 |
| Modular monolith before microservices | Avoid premature complexity; extract services as boundaries become clear | 2026-04 |
| BullMQ over RabbitMQ for AI queue | Already using Redis; BullMQ is lightweight and well-integrated | 2026-04 |
| Pino over Winston for logging | Better performance (5-10x faster), native structured JSON | 2026-04 |
| AES-256-GCM for API key encryption | Authenticated encryption prevents tampering; per-row IV prevents pattern analysis | 2026-04 |
| Expand-contract for DB migrations | Enables zero-downtime deploys; backward-compatible by design | 2026-04 |
| TimescaleDB over raw partitioning | Automatic chunk management, built-in retention policies, compression | 2026-04 |
| Append-only logs before TimescaleDB | Lower complexity for Phase 1; TimescaleDB introduced when query patterns mature | 2026-04 |
