/**
 * Exchange API Rate Limiter — Prevents hitting Binance/Gate.io rate limits.
 *
 * Uses Redis INCR + EXPIRE for per-venue sliding window.
 * Conservative limits (50% of actual) to leave headroom for manual trades.
 *
 * Binance Futures API: 2400 weight/min → we use 1200
 * Gate.io Futures API: 900 req/min → we use 450
 */
import { redis } from "../../db/redis.ts";

const LIMITS: Record<string, number> = {
  BINANCE: 1200,
  GATEIO: 450,
};

const WINDOW_SEC = 60;

export class ExchangeRateLimiter {
  /**
   * Try to acquire rate limit capacity.
   * Returns true if the request is allowed, false if rate limited.
   */
  async tryAcquire(venue: "BINANCE" | "GATEIO", weight = 1): Promise<boolean> {
    const key = `rl:exchange:${venue}`;
    const maxWeight = LIMITS[venue] ?? 600;
    try {
      const current = await redis.incrby(key, weight);
      if (current <= weight) {
        // First request in window — set TTL
        await redis.expire(key, WINDOW_SEC);
      }
      return current <= maxWeight;
    } catch {
      // Fail-open: if Redis is down, allow the request
      return true;
    }
  }

  /** Get current usage for a venue. */
  async getUsage(venue: "BINANCE" | "GATEIO"): Promise<number> {
    try {
      const val = await redis.get(`rl:exchange:${venue}`);
      return val ? Number(val) : 0;
    } catch {
      return 0;
    }
  }

  /** Get remaining capacity for a venue. */
  async getRemaining(venue: "BINANCE" | "GATEIO"): Promise<number> {
    const usage = await this.getUsage(venue);
    const max = LIMITS[venue] ?? 600;
    return Math.max(0, max - usage);
  }
}
