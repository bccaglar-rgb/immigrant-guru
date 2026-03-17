/**
 * Global Tick Orchestrator
 *
 * Single source of truth for all periodic ticks in the system.
 * Runs ONLY on IS_PRIMARY (Worker 0). Publishes to Redis pub/sub channels
 * so all workers on any machine stay in sync — no drift, no duplicate timers.
 *
 * Channels:
 *   tick:1s   → position sync, staleness check
 *   tick:5s   → signal compute, feature cache refresh trigger
 *   tick:60s  → scanner cycle, rr update
 *   tick:24h  → optimization run
 *
 * Workers subscribe via subscribeToTick(). They never open their own setInterval.
 *
 * Rule: if orchestrator is down → workers wait, do not self-trigger.
 */

import { redis } from "../db/redis.ts";
import Redis from "ioredis";

export type TickChannel = "tick:1s" | "tick:5s" | "tick:60s" | "tick:24h";

const TICK_INTERVALS: Record<TickChannel, number> = {
  "tick:1s":  1_000,
  "tick:5s":  5_000,
  "tick:60s": 60_000,
  "tick:24h": 24 * 60 * 60 * 1_000,
};

// ── Publisher ────────────────────────────────────────────────────────────────

class TickOrchestrator {
  private timers: Map<TickChannel, ReturnType<typeof setInterval>> = new Map();
  private started = false;

  start(): void {
    if (this.started) return;
    this.started = true;

    for (const [channel, intervalMs] of Object.entries(TICK_INTERVALS) as [TickChannel, number][]) {
      const timer = setInterval(() => {
        const payload = JSON.stringify({ ts: Date.now(), channel });
        redis.publish(channel, payload).catch((err) => {
          console.error(`[TickOrchestrator] publish ${channel} failed:`, err?.message ?? err);
        });
      }, intervalMs);

      this.timers.set(channel, timer);
    }

    console.log("[TickOrchestrator] Started — channels:", Object.keys(TICK_INTERVALS).join(", "));
  }

  stop(): void {
    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }
    this.timers.clear();
    this.started = false;
    console.log("[TickOrchestrator] Stopped");
  }
}

export const tickOrchestrator = new TickOrchestrator();

// ── Subscriber helper ────────────────────────────────────────────────────────

/**
 * Subscribe to one or more tick channels.
 * Returns an unsubscribe function.
 *
 * Usage:
 *   const unsub = subscribeToTick(["tick:60s"], () => doWork());
 *   // later: unsub();
 */
export function subscribeToTick(
  channels: TickChannel[],
  handler: (channel: TickChannel, ts: number) => void,
): () => void {
  // Each subscriber gets its own Redis connection (ioredis subscriber mode)
  const sub = new Redis({
    host: process.env.REDIS_HOST ?? "127.0.0.1",
    port: Number(process.env.REDIS_PORT ?? 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
    lazyConnect: false,
  });

  sub.subscribe(...channels).catch((err) => {
    console.error("[TickOrchestrator] subscribe failed:", err?.message ?? err);
  });

  sub.on("message", (ch: string, msg: string) => {
    if (!channels.includes(ch as TickChannel)) return;
    try {
      const { ts } = JSON.parse(msg) as { ts: number; channel: string };
      handler(ch as TickChannel, ts);
    } catch {
      // malformed message — ignore
    }
  });

  sub.on("error", (err) => {
    console.error("[TickOrchestrator] subscriber error:", err?.message ?? err);
  });

  return () => {
    sub.unsubscribe(...channels).catch(() => {});
    sub.disconnect();
  };
}
