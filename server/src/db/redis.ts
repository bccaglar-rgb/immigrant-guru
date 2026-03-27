import Redis from "ioredis";

// ── Base connection options ──────────────────────────────────
const baseOpts = {
  host: process.env.REDIS_HOST ?? "127.0.0.1",
  port: Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: 3,
  retryStrategy(times: number) {
    if (times > 10) return null; // stop retrying
    return Math.min(times * 200, 3000);
  },
  lazyConnect: false,
} as const;

// ── 3 Logical Redis Connections ──────────────────────────────
// Separated by DB index (0, 1, 2) so they can later move to separate hosts.
// In single-Redis setups, all three share the same server.
// In multi-Redis setups, override via REDIS_QUEUE_HOST / REDIS_CONTROL_HOST.

/**
 * DB 0 — Cache + Pub/Sub + Features + Market Data
 * Policy: allkeys-lru (eviction OK, data is re-fetchable)
 * Usage: feature snapshots, universe data, ticker cache, pub/sub bridge,
 *        probe state, position tracker, symbol registry, signal cache
 */
export const redis = new Redis({ ...baseOpts, db: 0 });
export const redisCache = redis; // alias for clarity in new code

/**
 * DB 1 — Job Queue (BullMQ)
 * Policy: noeviction (queue data must NOT be evicted)
 * Usage: bot scheduler jobs, dead letter queue
 * Separate host support: REDIS_QUEUE_HOST / REDIS_QUEUE_PORT
 */
export const redisQueue = new Redis({
  ...baseOpts,
  host: process.env.REDIS_QUEUE_HOST ?? process.env.REDIS_HOST ?? "127.0.0.1",
  port: Number(process.env.REDIS_QUEUE_PORT ?? process.env.REDIS_PORT ?? 6379),
  password: (process.env.REDIS_QUEUE_PASSWORD ?? process.env.REDIS_PASSWORD) || undefined,
  db: process.env.REDIS_QUEUE_HOST ? 0 : 1, // separate host → db 0, same host → db 1
});

/**
 * DB 2 — Control Plane (Kill Switch, Sessions, Rate Limits, Circuit Breaker)
 * Policy: noeviction (control state must NOT be evicted)
 * Usage: kill switch, circuit breaker, rate limiter, intent dedup,
 *        API rate limit, auth sessions, JWT tokens, policy cooldowns
 * Separate host support: REDIS_CONTROL_HOST / REDIS_CONTROL_PORT
 */
export const redisControl = new Redis({
  ...baseOpts,
  host: process.env.REDIS_CONTROL_HOST ?? process.env.REDIS_HOST ?? "127.0.0.1",
  port: Number(process.env.REDIS_CONTROL_PORT ?? process.env.REDIS_PORT ?? 6379),
  password: (process.env.REDIS_CONTROL_PASSWORD ?? process.env.REDIS_PASSWORD) || undefined,
  db: process.env.REDIS_CONTROL_HOST ? 0 : 2, // separate host → db 0, same host → db 2
});

// ── Connection Logging ──────────────────────────────────────
redis.on("error", (err) => console.error("[redis:cache] Connection error:", err.message));
redis.on("connect", () => console.log("[redis:cache] Connected (db 0)"));

redisQueue.on("error", (err) => console.error("[redis:queue] Connection error:", err.message));
redisQueue.on("connect", () => console.log("[redis:queue] Connected (db 1)"));

redisControl.on("error", (err) => console.error("[redis:control] Connection error:", err.message));
redisControl.on("connect", () => console.log("[redis:control] Connected (db 2)"));

/**
 * Quick connectivity check for all 3 Redis connections — called once at boot.
 */
export async function ensureRedisConnection(): Promise<void> {
  const [pCache, pQueue, pControl] = await Promise.all([
    redis.ping(),
    redisQueue.ping(),
    redisControl.ping(),
  ]);
  if (pCache !== "PONG") throw new Error(`Redis cache ping failed: ${pCache}`);
  if (pQueue !== "PONG") throw new Error(`Redis queue ping failed: ${pQueue}`);
  if (pControl !== "PONG") throw new Error(`Redis control ping failed: ${pControl}`);
  console.log("[redis] All 3 connections verified — cache/queue/control PONG");
}

/**
 * BullMQ connection config — uses queue Redis instance.
 * BullMQ requires its own connection objects (not ioredis instances).
 */
export function getBullMQConnection() {
  return {
    host: process.env.REDIS_QUEUE_HOST ?? process.env.REDIS_HOST ?? "127.0.0.1",
    port: Number(process.env.REDIS_QUEUE_PORT ?? process.env.REDIS_PORT ?? 6379),
    password: (process.env.REDIS_QUEUE_PASSWORD ?? process.env.REDIS_PASSWORD) || undefined,
    db: process.env.REDIS_QUEUE_HOST ? 0 : 1,
    maxRetriesPerRequest: null as null, // BullMQ requires this
  };
}
