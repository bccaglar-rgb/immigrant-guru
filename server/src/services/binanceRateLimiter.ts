/**
 * Centralized Exchange REST Rate Limiter — Production Hardened
 *
 * ALL exchange REST calls MUST go through exchangeFetch().
 *
 * Architecture:
 *   Redis key: rl:{exchange}:weight    — sorted set sliding window
 *   Redis key: rl:{exchange}:cooldown  — cooldown until timestamp
 *   Redis key: rl:{exchange}:circuit   — circuit breaker state
 *   Redis key: rl:{exchange}:dedup:{key} — cross-worker request dedup
 *   Redis key: rl:{exchange}:profile   — endpoint weight profiling
 *   Redis key: rl:{exchange}:metrics   — live counters
 *
 * Systems:
 *   1. Redis sliding window — all workers share same weight counter
 *   2. Cross-worker request dedup — identical concurrent REST calls collapsed
 *   3. Priority queue — P1(critical) > P2(normal) > P3(low) > P4(background)
 *   4. Circuit breaker — CLOSED → OPEN → HALF_OPEN per exchange
 *   5. Ban mode — 429/418/403 → WS-only emergency mode across all workers
 *   6. Endpoint profiler — tracks real vs estimated weight per endpoint
 *   7. Adaptive throttle — progressive delay near limits
 *   8. Metrics — live stats for admin visibility
 */

import { createClient, type RedisClientType } from "redis";
import { getEgressController } from "./egress/index.ts";

// ═══════════════════════════════════════════════════════════════════
// EXCHANGE POLICIES
// ═══════════════════════════════════════════════════════════════════

interface ExchangePolicy {
  name: string;
  weightPerMinute: number;
  softPct: number;
  hardPct: number;
  cooldown429Ms: number;
  cooldown418Ms: number;
  weightHeaderName: string;
}

const POLICIES: Record<string, ExchangePolicy> = {
  binance: {
    name: "Binance", weightPerMinute: 1200, softPct: 0.55, hardPct: 0.75,
    cooldown429Ms: 90_000, cooldown418Ms: 600_000, weightHeaderName: "X-MBX-USED-WEIGHT-1M",
  },
  bybit: {
    name: "Bybit", weightPerMinute: 600, softPct: 0.60, hardPct: 0.80,
    cooldown429Ms: 60_000, cooldown418Ms: 300_000, weightHeaderName: "",
  },
  okx: {
    name: "OKX", weightPerMinute: 600, softPct: 0.60, hardPct: 0.80,
    cooldown429Ms: 60_000, cooldown418Ms: 300_000, weightHeaderName: "",
  },
  gateio: {
    name: "Gate.io", weightPerMinute: 900, softPct: 0.60, hardPct: 0.80,
    cooldown429Ms: 60_000, cooldown418Ms: 300_000, weightHeaderName: "",
  },
};

const getPolicy = (ex: string): ExchangePolicy =>
  POLICIES[ex.toLowerCase().replace(/[.\-_\s]/g, "")] ?? POLICIES.binance!;

// ── Endpoint weight estimates ──
const ENDPOINT_WEIGHTS: Record<string, number> = {
  "/fapi/v1/klines": 10, "/fapi/v1/depth": 10, "/fapi/v1/exchangeInfo": 10,
  "/fapi/v1/ticker/24hr": 10, "/fapi/v1/ticker/price": 1, "/fapi/v1/time": 1,
  "/fapi/v1/order": 2, "/fapi/v1/openOrders": 5, "/fapi/v1/allOrders": 5,
  "/fapi/v1/userTrades": 10, "/fapi/v2/balance": 1, "/fapi/v2/account": 5,
  "/fapi/v2/positionRisk": 5, "/fapi/v1/income": 20, "/fapi/v1/listenKey": 1,
  "/v5/market/orderbook": 10, "/v5/market/kline": 10, "/v5/market/recent-trade": 10,
  "/api/v5/market/books": 10, "/api/v5/market/candles": 10,
  "/api/v4/futures/usdt/order_book": 10, "/api/v4/spot/currency_pairs": 5,
  "/api/v4/futures/usdt/contracts": 5, "/api/v4/futures/usdt/candlesticks": 10,
};

const estimateWeight = (url: string): number => {
  for (const [ep, w] of Object.entries(ENDPOINT_WEIGHTS)) {
    if (url.includes(ep)) return w;
  }
  return 5;
};

const WINDOW_MS = 60_000;

// ═══════════════════════════════════════════════════════════════════
// PRIORITY SYSTEM
// ═══════════════════════════════════════════════════════════════════

export type Priority = "critical" | "normal" | "low" | "background";

const PRIORITY_RANK: Record<Priority, number> = {
  critical: 0,   // P1: active trading, order placement
  normal: 1,     // P2: visible UI data, live orderbook
  low: 2,        // P3: background refresh, kline backfill
  background: 3, // P4: analytics, enrichment, optional data
};

// ═══════════════════════════════════════════════════════════════════
// CIRCUIT BREAKER (per-exchange)
// ═══════════════════════════════════════════════════════════════════

type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

interface CircuitBreaker {
  state: CircuitState;
  failureCount: number;
  lastFailureAt: number;
  openUntil: number;
  halfOpenAllowed: number;  // allow 1 request to test
}

const CIRCUIT_FAILURE_THRESHOLD = 5;   // 5 failures → OPEN
const CIRCUIT_OPEN_DURATION_MS = 30_000;  // 30s open before half-open
const CIRCUIT_WINDOW_MS = 60_000;      // failure window

const circuits = new Map<string, CircuitBreaker>();

const getCircuit = (exchange: string): CircuitBreaker => {
  let cb = circuits.get(exchange);
  if (!cb) {
    cb = { state: "CLOSED", failureCount: 0, lastFailureAt: 0, openUntil: 0, halfOpenAllowed: 0 };
    circuits.set(exchange, cb);
  }
  return cb;
};

const circuitCanPass = (exchange: string, priority: Priority): boolean => {
  const cb = getCircuit(exchange);
  const now = Date.now();

  if (cb.state === "CLOSED") return true;

  if (cb.state === "OPEN") {
    if (now >= cb.openUntil) {
      cb.state = "HALF_OPEN";
      cb.halfOpenAllowed = 1;
      return true;
    }
    return priority === "critical"; // only critical bypasses OPEN
  }

  // HALF_OPEN: allow limited requests
  if (cb.halfOpenAllowed > 0) {
    cb.halfOpenAllowed--;
    return true;
  }
  return priority === "critical";
};

const circuitRecordSuccess = (exchange: string): void => {
  const cb = getCircuit(exchange);
  if (cb.state === "HALF_OPEN") {
    cb.state = "CLOSED";
    cb.failureCount = 0;
    console.log(`[ExchangeRL:${exchange}] Circuit breaker CLOSED (recovered)`);
  }
  // Decay failures over time
  if (cb.failureCount > 0 && Date.now() - cb.lastFailureAt > CIRCUIT_WINDOW_MS) {
    cb.failureCount = Math.max(0, cb.failureCount - 1);
  }
};

const circuitRecordFailure = (exchange: string, reason: string): void => {
  const cb = getCircuit(exchange);
  cb.failureCount++;
  cb.lastFailureAt = Date.now();

  if (cb.state === "HALF_OPEN") {
    cb.state = "OPEN";
    cb.openUntil = Date.now() + CIRCUIT_OPEN_DURATION_MS * 2; // longer on re-open
    console.error(`[ExchangeRL:${exchange}] Circuit breaker OPEN (half-open test failed: ${reason})`);
    return;
  }

  if (cb.failureCount >= CIRCUIT_FAILURE_THRESHOLD && cb.state === "CLOSED") {
    cb.state = "OPEN";
    cb.openUntil = Date.now() + CIRCUIT_OPEN_DURATION_MS;
    console.error(`[ExchangeRL:${exchange}] Circuit breaker OPEN (${cb.failureCount} failures: ${reason})`);
  }
};

// ═══════════════════════════════════════════════════════════════════
// ENDPOINT PROFILER
// ═══════════════════════════════════════════════════════════════════

interface EndpointProfile {
  calls: number;
  totalEstimatedWeight: number;
  totalRealWeight: number;
  lastCallAt: number;
  avgLatencyMs: number;
  errors: number;
}

const endpointProfiles = new Map<string, EndpointProfile>();

const profileEndpoint = (endpoint: string, estimatedWeight: number, realWeight: number | null, latencyMs: number, error: boolean): void => {
  let profile = endpointProfiles.get(endpoint);
  if (!profile) {
    profile = { calls: 0, totalEstimatedWeight: 0, totalRealWeight: 0, lastCallAt: 0, avgLatencyMs: 0, errors: 0 };
    endpointProfiles.set(endpoint, profile);
  }
  profile.calls++;
  profile.totalEstimatedWeight += estimatedWeight;
  if (realWeight !== null) profile.totalRealWeight += realWeight;
  profile.lastCallAt = Date.now();
  profile.avgLatencyMs = profile.avgLatencyMs * 0.9 + latencyMs * 0.1;
  if (error) profile.errors++;
};

// ═══════════════════════════════════════════════════════════════════
// REDIS CONNECTION
// ═══════════════════════════════════════════════════════════════════

let redis: RedisClientType | null = null;
let redisAvailable = false;
let redisConnectAttempted = false;

const ensureRedis = async (): Promise<RedisClientType | null> => {
  if (redis && redisAvailable) return redis;
  if (redisConnectAttempted && !redisAvailable) return null;
  redisConnectAttempted = true;
  try {
    const host = process.env.REDIS_HOST ?? "127.0.0.1";
    const port = Number(process.env.REDIS_PORT ?? 6379);
    const password = process.env.REDIS_PASSWORD || undefined;
    redis = createClient({ socket: { host, port, connectTimeout: 2000 }, password }) as RedisClientType;
    redis.on("error", () => { redisAvailable = false; });
    redis.on("ready", () => { redisAvailable = true; });
    await redis.connect();
    redisAvailable = true;
    return redis;
  } catch {
    redisAvailable = false;
    return null;
  }
};

// ═══════════════════════════════════════════════════════════════════
// LOCAL STATE (fallback when Redis unavailable)
// ═══════════════════════════════════════════════════════════════════

interface LocalState {
  weightLog: Array<{ ts: number; weight: number }>;
  cooldownUntil: number;
  cooldownReason: string | null;
}

const localStates = new Map<string, LocalState>();
const getLocal = (ex: string): LocalState => {
  let s = localStates.get(ex);
  if (!s) { s = { weightLog: [], cooldownUntil: 0, cooldownReason: null }; localStates.set(ex, s); }
  return s;
};

const localWeight = (ex: string): number => {
  const s = getLocal(ex);
  const cutoff = Date.now() - WINDOW_MS;
  while (s.weightLog.length && s.weightLog[0].ts < cutoff) s.weightLog.shift();
  return s.weightLog.reduce((sum, e) => sum + e.weight, 0);
};

// ═══════════════════════════════════════════════════════════════════
// REDIS OPERATIONS
// ═══════════════════════════════════════════════════════════════════

const rk = (ex: string, suffix: string) => `rl:${ex}:${suffix}`;

const getRedisWeight = async (ex: string): Promise<number> => {
  const r = await ensureRedis();
  if (!r) return localWeight(ex);
  try {
    await r.zRemRangeByScore(rk(ex, "weight"), "-inf", Date.now() - WINDOW_MS);
    const entries = await r.zRangeWithScores(rk(ex, "weight"), 0, -1);
    return entries.reduce((sum, e) => sum + Number(e.value.split(":")[1] ?? 0), 0);
  } catch { return localWeight(ex); }
};

const recordWeight = async (ex: string, weight: number): Promise<void> => {
  const now = Date.now();
  getLocal(ex).weightLog.push({ ts: now, weight });
  const r = await ensureRedis();
  if (!r) return;
  try {
    const member = `${now}:${weight}:${Math.random().toString(36).slice(2, 6)}`;
    await r.zAdd(rk(ex, "weight"), { score: now, value: member });
    await r.expire(rk(ex, "weight"), 120);
  } catch { /* local fallback */ }
};

const setCooldown = async (ex: string, untilMs: number, reason: string): Promise<void> => {
  const local = getLocal(ex);
  local.cooldownUntil = untilMs;
  local.cooldownReason = reason;
  const r = await ensureRedis();
  if (!r) return;
  try {
    const ttl = Math.max(1, Math.ceil((untilMs - Date.now()) / 1000));
    await r.set(rk(ex, "cooldown"), `${untilMs}:${reason}`, { EX: ttl });
  } catch { /* local fallback */ }
};

const checkCooldown = async (ex: string): Promise<{ active: boolean; until: number; reason: string | null }> => {
  const local = getLocal(ex);
  const r = await ensureRedis();
  if (!r) {
    return local.cooldownUntil > Date.now()
      ? { active: true, until: local.cooldownUntil, reason: local.cooldownReason }
      : { active: false, until: 0, reason: null };
  }
  try {
    const val = await r.get(rk(ex, "cooldown"));
    if (!val) { local.cooldownUntil = 0; local.cooldownReason = null; return { active: false, until: 0, reason: null }; }
    const [u, reason] = val.split(":");
    const until = Number(u);
    if (until <= Date.now()) return { active: false, until: 0, reason: null };
    local.cooldownUntil = until;
    local.cooldownReason = reason ?? null;
    return { active: true, until, reason: reason ?? null };
  } catch {
    return local.cooldownUntil > Date.now()
      ? { active: true, until: local.cooldownUntil, reason: local.cooldownReason }
      : { active: false, until: 0, reason: null };
  }
};

// ═══════════════════════════════════════════════════════════════════
// IN-FLIGHT DEDUP (per-worker for Response objects)
// ═══════════════════════════════════════════════════════════════════

const inFlight = new Map<string, Promise<Response>>();

// ═══════════════════════════════════════════════════════════════════
// CROSS-WORKER REDIS DEDUP (shared response cache)
// ═══════════════════════════════════════════════════════════════════
// When Worker 1 fetches depth:BTCUSDT:20, the response is cached in Redis.
// Worker 2 requesting the same key within TTL gets the cached response
// WITHOUT making another REST call to the exchange.

const DEDUP_TTL_SEC = 3; // 3 second cache — fresh enough for market data

const tryRedisDedup = async (exchange: string, key: string): Promise<Response | null> => {
  const r = await ensureRedis();
  if (!r) return null;
  try {
    const cached = await r.get(rk(exchange, `dedup:${key}`));
    if (!cached) return null;
    const parsed = JSON.parse(cached) as { status: number; body: string; headers: Record<string, string> };
    return new Response(parsed.body, {
      status: parsed.status,
      headers: new Headers(parsed.headers ?? {}),
    });
  } catch { return null; }
};

const setRedisDedup = async (exchange: string, key: string, status: number, body: string, headers: Record<string, string>): Promise<void> => {
  // Only cache successful GET responses (not POST/trade calls)
  if (status >= 400) return;
  const r = await ensureRedis();
  if (!r) return;
  try {
    const payload = JSON.stringify({ status, body, headers });
    // Don't cache responses larger than 256KB (prevents Redis bloat)
    if (payload.length > 262_144) return;
    await r.set(rk(exchange, `dedup:${key}`), payload, { EX: DEDUP_TTL_SEC });
  } catch { /* best-effort */ }
};

// ═══════════════════════════════════════════════════════════════════
// STATS / METRICS
// ═══════════════════════════════════════════════════════════════════

const metrics = {
  totalRequests: 0,
  total429: 0,
  total418: 0,
  total403: 0,
  totalTimeout: 0,
  totalDedupHits: 0,
  totalRedisDedupHits: 0,
  totalCircuitRejected: 0,
  totalThrottleDelays: 0,
  totalPriorityDrops: 0,
  lastExchangeWeight: 0,
  byExchange: new Map<string, {
    requests: number; errors: number; avgLatencyMs: number;
    dedupHits: number; circuitState: CircuitState;
  }>(),
};

const getExMetrics = (ex: string) => {
  let m = metrics.byExchange.get(ex);
  if (!m) { m = { requests: 0, errors: 0, avgLatencyMs: 0, dedupHits: 0, circuitState: "CLOSED" }; metrics.byExchange.set(ex, m); }
  return m;
};

// ═══════════════════════════════════════════════════════════════════
// PUBLIC API — exchangeFetch (replaces binanceFetch)
// ═══════════════════════════════════════════════════════════════════

export interface ExchangeFetchOptions {
  url: string;
  init?: RequestInit;
  priority?: Priority;
  dedupKey?: string;
  weight?: number;
  exchange?: string;
}

// Backward compat alias
export type BinanceFetchOptions = ExchangeFetchOptions;

/**
 * Central gateway for ALL exchange REST calls.
 * Redis-backed, multi-worker safe, with circuit breaker + priority + dedup.
 */
export const exchangeFetch = async (opts: ExchangeFetchOptions): Promise<Response> => {
  const { url, init, priority = "normal", dedupKey } = opts;
  const exchange = opts.exchange ?? "binance";
  const policy = getPolicy(exchange);
  const weight = opts.weight ?? estimateWeight(url);
  const endpoint = url.split("?")[0]?.replace(/https?:\/\/[^/]+/, "") ?? url;
  const exm = getExMetrics(exchange);
  metrics.totalRequests++;
  exm.requests++;

  // ── 1. Circuit breaker check ──
  if (!circuitCanPass(exchange, priority)) {
    metrics.totalCircuitRejected++;
    throw new Error(`${exchange}_circuit_open: REST temporarily disabled for ${exchange}`);
  }

  // ── 2. Cooldown check (Redis-shared) ──
  const cd = await checkCooldown(exchange);
  if (cd.active && priority !== "critical") {
    throw new Error(`${exchange}_cooldown: ${cd.reason}, ${Math.ceil((cd.until - Date.now()) / 1000)}s remaining`);
  }

  // ── 3. Weight check (Redis-shared) ──
  const current = await getRedisWeight(exchange);
  const softLimit = Math.floor(policy.weightPerMinute * policy.softPct);
  const hardLimit = Math.floor(policy.weightPerMinute * policy.hardPct);

  // Priority-based rejection near limits
  if (current >= hardLimit && priority !== "critical") {
    metrics.totalPriorityDrops++;
    throw new Error(`${exchange}_hard_limit: weight ${current}/${policy.weightPerMinute} (hard=${hardLimit})`);
  }
  if (current >= softLimit && (priority === "low" || priority === "background")) {
    metrics.totalPriorityDrops++;
    throw new Error(`${exchange}_soft_limit: weight ${current}/${policy.weightPerMinute}, priority=${priority} dropped`);
  }

  // ── 4. Adaptive throttle near soft limit ──
  if (current >= softLimit && priority === "normal") {
    const overPct = (current - softLimit) / Math.max(1, hardLimit - softLimit);
    const delayMs = Math.min(3000, Math.floor(overPct * 2000));
    if (delayMs > 50) {
      metrics.totalThrottleDelays++;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  // ── 5. Dedup check (per-worker in-flight + cross-worker Redis) ──
  if (dedupKey) {
    // 5a. Per-worker: same promise reuse (instant)
    const existing = inFlight.get(dedupKey);
    if (existing) {
      metrics.totalDedupHits++;
      exm.dedupHits++;
      return existing;
    }
    // 5b. Cross-worker: Redis response cache (3s TTL)
    // Only for GET requests (don't dedup trade/order calls)
    if (!init?.method || init.method === "GET") {
      const cached = await tryRedisDedup(exchange, dedupKey);
      if (cached) {
        metrics.totalRedisDedupHits++;
        metrics.totalDedupHits++;
        exm.dedupHits++;
        return cached;
      }
    }
  }

  // ── 6. Resolve egress path ──
  const egressCtrl = getEgressController();
  const egress = egressCtrl?.resolveUrl(exchange, url) ?? { url, viaProxy: false, pathId: "direct" };

  // ── 7. Execute with profiling ──
  const startMs = Date.now();
  const promise = (async () => {
    try {
      let res: Response;
      let upstreamStatus: number;

      if (egress.viaProxy) {
        // ── PROXY PATH: Send through standby server ──
        const proxyRes = await fetch(egress.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...egress.headers,
          },
          body: JSON.stringify({
            url,
            method: init?.method ?? "GET",
            headers: init?.headers ?? {},
            body: init?.body ?? undefined,
          }),
          signal: init?.signal ?? AbortSignal.timeout(15_000), // extra 5s for proxy hop
        });

        if (!proxyRes.ok) {
          // Proxy server itself failed — connectivity issue
          egressCtrl?.reportConnectivityFailure(exchange, egress.pathId, `proxy_${proxyRes.status}`);
          throw new Error(`egress_proxy_error: proxy returned ${proxyRes.status}`);
        }

        const proxyBody = await proxyRes.json() as {
          status: number;
          headers: Record<string, string>;
          body: unknown;
          latencyMs: number;
        };

        upstreamStatus = proxyBody.status;

        // Reconstruct a Response-like object from proxied data
        const reconstructedHeaders = new Headers(proxyBody.headers ?? {});
        const bodyStr = typeof proxyBody.body === "string"
          ? proxyBody.body
          : JSON.stringify(proxyBody.body);
        res = new Response(bodyStr, {
          status: upstreamStatus,
          headers: reconstructedHeaders,
        });

        // Report success to egress controller (connectivity was fine)
        egressCtrl?.reportSuccess(exchange, egress.pathId);
      } else {
        // ── DIRECT PATH: Standard fetch ──
        res = await fetch(url, {
          ...init,
          signal: init?.signal ?? AbortSignal.timeout(10_000),
        });
        upstreamStatus = res.status;

        // Report to egress controller
        if (res.ok) {
          egressCtrl?.reportSuccess(exchange, egress.pathId);
        }
      }

      const latencyMs = Date.now() - startMs;

      // Record weight (GLOBAL — same regardless of egress path)
      await recordWeight(exchange, weight);

      // Read exchange weight header + drift correction
      let realWeight: number | null = null;
      if (policy.weightHeaderName) {
        const hw = Number(res.headers.get(policy.weightHeaderName) ?? 0);
        if (hw > 0) {
          metrics.lastExchangeWeight = hw;
          realWeight = hw;
          // Drift correction: if exchange reports much higher, inject phantom weight
          if (hw > current + weight + 80) {
            const phantom = Math.min(150, hw - current - weight);
            void recordWeight(exchange, phantom);
          }
        }
      }

      // Profile endpoint
      profileEndpoint(endpoint, weight, realWeight, latencyMs, !res.ok);

      // ── Handle rate limit responses ──
      // CRITICAL: Rate limits trigger backoff, NOT egress switching
      if (upstreamStatus === 429) {
        metrics.total429++;
        const retryAfter = Number(res.headers.get("Retry-After") ?? 90);
        const cooldownMs = Math.max(policy.cooldown429Ms, retryAfter * 1000);
        void setCooldown(exchange, Date.now() + cooldownMs, "429");
        circuitRecordFailure(exchange, "429");
        // Inform egress controller — does NOT trigger failover
        egressCtrl?.reportRateLimit(exchange, egress.pathId, 429);
        console.error(`[ExchangeRL:${policy.name}] 429! Cooldown ${cooldownMs / 1000}s. weight=${current}+${weight} path=${egress.pathId}`);
      } else if (upstreamStatus === 418) {
        metrics.total418++;
        void setCooldown(exchange, Date.now() + policy.cooldown418Ms, "418");
        circuitRecordFailure(exchange, "418");
        // Inform egress controller — quarantines path but does NOT switch to continue
        egressCtrl?.reportRateLimit(exchange, egress.pathId, 418);
        console.error(`[ExchangeRL:${policy.name}] 418 IP BAN! Cooldown ${policy.cooldown418Ms / 1000}s path=${egress.pathId}`);
      } else if (upstreamStatus === 403) {
        metrics.total403++;
        void setCooldown(exchange, Date.now() + policy.cooldown418Ms, "403");
        circuitRecordFailure(exchange, "403");
        egressCtrl?.reportRateLimit(exchange, egress.pathId, 403);
        console.error(`[ExchangeRL:${policy.name}] 403 FORBIDDEN! Cooldown ${policy.cooldown418Ms / 1000}s path=${egress.pathId}`);
      } else if (res.ok) {
        circuitRecordSuccess(exchange);
      } else {
        exm.errors++;
        if (upstreamStatus >= 500) {
          circuitRecordFailure(exchange, `${upstreamStatus}`);
          // 5xx from exchange = potential connectivity/server issue
          egressCtrl?.reportConnectivityFailure(exchange, egress.pathId, `http_${upstreamStatus}`);
        }
      }

      exm.avgLatencyMs = exm.avgLatencyMs * 0.9 + latencyMs * 0.1;
      exm.circuitState = getCircuit(exchange).state;

      // ── Cross-worker dedup: cache response in Redis for other workers ──
      if (dedupKey && res.ok && (!init?.method || init.method === "GET")) {
        try {
          // Clone response so we can read body without consuming it
          const cloned = res.clone();
          const bodyText = await cloned.text();
          const resHeaders: Record<string, string> = {};
          // Forward important headers
          for (const h of ["content-type", "x-mbx-used-weight-1m"]) {
            const val = res.headers.get(h);
            if (val) resHeaders[h] = val;
          }
          void setRedisDedup(exchange, dedupKey, res.status, bodyText, resHeaders);
        } catch { /* best-effort, don't fail the request */ }
      }

      return res;
    } catch (err) {
      exm.errors++;
      const errMsg = err instanceof Error ? err.message : "unknown";
      if (err instanceof Error && (err.name === "TimeoutError" || errMsg.includes("timeout"))) {
        metrics.totalTimeout++;
        circuitRecordFailure(exchange, "timeout");
        egressCtrl?.reportConnectivityFailure(exchange, egress.pathId, "timeout");
      } else if (errMsg.includes("ECONNREFUSED") || errMsg.includes("ECONNRESET")
        || errMsg.includes("ENOTFOUND") || errMsg.includes("EHOSTUNREACH")) {
        egressCtrl?.reportConnectivityFailure(exchange, egress.pathId, errMsg);
      }
      throw err;
    } finally {
      if (dedupKey) inFlight.delete(dedupKey);
    }
  })();

  if (dedupKey) inFlight.set(dedupKey, promise);
  return promise;
};

// Backward compat alias
export const binanceFetch = exchangeFetch;

// ═══════════════════════════════════════════════════════════════════
// METRICS API (for admin endpoint)
// ═══════════════════════════════════════════════════════════════════

export const getRateLimiterStatus = () => {
  const exchange = "binance";
  const policy = getPolicy(exchange);
  const local = getLocal(exchange);
  const now = Date.now();
  const cb = getCircuit(exchange);
  const egressCtrl = getEgressController();
  const egressStatus = egressCtrl?.getStatus() ?? {};
  return {
    currentWeight: localWeight(exchange),
    weightLimit: policy.weightPerMinute,
    softLimit: Math.floor(policy.weightPerMinute * policy.softPct),
    hardLimit: Math.floor(policy.weightPerMinute * policy.hardPct),
    redisAvailable,
    cooldownActive: local.cooldownUntil > now,
    cooldownReason: local.cooldownReason,
    cooldownRemainingMs: local.cooldownUntil > now ? Math.max(0, local.cooldownUntil - now) : 0,
    circuitState: cb.state,
    circuitFailures: cb.failureCount,
    totalRequests: metrics.totalRequests,
    total429s: metrics.total429,
    total418s: metrics.total418,
    total403s: metrics.total403,
    totalTimeouts: metrics.totalTimeout,
    totalDedupHits: metrics.totalDedupHits,
    totalRedisDedupHits: metrics.totalRedisDedupHits,
    totalPriorityDrops: metrics.totalPriorityDrops,
    totalThrottleDelays: metrics.totalThrottleDelays,
    totalCircuitRejected: metrics.totalCircuitRejected,
    lastExchangeWeight: metrics.lastExchangeWeight,
    inFlightCount: inFlight.size,
    egress: egressStatus,
  };
};

/** Full metrics for all exchanges (admin endpoint) */
export const getFullMetrics = () => {
  const exchanges: Record<string, unknown> = {};
  for (const [ex, policy] of Object.entries(POLICIES)) {
    const cb = getCircuit(ex);
    const local = getLocal(ex);
    const exm = getExMetrics(ex);
    const now = Date.now();
    exchanges[ex] = {
      policy: { weightPerMinute: policy.weightPerMinute, softPct: policy.softPct, hardPct: policy.hardPct },
      localWeight: localWeight(ex),
      circuitState: cb.state,
      circuitFailures: cb.failureCount,
      cooldownActive: local.cooldownUntil > now,
      cooldownReason: local.cooldownReason,
      requests: exm.requests,
      errors: exm.errors,
      avgLatencyMs: Math.round(exm.avgLatencyMs),
      dedupHits: exm.dedupHits,
    };
  }
  const topEndpoints = [...endpointProfiles.entries()]
    .sort((a, b) => b[1].totalEstimatedWeight - a[1].totalEstimatedWeight)
    .slice(0, 15)
    .map(([ep, p]) => ({
      endpoint: ep,
      calls: p.calls,
      estimatedWeight: p.totalEstimatedWeight,
      realWeight: p.totalRealWeight,
      avgLatencyMs: Math.round(p.avgLatencyMs),
      errors: p.errors,
      weightDrift: p.totalRealWeight > 0 ? Math.round(((p.totalRealWeight - p.totalEstimatedWeight) / Math.max(1, p.totalEstimatedWeight)) * 100) : null,
    }));

  return {
    global: {
      redisAvailable,
      totalRequests: metrics.totalRequests,
      total429: metrics.total429,
      total418: metrics.total418,
      total403: metrics.total403,
      totalTimeouts: metrics.totalTimeout,
      totalDedupHits: metrics.totalDedupHits,
      totalRedisDedupHits: metrics.totalRedisDedupHits,
      totalPriorityDrops: metrics.totalPriorityDrops,
      totalThrottleDelays: metrics.totalThrottleDelays,
      totalCircuitRejected: metrics.totalCircuitRejected,
      inFlightCount: inFlight.size,
    },
    exchanges,
    topEndpoints,
  };
};

export const logRateLimiterStatus = () => {
  const s = getRateLimiterStatus();
  if (s.cooldownActive || s.currentWeight > 200 || s.total429s > 0 || s.total418s > 0 || s.circuitState !== "CLOSED") {
    console.log(
      `[ExchangeRL] w=${s.currentWeight}/${s.weightLimit} ` +
      `redis=${redisAvailable ? "ok" : "down"} ` +
      `circuit=${s.circuitState}(${s.circuitFailures}) ` +
      `cd=${s.cooldownActive ? `${s.cooldownReason} ${Math.ceil(s.cooldownRemainingMs / 1000)}s` : "off"} ` +
      `429=${s.total429s} 418=${s.total418s} 403=${s.total403s} ` +
      `dedup=${s.totalDedupHits} drops=${s.totalPriorityDrops} ` +
      `req=${s.totalRequests} fly=${s.inFlightCount}`,
    );
  }
};
