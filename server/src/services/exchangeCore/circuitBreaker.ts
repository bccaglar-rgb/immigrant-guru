/**
 * Circuit Breaker — Per-exchange fault isolation.
 *
 * States:
 *   CLOSED    → normal operation, requests pass through
 *   OPEN      → exchange is failing, all requests rejected immediately
 *   HALF_OPEN → cooldown passed, one test request allowed through
 *
 * State stored in Redis → shared across all Execution Service instances.
 *
 * Thresholds (conservative defaults, tunable via env):
 *   FAILURE_THRESHOLD  = 5 failures in 60s → OPEN
 *   COOLDOWN_SEC       = 30s in OPEN → try HALF_OPEN
 *   SUCCESS_THRESHOLD  = 2 successes in HALF_OPEN → CLOSED
 *
 * Usage:
 *   const cb = new CircuitBreaker("BINANCE");
 *   if (!await cb.canRequest()) throw new Error("Circuit open");
 *   try {
 *     await callExchange();
 *     await cb.recordSuccess();
 *   } catch (err) {
 *     await cb.recordFailure();
 *     throw err;
 *   }
 */

import { redisControl } from "../../db/redis.ts";
import type { ExchangeVenue } from "./exchangeRateLimiter.ts";

type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

const FAILURE_THRESHOLD = Number(process.env.CB_FAILURE_THRESHOLD ?? 5);
const FAILURE_WINDOW_SEC = Number(process.env.CB_FAILURE_WINDOW_SEC ?? 60);
const COOLDOWN_SEC       = Number(process.env.CB_COOLDOWN_SEC ?? 30);
const SUCCESS_THRESHOLD  = Number(process.env.CB_SUCCESS_THRESHOLD ?? 2);

export class CircuitBreaker {
  private venue: ExchangeVenue;
  private keyState:   string;
  private keyFails:   string;
  private keySuccess: string;
  private keyOpenAt:  string;

  constructor(venue: ExchangeVenue) {
    this.venue      = venue;
    this.keyState   = `cb:${venue}:state`;
    this.keyFails   = `cb:${venue}:fails`;
    this.keySuccess = `cb:${venue}:success`;
    this.keyOpenAt  = `cb:${venue}:open_at`;
  }

  /** Returns true if a request should be allowed through. */
  async canRequest(): Promise<boolean> {
    const state = await this.getState();

    if (state === "CLOSED") return true;

    if (state === "OPEN") {
      // Check if cooldown elapsed → transition to HALF_OPEN
      const openAt = await redisControl.get(this.keyOpenAt);
      if (openAt && Date.now() - Number(openAt) >= COOLDOWN_SEC * 1000) {
        await redisControl.set(this.keyState, "HALF_OPEN");
        await redisControl.del(this.keySuccess);
        console.log(`[CircuitBreaker] ${this.venue}: OPEN → HALF_OPEN (cooldown elapsed)`);
        return true; // allow one test request
      }
      return false; // still OPEN
    }

    // HALF_OPEN: allow requests through for testing
    return true;
  }

  /** Record a successful exchange call. */
  async recordSuccess(): Promise<void> {
    const state = await this.getState();

    if (state === "HALF_OPEN") {
      const successes = await redisControl.incr(this.keySuccess);
      if (successes >= SUCCESS_THRESHOLD) {
        await this.reset();
        console.log(`[CircuitBreaker] ${this.venue}: HALF_OPEN → CLOSED (${successes} successes)`);
      }
    }
    // In CLOSED state: successes don't need tracking
  }

  /** Record a failed exchange call. */
  async recordFailure(): Promise<void> {
    const state = await this.getState();

    if (state === "OPEN") return; // already open

    if (state === "HALF_OPEN") {
      // Single failure in HALF_OPEN → back to OPEN
      await this.open();
      console.warn(`[CircuitBreaker] ${this.venue}: HALF_OPEN → OPEN (failure during test)`);
      return;
    }

    // CLOSED: count failures in window
    const fails = await redisControl.incr(this.keyFails);
    if (fails <= 1) {
      await redisControl.expire(this.keyFails, FAILURE_WINDOW_SEC);
    }

    if (fails >= FAILURE_THRESHOLD) {
      await this.open();
      console.warn(`[CircuitBreaker] ${this.venue}: CLOSED → OPEN (${fails} failures in ${FAILURE_WINDOW_SEC}s)`);
    }
  }

  /** Get current state. */
  async getState(): Promise<CircuitState> {
    try {
      const raw = await redisControl.get(this.keyState);
      if (raw === "OPEN" || raw === "HALF_OPEN") return raw;
      return "CLOSED";
    } catch {
      return "CLOSED"; // fail-open on Redis error
    }
  }

  /** Get full status for monitoring. */
  async getStatus(): Promise<{
    venue: ExchangeVenue;
    state: CircuitState;
    failures: number;
    openSinceMs: number | null;
  }> {
    const [state, fails, openAt] = await Promise.all([
      this.getState(),
      redisControl.get(this.keyFails).then((v) => Number(v ?? 0)).catch(() => 0),
      redisControl.get(this.keyOpenAt).then((v) => (v ? Number(v) : null)).catch(() => null),
    ]);
    return {
      venue: this.venue,
      state,
      failures: fails,
      openSinceMs: openAt ? Date.now() - openAt : null,
    };
  }

  // ── Internal ──

  private async open(): Promise<void> {
    await Promise.all([
      redisControl.set(this.keyState, "OPEN"),
      redisControl.set(this.keyOpenAt, String(Date.now())),
      redisControl.del(this.keyFails),
      redisControl.del(this.keySuccess),
    ]);
  }

  private async reset(): Promise<void> {
    await Promise.all([
      redisControl.set(this.keyState, "CLOSED"),
      redisControl.del(this.keyFails),
      redisControl.del(this.keySuccess),
      redisControl.del(this.keyOpenAt),
    ]);
  }
}

// ── Singletons (one per exchange) ───────────────────────────────────────────

export const circuitBreakers: Record<ExchangeVenue, CircuitBreaker> = {
  BINANCE: new CircuitBreaker("BINANCE"),
  BYBIT:   new CircuitBreaker("BYBIT"),
  OKX:     new CircuitBreaker("OKX"),
  GATEIO:  new CircuitBreaker("GATEIO"),
};

/** Get status of all circuit breakers (for /api/metrics). */
export async function getAllCircuitStatus() {
  return Promise.all(Object.values(circuitBreakers).map((cb) => cb.getStatus()));
}
