/**
 * RateLimitGuard — per-exchange REST weight tracking.
 *
 * Prevents hitting exchange API limits by tracking request weight
 * per minute per exchange. Supports async acquire (waits if near limit)
 * and sync tryAcquire (returns false if would exceed).
 *
 * Also handles 429/418 responses via reportLimitHit() which blocks
 * requests for the specified cooldown period.
 */

import type { MarketExchangeId } from "../types.ts";
import type { IRateLimitGuard, RateLimitUsage } from "../contracts/HubModels.ts";

interface ExchangeBucket {
  exchange: MarketExchangeId;
  maxWeight: number;
  usedWeight: number;
  windowStartMs: number;
  blockedUntilMs: number;
}

const WINDOW_MS = 60_000; // 1 minute sliding window

const DEFAULT_WEIGHTS: Record<MarketExchangeId, number> = {
  BINANCE: 2400,   // Binance: 2400 weight/min
  GATEIO: 900,     // Gate.io: 900 req/min
  BYBIT: 600,      // Bybit: 600 req/min
  OKX: 600,        // OKX: 600 req/min
};

export class RateLimitGuard implements IRateLimitGuard {
  private readonly buckets = new Map<MarketExchangeId, ExchangeBucket>();
  private readonly limitListeners = new Set<(exchange: MarketExchangeId, usage: RateLimitUsage) => void>();

  private getBucket(exchange: MarketExchangeId): ExchangeBucket {
    let bucket = this.buckets.get(exchange);
    if (!bucket) {
      bucket = {
        exchange,
        maxWeight: DEFAULT_WEIGHTS[exchange] ?? 600,
        usedWeight: 0,
        windowStartMs: Date.now(),
        blockedUntilMs: 0,
      };
      this.buckets.set(exchange, bucket);
    }
    // Reset window if expired
    const now = Date.now();
    if (now - bucket.windowStartMs > WINDOW_MS) {
      bucket.usedWeight = 0;
      bucket.windowStartMs = now;
    }
    return bucket;
  }

  async acquire(exchange: MarketExchangeId, weight = 1): Promise<boolean> {
    const bucket = this.getBucket(exchange);
    const now = Date.now();

    // Blocked by 429/418
    if (bucket.blockedUntilMs > now) {
      return false;
    }

    // Would exceed limit — wait for window reset
    if (bucket.usedWeight + weight > bucket.maxWeight) {
      const waitMs = Math.max(0, WINDOW_MS - (now - bucket.windowStartMs));
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(waitMs, 5_000)));
        // Re-check after wait
        return this.tryAcquire(exchange, weight);
      }
    }

    bucket.usedWeight += weight;
    return true;
  }

  tryAcquire(exchange: MarketExchangeId, weight = 1): boolean {
    const bucket = this.getBucket(exchange);
    const now = Date.now();

    if (bucket.blockedUntilMs > now) return false;
    if (bucket.usedWeight + weight > bucket.maxWeight) return false;

    bucket.usedWeight += weight;
    return true;
  }

  reportLimitHit(exchange: MarketExchangeId, retryAfterMs = 60_000): void {
    const bucket = this.getBucket(exchange);
    bucket.blockedUntilMs = Date.now() + retryAfterMs;
    bucket.usedWeight = bucket.maxWeight; // mark as full

    const usage = this.getUsage(exchange);
    for (const cb of this.limitListeners) {
      cb(exchange, usage);
    }
  }

  getUsage(exchange: MarketExchangeId): RateLimitUsage {
    const bucket = this.getBucket(exchange);
    const now = Date.now();
    return {
      exchange,
      usedWeight: bucket.usedWeight,
      maxWeight: bucket.maxWeight,
      resetAtMs: bucket.windowStartMs + WINDOW_MS,
      isBlocked: bucket.blockedUntilMs > now,
      blockedUntilMs: bucket.blockedUntilMs > now ? bucket.blockedUntilMs : null,
    };
  }

  onLimitHit(cb: (exchange: MarketExchangeId, usage: RateLimitUsage) => void): () => void {
    this.limitListeners.add(cb);
    return () => this.limitListeners.delete(cb);
  }
}
