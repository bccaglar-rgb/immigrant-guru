# Bitrium Migration Roadmap

> Status: Architecture Proposal
> Last Updated: 2026-04-04
> Priority: CRITICAL -- this is the execution plan for all other architecture docs

---

## Table of Contents

1. [Roadmap Overview](#roadmap-overview)
2. [Phase 1: Foundation (Week 1-2)](#phase-1-foundation)
3. [Phase 2: Reliability (Week 3-4)](#phase-2-reliability)
4. [Phase 3: Scale (Week 5-8)](#phase-3-scale)
5. [Phase 4: Performance (Week 9-12)](#phase-4-performance)
6. [Phase 5: Enterprise (Month 4+)](#phase-5-enterprise)
7. [Feature Flags Strategy](#feature-flags-strategy)
8. [Shadow Traffic Testing](#shadow-traffic-testing)
9. [Data Migration Procedures](#data-migration-procedures)
10. [Rollback Plans](#rollback-plans)
11. [Dependencies and Ordering](#dependencies-and-ordering)
12. [Team Responsibilities](#team-responsibilities)
13. [Exit Criteria](#exit-criteria)
14. [Risk Register](#risk-register)

---

## 1. Roadmap Overview

```
Week  1  2  3  4  5  6  7  8  9  10  11  12  13+
      |--Phase 1--|--Phase 2--|----Phase 3----|---Phase 4---|--Phase 5-->
      Foundation   Reliability  Scale          Performance   Enterprise

Key Milestones:
  W2: API keys encrypted, structured logging live, Docker dev ready
  W4: Managed PG+Redis, staging env, Grafana dashboards, zero-downtime deploy
  W8: Services containerized, WS gateway separated, AI isolated
  W12: CDN live, caching layer complete, per-user rate limiting
  M4+: K8s evaluation, multi-region planning
```

### Guiding Principles

1. **No big-bang migrations.** Every change is incremental and reversible.
2. **Always maintain a working system.** Dual-run old and new paths in parallel.
3. **Feature flags gate all changes.** Roll out to 5% -> 25% -> 50% -> 100%.
4. **Monitor before and after.** Baseline metrics established before changes.
5. **One risky change at a time.** Never stack multiple high-risk migrations.

---

## 2. Phase 1: Foundation (Week 1-2)

### Goals

Establish the basics that every future phase depends on: observability, security fundamentals, and developer tooling.

### P1.1: Structured Logging (Day 1-2)

**What:** Replace console.log with pino structured JSON logging.

**Tasks:**
- [ ] Install pino and pino-http
- [ ] Create logger configuration (see OBSERVABILITY.md section 2)
- [ ] Add request ID middleware
- [ ] Add sensitive field redaction
- [ ] Replace all console.log/warn/error calls with logger
- [ ] Configure PM2 to pipe logs to files

**Rollback:** Revert to previous code. Logging changes are low-risk.

**Exit Criteria:**
- All log output is structured JSON
- No sensitive data in log output (verified by grep)
- Request IDs present on every log line

### P1.2: Health Check Endpoints (Day 2-3)

**What:** Add /health and /ready endpoints to all services.

**Tasks:**
- [ ] Implement /health endpoint (basic liveness)
- [ ] Implement /ready endpoint (includes DB + Redis checks)
- [ ] Add health checks to PM2 configuration
- [ ] Configure Nginx to check health before routing
- [ ] Set up UptimeRobot or equivalent external monitor

**Exit Criteria:**
- /health returns 200 when process is alive
- /ready returns 503 when dependencies are unhealthy
- External uptime monitoring active

### P1.3: API Key Encryption (Day 3-7)

**What:** Encrypt all plaintext API keys in the database. See SECURITY-HARDENING.md section 3.

**Tasks:**
- [ ] Implement AES-256-GCM encryption module
- [ ] Add api_keys_encrypted column to user_exchange_configs
- [ ] Write migration script to encrypt existing keys
- [ ] Update all read paths to decrypt from new column
- [ ] Shadow read: compare decrypted vs plaintext for 48 hours
- [ ] Wipe plaintext column
- [ ] Drop plaintext column (next release)

**Risk:** HIGH. Encryption bugs could lock users out of their exchange connections.

**Rollback:** Keep plaintext column during shadow period. Feature flag to switch between old/new column.

**Exit Criteria:**
- All API keys encrypted at rest
- Shadow reads show 100% match for 48 hours
- Plaintext column wiped
- No increase in API key-related errors

### P1.4: Refresh Token Implementation (Day 5-8)

**What:** Replace single long-lived JWT with access + refresh token pair.

**Tasks:**
- [ ] Create refresh_tokens table
- [ ] Implement token refresh endpoint
- [ ] Update frontend to handle token refresh
- [ ] Implement session revocation
- [ ] Add device/IP tracking to sessions
- [ ] Set access token to 15-minute expiry
- [ ] Update frontend API client with auto-refresh interceptor

**Risk:** MEDIUM. Auth changes affect every user.

**Rollback:** Feature flag to accept old-style long-lived JWT during transition.

**Exit Criteria:**
- Access tokens expire in 15 minutes
- Refresh tokens rotate on use
- Session revocation works (test: change password -> all sessions invalidated)
- Frontend handles token refresh transparently

### P1.5: Automated Backups (Day 7-9)

**What:** Implement automated, verified database backups.

**Tasks:**
- [ ] Set up DO Spaces bucket for backups
- [ ] Write backup script (see DATABASE-ARCHITECTURE.md section 11)
- [ ] Schedule daily cron job
- [ ] Add backup verification step
- [ ] Test restore procedure
- [ ] Document restore runbook

**Exit Criteria:**
- Daily backups running and verified
- Restore tested successfully
- Backup retention: 30 days
- Alert on backup failure

### P1.6: Prometheus Metrics (Day 8-10)

**What:** Instrument application with Prometheus metrics.

**Tasks:**
- [ ] Install prom-client
- [ ] Add HTTP request metrics (duration, count, status)
- [ ] Add business metrics (invoices, subscriptions, WS connections)
- [ ] Add /metrics endpoint (internal only)
- [ ] Set up Prometheus server (same droplet initially, separate later)
- [ ] Verify metrics are being scraped

**Exit Criteria:**
- All metrics from OBSERVABILITY.md section 3 are being collected
- /metrics endpoint accessible from Prometheus
- Baseline values recorded for future comparison

### P1.7: Docker Compose Development (Day 9-14)

**What:** Containerized local development environment.

**Tasks:**
- [ ] Write Dockerfiles for API, market-hub, ws-gateway
- [ ] Create docker-compose.dev.yml
- [ ] Configure hot reload for development
- [ ] Add PostgreSQL and Redis containers with health checks
- [ ] Seed script for development data
- [ ] Update README with Docker development instructions

**Exit Criteria:**
- `docker compose up` starts full local environment
- Hot reload works for code changes
- All tests pass in containerized environment

---

## 3. Phase 2: Reliability (Week 3-4)

### P2.1: Managed PostgreSQL Migration (Day 15-17)

**What:** Migrate from self-managed PostgreSQL to DO Managed PostgreSQL.

**Tasks:**
- [ ] Create DO Managed PostgreSQL instance (db-s-2vcpu-4gb)
- [ ] Configure VPC access
- [ ] Test connection from application
- [ ] Plan migration window (low-traffic period)
- [ ] pg_dump from old instance
- [ ] pg_restore to new managed instance
- [ ] Verify data integrity (row counts, checksums)
- [ ] Update DATABASE_URL
- [ ] Switch traffic to new instance
- [ ] Monitor for 48 hours
- [ ] Decommission old PostgreSQL

**Risk:** HIGH. Database migration requires downtime (estimated: 15-30 minutes).

**Rollback:** Keep old PostgreSQL running for 1 week after migration.

**Exit Criteria:**
- Application connected to managed PostgreSQL
- Automated backups visible in DO dashboard
- No increase in query latency
- Old instance decommissioned

### P2.2: Managed Redis Migration (Day 17-18)

**What:** Migrate from self-managed Redis to DO Managed Redis.

**Tasks:**
- [ ] Create DO Managed Redis instance (db-s-1vcpu-1gb)
- [ ] Configure VPC access
- [ ] Update REDIS_URL
- [ ] Restart application (Redis data is ephemeral, no migration needed)
- [ ] Verify session and cache functionality

**Risk:** LOW. Redis data is ephemeral. Users may need to re-login.

**Exit Criteria:**
- Application connected to managed Redis
- Sessions working correctly
- WS connections re-established

### P2.3: Read Replica (Day 18-20)

**What:** Add PostgreSQL read replica for read-heavy queries.

**Tasks:**
- [ ] Create read replica from managed PostgreSQL
- [ ] Implement query router middleware (see DATABASE-ARCHITECTURE.md section 2)
- [ ] Identify and tag read-only queries
- [ ] Route analytics/reports to replica
- [ ] Monitor replication lag
- [ ] Add alert for replication lag > 30s

**Exit Criteria:**
- Read-only queries routed to replica
- Replication lag < 5 seconds
- Primary DB write load reduced

### P2.4: Grafana Dashboards and Alerting (Day 18-22)

**What:** Set up Grafana with dashboards and alerting.

**Tasks:**
- [ ] Deploy Grafana (observability droplet or Docker)
- [ ] Configure Prometheus datasource
- [ ] Create dashboards (see OBSERVABILITY.md section 6)
  - [ ] Platform Overview
  - [ ] API Performance
  - [ ] Payment Dashboard
  - [ ] WebSocket Dashboard
- [ ] Configure Alertmanager
- [ ] Set up Slack webhook for alerts
- [ ] Create alert rules (P1 and P2 alerts from OBSERVABILITY.md)
- [ ] Test alert delivery

**Exit Criteria:**
- All dashboards showing live data
- P1 and P2 alerts configured and tested
- Slack notifications working

### P2.5: Zero-Downtime Deployment (Day 20-24)

**What:** Implement blue/green deployment via Nginx.

**Tasks:**
- [ ] Create blue/green directory structure
- [ ] Write deployment script (see INFRASTRUCTURE.md section 6)
- [ ] Write rollback script
- [ ] Update GitHub Actions workflow
- [ ] Test deployment with no traffic interruption
- [ ] Test rollback procedure

**Exit Criteria:**
- Deployments cause zero downtime (verified by uptime monitor)
- Rollback completes in under 60 seconds
- Last 3 releases retained

### P2.6: Staging Environment (Day 22-28)

**What:** Create a staging environment that mirrors production.

**Tasks:**
- [ ] Create staging droplet (s-2vcpu-4gb)
- [ ] Create staging managed PostgreSQL (smallest)
- [ ] Configure staging.bitrium.com domain
- [ ] Set up staging CI/CD pipeline (auto-deploy on develop branch)
- [ ] Create anonymized data seeder
- [ ] Configure staging to use exchange testnet APIs
- [ ] Configure staging to use TRON Nile testnet

**Exit Criteria:**
- Staging environment fully operational
- CI/CD auto-deploys to staging on merge to develop
- Staging uses testnet for all external services

---

## 4. Phase 3: Scale (Week 5-8)

### P3.1: Containerize All Services (Day 29-35)

**What:** Dockerize all services for production deployment.

**Tasks:**
- [ ] Production Dockerfiles for each service (multi-stage builds)
- [ ] docker-compose.prod.yml with resource limits
- [ ] Container registry setup (DO Container Registry)
- [ ] CI pipeline: build -> test -> push image -> deploy
- [ ] Health checks for all containers
- [ ] Log aggregation from containers (Promtail)

**Exit Criteria:**
- All services running as containers in production
- Images stored in container registry
- Automated builds on push to main

### P3.2: Load Balancer and Multi-Instance (Day 33-38)

**What:** Add second droplet and DigitalOcean Load Balancer.

**Tasks:**
- [ ] Create second droplet
- [ ] Configure DO Load Balancer ($12/mo)
- [ ] SSL termination at load balancer
- [ ] Health check configuration
- [ ] Deploy API containers to both droplets
- [ ] Test failover (shutdown one droplet)
- [ ] Update DNS to point to load balancer

**Exit Criteria:**
- Traffic distributed across two droplets
- Single droplet failure causes no downtime
- Health check correctly removes unhealthy instances

### P3.3: Separate WebSocket Gateway (Day 36-42)

**What:** Extract WebSocket handling to a dedicated uWebSockets.js service.

**Tasks:**
- [ ] Implement WS gateway (see REALTIME-ARCHITECTURE.md)
- [ ] Implement WS ticket authentication
- [ ] Implement channel subscription model
- [ ] Implement Redis Pub/Sub adapter
- [ ] Update market-hub to publish via Redis
- [ ] Update Nginx to route /ws/* to gateway
- [ ] Feature flag: gradual rollout of new WS endpoint
- [ ] Monitor connection stability for 2 weeks
- [ ] Remove old WS code from API server

**Exit Criteria:**
- WS connections served from dedicated gateway
- API server no longer handles WS
- No increase in WS connection errors
- Message latency p99 < 200ms

### P3.4: AI Service Isolation (Day 40-48)

**What:** Extract AI engine to a separate service.

**Tasks:**
- [ ] Create ai-worker service
- [ ] Implement provider abstraction layer (see AI-ENGINE-ARCHITECTURE.md)
- [ ] Implement caching layer
- [ ] Implement circuit breaker
- [ ] Implement cost tracking
- [ ] Internal HTTP API between API server and AI worker
- [ ] Deploy as separate container
- [ ] Feature flag: route AI requests to new service

**Exit Criteria:**
- AI processing isolated from API server
- Circuit breaker prevents cascade failures
- Cost tracking active
- Cache hit ratio > 20%

### P3.5: Payment Service Isolation (Day 44-52)

**What:** Extract payment processing to a dedicated service.

**Tasks:**
- [ ] Create payment-worker service
- [ ] Implement invoice state machine (see PAYMENT-ARCHITECTURE.md)
- [ ] Implement double-entry ledger
- [ ] Implement idempotency layer
- [ ] Implement reconciliation job
- [ ] Internal API between API server and payment worker
- [ ] Deploy as separate container
- [ ] Shadow mode: run old and new in parallel, compare results

**Risk:** HIGH. Payment processing changes are critical.

**Rollback:** Shadow mode runs both old and new paths. Feature flag switches which result is used.

**Exit Criteria:**
- Payment processing in dedicated service
- Ledger entries balanced (daily reconciliation passes)
- Shadow mode shows 100% agreement for 1 week
- Old payment code removed

### P3.6: Market Data Persistence (Day 48-56)

**What:** Persist market data to PostgreSQL with TimescaleDB.

**Tasks:**
- [ ] Install TimescaleDB extension
- [ ] Create market_data hypertable
- [ ] Configure compression policy
- [ ] Create continuous aggregates (hourly, daily)
- [ ] Set up retention policy (90 days raw, 5 years aggregated)
- [ ] market-hub writes to both Redis (real-time) and PG (persistence)
- [ ] API endpoints for historical data queries

**Exit Criteria:**
- Market data persisted with < 5 second delay
- Compression achieving > 90% reduction on older data
- Historical data API endpoints working
- Retention policies active

---

## 5. Phase 4: Performance (Week 9-12)

### P4.1: CDN for Static Assets (Day 57-60)

**Tasks:**
- [ ] Configure DO Spaces as CDN origin
- [ ] Upload Vite build output to Spaces
- [ ] Configure Nginx to proxy static assets from CDN
- [ ] Set cache headers (immutable for hashed assets)
- [ ] Update Vite config for CDN base URL
- [ ] Verify cache hit rate > 90%

**Exit Criteria:**
- Static assets served from CDN
- LCP improved by > 30%
- Origin server bandwidth reduced

### P4.2: Redis Caching Layer (Day 58-63)

**Tasks:**
- [ ] Implement cache-aside pattern for user profiles
- [ ] Implement cache-aside for subscription data
- [ ] Implement API response caching for market data endpoints
- [ ] Add cache invalidation triggers (PG NOTIFY)
- [ ] Monitor cache hit ratios per entity type
- [ ] Tune TTLs based on observed patterns

**Exit Criteria:**
- Cache hit ratio > 50% for user/subscription reads
- API response time p50 reduced by > 30%
- No stale data issues (verified by user testing)

### P4.3: API Response Caching (Day 62-67)

**Tasks:**
- [ ] Add ETag support for cacheable endpoints
- [ ] Add Cache-Control headers for public market data
- [ ] Implement conditional requests (If-None-Match)
- [ ] Frontend: configure TanStack Query stale times

**Exit Criteria:**
- 304 Not Modified responses for unchanged data
- Reduced bandwidth usage
- Frontend caching working correctly

### P4.4: MessagePack for Internal WS (Day 65-70)

**Tasks:**
- [ ] Add MessagePack serialization to WS gateway
- [ ] Client negotiation: `?format=msgpack` query param
- [ ] Benchmark: JSON vs MessagePack bandwidth and CPU
- [ ] Gradual rollout via feature flag
- [ ] Keep JSON as default, MessagePack as opt-in

**Exit Criteria:**
- MessagePack available for clients that support it
- 30-50% bandwidth reduction for MessagePack clients
- No regression for JSON clients

### P4.5: AI Prompt Caching (Day 68-75)

**Tasks:**
- [ ] Implement prompt hash -> response cache (see AI-ENGINE-ARCHITECTURE.md section 4)
- [ ] Configure TTLs per task type
- [ ] Add cache warm-up for common prompts
- [ ] Monitor cache hit ratio
- [ ] Track cost savings from caching

**Exit Criteria:**
- AI cache hit ratio > 30%
- AI response latency p50 reduced by > 40% (cache hits)
- Monthly AI cost reduced by > 20%

### P4.6: Per-User Rate Limiting (Day 73-80)

**Tasks:**
- [ ] Implement sliding window rate limiter (Redis-based)
- [ ] Configure per-tier limits (see SECURITY-HARDENING.md section 8)
- [ ] Add rate limit headers to responses (X-RateLimit-*)
- [ ] Frontend: display rate limit status to users
- [ ] Admin endpoint to override limits for specific users

**Exit Criteria:**
- Rate limits enforced per user per tier
- Rate limit headers present on all responses
- No false positives on legitimate usage patterns

---

## 6. Phase 5: Enterprise (Month 4+)

### P5.1: Kubernetes Evaluation

**Decision Criteria:**

| Factor | Docker Compose | DOKS (Kubernetes) |
|--------|---------------|-------------------|
| Team size < 3 | Recommended | Overkill |
| Services < 8 | Recommended | Overkill |
| Auto-scaling needed | Manual | Built-in HPA |
| Zero-downtime deploy | Blue/green script | Rolling updates native |
| Monthly cost | $200-400 | $400-800 |
| Operational overhead | Low | High |

**Recommendation:** Stay on Docker Compose unless auto-scaling becomes a business requirement or team grows to 5+ engineers.

### P5.2: Multi-Region (If Needed)

- Deploy read replicas in additional regions
- CDN serves static assets globally
- Consider Cloudflare Workers for edge routing
- Database write remains in primary region

### P5.3: Event Streaming (Kafka/NATS)

**When:** If service-to-service communication becomes a bottleneck.

- Replace direct HTTP calls between services with event streaming
- NATS recommended over Kafka for simplicity and Node.js ecosystem
- Use for: payment events, market data distribution, AI job queue

### P5.4: Local AI Inference

**When:** Monthly AI costs exceed $5,000 and simple tasks dominate.

- Deploy Qwen 7B or equivalent on GPU droplet
- Use for screening, classification, and alert evaluation
- Keep cloud providers for complex analysis

### P5.5: SOC2 Preparation

**Tasks:**
- [ ] Formal access control documentation
- [ ] Audit log completeness verification
- [ ] Encryption at rest and in transit audit
- [ ] Incident response plan formalization
- [ ] Vendor security assessment
- [ ] Penetration testing (external firm)
- [ ] Security policy documentation

### P5.6: Penetration Testing

- Engage external security firm
- Scope: API, WebSocket, authentication, payment flows
- Remediate all critical and high findings before public launch
- Re-test after remediation

---

## 7. Feature Flags Strategy

### Implementation

```javascript
class FeatureFlags {
  constructor(redis) {
    this.redis = redis;
    this.cache = new Map();
    this.refreshInterval = 30000; // 30s
  }

  async isEnabled(flag, userId = null) {
    const config = await this.getFlag(flag);
    if (!config) return false;

    // Global kill switch
    if (!config.enabled) return false;

    // Percentage rollout
    if (config.percentage < 100) {
      if (!userId) return false;
      const hash = (userId * 2654435761) % 100; // Deterministic hash
      if (hash >= config.percentage) return false;
    }

    // User allowlist
    if (config.allowlist?.includes(userId)) return true;

    // User blocklist
    if (config.blocklist?.includes(userId)) return false;

    return true;
  }
}
```

### Feature Flag Registry

| Flag | Phase | Description | Default |
|------|-------|-------------|---------|
| `new_ws_gateway` | P3.3 | Route WS to new uWebSockets.js gateway | off |
| `ai_service_v2` | P3.4 | Route AI requests to isolated service | off |
| `payment_service_v2` | P3.5 | Route payments to isolated service | off |
| `encrypted_api_keys` | P1.3 | Read from encrypted column | off |
| `refresh_tokens` | P1.4 | Use access+refresh token auth | off |
| `messagepack_ws` | P4.4 | Enable MessagePack WS serialization | off |
| `ai_prompt_cache` | P4.5 | Enable AI response caching | off |
| `per_user_ratelimit` | P4.6 | Enable per-user rate limiting | off |
| `read_replica` | P2.3 | Route reads to replica | off |

### Rollout Procedure

```
1. Deploy code with feature flag (default: off)
2. Enable for internal team (allowlist)
3. Monitor for 24 hours
4. Enable for 5% of users
5. Monitor for 48 hours
6. Ramp to 25% -> 50% -> 100% (each step: 24hr monitor)
7. Remove feature flag and old code path (cleanup)
```

---

## 8. Shadow Traffic Testing

### How It Works

For critical migrations (payment processing, API key encryption):

```javascript
async function shadowTest(request) {
  // Run old path (source of truth)
  const oldResult = await oldImplementation(request);

  // Run new path in parallel (shadow)
  const newResult = await newImplementation(request).catch(err => {
    log.error('Shadow implementation failed', { error: err.message });
    return null;
  });

  // Compare results
  if (newResult && !deepEqual(oldResult, newResult)) {
    log.warn('Shadow mismatch', {
      oldResult: redact(oldResult),
      newResult: redact(newResult),
      request: redact(request),
    });
    metrics.shadowMismatches.inc();
  }

  // Always return old result
  return oldResult;
}
```

### Shadow Test Requirements

- Shadow path must not have side effects (no DB writes, no external calls)
- For payment shadow: compare state transitions, not actual blockchain operations
- Shadow mismatches trigger alerts when rate exceeds 0.1%
- Shadow must run for minimum 1 week before cutover

---

## 9. Data Migration Procedures

### PostgreSQL Migration (P2.1)

```bash
# 1. Pre-migration
pg_dump --schema-only old_db > schema_backup.sql
pg_dump --data-only old_db | wc -l  # Record row counts

# 2. Set up replication (if using logical replication)
# OR do a dump/restore for smaller databases

# 3. During maintenance window
# a. Put application in read-only mode
# b. Final pg_dump
pg_dump --format=custom --compress=9 old_db > final_backup.dump

# c. Restore to managed instance
pg_restore --dbname=new_db --jobs=4 final_backup.dump

# d. Verify row counts
psql new_db -c "SELECT 'users', count(*) FROM users
UNION ALL SELECT 'invoices', count(*) FROM invoices
UNION ALL SELECT 'payment_events', count(*) FROM payment_events;"

# e. Switch DATABASE_URL
# f. Restart application
# g. Remove read-only mode
```

### API Key Encryption Migration (P1.3)

```javascript
async function migrateApiKeys() {
  const batchSize = 100;
  let offset = 0;
  let total = 0;

  while (true) {
    const rows = await db.query(
      'SELECT id, api_keys FROM user_exchange_configs ORDER BY id LIMIT $1 OFFSET $2',
      [batchSize, offset]
    );

    if (rows.length === 0) break;

    for (const row of rows) {
      const encrypted = encryption.encrypt(JSON.stringify(row.api_keys));
      await db.query(
        'UPDATE user_exchange_configs SET api_keys_encrypted = $2 WHERE id = $1',
        [row.id, encrypted]
      );
      total++;
    }

    offset += batchSize;
    log.info(`Migrated ${total} API key records`);
  }

  log.info(`API key migration complete. Total: ${total}`);
}
```

---

## 10. Rollback Plans

### Rollback Decision Matrix

| Change Type | Rollback Method | Time Estimate | Data Loss Risk |
|------------|----------------|---------------|----------------|
| Code deploy | Switch symlink + restart | 60 seconds | None |
| Database schema (additive) | No rollback needed | N/A | None |
| Database schema (destructive) | Restore from backup | 15-30 min | Up to RPO |
| Database migration (managed PG) | Repoint to old instance | 5 min | None (if old still running) |
| Feature flag change | Disable flag | Immediate | None |
| Configuration change | Revert config, restart | 2 min | None |
| Infrastructure (new LB) | Revert DNS | 5 min + TTL | None |

### Rollback Triggers

- Error rate > 5% for 2 minutes
- p99 latency > 5x baseline for 5 minutes
- Payment processing failure
- Data integrity issue detected
- Security incident

---

## 11. Dependencies and Ordering

### Dependency Graph

```
P1.1 Logging ────────┐
                      ├── P1.6 Metrics ──── P2.4 Grafana
P1.2 Health Checks ──┘

P1.3 API Key Encryption (independent)

P1.4 Refresh Tokens (independent)

P1.5 Backups ──── P2.1 Managed PG ──── P2.3 Read Replica
                                    └── P3.6 TimescaleDB

P1.7 Docker Dev ──── P3.1 Containerize ──── P3.2 Multi-Instance

P2.2 Managed Redis (after P2.1)

P2.5 Zero-Downtime Deploy (after P2.1)

P2.6 Staging (after P2.1, P2.2)

P3.3 WS Gateway (after P3.1, P1.6)

P3.4 AI Isolation (after P3.1)

P3.5 Payment Isolation (after P3.1, P2.1)

P4.1 CDN (independent)
P4.2 Redis Caching (after P2.2)
P4.3 API Caching (after P4.2)
P4.4 MessagePack (after P3.3)
P4.5 AI Caching (after P3.4)
P4.6 Rate Limiting (after P2.2)
```

### Critical Path

```
P1.1 -> P1.6 -> P2.4 (observability is prerequisite for everything)
P1.5 -> P2.1 -> P2.3 (database reliability)
P1.7 -> P3.1 -> P3.2 (containerization and scaling)
```

---

## 12. Team Responsibilities

### For a Small Team (2-3 Engineers)

| Role | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|------|---------|---------|---------|---------|
| Lead/Backend | API key encryption, auth redesign | Managed PG, zero-downtime | Payment isolation, WS gateway | Rate limiting |
| Backend/Infra | Logging, metrics, Docker | Redis, staging, Grafana | Containerize, LB, AI isolation | CDN, caching |
| Frontend | API client, auth token handling | Dashboard updates | WS client migration | Performance optimization |

### Decision Authority

| Decision | Authority |
|----------|-----------|
| Feature flag rollout percentage | Lead engineer |
| Rollback trigger | Any engineer |
| Schema migration approval | Lead engineer (reviewed by second) |
| Infrastructure spend increase | Team lead + management |
| Security incident response | Designated incident commander |

---

## 13. Exit Criteria

### Phase 1 Exit Criteria

- [ ] All logs structured JSON with request correlation
- [ ] Health check endpoints on all services
- [ ] API keys encrypted at rest (plaintext wiped)
- [ ] Refresh token auth active for all users
- [ ] Automated daily backups with verified restores
- [ ] Prometheus metrics collecting (baseline established)
- [ ] Docker Compose development environment working

### Phase 2 Exit Criteria

- [ ] Running on managed PostgreSQL and Redis
- [ ] Read replica active, routing verified
- [ ] Grafana dashboards live with P1/P2 alerts
- [ ] Zero-downtime deployment verified (3+ successful deploys)
- [ ] Staging environment operational and used for all pre-production testing

### Phase 3 Exit Criteria

- [ ] All services containerized and running in production
- [ ] Load balanced across 2+ instances
- [ ] WebSocket on dedicated gateway (uWebSockets.js)
- [ ] AI processing in isolated service with circuit breaker
- [ ] Payment processing isolated with double-entry ledger
- [ ] Market data persisted with TimescaleDB

### Phase 4 Exit Criteria

- [ ] Static assets served from CDN (cache hit > 90%)
- [ ] Redis caching layer active (hit ratio > 50%)
- [ ] API response caching with ETags
- [ ] MessagePack available for WS clients
- [ ] AI prompt cache active (hit ratio > 30%, cost down > 20%)
- [ ] Per-user rate limiting enforced by tier

### Phase 5 Exit Criteria

- [ ] Kubernetes decision made (adopt or defer)
- [ ] Penetration test completed, critical findings remediated
- [ ] SOC2 readiness assessment complete

---

## 14. Risk Register

| Risk | Phase | Likelihood | Impact | Mitigation |
|------|-------|-----------|--------|------------|
| API key encryption corrupts keys | P1 | Low | Critical | Shadow reads for 48hr, keep plaintext during transition |
| Auth migration logs out all users | P1 | Medium | Medium | Accept old JWTs for 24hr grace period |
| Managed PG migration data loss | P2 | Low | Critical | Verified backup before migration, keep old instance 1 week |
| Zero-downtime deploy causes brief errors | P2 | Medium | Low | Test extensively in staging first |
| WS gateway migration drops connections | P3 | Medium | Medium | Dual endpoint with gradual migration |
| Payment isolation causes double-charges | P3 | Low | Critical | Shadow mode for 1 week, idempotency keys |
| Containerization increases latency | P3 | Low | Low | Benchmark before/after, tune resource limits |
| CDN cache serves stale assets | P4 | Low | Low | Content-hash in filenames (Vite default) |
| Cost overrun from new infrastructure | P2-3 | Medium | Medium | Phased cost plan, monthly budget reviews |
| Team velocity drops during migration | P1-3 | High | Medium | One risky change at a time, minimize concurrent migrations |

---

## Appendix: Week-by-Week Calendar

```
Week 1:
  Mon-Tue: P1.1 Structured logging
  Tue-Wed: P1.2 Health checks
  Wed-Fri: P1.3 API key encryption (start)

Week 2:
  Mon-Tue: P1.3 API key encryption (complete + shadow)
  Tue-Thu: P1.4 Refresh tokens
  Thu-Fri: P1.5 Automated backups
  Thu-Fri: P1.6 Prometheus metrics
  All week: P1.7 Docker Compose dev (parallel)

Week 3:
  Mon-Wed: P2.1 Managed PostgreSQL migration
  Wed-Thu: P2.2 Managed Redis migration
  Thu-Fri: P2.3 Read replica setup

Week 4:
  Mon-Wed: P2.4 Grafana dashboards + alerting
  Wed-Fri: P2.5 Zero-downtime deployment
  All week: P2.6 Staging environment (parallel)

Week 5-6:
  P3.1 Containerize all services
  P3.2 Load balancer + multi-instance

Week 7-8:
  P3.3 Separate WS gateway
  P3.4 AI service isolation
  P3.5 Payment service isolation (start)

Week 8 overflow:
  P3.5 Payment service isolation (complete)
  P3.6 Market data persistence

Week 9-10:
  P4.1 CDN
  P4.2 Redis caching layer
  P4.3 API response caching

Week 11-12:
  P4.4 MessagePack WS
  P4.5 AI prompt caching
  P4.6 Per-user rate limiting

Month 4+:
  P5.x Enterprise features as needed
```
