/**
 * BaseAdapter — Shared transport layer for all exchange adapters.
 *
 * SCOPE (transport-level only):
 *  - WS connection lifecycle (connect, reconnect with exp backoff + jitter, close)
 *  - Heartbeat + watchdog (stale detection → auto reconnect)
 *  - Safe send (socket open check, serialize, error catch)
 *  - Per-channel subscription bookkeeping (sets/maps + auto-resubscribe on reconnect)
 *  - Data store helpers (patchSnapshot, upsertCandle, appendRecentTrade)
 *  - Health score foundation (base scoring + adapter hook for exchange-specific adjustments)
 *  - Event emission to Hub
 *  - Static utilities (toText, toNum, toMs, asRecord, normalizeLevelRows)
 *
 * NOT IN SCOPE (stays in Hub or adapter):
 *  - Fallback decisions (WS vs REST vs cache)
 *  - Rate limit policy
 *  - Cache / Redis
 *  - Fanout / broadcast
 *  - Symbol priority
 *  - Orderbook snapshot sanity (adapter manages its own timer + REST calls)
 *
 * Each exchange adapter extends this class and implements the abstract hooks.
 * The existing adapters (BinanceFuturesMarketAdapter etc.) are NOT modified —
 * they continue working as-is. Future steps will migrate them to extend BaseAdapter.
 */

import WebSocket from "ws";
import type {
  MarketExchangeId,
  AdapterHealthSnapshot,
  AdapterSymbolSnapshot,
  AdapterCandlePoint,
  AdapterTradePoint,
  NormalizedEvent,
  NormalizedBookDeltaEvent,
} from "./types.ts";
import type {
  IExchangeAdapter,
  SubscriptionChannel,
  SubscribeParams,
} from "./contracts/ExchangeAdapter.ts";
import type {
  ConnectionState,
  AdapterPolicy,
  OrderbookSnapshot,
} from "./contracts/HubModels.ts";
import { SequenceSafeOrderbookStore } from "./sequenceSafeOrderbook.ts";

// ═══════════════════════════════════════════════════════════════════
// STATIC UTILITIES — shared across all adapters
// ═══════════════════════════════════════════════════════════════════

/** Convert WebSocket.RawData → string */
export function toText(raw: WebSocket.RawData): string {
  if (typeof raw === "string") return raw;
  if (Buffer.isBuffer(raw)) return raw.toString("utf8");
  if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString("utf8");
  if (Array.isArray(raw)) return Buffer.concat(raw).toString("utf8");
  return String(raw ?? "");
}

/** Safe number parse — returns null for NaN/Infinity */
export function toNum(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Convert timestamp to milliseconds (auto-detect seconds vs ms) */
export function toMs(value: unknown): number | null {
  const n = toNum(value);
  if (n === null || n <= 0) return null;
  return n < 1_000_000_000_000 ? Math.round(n * 1000) : Math.round(n);
}

/** Safe cast to Record */
export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Safe cast to Record[] — unwraps single objects and arrays */
export function asRecordList(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value
      .map((item) => asRecord(item))
      .filter((item): item is Record<string, unknown> => Boolean(item));
  }
  const one = asRecord(value);
  return one ? [one] : [];
}

/** Parse orderbook level rows from various exchange formats */
export function normalizeLevelRows(input: unknown): Array<[number, number]> {
  if (!Array.isArray(input)) return [];
  const out: Array<[number, number]> = [];
  for (const row of input) {
    if (Array.isArray(row) && row.length >= 2) {
      const price = Number(row[0]);
      const qty = Number(row[1]);
      if (Number.isFinite(price) && price > 0 && Number.isFinite(qty)) {
        out.push([price, Math.max(0, qty)]);
      }
      continue;
    }
    if (typeof row === "object" && row) {
      const rec = row as Record<string, unknown>;
      const price = toNum(rec.p ?? rec.price);
      const qty = toNum(rec.s ?? rec.size ?? rec.q ?? rec.amount);
      if (price !== null && price > 0 && qty !== null) {
        out.push([price, Math.max(0, qty)]);
      }
    }
  }
  return out;
}

/** Extract sequence number from a payload, trying multiple key names */
export function seqFrom(payload: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const n = toNum(payload[key]);
    if (n !== null) return n;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════
// WATCHDOG TICK — fixed interval for all adapters
// ═══════════════════════════════════════════════════════════════════

const WATCHDOG_TICK_MS = 5_000;
const DEFAULT_CANDLE_STORE_MAX = 900;
const DEFAULT_TRADE_STORE_MAX = 400;
const DEFAULT_DELTA_BUFFER_MAX = 400;
const REASON_LOG_MAX = 30;

// ═══════════════════════════════════════════════════════════════════
// BASE ADAPTER
// ═══════════════════════════════════════════════════════════════════

export abstract class BaseAdapter implements IExchangeAdapter {
  abstract readonly exchange: MarketExchangeId;
  abstract readonly policy: AdapterPolicy;

  // ── Connection State ──────────────────────────────────────────
  protected ws: WebSocket | null = null;
  protected wsUrlIndex = 0;
  protected started = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;

  // ── Event Listeners ───────────────────────────────────────────
  private readonly listeners = new Set<(event: NormalizedEvent) => void>();

  // ── Subscription Bookkeeping ──────────────────────────────────
  // These sets track what's subscribed for reconnect resubscribe.
  // Hub's SubscriptionManager owns ref counting; these are adapter-local.
  protected readonly tickerSubs = new Set<string>();
  protected readonly depthSubs = new Map<string, number>();          // symbol → levels
  protected readonly klineSubs = new Map<string, Set<string>>();     // symbol → intervals
  protected readonly tradeSubs = new Set<string>();
  protected readonly allSymbols = new Set<string>();                 // union of all subscribed symbols

  // ── Data Stores ───────────────────────────────────────────────
  protected readonly snapshots = new Map<string, AdapterSymbolSnapshot>();
  protected readonly candlesBySymbol = new Map<string, Map<string, AdapterCandlePoint[]>>();
  protected readonly recentTradesBySymbol = new Map<string, AdapterTradePoint[]>();

  // ── Orderbook Store ───────────────────────────────────────────
  // Shared across all adapters. Adapter manages snapshot lifecycle.
  protected readonly orderbooks = new SequenceSafeOrderbookStore();
  protected readonly deltaBufferBySymbol = new Map<string, NormalizedBookDeltaEvent[]>();
  protected readonly pendingSnapshotSymbols = new Set<string>();
  protected readonly lastBookDeltaAtBySymbol = new Map<string, number>();
  protected readonly lastSnapshotAtBySymbol = new Map<string, number>();

  // ── Health Metrics ────────────────────────────────────────────
  protected lastMessageAt = 0;
  protected lastError: string | null = null;
  protected reconnectCount = 0;
  protected resyncCount = 0;
  protected gapCount = 0;
  protected latencyEmaMs: number | null = null;
  protected readonly reasons: string[] = [];

  // ══════════════════════════════════════════════════════════════
  //  LIFECYCLE
  // ══════════════════════════════════════════════════════════════

  start(): void {
    if (this.started) return;
    this.started = true;
    this.connect();
    this.startHeartbeat();
    this.startWatchdog();
    this.onStarted();
  }

  stop(): void {
    this.started = false;
    this.clearTimers();
    this.closeWs();
    this.onStopped();
  }

  // ══════════════════════════════════════════════════════════════
  //  WS CONNECTION
  // ══════════════════════════════════════════════════════════════

  protected connect(): void {
    if (!this.started) return;
    this.closeWs();

    const urls = this.getWsUrls();
    if (!urls.length) return;
    const url = urls[this.wsUrlIndex % urls.length]!;

    const ws = new WebSocket(url, { handshakeTimeout: 10_000 });
    this.ws = ws;

    ws.on("open", () => {
      this.reconnectAttempts = 0;
      this.lastError = null;
      this.touchMessage(Date.now());
      this.pushReason("ws_open");
      this.resubscribeAll();
      this.onConnected();
    });

    ws.on("message", (raw) => {
      this.handleRawMessage(raw);
    });

    ws.on("pong", () => {
      this.touchMessage(Date.now());
    });

    ws.on("close", () => {
      if (!this.started) return;
      this.pushReason("ws_close");
      this.onDisconnected();
      this.scheduleReconnect();
    });

    ws.on("error", (error) => {
      if (!this.started) return;
      this.lastError = error instanceof Error ? error.message : "ws_error";
      this.pushReason(`ws_error:${this.lastError}`);
      this.scheduleReconnect();
    });
  }

  protected scheduleReconnect(): void {
    if (!this.started || this.reconnectTimer) return;
    this.reconnectAttempts += 1;
    this.reconnectCount += 1;
    const urls = this.getWsUrls();
    if (urls.length > 1) {
      this.wsUrlIndex = (this.wsUrlIndex + 1) % urls.length;
    }
    const waitMs = this.computeBackoff(this.reconnectAttempts);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, waitMs);
  }

  private computeBackoff(attempt: number): number {
    const { reconnectBaseMs, reconnectMaxMs, reconnectJitterMs } = this.policy;
    const expo = Math.round(reconnectBaseMs * Math.pow(2, Math.max(0, attempt - 1)));
    const jitter = Math.floor(Math.random() * reconnectJitterMs);
    return Math.min(reconnectMaxMs, expo + jitter);
  }

  // ══════════════════════════════════════════════════════════════
  //  HEARTBEAT & WATCHDOG
  // ══════════════════════════════════════════════════════════════

  private startHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      if (!this.isWsOpen()) return;
      this.onHeartbeatTick();
    }, this.policy.heartbeatIntervalMs);
  }

  private startWatchdog(): void {
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
    this.watchdogTimer = setInterval(() => {
      if (!this.started) return;
      const ageMs = this.lastMessageAt > 0
        ? Date.now() - this.lastMessageAt
        : Number.POSITIVE_INFINITY;
      if (ageMs <= this.policy.watchdogStaleMs) return;
      this.pushReason(`watchdog_reconnect_${Math.round(ageMs)}ms`);
      this.closeWs();
      // closeWs doesn't trigger reconnect — watchdog should
      this.scheduleReconnect();
    }, WATCHDOG_TICK_MS);
  }

  // ══════════════════════════════════════════════════════════════
  //  SAFE SEND
  // ══════════════════════════════════════════════════════════════

  /** Send data over WS. Returns false if socket not open or send failed. */
  protected safeSend(data: unknown): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    try {
      this.ws.send(typeof data === "string" ? data : JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  /** Send WS ping. Returns false if socket not open. */
  protected safePing(): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    try {
      this.ws.ping();
      return true;
    } catch {
      return false;
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  SUBSCRIPTION BOOKKEEPING
  // ══════════════════════════════════════════════════════════════

  subscribeTicker(symbol: string): void {
    const s = this.toBitriumSymbol(symbol) || symbol;
    if (this.tickerSubs.has(s)) return;
    this.tickerSubs.add(s);
    this.allSymbols.add(s);
    const frame = this.buildSubscribeFrame("ticker", s);
    if (frame) this.safeSend(frame);
  }

  unsubscribeTicker(symbol: string): void {
    const s = this.toBitriumSymbol(symbol) || symbol;
    if (!this.tickerSubs.delete(s)) return;
    const frame = this.buildUnsubscribeFrame("ticker", s);
    if (frame) this.safeSend(frame);
    this.pruneAllSymbols(s);
  }

  subscribeDepth(symbol: string, levels = 20): void {
    const s = this.toBitriumSymbol(symbol) || symbol;
    if (this.depthSubs.has(s)) return;
    this.depthSubs.set(s, levels);
    this.allSymbols.add(s);
    const frame = this.buildSubscribeFrame("depth", s, { levels });
    if (frame) this.safeSend(frame);
  }

  unsubscribeDepth(symbol: string): void {
    const s = this.toBitriumSymbol(symbol) || symbol;
    if (!this.depthSubs.delete(s)) return;
    const frame = this.buildUnsubscribeFrame("depth", s);
    if (frame) this.safeSend(frame);
    this.pruneAllSymbols(s);
  }

  subscribeKline(symbol: string, interval: string): void {
    const s = this.toBitriumSymbol(symbol) || symbol;
    let intervals = this.klineSubs.get(s);
    if (!intervals) {
      intervals = new Set();
      this.klineSubs.set(s, intervals);
    }
    if (intervals.has(interval)) return;
    intervals.add(interval);
    this.allSymbols.add(s);
    const frame = this.buildSubscribeFrame("kline", s, { interval });
    if (frame) this.safeSend(frame);
  }

  unsubscribeKline(symbol: string, interval: string): void {
    const s = this.toBitriumSymbol(symbol) || symbol;
    const intervals = this.klineSubs.get(s);
    if (!intervals || !intervals.delete(interval)) return;
    if (intervals.size === 0) this.klineSubs.delete(s);
    const frame = this.buildUnsubscribeFrame("kline", s, { interval });
    if (frame) this.safeSend(frame);
    this.pruneAllSymbols(s);
  }

  subscribeTrade(symbol: string): void {
    const s = this.toBitriumSymbol(symbol) || symbol;
    if (this.tradeSubs.has(s)) return;
    this.tradeSubs.add(s);
    this.allSymbols.add(s);
    const frame = this.buildSubscribeFrame("trade", s);
    if (frame) this.safeSend(frame);
  }

  unsubscribeTrade(symbol: string): void {
    const s = this.toBitriumSymbol(symbol) || symbol;
    if (!this.tradeSubs.delete(s)) return;
    const frame = this.buildUnsubscribeFrame("trade", s);
    if (frame) this.safeSend(frame);
    this.pruneAllSymbols(s);
  }

  /** Legacy bulk subscribe — kept for backward compatibility with current Hub. */
  subscribeSymbols(symbols: string[]): void {
    for (const raw of symbols) {
      const s = this.toBitriumSymbol(raw) || raw;
      if (!s) continue;
      this.subscribeTicker(s);
      this.subscribeDepth(s);
      this.subscribeTrade(s);
    }
    this.onSymbolsSubscribed(symbols);
  }

  /** Remove symbol from allSymbols if no channel references it. */
  private pruneAllSymbols(symbol: string): void {
    if (
      this.tickerSubs.has(symbol) ||
      this.depthSubs.has(symbol) ||
      this.klineSubs.has(symbol) ||
      this.tradeSubs.has(symbol)
    ) return;
    this.allSymbols.delete(symbol);
  }

  /** Re-send all active subscriptions (called after reconnect). */
  protected resubscribeAll(): void {
    for (const symbol of this.tickerSubs) {
      const frame = this.buildSubscribeFrame("ticker", symbol);
      if (frame) this.safeSend(frame);
    }
    for (const [symbol, levels] of this.depthSubs) {
      const frame = this.buildSubscribeFrame("depth", symbol, { levels });
      if (frame) this.safeSend(frame);
    }
    for (const [symbol, intervals] of this.klineSubs) {
      for (const interval of intervals) {
        const frame = this.buildSubscribeFrame("kline", symbol, { interval });
        if (frame) this.safeSend(frame);
      }
    }
    for (const symbol of this.tradeSubs) {
      const frame = this.buildSubscribeFrame("trade", symbol);
      if (frame) this.safeSend(frame);
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  IN-MEMORY DATA ACCESS
  // ══════════════════════════════════════════════════════════════

  getSnapshot(symbol: string): AdapterSymbolSnapshot | null {
    const key = this.toBitriumSymbol(symbol) || symbol;
    if (!key) return null;
    return this.snapshots.get(key) ?? null;
  }

  getCandles(symbol: string, interval: string, limit: number): AdapterCandlePoint[] {
    const key = this.toBitriumSymbol(symbol) || symbol;
    if (!key) return [];
    const byInterval = this.candlesBySymbol.get(key);
    if (!byInterval) return [];
    const rows = byInterval.get(interval.toLowerCase()) ?? [];
    if (!rows.length) return [];
    return rows.slice(-Math.max(1, Math.min(1500, limit)));
  }

  getRecentTrades(symbol: string, limit: number): AdapterTradePoint[] {
    const key = this.toBitriumSymbol(symbol) || symbol;
    if (!key) return [];
    const rows = this.recentTradesBySymbol.get(key) ?? [];
    if (!rows.length) return [];
    return rows.slice(-Math.max(1, Math.min(800, limit)));
  }

  getOrderbook(symbol: string): OrderbookSnapshot | null {
    const key = this.toBitriumSymbol(symbol) || symbol;
    if (!key || !this.orderbooks.isReady(key)) return null;
    const depth = this.orderbooks.getDepthLevels(key, 20);
    if (!depth || (depth.bids.length === 0 && depth.asks.length === 0)) return null;
    return {
      exchange: this.exchange,
      symbol: key,
      seq: this.orderbooks.getLastSeq(key),
      bids: depth.bids.map(([price, qty]) => ({ price, qty })),
      asks: depth.asks.map(([price, qty]) => ({ price, qty })),
      ts: Date.now(),
    };
  }

  // ══════════════════════════════════════════════════════════════
  //  EVENTS
  // ══════════════════════════════════════════════════════════════

  onEvent(cb: (event: NormalizedEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  protected emit(event: NormalizedEvent): void {
    for (const cb of this.listeners) cb(event);
  }

  // ══════════════════════════════════════════════════════════════
  //  HEALTH & DIAGNOSTICS
  // ══════════════════════════════════════════════════════════════

  getHealth(): AdapterHealthSnapshot {
    const now = Date.now();
    const connected = this.isWsOpen();
    const ageMs = this.lastMessageAt > 0
      ? Math.max(0, now - this.lastMessageAt)
      : Number.POSITIVE_INFINITY;

    // Base score
    let score = connected ? 96 : 20;

    // Message age penalties
    if (ageMs > 3_000) score -= 8;
    if (ageMs > 7_000) score -= 13;
    if (ageMs > 12_000) score -= 18;
    if (ageMs > 22_000) score -= 25;

    // Latency penalties
    if (this.latencyEmaMs !== null) {
      if (this.latencyEmaMs > 700) score -= 6;
      if (this.latencyEmaMs > 1_500) score -= 8;
      if (this.latencyEmaMs > 2_500) score -= 10;
    }

    // Gap & resync penalties
    score -= Math.min(10, this.gapCount * 0.5);
    score -= Math.min(10, this.resyncCount * 0.45);

    // Exchange-specific adjustments (adapter hook)
    score = this.adjustHealthScore(score);

    score = Math.max(0, Math.min(100, Math.round(score)));

    const state: AdapterHealthSnapshot["state"] =
      !connected || ageMs > this.policy.watchdogStaleMs
        ? "down"
        : score >= 75
          ? "healthy"
          : "degraded";

    const reasons: string[] = [];
    if (!connected) reasons.push("ws_disconnected");
    if (ageMs > 7_000) reasons.push(`message_age_${Math.round(ageMs)}ms`);
    if (this.lastError) reasons.push(this.lastError);
    for (const reason of this.reasons.slice(-3)) reasons.push(reason);

    return {
      exchange: this.exchange,
      score,
      state,
      connected,
      latencyMs: this.latencyEmaMs !== null ? Math.round(this.latencyEmaMs) : null,
      lastMessageAt: this.lastMessageAt || null,
      lastMessageAgeMs: Number.isFinite(ageMs) ? ageMs : 99_999_999,
      reconnects: this.reconnectCount,
      resyncs: this.resyncCount,
      gapCount: this.gapCount,
      reasons: [...new Set(reasons)].slice(0, 8),
    };
  }

  getConnectionState(): ConnectionState {
    const connected = this.isWsOpen();
    let status: ConnectionState["status"];
    if (connected) status = "connected";
    else if (this.reconnectTimer) status = "reconnecting";
    else if (this.started) status = "connecting";
    else status = "disconnected";

    const urls = this.getWsUrls();
    return {
      status,
      url: this.ws ? (urls[this.wsUrlIndex % urls.length] ?? null) : null,
      connectedAt: connected ? this.lastMessageAt : null,
      reconnectAttempts: this.reconnectAttempts,
      lastError: this.lastError,
      latencyMs: this.latencyEmaMs !== null ? Math.round(this.latencyEmaMs) : null,
    };
  }

  // ══════════════════════════════════════════════════════════════
  //  DATA STORE HELPERS
  // ══════════════════════════════════════════════════════════════

  /** Merge partial data into symbol snapshot (in-memory L1). */
  protected patchSnapshot(symbol: string, patch: Partial<AdapterSymbolSnapshot>): void {
    const key = this.toBitriumSymbol(symbol) || symbol;
    if (!key) return;
    const existing = this.snapshots.get(key);
    const next: AdapterSymbolSnapshot = {
      exchange: this.exchange,
      symbol: key,
      price: null,
      change24hPct: null,
      volume24hUsd: null,
      topBid: null,
      topAsk: null,
      bidQty: null,
      askQty: null,
      spreadBps: null,
      depthUsd: null,
      imbalance: null,
      markPrice: null,
      fundingRate: null,
      nextFundingTime: null,
      lastTradePrice: null,
      lastTradeQty: null,
      lastTradeSide: null,
      sourceTs: null,
      updatedAt: Date.now(),
      ...(existing ?? {}),
      ...patch,
      updatedAt: Date.now(),
    };
    this.snapshots.set(key, next);
  }

  /** Append a trade to the recent trades ring buffer. */
  protected appendRecentTrade(symbol: string, row: AdapterTradePoint): void {
    const key = this.toBitriumSymbol(symbol) || symbol;
    if (!key) return;
    const current = this.recentTradesBySymbol.get(key) ?? [];
    current.push(row);
    if (current.length > DEFAULT_TRADE_STORE_MAX) {
      current.splice(0, current.length - DEFAULT_TRADE_STORE_MAX);
    }
    this.recentTradesBySymbol.set(key, current);
  }

  /** Upsert a candle into the candle store (replace if same time, append if newer). */
  protected upsertCandle(symbol: string, interval: string, row: AdapterCandlePoint): void {
    const key = this.toBitriumSymbol(symbol) || symbol;
    if (!key) return;
    const frame = interval.toLowerCase();
    const byInterval = this.candlesBySymbol.get(key) ?? new Map<string, AdapterCandlePoint[]>();
    const list = byInterval.get(frame) ?? [];
    const last = list[list.length - 1];
    if (last && last.time === row.time) {
      list[list.length - 1] = row;
    } else if (!last || row.time > last.time) {
      list.push(row);
      if (list.length > DEFAULT_CANDLE_STORE_MAX) {
        list.splice(0, list.length - DEFAULT_CANDLE_STORE_MAX);
      }
    } else {
      const idx = list.findIndex((item) => item.time === row.time);
      if (idx >= 0) list[idx] = row;
    }
    byInterval.set(frame, list);
    this.candlesBySymbol.set(key, byInterval);
  }

  // ── Orderbook helpers ─────────────────────────────────────────

  /** Update snapshot from orderbook top-of-book data. */
  protected updateBookDerivedFields(symbol: string, ts: number): void {
    const top = this.orderbooks.getTopOfBook(symbol);
    this.patchSnapshot(symbol, {
      topBid: top.topBid,
      topAsk: top.topAsk,
      bidQty: top.bidQty,
      askQty: top.askQty,
      spreadBps: top.spreadBps,
      depthUsd: top.depthUsd,
      imbalance: top.imbalance,
      sourceTs: ts,
    });
  }

  /** Buffer a delta while waiting for snapshot. */
  protected bufferDelta(symbol: string, delta: NormalizedBookDeltaEvent): void {
    const queue = this.deltaBufferBySymbol.get(symbol) ?? [];
    queue.push(delta);
    if (queue.length > DEFAULT_DELTA_BUFFER_MAX) {
      queue.splice(0, queue.length - DEFAULT_DELTA_BUFFER_MAX);
    }
    this.deltaBufferBySymbol.set(symbol, queue);
  }

  /** Reset orderbook state for a symbol (on gap or reconnect). */
  protected resetSymbolSyncState(symbol: string): void {
    const key = this.toBitriumSymbol(symbol) || symbol;
    if (!key) return;
    this.orderbooks.reset(key);
    this.deltaBufferBySymbol.delete(key);
    this.pendingSnapshotSymbols.delete(key);
    this.lastBookDeltaAtBySymbol.delete(key);
  }

  // ══════════════════════════════════════════════════════════════
  //  COMMON HELPERS
  // ══════════════════════════════════════════════════════════════

  /** Mark that a message was received. Updates latency EMA if event timestamp provided. */
  protected touchMessage(eventTs?: number | null): void {
    const now = Date.now();
    this.lastMessageAt = now;
    if (eventTs === null || eventTs === undefined || !Number.isFinite(eventTs) || eventTs <= 0) return;
    const latency = Math.max(0, now - Number(eventTs));
    this.latencyEmaMs = this.latencyEmaMs === null
      ? latency
      : this.latencyEmaMs * 0.8 + latency * 0.2;
  }

  /** Append a diagnostic reason to the rolling log. */
  protected pushReason(reason: string): void {
    this.reasons.push(`${new Date().toISOString()}:${reason}`);
    if (this.reasons.length > REASON_LOG_MAX) {
      this.reasons.splice(0, this.reasons.length - REASON_LOG_MAX);
    }
  }

  /** Check if WS is open and ready to send. */
  protected isWsOpen(): boolean {
    return Boolean(this.ws && this.ws.readyState === WebSocket.OPEN);
  }

  // ── Private internals ─────────────────────────────────────────

  private closeWs(): void {
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.terminate();
      this.ws = null;
    }
  }

  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  private handleRawMessage(raw: WebSocket.RawData): void {
    const text = toText(raw);
    try {
      this.parseMessage(text);
    } catch (error) {
      this.pushReason(`parse_error:${error instanceof Error ? error.message : "unknown"}`);
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  ABSTRACT HOOKS — Each adapter implements these
  // ══════════════════════════════════════════════════════════════

  /** WS URLs for this exchange. Base rotates through them on reconnect. */
  protected abstract getWsUrls(): string[];

  /**
   * Parse an incoming WS message (already converted to text).
   * Adapter should call this.emit(), this.patchSnapshot(), etc.
   * Adapter should call this.touchMessage(eventTs) for latency tracking.
   */
  protected abstract parseMessage(text: string): void;

  /**
   * Build a WS subscribe frame for this exchange's protocol.
   * Return null if this channel is not supported or uses aggregate streams.
   */
  protected abstract buildSubscribeFrame(
    channel: SubscriptionChannel,
    symbol: string,
    params?: SubscribeParams,
  ): unknown | null;

  /**
   * Build a WS unsubscribe frame. Return null if not supported.
   */
  protected abstract buildUnsubscribeFrame(
    channel: SubscriptionChannel,
    symbol: string,
    params?: SubscribeParams,
  ): unknown | null;

  /** Convert Bitrium format ("BTCUSDT") → exchange native format. */
  abstract toExchangeSymbol(symbol: string): string;

  /** Convert exchange native format → Bitrium format ("BTCUSDT"). */
  abstract toBitriumSymbol(raw: string): string;

  // ── REST fallback (Hub calls these via RateLimitGuard + Dedup) ──

  abstract fetchDepthSnapshot(symbol: string, levels?: number): Promise<OrderbookSnapshot>;
  abstract fetchKlines(symbol: string, interval: string, limit?: number): Promise<AdapterCandlePoint[]>;
  abstract fetchRecentTrades(symbol: string, limit?: number): Promise<AdapterTradePoint[]>;

  // ══════════════════════════════════════════════════════════════
  //  OPTIONAL HOOKS — Override for exchange-specific behavior
  // ══════════════════════════════════════════════════════════════

  /**
   * Adjust health score with exchange-specific penalties.
   * Called by getHealth() after base score calculation.
   * Override to add penalties for stale symbols, snapshot failures, etc.
   */
  protected adjustHealthScore(baseScore: number): number {
    return baseScore;
  }

  /** Called after start(). Use for exchange-specific timers (snapshot sanity, etc). */
  protected onStarted(): void {}

  /** Called after stop(). Use for cleanup of exchange-specific timers. */
  protected onStopped(): void {}

  /** Called when WS connection opens. Use for initial data requests. */
  protected onConnected(): void {}

  /** Called when WS connection closes. */
  protected onDisconnected(): void {}

  /**
   * Called on heartbeat tick. Default: send WS ping.
   * Override if exchange needs custom ping frame (e.g. Gate.io, OKX).
   */
  protected onHeartbeatTick(): void {
    this.safePing();
  }

  /** Called after subscribeSymbols() processes all symbols. */
  protected onSymbolsSubscribed(_symbols: string[]): void {}
}
