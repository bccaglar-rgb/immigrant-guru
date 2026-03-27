/**
 * MarketHealth — Centralized per-symbol health state tracking.
 *
 * FAZ 1: Stale + Health System
 *
 * Tracks real-time health of every symbol's market data:
 *   - depth freshness (last update age)
 *   - ticker freshness (last price update age)
 *   - orderbook sync status (sequence gaps)
 *   - data source + confidence
 *
 * Architecture:
 *   - In-memory Map<symbol, SymbolHealth> — zero latency reads
 *   - Updated by: depth ingestion, HubEventBridge, adapter health hooks
 *   - Read by: API routes, Gateway (Pipeline 9), admin endpoints
 *   - 5s sweep timer: checks all tracked symbols for stale transitions
 *
 * Status rules:
 *   healthy:     depthAge < 3s AND tickerAge < 5s AND seqSynced
 *   degraded:    depthAge 3-8s OR !seqSynced OR depthLevels < 5
 *   stale:       depthAge > 8s OR tickerAge > 15s
 *   unavailable: no data OR depthAge > 60s
 */

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export type HealthStatus = "healthy" | "degraded" | "stale" | "unavailable";
export type HealthConfidence = "high" | "medium" | "low";

export interface SymbolHealth {
  symbol: string;
  status: HealthStatus;
  source: string;                // "BINANCE" | "BYBIT" | "OKX" | "GATEIO" | "CACHE" | "NONE"
  depthLevels: number;           // how many bid/ask levels available
  lastDepthUpdateTs: number;     // epoch ms — last depth data written
  lastTickerUpdateTs: number;    // epoch ms — last price/ticker update
  depthAgeMs: number;            // computed on read: now - lastDepthUpdateTs
  tickerAgeMs: number;           // computed on read: now - lastTickerUpdateTs
  confidence: HealthConfidence;
  wsConnected: boolean;          // depth WS stream active?
  seqSynced: boolean;            // orderbook sequence in sync?
  lastStateChangeTs: number;     // when status last changed
}

// ═══════════════════════════════════════════════════════════════════
// THRESHOLDS
// ═══════════════════════════════════════════════════════════════════

const DEPTH_HEALTHY_MS     = 3_000;   // < 3s → healthy
const DEPTH_DEGRADED_MS    = 8_000;   // 3-8s → degraded
const DEPTH_STALE_MS       = 8_000;   // > 8s → stale
const DEPTH_UNAVAILABLE_MS = 60_000;  // > 60s → unavailable
const TICKER_STALE_MS      = 15_000;  // > 15s → stale
const MIN_DEPTH_LEVELS     = 5;       // < 5 levels → degraded
const SWEEP_INTERVAL_MS    = 5_000;   // sweep every 5s

type StatusListener = (symbol: string, prev: HealthStatus, next: HealthStatus, health: SymbolHealth) => void;

// ═══════════════════════════════════════════════════════════════════
// STORE
// ═══════════════════════════════════════════════════════════════════

class SymbolHealthStore {
  private readonly store = new Map<string, SymbolHealth>();
  private sweepTimer: ReturnType<typeof setInterval> | null = null;
  private readonly listeners = new Set<StatusListener>();

  /** Start the periodic sweep timer. Call once at boot. */
  start(): void {
    if (this.sweepTimer) return;
    this.sweepTimer = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
    console.log("[MarketHealth] Started (5s sweep interval)");
  }

  stop(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  /** Subscribe to status transitions. Returns unsubscribe function. */
  onStatusChange(cb: StatusListener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  // ── UPDATE METHODS ──────────────────────────────────────────────

  /** Called after depth data is written to cache. */
  updateDepth(symbol: string, opts: {
    source: string;
    levels: number;
    seqSynced?: boolean;
    wsConnected?: boolean;
  }): void {
    const now = Date.now();
    const existing = this.store.get(symbol);
    const prev: SymbolHealth = existing ?? this.emptyHealth(symbol);

    const updated: SymbolHealth = {
      ...prev,
      symbol,
      source: opts.source,
      depthLevels: opts.levels,
      lastDepthUpdateTs: now,
      depthAgeMs: 0,
      wsConnected: opts.wsConnected ?? prev.wsConnected,
      seqSynced: opts.seqSynced ?? prev.seqSynced,
      // status + confidence recomputed below
      status: prev.status,
      confidence: prev.confidence,
      lastStateChangeTs: prev.lastStateChangeTs,
    };

    this.recomputeStatus(updated);
    this.checkTransition(prev, updated);
    this.store.set(symbol, updated);
  }

  /** Called when a ticker/price event is received. */
  updateTicker(symbol: string, source: string): void {
    const now = Date.now();
    const existing = this.store.get(symbol);
    const prev: SymbolHealth = existing ?? this.emptyHealth(symbol);

    const updated: SymbolHealth = {
      ...prev,
      symbol,
      source: prev.source === "NONE" ? source : prev.source,
      lastTickerUpdateTs: now,
      tickerAgeMs: 0,
      status: prev.status,
      confidence: prev.confidence,
      lastStateChangeTs: prev.lastStateChangeTs,
    };

    this.recomputeStatus(updated);
    this.checkTransition(prev, updated);
    this.store.set(symbol, updated);
  }

  /** Called when sequence sync state changes (gap detected / resync complete). */
  updateSeqSync(symbol: string, synced: boolean): void {
    const existing = this.store.get(symbol);
    if (!existing) return;
    const prev = { ...existing };
    existing.seqSynced = synced;
    this.recomputeStatus(existing);
    this.checkTransition(prev, existing);
  }

  /** Called when WS connection state changes for this symbol's adapter. */
  updateWsState(symbol: string, connected: boolean): void {
    const existing = this.store.get(symbol);
    if (!existing) return;
    existing.wsConnected = connected;
  }

  // ── READ METHODS ────────────────────────────────────────────────

  /** Get health for a single symbol (ages recomputed on read). */
  getHealth(symbol: string): SymbolHealth | null {
    const entry = this.store.get(symbol);
    if (!entry) return null;
    const now = Date.now();
    entry.depthAgeMs = entry.lastDepthUpdateTs > 0 ? now - entry.lastDepthUpdateTs : -1;
    entry.tickerAgeMs = entry.lastTickerUpdateTs > 0 ? now - entry.lastTickerUpdateTs : -1;
    return entry;
  }

  /** Get all tracked symbols' health. */
  getAllHealth(): SymbolHealth[] {
    const now = Date.now();
    const result: SymbolHealth[] = [];
    for (const entry of Array.from(this.store.values())) {
      entry.depthAgeMs = entry.lastDepthUpdateTs > 0 ? now - entry.lastDepthUpdateTs : -1;
      entry.tickerAgeMs = entry.lastTickerUpdateTs > 0 ? now - entry.lastTickerUpdateTs : -1;
      result.push(entry);
    }
    return result;
  }

  /** Aggregate stats for admin dashboard. */
  getAggregateStats(): {
    total: number;
    healthy: number;
    degraded: number;
    stale: number;
    unavailable: number;
    avgDepthAgeMs: number;
    avgTickerAgeMs: number;
  } {
    const now = Date.now();
    let healthy = 0, degraded = 0, stale = 0, unavailable = 0;
    let depthAgeSum = 0, depthAgeCount = 0;
    let tickerAgeSum = 0, tickerAgeCount = 0;

    for (const entry of Array.from(this.store.values())) {
      // Recompute ages for fresh stats
      entry.depthAgeMs = entry.lastDepthUpdateTs > 0 ? now - entry.lastDepthUpdateTs : -1;
      entry.tickerAgeMs = entry.lastTickerUpdateTs > 0 ? now - entry.lastTickerUpdateTs : -1;

      switch (entry.status) {
        case "healthy": healthy++; break;
        case "degraded": degraded++; break;
        case "stale": stale++; break;
        case "unavailable": unavailable++; break;
      }
      if (entry.depthAgeMs >= 0) { depthAgeSum += entry.depthAgeMs; depthAgeCount++; }
      if (entry.tickerAgeMs >= 0) { tickerAgeSum += entry.tickerAgeMs; tickerAgeCount++; }
    }

    return {
      total: this.store.size,
      healthy, degraded, stale, unavailable,
      avgDepthAgeMs: depthAgeCount > 0 ? Math.round(depthAgeSum / depthAgeCount) : -1,
      avgTickerAgeMs: tickerAgeCount > 0 ? Math.round(tickerAgeSum / tickerAgeCount) : -1,
    };
  }

  // ── INTERNAL ────────────────────────────────────────────────────

  /** Periodic sweep — recompute all statuses based on age. */
  private sweep(): void {
    const now = Date.now();
    for (const entry of Array.from(this.store.values())) {
      const prev: SymbolHealth = { ...entry };
      entry.depthAgeMs = entry.lastDepthUpdateTs > 0 ? now - entry.lastDepthUpdateTs : -1;
      entry.tickerAgeMs = entry.lastTickerUpdateTs > 0 ? now - entry.lastTickerUpdateTs : -1;
      this.recomputeStatus(entry);
      this.checkTransition(prev, entry);
    }
  }

  /** Recompute status + confidence from current fields. */
  private recomputeStatus(h: SymbolHealth): void {
    const now = Date.now();
    const depthAge = h.lastDepthUpdateTs > 0 ? now - h.lastDepthUpdateTs : Infinity;
    const tickerAge = h.lastTickerUpdateTs > 0 ? now - h.lastTickerUpdateTs : Infinity;

    // Status computation
    if (depthAge === Infinity && tickerAge === Infinity) {
      h.status = "unavailable";
    } else if (depthAge > DEPTH_UNAVAILABLE_MS) {
      h.status = "unavailable";
    } else if (depthAge > DEPTH_STALE_MS || tickerAge > TICKER_STALE_MS) {
      h.status = "stale";
    } else if (depthAge > DEPTH_HEALTHY_MS || !h.seqSynced || h.depthLevels < MIN_DEPTH_LEVELS) {
      h.status = "degraded";
    } else {
      h.status = "healthy";
    }

    // Confidence computation
    const primarySource = ["BINANCE", "BYBIT", "BINANCE_WS"].includes(h.source);
    if (h.status === "healthy" && primarySource && h.depthLevels >= 15) {
      h.confidence = "high";
    } else if ((h.status === "healthy" || h.status === "degraded") && h.depthLevels >= 5) {
      h.confidence = "medium";
    } else {
      h.confidence = "low";
    }
  }

  /** Detect status transition and notify listeners. */
  private checkTransition(prev: SymbolHealth, next: SymbolHealth): void {
    if (prev.status !== next.status) {
      next.lastStateChangeTs = Date.now();
      // Log significant transitions
      if (next.status === "stale" || next.status === "unavailable" ||
          (prev.status === "stale" && next.status === "healthy")) {
        console.log(
          `[MarketHealth] ${next.symbol}: ${prev.status} → ${next.status}` +
          ` (depth=${next.depthAgeMs}ms, ticker=${next.tickerAgeMs}ms, levels=${next.depthLevels}, src=${next.source})`
        );
      }
      // Notify listeners (Gateway Pipeline 9 etc.)
      for (const cb of Array.from(this.listeners)) {
        try { cb(next.symbol, prev.status, next.status, next); }
        catch { /* listener error — best effort */ }
      }
    }
  }

  private emptyHealth(symbol: string): SymbolHealth {
    return {
      symbol,
      status: "unavailable",
      source: "NONE",
      depthLevels: 0,
      lastDepthUpdateTs: 0,
      lastTickerUpdateTs: 0,
      depthAgeMs: -1,
      tickerAgeMs: -1,
      confidence: "low",
      wsConnected: false,
      seqSynced: false,
      lastStateChangeTs: Date.now(),
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// SINGLETON
// ═══════════════════════════════════════════════════════════════════

export const marketHealth = new SymbolHealthStore();
