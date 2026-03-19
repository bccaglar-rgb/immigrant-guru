/**
 * ExchangeTimeSync — Maintains clock offset between local server and exchange servers.
 *
 * Binance signed requests require a timestamp within recvWindow (default 10s).
 * If the local clock drifts, orders get rejected with "Timestamp outside recvWindow".
 *
 * Syncs every 60s per venue. Stores offset in Redis for cross-worker access.
 */
import { redis } from "../../db/redis.ts";
import type { CoreVenue } from "./types.ts";

const SYNC_INTERVAL_MS = 60_000;
const DRIFT_WARNING_MS = 500; // warn if drift exceeds 500ms

const offsetKey = (venue: CoreVenue): string => `timesync:${venue}:offset_ms`;

export interface TimeSyncStatus {
  venue: CoreVenue;
  offsetMs: number;
  driftMs: number;
  lastSyncedAt: string;
  isDangerous: boolean;
}

export class ExchangeTimeSync {
  private offsets: Map<CoreVenue, number> = new Map();
  private lastSynced: Map<CoreVenue, string> = new Map();
  private timers: ReturnType<typeof setInterval>[] = [];

  /** Get timestamp adjusted for exchange server time. */
  getAdjustedTimestamp(venue: CoreVenue): number {
    const offset = this.offsets.get(venue) ?? 0;
    return Date.now() + offset;
  }

  /** Check if clock drift is dangerously high. */
  isDriftDangerous(venue: CoreVenue): boolean {
    const offset = this.offsets.get(venue) ?? 0;
    return Math.abs(offset) > DRIFT_WARNING_MS;
  }

  /** Get status for all synced venues. */
  getStatus(): TimeSyncStatus[] {
    const result: TimeSyncStatus[] = [];
    for (const [venue, offset] of this.offsets) {
      result.push({
        venue,
        offsetMs: offset,
        driftMs: Math.abs(offset),
        lastSyncedAt: this.lastSynced.get(venue) ?? "",
        isDangerous: Math.abs(offset) > DRIFT_WARNING_MS,
      });
    }
    return result;
  }

  /** Start background sync for supported venues. */
  start(): void {
    const venues: CoreVenue[] = ["BINANCE", "GATEIO", "BYBIT", "OKX"];
    for (const venue of venues) {
      // Immediate first sync
      void this.sync(venue);
      // Periodic sync
      const timer = setInterval(() => void this.sync(venue), SYNC_INTERVAL_MS);
      this.timers.push(timer);
    }
    console.log("[ExchangeTimeSync] Started (60s interval per venue)");
  }

  stop(): void {
    for (const timer of this.timers) clearInterval(timer);
    this.timers = [];
  }

  /** Sync with a specific exchange and update offset. */
  async sync(venue: CoreVenue): Promise<{ offsetMs: number; driftMs: number } | null> {
    try {
      const localBefore = Date.now();
      let serverTime: number;

      if (venue === "BINANCE") {
        serverTime = await this.fetchBinanceServerTime();
      } else if (venue === "GATEIO") {
        serverTime = await this.fetchGateServerTime();
      } else if (venue === "BYBIT") {
        serverTime = await this.fetchBybitServerTime();
      } else if (venue === "OKX") {
        serverTime = await this.fetchOkxServerTime();
      } else {
        return null;
      }

      const localAfter = Date.now();
      // Estimate one-way latency as half the round-trip
      const latency = (localAfter - localBefore) / 2;
      const localMidpoint = localBefore + latency;
      const offset = serverTime - localMidpoint;

      this.offsets.set(venue, offset);
      this.lastSynced.set(venue, new Date().toISOString());

      // Store in Redis for other workers
      await redis.set(offsetKey(venue), String(offset), "EX", 120);

      const drift = Math.abs(offset);
      if (drift > DRIFT_WARNING_MS) {
        console.warn(`[ExchangeTimeSync] ${venue} drift ${drift}ms (offset ${offset}ms) — DANGEROUS`);
      }

      return { offsetMs: offset, driftMs: drift };
    } catch (err: any) {
      console.error(`[ExchangeTimeSync] ${venue} sync failed:`, err?.message);

      // Try loading from Redis (another worker may have synced)
      try {
        const cached = await redis.get(offsetKey(venue));
        if (cached != null) {
          this.offsets.set(venue, Number(cached));
        }
      } catch { /* best effort */ }

      return null;
    }
  }

  // ── Exchange Server Time Fetch ────────────────────────────────

  private async fetchBinanceServerTime(): Promise<number> {
    const res = await fetch("https://fapi.binance.com/fapi/v1/time");
    if (!res.ok) throw new Error(`Binance time API ${res.status}`);
    const data = (await res.json()) as { serverTime: number };
    return data.serverTime;
  }

  private async fetchGateServerTime(): Promise<number> {
    // Gate.io doesn't have a dedicated time endpoint; use headers from a lightweight call
    const res = await fetch("https://fx-api.gateio.ws/api/v4/futures/usdt/contracts/BTC_USDT");
    if (!res.ok) throw new Error(`Gate.io API ${res.status}`);
    // Use Date header as server time approximation
    const dateHeader = res.headers.get("date");
    if (dateHeader) {
      return new Date(dateHeader).getTime();
    }
    // Fallback: use local time (no offset)
    return Date.now();
  }

  private async fetchBybitServerTime(): Promise<number> {
    const res = await fetch("https://api.bybit.com/v5/market/time");
    if (!res.ok) throw new Error(`Bybit time API ${res.status}`);
    const data = (await res.json()) as { result: { timeSecond: string; timeNano: string } };
    return Number(data.result.timeSecond) * 1000;
  }

  private async fetchOkxServerTime(): Promise<number> {
    const res = await fetch("https://www.okx.com/api/v5/public/time");
    if (!res.ok) throw new Error(`OKX time API ${res.status}`);
    const data = (await res.json()) as { data: Array<{ ts: string }> };
    return Number(data.data?.[0]?.ts ?? Date.now());
  }
}
