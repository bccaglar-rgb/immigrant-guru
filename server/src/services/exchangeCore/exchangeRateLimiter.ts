/**
 * Exchange API Rate Limiter — Prevents hitting exchange rate limits.
 *
 * Uses Redis INCR + EXPIRE for per-venue sliding window (shared across
 * all instances — Execution Service can run as 2 stateless nodes).
 * Conservative limits (50% of actual) to leave headroom for manual trades.
 *
 * Binance Futures:  2400 weight/min  → we use 1200
 * Bybit Futures:    600 req/5s       → we use 120/5s (1440/min)
 * OKX Futures:      60 req/2s        → we use 30/2s  (900/min)
 * Gate.io Futures:  900 req/min      → we use 450
 */
import { redis } from "../../db/redis.ts";

export type ExchangeVenue = "BINANCE" | "BYBIT" | "OKX" | "GATEIO";

interface VenueLimitConfig {
  maxWeight: number;
  windowSec: number;
}

const VENUE_LIMITS: Record<ExchangeVenue, VenueLimitConfig> = {
  BINANCE: { maxWeight: 1200, windowSec: 60 },
  BYBIT:   { maxWeight: 1440, windowSec: 60 },  // 120 per 5s → 1440/min
  OKX:     { maxWeight: 900,  windowSec: 60 },  // 30 per 2s  → 900/min
  GATEIO:  { maxWeight: 450,  windowSec: 60 },
};

export class ExchangeRateLimiter {
  /**
   * Try to acquire rate limit capacity (shared across all instances via Redis).
   * Returns true if the request is allowed, false if rate limited.
   */
  async tryAcquire(venue: ExchangeVenue, weight = 1): Promise<boolean> {
    const cfg = VENUE_LIMITS[venue];
    if (!cfg) return true;
    const key = `rl:exchange:${venue}`;
    try {
      const current = await redis.incrby(key, weight);
      if (current <= weight) {
        await redis.expire(key, cfg.windowSec);
      }
      return current <= cfg.maxWeight;
    } catch {
      // Fail-open: if Redis is down, allow the request
      return true;
    }
  }

  /** Get current usage for a venue (0–maxWeight). */
  async getUsage(venue: ExchangeVenue): Promise<number> {
    try {
      const val = await redis.get(`rl:exchange:${venue}`);
      return val ? Number(val) : 0;
    } catch {
      return 0;
    }
  }

  /** Get remaining capacity (0 = rate limited). */
  async getRemaining(venue: ExchangeVenue): Promise<number> {
    const usage = await this.getUsage(venue);
    const max = VENUE_LIMITS[venue]?.maxWeight ?? 600;
    return Math.max(0, max - usage);
  }

  /** Get usage ratio 0–1 for all venues (Prometheus / dashboard). */
  async getAllUsage(): Promise<Record<ExchangeVenue, { usage: number; max: number; ratio: number }>> {
    const venues = Object.keys(VENUE_LIMITS) as ExchangeVenue[];
    const results = await Promise.all(venues.map((v) => this.getUsage(v)));
    const out = {} as Record<ExchangeVenue, { usage: number; max: number; ratio: number }>;
    for (let i = 0; i < venues.length; i++) {
      const v = venues[i];
      const max = VENUE_LIMITS[v].maxWeight;
      out[v] = { usage: results[i], max, ratio: results[i] / max };
    }
    return out;
  }

  // ── Multi-Level Rate Limiting (Faz 6+) ──────────────────────
  // Beyond venue-level: user-level and symbol-level rate limits
  // Prevents a single user or symbol from consuming all capacity.

  /** Per-user rate limit: max orders per minute per user. Default: 60/min. */
  async tryAcquireUser(userId: string, venue: ExchangeVenue, weight = 1): Promise<boolean> {
    const maxPerUser = 60;
    const key = `rl:user:${userId}:${venue}`;
    try {
      const current = await redis.incrby(key, weight);
      if (current <= weight) await redis.expire(key, 60);
      return current <= maxPerUser;
    } catch {
      return true;
    }
  }

  /** Per-symbol rate limit: max orders per minute per symbol across all users. Default: 120/min. */
  async tryAcquireSymbol(symbol: string, venue: ExchangeVenue, weight = 1): Promise<boolean> {
    const maxPerSymbol = 120;
    const key = `rl:symbol:${symbol}:${venue}`;
    try {
      const current = await redis.incrby(key, weight);
      if (current <= weight) await redis.expire(key, 60);
      return current <= maxPerSymbol;
    } catch {
      return true;
    }
  }

  /** Global rate limit: max total orders per minute across all venues. Default: 3000/min. */
  async tryAcquireGlobal(weight = 1): Promise<boolean> {
    const maxGlobal = 3000;
    const key = "rl:global";
    try {
      const current = await redis.incrby(key, weight);
      if (current <= weight) await redis.expire(key, 60);
      return current <= maxGlobal;
    } catch {
      return true;
    }
  }

  /**
   * Multi-level check: global → venue → user → symbol.
   * Returns the level that blocked, or null if all passed.
   */
  async tryAcquireAll(
    venue: ExchangeVenue,
    userId: string,
    symbol: string,
    weight = 1,
  ): Promise<{ allowed: boolean; blockedBy?: "GLOBAL" | "VENUE" | "USER" | "SYMBOL" }> {
    if (!await this.tryAcquireGlobal(weight)) {
      return { allowed: false, blockedBy: "GLOBAL" };
    }
    if (!await this.tryAcquire(venue, weight)) {
      return { allowed: false, blockedBy: "VENUE" };
    }
    if (!await this.tryAcquireUser(userId, venue, weight)) {
      return { allowed: false, blockedBy: "USER" };
    }
    if (!await this.tryAcquireSymbol(symbol, venue, weight)) {
      return { allowed: false, blockedBy: "SYMBOL" };
    }
    return { allowed: true };
  }
}
