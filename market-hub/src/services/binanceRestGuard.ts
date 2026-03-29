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
  return 5; // default conservative estimate
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
  opts?: { method?: string; headers?: Record<string, string>; timeoutMs?: number; dedupKey?: string; skipBudgetCheck?: boolean },
): Promise<Response> {
  const weight = getWeight(url);
  const dedupKey = opts?.dedupKey ?? url.split("?")[0];

  // 0. Startup burst damper — first 60s block non-essential REST
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
