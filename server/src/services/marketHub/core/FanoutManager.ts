/**
 * FanoutManager — throttled broadcast to N consumers.
 *
 * 1 upstream event → N downstream consumers.
 * Per-channel throttle prevents flooding clients with depth updates (20+/sec).
 *
 * Usage:
 *   fanout.addConsumer("ws-client-123", (event) => ws.send(event));
 *   fanout.broadcast(depthEvent); // throttled to 100ms for depth
 */

import type { NormalizedEvent } from "../types.ts";
import type { IFanoutManager, FanoutStats } from "../contracts/HubModels.ts";
import type { SubscriptionChannel } from "../contracts/ExchangeAdapter.ts";

interface ThrottleState {
  lastBroadcastAt: number;
  pending: NormalizedEvent | null;
  timer: ReturnType<typeof setTimeout> | null;
}

export class FanoutManager implements IFanoutManager {
  private readonly consumers = new Map<string, (event: NormalizedEvent) => void>();
  private readonly throttles = new Map<SubscriptionChannel, number>(); // channel → intervalMs
  private readonly throttleState = new Map<string, ThrottleState>(); // channel:symbol → state
  private eventsCount = 0;
  private droppedCount = 0;
  private lastStatsResetAt = Date.now();

  constructor() {
    // Default throttles
    this.throttles.set("depth", 100);    // depth: max 10/sec per symbol
    this.throttles.set("ticker", 200);   // ticker: max 5/sec per symbol
    this.throttles.set("trade", 0);      // trade: no throttle (latency matters)
    this.throttles.set("kline", 0);      // kline: no throttle (low frequency)
  }

  broadcast(event: NormalizedEvent): void {
    this.eventsCount += 1;
    const channel = this.eventToChannel(event.type);
    const throttleMs = this.throttles.get(channel) ?? 0;

    if (throttleMs <= 0) {
      this.broadcastToAll(event);
      return;
    }

    // Throttled broadcast
    const key = `${channel}:${event.symbol}`;
    let state = this.throttleState.get(key);
    if (!state) {
      state = { lastBroadcastAt: 0, pending: null, timer: null };
      this.throttleState.set(key, state);
    }

    const now = Date.now();
    const elapsed = now - state.lastBroadcastAt;

    if (elapsed >= throttleMs) {
      // Enough time passed — broadcast immediately
      state.lastBroadcastAt = now;
      state.pending = null;
      this.broadcastToAll(event);
    } else {
      // Throttled — store latest, schedule flush
      this.droppedCount += 1;
      state.pending = event;
      if (!state.timer) {
        const remaining = throttleMs - elapsed;
        state.timer = setTimeout(() => {
          state!.timer = null;
          if (state!.pending) {
            state!.lastBroadcastAt = Date.now();
            const pending = state!.pending;
            state!.pending = null;
            this.broadcastToAll(pending);
          }
        }, remaining);
      }
    }
  }

  addConsumer(consumerId: string, cb: (event: NormalizedEvent) => void): () => void {
    this.consumers.set(consumerId, cb);
    return () => this.consumers.delete(consumerId);
  }

  removeConsumer(consumerId: string): void {
    this.consumers.delete(consumerId);
  }

  setThrottle(channel: SubscriptionChannel, intervalMs: number): void {
    this.throttles.set(channel, Math.max(0, intervalMs));
  }

  getConsumerCount(): number {
    return this.consumers.size;
  }

  getStats(): FanoutStats {
    const now = Date.now();
    const windowMs = Math.max(1, now - this.lastStatsResetAt);
    const stats: FanoutStats = {
      consumerCount: this.consumers.size,
      eventsPerSecond: Math.round((this.eventsCount / windowMs) * 1000),
      droppedPerSecond: Math.round((this.droppedCount / windowMs) * 1000),
      broadcastLatencyMs: 0, // Could be measured if needed
    };
    // Reset counters
    this.eventsCount = 0;
    this.droppedCount = 0;
    this.lastStatsResetAt = now;
    return stats;
  }

  private broadcastToAll(event: NormalizedEvent): void {
    for (const cb of this.consumers.values()) {
      try {
        cb(event);
      } catch {
        // Consumer error — don't crash fanout
      }
    }
  }

  private eventToChannel(type: string): SubscriptionChannel {
    if (type === "trade") return "trade";
    if (type === "kline") return "kline";
    if (type.includes("book") || type.includes("depth")) return "depth";
    return "ticker";
  }
}
