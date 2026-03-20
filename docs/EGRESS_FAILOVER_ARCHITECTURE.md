# Egress Failover Architecture — Production Patch Plan

## 1. Executive Summary

This document describes a **minimal, safe egress failover layer** for Bitrium's Binance connectivity. The system adds a warm standby network path (via API-2) that activates **only** when the primary path (API-1) experiences genuine connectivity failure — NOT when rate limits are hit.

**Key design decisions:**
- This is NOT a rate-limit evasion system
- 429/418 responses trigger backoff, NEVER IP switching
- Global rate budget (Redis) is shared across ALL egress paths
- Failover is triggered ONLY by connectivity/network health
- Existing architecture (rate limiter, circuit breaker, WS pipelines) is preserved unchanged

**Files created/modified:**

| File | Status | Purpose |
|------|--------|---------|
| `server/src/services/egress/types.ts` | **NEW** | Shared types and interfaces |
| `server/src/services/egress/egressController.ts` | **NEW** | Central egress path manager |
| `server/src/services/egress/healthMonitor.ts` | **NEW** | Connectivity health probing |
| `server/src/services/egress/failoverPolicy.ts` | **NEW** | State machine + failover rules |
| `server/src/services/egress/wsSwitchover.ts` | **NEW** | WS connection migration |
| `server/src/services/egress/index.ts` | **NEW** | Public API barrel export |
| `server/src/routes/egressProxy.ts` | **NEW** | Internal VPC proxy endpoint |
| `server/src/routes/egressAdmin.ts` | **NEW** | Admin monitoring/control routes |
| `server/src/services/binanceRateLimiter.ts` | **MODIFIED** | Egress-aware fetch routing |
| `server/src/index.ts` | **MODIFIED** | Route registration + init |

---

## 2. Assumptions

1. API-2 (178.62.198.35) is NOT currently banned by Binance
2. VPC network (10.110.0.0/20) is reliable between API-1 and API-2
3. Both servers run the same codebase and share Redis (10.110.0.6)
4. The Binance IP ban on API-1 (161.35.94.191) is the primary P0 issue
5. Rate limiter state (Redis keys `rl:*`) is already shared cross-worker

## 3. Non-Goals

- **NOT** redesigning the rate limiter
- **NOT** adding IP rotation or round-robin
- **NOT** bypassing Binance rate limits via multiple IPs
- **NOT** changing WebSocket architecture (WS-first stays)
- **NOT** modifying trade execution pipeline
- **NOT** changing the Market Hub adapter architecture

---

## 4. Minimal Architecture Patch

### Where the Egress Controller Sits

```
                          BEFORE
    ┌──────────────────────────────────────────────┐
    │ exchangeFetch(url)                           │
    │   ├── Circuit Breaker check                  │
    │   ├── Cooldown check (Redis)                 │
    │   ├── Weight check (Redis)                   │
    │   ├── Priority/throttle                      │
    │   ├── Dedup check                            │
    │   └── fetch(url) ──────────────── Binance    │
    └──────────────────────────────────────────────┘

                          AFTER
    ┌──────────────────────────────────────────────┐
    │ exchangeFetch(url)                           │
    │   ├── Circuit Breaker check         (same)   │
    │   ├── Cooldown check (Redis)        (same)   │
    │   ├── Weight check (Redis)          (same)   │
    │   ├── Priority/throttle             (same)   │
    │   ├── Dedup check                   (same)   │
    │   ├── EgressController.resolveUrl() (NEW)    │
    │   └── fetch(resolved_url)                    │
    │        ├── DIRECT → fapi.binance.com         │
    │        └── PROXY  → API-2 /internal/proxy    │
    │                     └── fapi.binance.com     │
    └──────────────────────────────────────────────┘
```

### What is NOT Touched

| Component | Status |
|-----------|--------|
| Redis rate limiter sliding window | **UNCHANGED** |
| Circuit breaker (per-exchange) | **UNCHANGED** |
| Priority system (P1-P4) | **UNCHANGED** |
| In-flight dedup | **UNCHANGED** |
| Endpoint profiler | **UNCHANGED** |
| WS Gateway (8 pipelines) | **UNCHANGED** |
| Market Hub adapters | **UNCHANGED** |
| Health Score Router | **UNCHANGED** |
| Trade execution pipeline (12 stages) | **UNCHANGED** |
| ExchangeCore service | **UNCHANGED** |
| Private Stream Manager | **UNCHANGED** |
| All database schemas | **UNCHANGED** |

### Interaction with Market Hub and Trade Hub

**Market Hub:** Uses `exchangeFetch()` for REST fallback calls (depth, klines). The egress controller transparently routes these through the active path. No changes to the hub.

**Trade Hub:** Uses `exchangeFetch()` for order execution, balance queries, and reconciliation. Same transparent routing. The 12-stage pipeline is completely unaware of the egress layer.

---

## 5. Failover Policy

### When Failover IS Allowed

| Condition | Action |
|-----------|--------|
| TCP connection refused (ECONNREFUSED) | Failover after 3 consecutive failures |
| DNS resolution failure (ENOTFOUND) | Failover after 3 consecutive failures |
| TLS handshake failure | Failover after 3 consecutive failures |
| Request timeout (>5s probe, >10s request) | Failover after 3 consecutive failures |
| Host unreachable (EHOSTUNREACH) | Failover after 3 consecutive failures |
| Exchange 5xx responses | Failover after 3 consecutive failures |
| Manual operator command | Immediate failover |

### When Failover is NOT Allowed

| Condition | Action |
|-----------|--------|
| 429 Too Many Requests | **BACK OFF** — rate limiter cooldown, NO switching |
| 418 IP Ban | **QUARANTINE** current path, NO switching to continue |
| 403 Forbidden | **QUARANTINE** current path, NO switching to continue |
| Cooldown active (within 120s of last failover) | **BLOCKED** — wait for cooldown |
| No healthy standby available | **BLOCKED** — log error, stay on current |

### Health Check Thresholds

| Parameter | Value |
|-----------|-------|
| Probe interval | 30s |
| Probe timeout | 5s |
| Failure threshold (→ DOWN) | 3 consecutive |
| Recovery threshold (→ ACTIVE) | 5 consecutive |
| Degraded latency threshold | 2000ms avg |
| Failover cooldown | 120s between events |
| Min standby duration | 300s before returning to primary |
| Quarantine duration (418/403) | 600s |

### Recovery Logic

1. Primary goes DOWN → auto-failover to STANDBY
2. Health monitor continues probing PRIMARY every 30s
3. After PRIMARY gets 5 consecutive successes → state becomes ACTIVE
4. Wait for min standby duration (300s) to expire
5. Wait for failover cooldown (120s) to expire
6. Auto-switch back to PRIMARY
7. STANDBY returns to warm standby

---

## 6. Global Rate Governance

### Central Rate Governor Integration

The existing Redis-based rate limiter already tracks weight globally:

```
Redis key: rl:binance:weight    — sorted set sliding window (shared ALL workers)
Redis key: rl:binance:cooldown  — cooldown timestamp (shared ALL workers)
```

**CRITICAL:** These keys are NOT per-IP. They are per-exchange.

When the active egress path changes from API-1 to API-2:
- The Redis weight counter continues counting
- The cooldown state continues enforcing
- **No weight budget is reset**
- **No new capacity is created**

The system behaves as if it has ONE connection to Binance that happens to go through a different network cable.

### What Cannot Happen

| Behavior | Why Impossible |
|----------|---------------|
| Two IPs each get 1200 weight/min | Weight counter is in Redis, shared across all paths |
| Switching IP resets the weight window | Weight is recorded BEFORE response status check |
| 429 on primary → switch to standby → continue | Rate limiter sets global cooldown, egress does NOT switch on 429 |
| Each worker chooses its own egress independently | EgressController is singleton on primary worker |

---

## 7. WebSocket Continuity Design

### WS Switchover Strategy

WebSocket connections are NOT affected by REST egress failover because:
1. WS connections use different endpoints (stream.binance.com, not fapi.binance.com)
2. WS connections are long-lived and managed by their own reconnect logic
3. The egress controller only manages REST request routing

However, if the underlying network path also affects WS connectivity, the `WsSwitchoverManager` provides:

| Mode | Overlap | Use Case |
|------|---------|----------|
| PLANNED | 5s | Scheduled maintenance, controlled migration |
| EMERGENCY | 0s (staggered 500ms) | Network path failure detected |
| RECOVERY | 10s | Return to primary after recovery |

### Anti-Storm Rules

| Rule | Value |
|------|-------|
| Max reconnections per window | 5 per 10s |
| Stagger between reconnections | 500ms |
| Storm cooldown | 30s pause |

### Current WS reconnect behavior (PRESERVED)

| Component | Existing Behavior | Changed? |
|-----------|-------------------|----------|
| Market WS (Pipeline 1-6) | Auto-reconnect with backoff | NO |
| Private Streams (Pipeline 8) | Exponential backoff 1s→30s | NO |
| Binance listenKey | 30min keepalive | NO |
| Depth relay | readyState guard | NO |

---

## 8. Step-by-Step Implementation Plan

### Phase 1: Instrumentation Only (Risk: MINIMAL)

**Goal:** Deploy egress module in observation mode. No traffic routing.

**Changes:**
1. Deploy all `egress/` files
2. Deploy `egressProxy.ts` route
3. Deploy `egressAdmin.ts` route
4. Initialize EgressController at startup
5. Health monitor probes both paths

**What happens:** Health probes run. Admin can see path status. No traffic is routed through proxy. `exchangeFetch()` always uses DIRECT mode.

**How to activate:** Set `EGRESS_ENABLED=true` in .env (defaults to true)

**Rollback:** Set `EGRESS_ENABLED=false` or remove egress import

**Testing:**
- `curl http://API-1:3000/api/admin/egress/status`
- Verify both paths show health data
- Verify no traffic is proxied (proxyMetrics.totalRequests = 0 except probes)

### Phase 2: Passive Standby (Risk: LOW)

**Goal:** API-2 proxy endpoint is tested and validated.

**Changes:**
1. SSH to API-2, test Binance connectivity:
   ```bash
   curl -s https://fapi.binance.com/fapi/v1/ping
   curl -s https://fapi.binance.com/fapi/v1/time
   curl -s "https://fapi.binance.com/fapi/v1/depth?symbol=BTCUSDT&limit=5"
   ```
2. Test proxy endpoint from API-1:
   ```bash
   curl -s -X POST http://10.110.0.8:3000/internal/egress-proxy \
     -H "Content-Type: application/json" \
     -d '{"url":"https://fapi.binance.com/fapi/v1/ping","method":"GET"}'
   ```
3. Monitor proxy metrics:
   ```bash
   curl http://10.110.0.8:3000/internal/egress-proxy/health
   ```

**Rollback:** No production traffic affected. Just testing.

**Testing:**
- Verify proxy returns correct Binance responses
- Verify latency is acceptable (API-1 → VPC → API-2 → Binance → API-2 → VPC → API-1)
- Verify rate limit headers are forwarded

### Phase 3: Controlled Failover (Risk: MEDIUM)

**Goal:** Enable automatic failover for Binance REST calls.

**Changes:**
1. Integrate `EgressController.resolveUrl()` into `exchangeFetch()` (already done in code)
2. Deploy modified `binanceRateLimiter.ts`
3. Monitor via admin endpoint

**Activation:**
- Failover happens automatically when primary path health drops
- Or manually: `POST /api/admin/egress/failover`

**What to watch:**
- `GET /api/admin/egress/status` — path states, active path
- `GET /api/admin/rate-limiter` — weight tracking still works
- No duplicate 429s or weight budget issues

**Rollback:** `POST /api/admin/egress/recovery` or `EGRESS_ENABLED=false` + restart

### Phase 4: Recovery/Rollback (Risk: LOW)

**Goal:** Validate automatic recovery when primary recovers.

**Changes:** None — this is the recovery mechanism.

**Steps:**
1. While on STANDBY, wait for PRIMARY to recover (health probes)
2. After 300s min standby + primary healthy → auto-recovery
3. Or manual: `POST /api/admin/egress/recovery`

**Testing:**
- Simulate primary recovery (unban or network fix)
- Verify auto-switch-back timing
- Verify no data gaps during switchover

---

## 9. Pseudocode / Example Interfaces

### Egress Controller State Machine

```
States: ACTIVE, DEGRADED, DOWN, QUARANTINED

ACTIVE ──[high latency > 2s]──────────→ DEGRADED
ACTIVE ──[3 consecutive failures]─────→ DOWN
DEGRADED ──[5 successes + low latency]─→ ACTIVE
DEGRADED ──[3 consecutive failures]───→ DOWN
DOWN ──[2 successes]──────────────────→ DEGRADED
QUARANTINED ──[timer 600s]────────────→ DEGRADED
```

### Request Flow with Egress

```typescript
// In exchangeFetch():
const egress = egressCtrl.resolveUrl("binance", originalUrl);

if (egress.viaProxy) {
  // POST to http://10.110.0.8:3000/internal/egress-proxy
  // Body: { url: originalUrl, method, headers }
  // Response: { status, headers, body }
  const proxyRes = await fetch(egress.url, {
    method: "POST",
    headers: egress.headers,
    body: JSON.stringify({ url: originalUrl, ... })
  });
  // Reconstruct response from proxy payload
  const { status, headers, body } = await proxyRes.json();
  return new Response(body, { status, headers });
} else {
  // Direct fetch (unchanged behavior)
  return fetch(url, init);
}
```

### Failover Decision Tree

```
onConnectivityFailure(pathId):
  if pathId != activePath → ignore
  if cooldown active → block
  if no healthy standby → log error
  else → switch to standby, record event

onRateLimit(429/418):
  if 418/403 → quarantine path, DO NOT switch
  if 429 → rate limiter handles cooldown
  NEVER trigger failover

onPrimaryRecovered():
  if still on standby:
    if min standby duration passed:
      if cooldown expired:
        → switch back to primary
```

---

## 10. Do Not Break Existing System — Required Checks Before Merge

### Safety Checklist

- [ ] **Rate limiter weight tracking is GLOBAL** — switching egress does NOT reset `rl:binance:weight` Redis key
- [ ] **429 response does NOT trigger egress failover** — only rate limiter cooldown
- [ ] **418 response does NOT trigger egress failover** — quarantines path, does NOT switch to continue
- [ ] **Circuit breaker is UNCHANGED** — still per-exchange, same thresholds
- [ ] **Dedup is UNCHANGED** — still per-worker in-flight Map
- [ ] **Priority system is UNCHANGED** — P1-P4 same behavior
- [ ] **WS connections are NOT affected** — egress only routes REST calls
- [ ] **Proxy endpoint is VPC-only** — 10.110.0.0/20 guard enforced
- [ ] **Proxy has its own rate limit** — 300 rpm max (prevents abuse)
- [ ] **Proxy only allows known exchange hosts** — allowlist enforced
- [ ] **Failover cooldown prevents flapping** — 120s between events
- [ ] **Standby duration prevents premature return** — 300s minimum
- [ ] **Trade execution pipeline unchanged** — 12 stages identical
- [ ] **Market Hub unchanged** — adapters, health router, subscriptions
- [ ] **Database schema unchanged** — no new tables or migrations needed
- [ ] **Rollback path exists** — `EGRESS_ENABLED=false` + restart
- [ ] **Manual override exists** — admin endpoints for force failover/recovery
- [ ] **Metrics exposed** — egress status in rate limiter admin endpoint
- [ ] **No round-robin** — one active path at a time, period
- [ ] **Proxy response reconstructed correctly** — status codes, headers forwarded
- [ ] **Weight header drift correction still works** — X-MBX-USED-WEIGHT-1M parsed from proxy response

---

## 11. Monitoring and Alerting

### Logs

| Log Pattern | Meaning | Severity |
|-------------|---------|----------|
| `[EgressHealth] Path "X" state: A → B` | Path state change | INFO/WARN |
| `[FailoverPolicy] *** FAILOVER ***` | Failover executed | CRITICAL |
| `[FailoverPolicy] Failover blocked: cooldown` | Cooldown prevented failover | WARN |
| `[FailoverPolicy] ACTIVE path quarantined!` | Ban detected, traffic stops | CRITICAL |
| `[EgressProxy] FAILED` | Proxy request failed | ERROR |
| `[WsSwitchover] STORM detected` | Too many reconnections | WARN |

### Metrics (via `GET /api/admin/egress/status`)

```json
{
  "enabled": true,
  "exchanges": {
    "binance": {
      "activePath": "binance-primary",
      "paths": [
        {
          "id": "binance-primary",
          "state": "ACTIVE",
          "health": {
            "consecutiveSuccesses": 15,
            "consecutiveFailures": 0,
            "avgLatencyMs": 142,
            "successRate": 1.0,
            "totalProbes": 120,
            "totalFailures": 0
          }
        },
        {
          "id": "binance-standby",
          "state": "ACTIVE",
          "health": { ... }
        }
      ],
      "recentEvents": []
    }
  }
}
```

### Recommended Alerts

| Metric | Threshold | Alert |
|--------|-----------|-------|
| Failover event count | > 0 in 1h | WARN: Egress failover occurred |
| Active path state | DOWN | CRITICAL: No healthy egress path |
| Probe success rate | < 0.8 | WARN: Egress path degraded |
| Proxy error rate | > 10% | WARN: Proxy unreliable |
| 418/quarantine events | > 0 | CRITICAL: IP ban detected |
| Recovery events | > 3 in 1h | WARN: Path instability (flapping) |

---

## 12. Testing Strategy

### Unit Tests

| Test | What it Validates |
|------|-------------------|
| `FailoverPolicy.handleStateChange()` with DOWN state → triggers failover | Correct trigger |
| `FailoverPolicy.handleRateLimit(429)` → does NOT trigger failover | Non-failover on rate limit |
| `FailoverPolicy.handleRateLimit(418)` → quarantines but does NOT switch | No evasion behavior |
| Cooldown blocks rapid failovers | Anti-flapping |
| Min standby duration blocks premature recovery | Stability |
| `EgressController.resolveUrl()` with PROXY path → correct proxy URL | URL transformation |
| `EgressController.resolveUrl()` with DIRECT path → original URL | No modification |
| Weight tracking after egress switch → same Redis key | Budget preservation |

### Integration Tests

| Test | What it Validates |
|------|-------------------|
| `exchangeFetch()` via PROXY → correct response reconstruction | End-to-end proxy flow |
| `exchangeFetch()` handles proxy failure → reports connectivity failure | Failure propagation |
| Rate limiter cooldown persists across egress switch | Global budget |
| Health monitor probes via PROXY → correct health assessment | Proxy health monitoring |
| Admin endpoints return correct status | Observability |

### Chaos/Failover Tests

| Test | What it Validates |
|------|-------------------|
| Block API-1 → Binance (iptables) → auto-failover to API-2 | Automatic failover |
| Unblock API-1 → auto-recovery to primary | Automatic recovery |
| Block both paths → system enters BLOCKED state | Graceful degradation |
| Rapid block/unblock (flapping) → cooldown prevents rapid switching | Anti-flapping |
| Kill API-2 process → standby goes DOWN → no failover to it | Dead standby detection |

### WebSocket Continuity Tests

| Test | What it Validates |
|------|-------------------|
| REST failover does NOT disconnect market WS | WS isolation |
| REST failover does NOT disconnect private streams | WS isolation |
| WS switchover with PLANNED mode → no data gap > 5s | Graceful switchover |
| Storm detection → pause after 5 reconnects in 10s | Anti-storm |

### Rate Budget Preservation Tests

| Test | What it Validates |
|------|-------------------|
| Before failover: weight = 500. After failover: weight still 500 | No budget reset |
| 429 on primary → cooldown set → switch to standby → cooldown still active | Global cooldown |
| Request via proxy increments same `rl:binance:weight` Redis key | Shared accounting |

### Rollback Validation Tests

| Test | What it Validates |
|------|-------------------|
| Set `EGRESS_ENABLED=false` → all traffic goes DIRECT | Kill switch works |
| `POST /api/admin/egress/recovery` → returns to primary | Manual recovery |
| Remove egress import → system works without egress module | Clean removal |

---

## 13. Rollback Plan

### Level 1: Soft Rollback (No Restart)
```bash
# Force return to primary
curl -X POST http://API-1:3000/api/admin/egress/recovery \
  -H "Content-Type: application/json" \
  -d '{"exchange":"binance"}'
```

### Level 2: Config Rollback (Restart Required)
```bash
# Add to .env on API-1
echo "EGRESS_ENABLED=false" >> .env
pm2 restart all
```

### Level 3: Code Rollback (Deploy Required)
```bash
# Revert the binanceRateLimiter.ts changes
git checkout HEAD~1 -- server/src/services/binanceRateLimiter.ts
git checkout HEAD~1 -- server/src/index.ts
pm2 restart all
```

### Level 4: Full Removal
```bash
# Remove all egress files
rm -rf server/src/services/egress/
rm server/src/routes/egressProxy.ts
rm server/src/routes/egressAdmin.ts
# Revert modified files
git checkout HEAD~1 -- server/src/services/binanceRateLimiter.ts
git checkout HEAD~1 -- server/src/index.ts
pm2 restart all
```

---

## Appendix: Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `EGRESS_ENABLED` | `"true"` | Set to `"false"` to disable egress controller |
| `EGRESS_STANDBY_HOST` | `"10.110.0.8"` | VPC IP of standby server (API-2) |
| `EGRESS_STANDBY_PORT` | `"3000"` | Port of standby server |
| `EGRESS_PRIMARY_IP` | `"161.35.94.191"` | Primary server's outbound IP (for logging) |
| `EGRESS_STANDBY_IP` | `"178.62.198.35"` | Standby server's outbound IP (for logging) |

## Appendix: File / Module Structure

```
server/src/services/egress/
├── index.ts              # Public API (barrel export)
├── types.ts              # Shared types, interfaces, config defaults
├── egressController.ts   # Central controller + singleton factory
├── healthMonitor.ts      # Connectivity probe engine
├── failoverPolicy.ts     # State machine + failover decision logic
└── wsSwitchover.ts       # WebSocket connection migration manager

server/src/routes/
├── egressProxy.ts        # Internal VPC proxy endpoint
└── egressAdmin.ts        # Admin monitoring/control endpoints
```
