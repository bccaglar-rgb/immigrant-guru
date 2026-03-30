/**
 * Binance REST Guard — Shared rate-limit-aware fetch wrapper for market-hub process.
 *
 * market-hub runs as a separate Node.js process and cannot import exchangeFetch()
 * from the main server. This module provides the same Redis-backed protections:
 *
 *  1. Pre-request cooldown check (Redis key: rl:binance:cooldown)
 *  2. Pre-request weight budget check (Redis sorted set: rl:binance:weight)
 *  3. Post-request weight recording
 *  4. 429 → write cooldown to Redis (all processes stop)
 *  5. 418 → write cooldown + circuit OPEN to Redis (all processes stop immediately)
 *  6. Concurrency limiting per endpoint category
 *  7. Request timeout
 *
 * All Redis keys are IDENTICAL to server/src/services/binanceRateLimiter.ts
 * so both processes share the same global state.
 */

import { redis } from "../redis.ts";
import {
  canRequest as budgetCanRequest,
  recordRequest as budgetRecordRequest,
  onBanDetected as budgetOnBanDetected,
  classifyEndpoint as budgetClassifyEndpoint,
} from "./budgetEngine.ts";
import { recordReason } from "./hubObservability.ts";

// ── Config ──
const WEIGHT_LIMIT = 1200;
const SOFT_LIMIT = Math.floor(WEIGHT_LIMIT * 0.60); // 720 — market-hub should be conservative
const HARD_LIMIT = Math.floor(WEIGHT_LIMIT * 0.80); // 960 — absolute block
const COOLDOWN_KEY = "rl:binance:cooldown";
const WEIGHT_KEY = "rl:binance:weight";
const CB_STATE_KEY = "rl:binance:cb:state";
const CB_OPEN_UNTIL_KEY = "rl:binance:cb:openUntil";
const FETCH_TIMEOUT_MS = 12_000;

// ── Endpoint weight estimates ──
const ENDPOINT_WEIGHTS: Record<string, number> = {
  "/fapi/v1/depth": 10,
  "/fapi/v1/klines": 5,
  "/fapi/v1/exchangeInfo": 10,
  "/fapi/v1/ticker/price": 1,
  "/fapi/v1/time": 1,
  "/fapi/v1/ping": 1,
};

const getWeight = (url: string): number => {
  for (const [path, w] of Object.entries(ENDPOINT_WEIGHTS)) {
    if (url.includes(path)) return w;
  }
  return 5;
};

// ── Per-endpoint budget caps (per minute) ──
// Tier C endpoints auto-throttle when global weight is elevated
const ENDPOINT_BUDGET: Record<string, { maxPerMin: number; tier: "A" | "B" | "C" }> = {
  "/fapi/v1/depth": { maxPerMin: 8, tier: "B" },       // recovery snapshots
  "/fapi/v1/klines": { maxPerMin: 6, tier: "C" },      // backfill
  "/fapi/v1/exchangeInfo": { maxPerMin: 1, tier: "C" }, // contract refresh
};

const endpointCallCounts = new Map<string, { count: number; resetAt: number }>();

const checkEndpointBudget = (url: string): boolean => {
  const now = Date.now();
  for (const [path, budget] of Object.entries(ENDPOINT_BUDGET)) {
    if (!url.includes(path)) continue;
    let tracker = endpointCallCounts.get(path);
    if (!tracker || now > tracker.resetAt) {
      tracker = { count: 0, resetAt: now + 60_000 };
      endpointCallCounts.set(path, tracker);
    }
    if (tracker.count >= budget.maxPerMin) return false;
    tracker.count++;
    return true;
  }
  return true; // no budget cap for unlisted endpoints
};

const getEndpointTier = (url: string): "A" | "B" | "C" => {
  for (const [path, budget] of Object.entries(ENDPOINT_BUDGET)) {
    if (url.includes(path)) return budget.tier;
  }
  return "B";
};

// ── Concurrency control ──
let inFlight = 0;
const MAX_CONCURRENT = 3; // max 3 simultaneous REST calls from market-hub
const pendingQueue: Array<() => void> = [];

const acquireSlot = (): Promise<void> => {
  if (inFlight < MAX_CONCURRENT) {
    inFlight++;
    return Promise.resolve();
  }
  return new Promise((resolve) => pendingQueue.push(() => { inFlight++; resolve(); }));
};

const releaseSlot = () => {
  inFlight--;
  const next = pendingQueue.shift();
  if (next) next();
};

// ── Dedup: prevent same request within 2s ──
const recentRequests = new Map<string, number>();
const DEDUP_TTL_MS = 2000;

const isDuplicate = (url: string): boolean => {
  const now = Date.now();
  const last = recentRequests.get(url);
  if (last && now - last < DEDUP_TTL_MS) return true;
  recentRequests.set(url, now);
  // Cleanup old entries periodically
  if (recentRequests.size > 200) {
    for (const [k, t] of recentRequests) {
      if (now - t > DEDUP_TTL_MS) recentRequests.delete(k);
    }
  }
  return false;
};

// ── Startup burst damper ──
const BOOT_TIME = Date.now();
const STARTUP_DAMPER_MS = 60_000;

// ── Attribution Tracker — endpoint + reason + symbol metrics ──
interface AttrEntry { req: number; weight: number; byReason: Record<string, number>; bySymbol: Record<string, number> }
const attribution = new Map<string, AttrEntry>();
let lastAttrLog = Date.now();
const ATTR_LOG_INTERVAL_MS = 60_000;

function classifyEndpoint(url: string): string {
  if (url.includes("/depth")) return "depthSnapshot";
  if (url.includes("/klines")) return "klines";
  if (url.includes("/exchangeInfo")) return "exchangeInfo";
  if (url.includes("/ticker")) return "ticker";
  if (url.includes("/listenKey")) return "listenKey";
  if (url.includes("/time") || url.includes("/ping")) return "health";
  return "other";
}

function extractSymbol(url: string): string {
  const m = url.match(/symbol=([A-Z0-9]+)/);
  return m?.[1] ?? "GLOBAL";
}

function recordAttribution(url: string, weight: number, reason?: string): void {
  const ep = classifyEndpoint(url);
  let entry = attribution.get(ep);
  if (!entry) { entry = { req: 0, weight: 0, byReason: {}, bySymbol: {} }; attribution.set(ep, entry); }
  entry.req++;
  entry.weight += weight;
  const r = reason ?? "unknown";
  entry.byReason[r] = (entry.byReason[r] ?? 0) + 1;
  const sym = extractSymbol(url);
  entry.bySymbol[sym] = (entry.bySymbol[sym] ?? 0) + 1;
}

function maybeLogAttribution(): void {
  const now = Date.now();
  if (now - lastAttrLog < ATTR_LOG_INTERVAL_MS) return;
  lastAttrLog = now;
  if (!attribution.size) return;

  let totalReq = 0, totalWeight = 0;
  const lines: string[] = [];
  for (const [ep, a] of [...attribution.entries()].sort((a, b) => b[1].weight - a[1].weight)) {
    totalReq += a.req;
    totalWeight += a.weight;
    const topSymbols = Object.entries(a.bySymbol).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([s, c]) => `${s}:${c}`).join(",");
    const topReasons = Object.entries(a.byReason).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([r, c]) => `${r}:${c}`).join(",");
    lines.push(`  ${ep}: req=${a.req} w=${a.weight} sym=[${topSymbols}] reason=[${topReasons}]`);
  }
  console.log(`[HubAttribution] 60s report: total req=${totalReq} weight=${totalWeight}\n${lines.join("\n")}`);

  // Reset for next period
  attribution.clear();
}

// ── Public API ──

export interface GuardedFetchResult {
  ok: boolean;
  status: number;
  data: any;
  blocked?: string; // reason if blocked before fetch
}

/**
 * Rate-limit-aware fetch for Binance REST APIs.
 * Shares Redis state with the main server process.
 */
export async function guardedBinanceFetch(
  url: string,
  opts?: { method?: string; headers?: Record<string, string>; timeoutMs?: number; dedupKey?: string; skipBudgetCheck?: boolean; reason?: string },
): Promise<Response> {
  const weight = getWeight(url);
  const dedupKey = opts?.dedupKey ?? url.split("?")[0];
  const tier = getEndpointTier(url);

  // Attribution tracking
  recordAttribution(url, weight, opts?.reason);
  maybeLogAttribution();

  // Feed reason into observability
  if (opts?.reason) recordReason(opts.reason);

  // 0-pre. Budget engine check — synthetic 429 if local budget says no
  if (!opts?.skipBudgetCheck) {
    const endpoint = budgetClassifyEndpoint(url);
    const budgetCheck = budgetCanRequest(endpoint, weight);
    if (!budgetCheck.allowed) {
      throw new Error(`hub_budget_blocked: ${budgetCheck.reason}`);
    }
  }

  // 0a. Per-endpoint budget cap
  if (!checkEndpointBudget(url)) {
    throw new Error(`hub_endpoint_budget: ${url.split("?")[0]} exceeded per-minute cap`);
  }

  // 0b. Tier-based auto-throttle: when weight > 50%, Tier C is blocked; > 70%, Tier B delayed
  if (!opts?.skipBudgetCheck) {
    try {
      const now = Date.now();
      const entries = await redis.zrangebyscore(WEIGHT_KEY, now - 60_000, "+inf");
      let cw = 0;
      for (const e of entries) cw += Number(e.split(":")[1] ?? 0);
      const usagePct = cw / WEIGHT_LIMIT;
      if (tier === "C" && usagePct > 0.50) {
        throw new Error(`hub_tier_throttle: Tier C blocked at ${Math.round(usagePct * 100)}% weight usage`);
      }
      if (tier === "B" && usagePct > 0.70) {
        await new Promise((r) => setTimeout(r, 2000)); // 2s delay for Tier B above 70%
      }
    } catch (err: any) {
      if (err.message?.startsWith("hub_tier")) throw err;
    }
  }

  // 0c. Startup burst damper — first 60s block non-essential REST
  const elapsed = Date.now() - BOOT_TIME;
  if (elapsed < STARTUP_DAMPER_MS) {
    if (elapsed < 20_000) {
      throw new Error(`hub_startup_damper: first 20s, REST blocked (${elapsed}ms since boot)`);
    }
    // 20-60s: progressive delay
    const rampDelay = Math.floor((1 - (elapsed - 20_000) / (STARTUP_DAMPER_MS - 20_000)) * 2000);
    if (rampDelay > 100) await new Promise((r) => setTimeout(r, rampDelay));
  }

  // 1. Dedup check
  if (isDuplicate(dedupKey)) {
    throw new Error(`hub_dedup: duplicate request within ${DEDUP_TTL_MS}ms: ${dedupKey}`);
  }

  // 2. Redis cooldown check
  try {
    const cd = await redis.get(COOLDOWN_KEY);
    if (cd) {
      const until = parseInt(cd.split(":")[0], 10);
      if (until > Date.now()) {
        const remaining = Math.ceil((until - Date.now()) / 1000);
        throw new Error(`hub_cooldown: binance cooldown active, ${remaining}s remaining`);
      }
    }
  } catch (err: any) {
    if (err.message?.startsWith("hub_cooldown")) throw err;
    // Redis error → allow request (fail-open) but log
    console.warn("[BinanceRestGuard] Redis cooldown check failed:", err.message);
  }

  // 3. Circuit breaker check
  try {
    const [state, openUntil] = await Promise.all([
      redis.get(CB_STATE_KEY),
      redis.get(CB_OPEN_UNTIL_KEY),
    ]);
    if (state === "OPEN" && Number(openUntil ?? 0) > Date.now()) {
      const remaining = Math.ceil((Number(openUntil) - Date.now()) / 1000);
      throw new Error(`hub_circuit_open: circuit breaker OPEN, ${remaining}s remaining`);
    }
  } catch (err: any) {
    if (err.message?.startsWith("hub_circuit")) throw err;
  }

  // 4. Weight budget check
  if (!opts?.skipBudgetCheck) {
    try {
      const now = Date.now();
      const windowStart = now - 60_000;
      // Read current weight from shared sorted set
      const entries = await redis.zrangebyscore(WEIGHT_KEY, windowStart, "+inf");
      let currentWeight = 0;
      for (const entry of entries) {
        const parts = entry.split(":");
        currentWeight += Number(parts[1] ?? 0);
      }

      if (currentWeight + weight > HARD_LIMIT) {
        throw new Error(`hub_hard_limit: weight ${currentWeight}+${weight}/${WEIGHT_LIMIT} exceeds hard limit ${HARD_LIMIT}`);
      }
      if (currentWeight + weight > SOFT_LIMIT) {
        // Above soft limit: add delay proportional to how close we are to hard
        const overSoft = currentWeight + weight - SOFT_LIMIT;
        const delayMs = Math.min(2000, (overSoft / (HARD_LIMIT - SOFT_LIMIT)) * 2000);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    } catch (err: any) {
      if (err.message?.startsWith("hub_hard_limit")) throw err;
    }
  }

  // 5. Acquire concurrency slot
  await acquireSlot();

  try {
    // 6. Record weight BEFORE request (pre-reserve)
    const now = Date.now();
    const member = `${now}:${weight}:hub-${Math.random().toString(36).slice(2, 6)}`;
    try {
      await redis.zadd(WEIGHT_KEY, now, member);
      await redis.expire(WEIGHT_KEY, 65);
    } catch { /* best-effort */ }

    // 6b. Record in local budget engine
    budgetRecordRequest(budgetClassifyEndpoint(url), weight);

    // 7. Execute fetch with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), opts?.timeoutMs ?? FETCH_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(url, {
        method: opts?.method ?? "GET",
        headers: opts?.headers,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    // 8. Handle rate limit responses → write to shared Redis
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("Retry-After") ?? 30);
      const cooldownMs = Math.max(15_000, retryAfter * 1000);
      const until = Date.now() + cooldownMs;
      try {
        await redis.set(COOLDOWN_KEY, `${until}:hub-429`, "PX", cooldownMs);
      } catch { /* best-effort */ }
      console.error(`[BinanceRestGuard] 429! Cooldown ${cooldownMs / 1000}s written to Redis`);
      budgetOnBanDetected(429);
    }

    if (res.status === 418) {
      const cooldownMs = 120_000; // 2 minutes
      const until = Date.now() + cooldownMs;
      try {
        await Promise.all([
          redis.set(COOLDOWN_KEY, `${until}:hub-418`, "PX", cooldownMs),
          redis.set(CB_STATE_KEY, "OPEN"),
          redis.set(CB_OPEN_UNTIL_KEY, String(until)),
        ]);
      } catch { /* best-effort */ }
      console.error(`[BinanceRestGuard] 418 IP BAN! Circuit OPEN + cooldown written to Redis (${cooldownMs / 1000}s)`);
      budgetOnBanDetected(418);
    }

    if (res.status === 403) {
      const cooldownMs = 60_000;
      try {
        await redis.set(COOLDOWN_KEY, `${Date.now() + cooldownMs}:hub-403`, "PX", cooldownMs);
      } catch { /* best-effort */ }
      console.error(`[BinanceRestGuard] 403! Cooldown ${cooldownMs / 1000}s written to Redis`);
    }

    // 9. Log weight usage on success
    if (res.ok) {
      // Check if Binance reports actual weight
      const reportedWeight = res.headers.get("X-MBX-USED-WEIGHT-1M");
      if (reportedWeight) {
        const reported = Number(reportedWeight);
        if (reported > SOFT_LIMIT) {
          console.warn(`[BinanceRestGuard] Binance reports weight ${reported}/${WEIGHT_LIMIT} — approaching limit`);
        }
      }
    }

    return res;
  } finally {
    releaseSlot();
  }
}

/**
 * Convenience: fetch JSON with guard.
 */
export async function guardedBinanceJson<T = any>(
  url: string,
  opts?: Parameters<typeof guardedBinanceFetch>[1],
): Promise<T> {
  const res = await guardedBinanceFetch(url, opts);
  if (!res.ok) {
    throw new Error(`Binance HTTP ${res.status}: ${await res.text().catch(() => "")}`);
  }
  return res.json() as Promise<T>;
}
