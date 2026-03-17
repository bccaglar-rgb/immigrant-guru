/**
 * Redis-based API Rate Limiter
 *
 * Uses Redis INCR + EXPIRE for sliding window rate limiting.
 * Fails open if Redis is down (so the API stays available).
 */
import { redis } from "../db/redis.ts";
import type { Request, Response, NextFunction } from "express";

interface RateLimitConfig {
  /** Window duration in seconds */
  windowSec: number;
  /** Max requests per window */
  max: number;
  /** Redis key prefix (e.g. "api", "bot-create") */
  keyPrefix: string;
  /** Use x-user-id header instead of IP for key (default: true) */
  byUser?: boolean;
}

export function createRateLimit(config: RateLimitConfig) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = config.byUser !== false ? (req.headers["x-user-id"] as string) : undefined;
    const key = `rl:${config.keyPrefix}:${userId || req.ip || "unknown"}`;
    try {
      const current = await redis.incr(key);
      if (current === 1) await redis.expire(key, config.windowSec);
      if (current > config.max) {
        return res.status(429).json({
          ok: false,
          error: "rate_limited",
          retryAfterSec: config.windowSec,
        });
      }
      return next();
    } catch {
      // Fail-open: if Redis is down, allow the request
      return next();
    }
  };
}

// ── Pre-built limiters ──

/** General API: 120 req/60s per user */
export const apiGeneral = createRateLimit({
  windowSec: 60,
  max: 120,
  keyPrefix: "api",
});

/** Bot creation: 10 req/60s per user */
export const botCreate = createRateLimit({
  windowSec: 60,
  max: 10,
  keyPrefix: "bot-create",
});

/** Exchange submit: 30 req/60s per user */
export const exchangeSubmit = createRateLimit({
  windowSec: 60,
  max: 30,
  keyPrefix: "exchange",
});
