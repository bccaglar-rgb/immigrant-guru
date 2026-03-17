/**
 * Feature Freshness — Tracks when the shared feature cache was last refreshed.
 *
 * Bot workers check this before making decisions. If features are stale
 * (>120s old), bots skip trading to avoid acting on outdated data.
 */
import { redis } from "../../db/redis.ts";

const FRESHNESS_KEY = "bot:features:last_refresh";
const FRESHNESS_TTL_SEC = 180; // 3 min (engine refreshes every 60s, TTL is safety margin)

/** Mark features as freshly refreshed (called by Worker 0 after engine refresh). */
export async function markFeaturesRefreshed(): Promise<void> {
  await redis.set(FRESHNESS_KEY, String(Date.now()), "EX", FRESHNESS_TTL_SEC);
}

/** Get age of features in milliseconds. Returns Infinity if key missing. */
export async function getFeaturesAge(): Promise<number> {
  const ts = await redis.get(FRESHNESS_KEY);
  if (!ts) return Infinity;
  return Date.now() - Number(ts);
}

/** Check if features are stale (older than maxAgeMs, default 120s). */
export async function areFeaturesStale(maxAgeMs = 120_000): Promise<boolean> {
  return (await getFeaturesAge()) > maxAgeMs;
}
