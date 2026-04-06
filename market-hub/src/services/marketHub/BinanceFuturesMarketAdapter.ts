import WebSocket from "ws";
import type { IExchangeMarketAdapter } from "./adapter.ts";
import type {
  AdapterCandlePoint,
  AdapterHealthSnapshot,
  AdapterSymbolSnapshot,
  AdapterTradePoint,
  NormalizedBookDeltaEvent,
  NormalizedBookSnapshotEvent,
  NormalizedEvent,
  NormalizedKlineEvent,
  NormalizedTradeEvent,
} from "./types.ts";
import { SequenceSafeOrderbookStore } from "./sequenceSafeOrderbook.ts";
import { guardedBinanceFetch } from "../binanceRestGuard.ts";

// !bookTicker REMOVED: it fires for ALL 300+ symbols on every trade = 2000-5000 msgs/sec,
// saturating the event loop. Bid/ask data is available from depth WS for subscribed symbols
// and from !ticker@arr for price display. bookTicker data (top bid/ask, spread) is
// a nice-to-have but not worth the CPU cost.
const BINANCE_AGGREGATE_URLS = [
  "wss://fstream.binance.com/stream?streams=!ticker@arr/!markPrice@arr@1s",
  "wss://fstream.binance.com:443/stream?streams=!ticker@arr/!markPrice@arr@1s",
];
const BINANCE_DEPTH_URLS = [
  "wss://fstream.binance.com/ws",
  "wss://fstream.binance.com:443/ws",
];
const BINANCE_TRADE_URLS = [
  "wss://fstream.binance.com/ws",
  "wss://fstream.binance.com:443/ws",
];
const BINANCE_DEPTH_SNAPSHOT_BASE = "https://fapi.binance.com";
const WATCHDOG_STALE_MS = 20_000;
const WATCHDOG_TICK_MS = 5_000;
const HEARTBEAT_PING_MS = 8_000;
const SYMBOL_DELTA_STALE_MS = 60_000; // 60s — only snapshot on truly dead symbols
const SNAPSHOT_SANITY_INTERVAL_MS = 30_000; // 30s — state machine tick (lightweight, no REST unless needed)
const SNAPSHOT_REQUEST_GAP_MS = 3000; // 3s between snapshots
const SNAPSHOT_BLOCK_COOLDOWN_MS = 600_000; // 10 min — Binance IP bans are long, no point retrying often
const CONTRACT_REFRESH_INTERVAL_MS = 4 * 60 * 60_000; // 4 hours — contracts rarely change
const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 12_000;
const DEPTH_BUFFER_MAX = 400;
// Maximum symbols for depth+kline WS subscriptions.
// Each symbol = @depth@500ms (2/sec) + 7 @kline streams + @trade on tradeWs.
// 10 symbols × 2/sec = 20 depth msgs/sec — keeps event loop clean for trade latency.
// Beyond this, symbols still get price/ticker/mark from the aggregate WS (!ticker@arr).
const MAX_DEPTH_SYMBOLS = 10;

// Priority symbols that MUST be in depthSymbols (subscribed first on start).
// These are the highest-volume Binance Futures pairs — without priority seeding,
// random low-volume symbols from !ticker@arr could fill the depth slots first.
const PRIORITY_DEPTH_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"];
const BINANCE_CANDLE_INTERVALS = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"] as const;
const CANDLE_STORE_MAX = 900;
const TRADE_STORE_MAX = 500;

// ═══════════════════════════════════════════════════════════════════
// RECOVERY STATE MACHINE — prevents fail→retry→fail snapshot loops
// that burn REST weight and trigger 418 IP bans.
// ═══════════════════════════════════════════════════════════════════
enum DepthSymbolState {
  INIT = "INIT",                       // Never had a snapshot
  SYNCING = "SYNCING",                 // Initial snapshot in-flight
  READY = "READY",                     // Book healthy, WS flowing
  DESYNC_SUSPECTED = "DESYNC_SUSPECTED", // Might need recovery (WS stale 60s)
  RECOVERING = "RECOVERING",           // Recovery snapshot in-flight
  COOLDOWN = "COOLDOWN",               // Failed, waiting before retry
  BLOCKED = "BLOCKED",                 // Too many failures, long block
}

// Exponential backoff schedule for COOLDOWN state
const RECOVERY_COOLDOWN_MS: Record<number, number> = {
  1: 30_000,    // attempt 1 → 30s
  2: 120_000,   // attempt 2 → 2min
  3: 300_000,   // attempt 3 → 5min
};
const RECOVERY_BLOCK_MS = 600_000;     // 4+ attempts → BLOCKED for 10min
const RECOVERY_MAX_BEFORE_BLOCK = 4;   // attempts before BLOCKED
const DESYNC_CONFIRMATION_DELAY_MS = 10_000; // wait 10s before confirming desync
const WS_STALE_THRESHOLD_MS = 60_000;  // WS deltas stopped for 60s → DESYNC_SUSPECTED

const toText = (raw: WebSocket.RawData): string => {
  if (typeof raw === "string") return raw;
  if (Buffer.isBuffer(raw)) return raw.toString("utf8");
  if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString("utf8");
  if (Array.isArray(raw)) return Buffer.concat(raw).toString("utf8");
  return String(raw ?? "");
};

const normalizeSymbol = (raw: unknown): string => String(raw ?? "").toUpperCase().replace(/[-_/]/g, "").trim();

const ensureUsdtPair = (raw: unknown): string => {
  const symbol = normalizeSymbol(raw);
  if (!symbol) return "";
  return symbol.endsWith("USDT") ? symbol : `${symbol}USDT`;
};

const toNum = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const levelRows = (input: unknown): Array<[number, number]> => {
  if (!Array.isArray(input)) return [];
  const out: Array<[number, number]> = [];
  for (const row of input) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const price = Number(row[0]);
    const qty = Number(row[1]);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(qty)) continue;
    out.push([price, Math.max(0, qty)]);
  }
  return out;
};

const computeBackoff = (attempt: number): number => {
  const expo = Math.round(RECONNECT_BASE_MS * Math.pow(1.9, Math.max(0, attempt - 1)));
  const jitter = Math.floor(Math.random() * 250);
  return Math.min(RECONNECT_MAX_MS, expo + jitter);
};

const nowIso = () => new Date().toISOString();

export class BinanceFuturesMarketAdapter implements IExchangeMarketAdapter {
  readonly exchange = "BINANCE" as const;

  private aggregateWs: WebSocket | null = null;
  private depthWs: WebSocket | null = null;
  private tradeWs: WebSocket | null = null;  // Fast lane: dedicated trade-only WS
  private aggregateUrlIndex = 0;
  private depthUrlIndex = 0;
  private tradeUrlIndex = 0;
  private started = false;
  private aggregateReconnectAttempts = 0;
  private depthReconnectAttempts = 0;
  private tradeReconnectAttempts = 0;
  private aggregateReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private depthReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private tradeReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private snapshotSanityTimer: ReturnType<typeof setInterval> | null = null;
  private contractRefreshTimer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<(event: NormalizedEvent) => void>();

  private readonly snapshots = new Map<string, AdapterSymbolSnapshot>();
  private readonly candlesBySymbol = new Map<string, Map<string, AdapterCandlePoint[]>>();
  private readonly recentTradesBySymbol = new Map<string, AdapterTradePoint[]>();
  private readonly orderbooks = new SequenceSafeOrderbookStore();
  private readonly deltaBufferBySymbol = new Map<string, NormalizedBookDeltaEvent[]>();
  private readonly lastBookDeltaAtBySymbol = new Map<string, number>();
  private readonly lastSnapshotAtBySymbol = new Map<string, number>();
  private readonly snapshotFailuresBySymbol = new Map<string, number>();
  private readonly excludedDepthSymbols = new Set<string>();
  // ── Recovery State Machine tracking ──
  private readonly symbolStates = new Map<string, DepthSymbolState>();
  private readonly symbolStateChangedAt = new Map<string, number>();
  private readonly symbolRecoveryAttempts = new Map<string, number>();
  private readonly futuresContracts = new Set<string>();
  private readonly depthSymbols = new Set<string>();
  private readonly pendingSnapshotSymbols = new Set<string>();
  private readonly snapshotQueue: string[] = [];
  private readonly snapshotQueueSet = new Set<string>();
  private readonly recentReasons: string[] = [];

  private lastMessageAt = 0;
  private lastError: string | null = null;
  private reconnects = 0;
  private resyncs = 0;
  private gapCount = 0;
  private snapshotFailures = 0;
  private symbolStaleResyncs = 0;
  private snapshotBlockedUntil = 0;
  private contractsLoading = false;
  private snapshotDrainInFlight = false;
  private latencyEmaMs: number | null = null;
  private _depthLimitLogged = false;
  /** 500ms batch flush timer for ticker/markPrice events */
  private _tickerFlushTimer: ReturnType<typeof setInterval> | null = null;
  /** Event loop lag detection — identifies what blocks the event loop */
  private _elLagTimer: ReturnType<typeof setInterval> | null = null;
  private _lastElCheck = 0;
  /** Message counters per 30s window for diagnostic */
  private _diagKlineCount = 0;
  private _diagTradeCount = 0;
  private _diagDepthCount = 0;
  private _diagTickerCount = 0;
  private _diagTimer: ReturnType<typeof setInterval> | null = null;

  start(): void {
    if (this.started) return;
    this.started = true;
    // Pre-seed priority symbols so they always get depth/trade subscriptions
    // before random low-volume symbols from !ticker@arr fill the slots
    for (const symbol of PRIORITY_DEPTH_SYMBOLS) {
      this.depthSymbols.add(symbol);
    }
    this.connectAggregate();
    this.connectDepth();
    this.connectTrade();  // Fast lane: dedicated trade WS
    this.startHeartbeat();
    this.startWatchdog();
    this.startSnapshotSanity();
    this.startContractRefresh();
    this.startTickerFlush();  // 500ms batch emit for ticker/markPrice
    this.startDiagnostics();  // Event loop lag + message rate monitor
    void this.refreshContracts();
  }

  stop(): void {
    this.started = false;
    if (this.aggregateReconnectTimer) {
      clearTimeout(this.aggregateReconnectTimer);
      this.aggregateReconnectTimer = null;
    }
    if (this.depthReconnectTimer) {
      clearTimeout(this.depthReconnectTimer);
      this.depthReconnectTimer = null;
    }
    if (this.tradeReconnectTimer) {
      clearTimeout(this.tradeReconnectTimer);
      this.tradeReconnectTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    if (this.snapshotSanityTimer) {
      clearInterval(this.snapshotSanityTimer);
      this.snapshotSanityTimer = null;
    }
    if (this.contractRefreshTimer) {
      clearInterval(this.contractRefreshTimer);
      this.contractRefreshTimer = null;
    }
    if (this._tickerFlushTimer) {
      clearInterval(this._tickerFlushTimer);
      this._tickerFlushTimer = null;
    }
    if (this._elLagTimer) {
      clearInterval(this._elLagTimer);
      this._elLagTimer = null;
    }
    if (this._diagTimer) {
      clearInterval(this._diagTimer);
      this._diagTimer = null;
    }
    if (this.aggregateWs) {
      this.aggregateWs.removeAllListeners();
      this.aggregateWs.terminate();
      this.aggregateWs = null;
    }
    if (this.depthWs) {
      this.depthWs.removeAllListeners();
      this.depthWs.terminate();
      this.depthWs = null;
    }
    if (this.tradeWs) {
      this.tradeWs.removeAllListeners();
      this.tradeWs.terminate();
      this.tradeWs = null;
    }
  }

  subscribeSymbols(symbols: string[]): void {
    const unique = [...new Set(symbols.map((symbol) => ensureUsdtPair(symbol)).filter(Boolean))];
    if (!unique.length) return;
    const eligible = unique.filter((symbol) => this.isDepthEligible(symbol));
    if (!eligible.length) return;
    const newlyAdded: string[] = [];
    for (const symbol of eligible) {
      if (this.depthSymbols.has(symbol)) continue;
      // Enforce depth symbol limit — prevent 200+ symbols flooding the event loop
      // Each symbol adds ~10 depth msgs/sec + 7 kline streams
      if (this.depthSymbols.size >= MAX_DEPTH_SYMBOLS) {
        // Log once per rejected symbol for debugging
        if (!this._depthLimitLogged) {
          console.log(`[BinanceFuturesAdapter] Depth limit reached (${MAX_DEPTH_SYMBOLS}), not subscribing ${symbol} and future symbols for depth/kline/trade WS`);
          this._depthLimitLogged = true;
        }
        break;
      }
      this.depthSymbols.add(symbol);
      newlyAdded.push(symbol);
    }
    if (!newlyAdded.length) return;
    this.subscribeDepthStreams(newlyAdded);
    this.subscribeTradeStreams(newlyAdded);  // Fast lane: subscribe on trade WS too
    for (const symbol of newlyAdded) {
      // Ensure state is INIT for newly subscribed symbols
      if (!this.symbolStates.has(symbol)) {
        this.symbolStates.set(symbol, DepthSymbolState.INIT);
        this.symbolStateChangedAt.set(symbol, Date.now());
      }
      this.enqueueSnapshot(symbol);
    }
  }

  onEvent(cb: (event: NormalizedEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  getHealth(): AdapterHealthSnapshot {
    const now = Date.now();
    const connectedAggregate = Boolean(this.aggregateWs && this.aggregateWs.readyState === WebSocket.OPEN);
    const connectedDepth = Boolean(this.depthWs && this.depthWs.readyState === WebSocket.OPEN);
    const connectedTrade = Boolean(this.tradeWs && this.tradeWs.readyState === WebSocket.OPEN);
    const connected = connectedAggregate && connectedDepth && connectedTrade;
    const lastMessageAgeMs = this.lastMessageAt > 0 ? Math.max(0, now - this.lastMessageAt) : Number.POSITIVE_INFINITY;
    let score = connected ? 100 : (connectedAggregate || connectedDepth || connectedTrade) ? 58 : 20;
    if (lastMessageAgeMs > 3_000) score -= 8;
    if (lastMessageAgeMs > 6_000) score -= 12;
    if (lastMessageAgeMs > 12_000) score -= 18;
    if (lastMessageAgeMs > 20_000) score -= 25;
    if (this.latencyEmaMs !== null) {
      if (this.latencyEmaMs > 600) score -= 6;
      if (this.latencyEmaMs > 1_200) score -= 8;
      if (this.latencyEmaMs > 2_000) score -= 10;
    }
    score -= Math.min(12, this.gapCount * 0.6);
    score -= Math.min(10, this.resyncs * 0.5);
    score -= Math.min(10, this.symbolStaleResyncs * 0.4);
    score -= Math.min(12, this.snapshotFailures * 1.1);
    score -= Math.min(8, this.pendingSnapshotSymbols.size * 0.7);
    let staleSymbolCount = 0;
    for (const symbol of this.depthSymbols) {
      if (!this.orderbooks.isReady(symbol)) continue;
      const lastDeltaAt = this.lastBookDeltaAtBySymbol.get(symbol) ?? 0;
      if (!lastDeltaAt) continue;
      if (now - lastDeltaAt > SYMBOL_DELTA_STALE_MS) staleSymbolCount += 1;
    }
    if (staleSymbolCount > 0) score -= Math.min(10, staleSymbolCount * 1.2);
    score = Math.max(0, Math.min(100, Math.round(score)));
    const state: AdapterHealthSnapshot["state"] =
      !connected || lastMessageAgeMs > WATCHDOG_STALE_MS
        ? "down"
        : score >= 78
          ? "healthy"
          : "degraded";
    const reasons: string[] = [];
    if (!connectedAggregate) reasons.push("aggregate_ws_disconnected");
    if (!connectedDepth) reasons.push("depth_ws_disconnected");
    if (!connectedTrade) reasons.push("trade_ws_disconnected");
    if (lastMessageAgeMs > 6_000) reasons.push(`message_age_${Math.round(lastMessageAgeMs)}ms`);
    if (staleSymbolCount > 0) reasons.push(`stale_symbols_${staleSymbolCount}`);
    if (this.snapshotFailures > 0) reasons.push(`snapshot_failures_${this.snapshotFailures}`);
    if (this.pendingSnapshotSymbols.size > 0) reasons.push(`snapshot_pending_${this.pendingSnapshotSymbols.size}`);
    if (this.snapshotBlockedUntil > now) reasons.push(`snapshot_blocked_${Math.max(1, Math.round((this.snapshotBlockedUntil - now) / 1000))}s`);
    // State machine summary
    let cooldownCount = 0;
    let blockedCount = 0;
    for (const [, symState] of this.symbolStates) {
      if (symState === DepthSymbolState.COOLDOWN) cooldownCount++;
      if (symState === DepthSymbolState.BLOCKED) blockedCount++;
    }
    if (cooldownCount > 0) reasons.push(`depth_cooldown_${cooldownCount}`);
    if (blockedCount > 0) reasons.push(`depth_blocked_${blockedCount}`);
    if (this.lastError) reasons.push(this.lastError);
    for (const reason of this.recentReasons.slice(-3)) reasons.push(reason);
    return {
      exchange: this.exchange,
      score,
      state,
      connected,
      latencyMs: this.latencyEmaMs !== null ? Math.round(this.latencyEmaMs) : null,
      lastMessageAt: this.lastMessageAt || null,
      lastMessageAgeMs: Number.isFinite(lastMessageAgeMs) ? lastMessageAgeMs : 99_999_999,
      reconnects: this.reconnects,
      resyncs: this.resyncs,
      gapCount: this.gapCount,
      reasons: [...new Set(reasons)].slice(0, 8),
    };
  }

  getSnapshot(symbol: string): AdapterSymbolSnapshot | null {
    const normalized = ensureUsdtPair(symbol);
    if (!normalized) return null;
    return this.snapshots.get(normalized) ?? null;
  }

  getCandles(symbol: string, interval: string, limit: number): AdapterCandlePoint[] {
    const normalized = ensureUsdtPair(symbol);
    if (!normalized) return [];
    const byInterval = this.candlesBySymbol.get(normalized);
    if (!byInterval) return [];
    const rows = byInterval.get(interval.toLowerCase()) ?? [];
    if (!rows.length) return [];
    return rows.slice(-Math.max(1, Math.min(1500, limit)));
  }

  getRecentTrades(symbol: string, limit: number): AdapterTradePoint[] {
    const normalized = ensureUsdtPair(symbol);
    if (!normalized) return [];
    const rows = this.recentTradesBySymbol.get(normalized) ?? [];
    if (!rows.length) return [];
    return rows.slice(-Math.max(1, Math.min(900, limit)));
  }

  private emit(event: NormalizedEvent): void {
    for (const cb of this.listeners) cb(event);
  }

  private pushReason(reason: string): void {
    this.recentReasons.push(`${nowIso()}:${reason}`);
    if (this.recentReasons.length > 30) {
      this.recentReasons.splice(0, this.recentReasons.length - 30);
    }
  }

  // ── Recovery State Machine helpers ──

  private getSymbolState(symbol: string): DepthSymbolState {
    return this.symbolStates.get(symbol) ?? DepthSymbolState.INIT;
  }

  private transitionState(symbol: string, to: DepthSymbolState, reason: string): void {
    const from = this.getSymbolState(symbol);
    if (from === to) return;
    this.symbolStates.set(symbol, to);
    this.symbolStateChangedAt.set(symbol, Date.now());
    console.log(`[DepthState] ${symbol}: ${from} → ${to} (reason: ${reason})`);
  }

  private getRecoveryCooldownMs(attempt: number): number {
    if (attempt >= RECOVERY_MAX_BEFORE_BLOCK) return RECOVERY_BLOCK_MS;
    return RECOVERY_COOLDOWN_MS[attempt] ?? RECOVERY_COOLDOWN_MS[3] ?? 300_000;
  }

  private touchMessage(eventTs?: number | null): void {
    const now = Date.now();
    this.lastMessageAt = now;
    if (eventTs === null || eventTs === undefined || !Number.isFinite(eventTs) || eventTs <= 0) return;
    const latency = Math.max(0, now - Number(eventTs));
    this.latencyEmaMs = this.latencyEmaMs === null ? latency : this.latencyEmaMs * 0.8 + latency * 0.2;
  }

  private connectAggregate(): void {
    if (!this.started) return;
    if (this.aggregateWs) {
      this.aggregateWs.removeAllListeners();
      this.aggregateWs.terminate();
      this.aggregateWs = null;
    }
    const url = BINANCE_AGGREGATE_URLS[this.aggregateUrlIndex] ?? BINANCE_AGGREGATE_URLS[0];
    const ws = new WebSocket(url, { handshakeTimeout: 10_000, perMessageDeflate: false });
    this.aggregateWs = ws;

    ws.on("open", () => {
      this.aggregateReconnectAttempts = 0;
      this.lastError = null;
      this.touchMessage(Date.now());
      this.pushReason("aggregate_open");
    });

    ws.on("message", (raw) => {
      this.parseAggregateMessage(raw);
    });

    ws.on("pong", () => {
      this.touchMessage(Date.now());
    });

    ws.on("close", () => {
      if (!this.started) return;
      this.pushReason("aggregate_close");
      this.scheduleAggregateReconnect();
    });

    ws.on("error", (error) => {
      if (!this.started) return;
      this.lastError = error instanceof Error ? error.message : "aggregate_ws_error";
      this.pushReason(`aggregate_error:${this.lastError}`);
      this.scheduleAggregateReconnect();
    });
  }

  private connectDepth(): void {
    if (!this.started) return;
    if (this.depthWs) {
      this.depthWs.removeAllListeners();
      this.depthWs.terminate();
      this.depthWs = null;
    }
    const url = BINANCE_DEPTH_URLS[this.depthUrlIndex] ?? BINANCE_DEPTH_URLS[0];
    const ws = new WebSocket(url, { handshakeTimeout: 10_000, perMessageDeflate: false });
    this.depthWs = ws;

    ws.on("open", () => {
      this.depthReconnectAttempts = 0;
      this.lastError = null;
      this.touchMessage(Date.now());
      this.pushReason("depth_open");
      this.subscribeDepthStreams([...this.depthSymbols]);
      // Staggered reconnect snapshots — don't burst all at once
      const depthArr = [...this.depthSymbols];
      for (let i = 0; i < depthArr.length; i++) {
        this.resetSymbolSyncState(depthArr[i]);
        // Reset state machine to INIT on WS reconnect so symbols can re-sync
        this.symbolRecoveryAttempts.set(depthArr[i], 0);
        this.snapshotFailuresBySymbol.set(depthArr[i], 0);
        this.excludedDepthSymbols.delete(depthArr[i]);
        // Clear incremental book maps so stale partial books don't persist
        this.incrementalBooks.delete(depthArr[i]);
        this.incrementalAsks.delete(depthArr[i]);
        this.transitionState(depthArr[i], DepthSymbolState.INIT, "ws_reconnect");
        // Stagger: 2s apart per symbol to avoid REST burst
        setTimeout(() => { if (this.started) this.enqueueSnapshot(depthArr[i]); }, i * 2000);
      }
      // Backfill candles only if REST API is not blocked — delayed 20s after reconnect
      setTimeout(() => {
        if (this.snapshotBlockedUntil <= Date.now()) {
          void this.backfillCandles(depthArr);
        } else {
          this.pushReason("backfill_skipped:rest_blocked");
        }
      }, 20_000);
    });

    ws.on("message", (raw) => {
      this.parseDepthMessage(raw);
    });

    ws.on("pong", () => {
      this.touchMessage(Date.now());
    });

    ws.on("close", () => {
      if (!this.started) return;
      this.pushReason("depth_close");
      this.scheduleDepthReconnect();
    });

    ws.on("error", (error) => {
      if (!this.started) return;
      this.lastError = error instanceof Error ? error.message : "depth_ws_error";
      this.pushReason(`depth_error:${this.lastError}`);
      this.scheduleDepthReconnect();
    });
  }

  private scheduleAggregateReconnect(): void {
    if (!this.started || this.aggregateReconnectTimer) return;
    this.aggregateReconnectAttempts += 1;
    this.reconnects += 1;
    this.aggregateUrlIndex = (this.aggregateUrlIndex + 1) % BINANCE_AGGREGATE_URLS.length;
    const waitMs = computeBackoff(this.aggregateReconnectAttempts);
    this.aggregateReconnectTimer = setTimeout(() => {
      this.aggregateReconnectTimer = null;
      this.connectAggregate();
    }, waitMs);
  }

  private scheduleDepthReconnect(): void {
    if (!this.started || this.depthReconnectTimer) return;
    this.depthReconnectAttempts += 1;
    this.reconnects += 1;
    this.depthUrlIndex = (this.depthUrlIndex + 1) % BINANCE_DEPTH_URLS.length;
    const waitMs = computeBackoff(this.depthReconnectAttempts);
    this.depthReconnectTimer = setTimeout(() => {
      this.depthReconnectTimer = null;
      this.connectDepth();
    }, waitMs);
  }

  // ═══════════════════════════════════════════════════════════════════
  // FAST LANE: Dedicated trade-only WS connection
  //  Isolates trade events from depth/kline flood (~2000+ msg/sec)
  //  Expected: BTCUSDT trade latency drops from p50=200-900ms → ~35-50ms
  // ═══════════════════════════════════════════════════════════════════

  private connectTrade(): void {
    if (!this.started) return;
    if (this.tradeWs) {
      this.tradeWs.removeAllListeners();
      this.tradeWs.terminate();
      this.tradeWs = null;
    }
    const url = BINANCE_TRADE_URLS[this.tradeUrlIndex] ?? BINANCE_TRADE_URLS[0];
    const ws = new WebSocket(url, { handshakeTimeout: 10_000, perMessageDeflate: false });
    this.tradeWs = ws;

    ws.on("open", () => {
      this.tradeReconnectAttempts = 0;
      this.lastError = null;
      this.touchMessage(Date.now());
      this.pushReason("trade_fast_lane_open");
      // Subscribe all tracked symbols for @trade on the fast lane
      this.subscribeTradeStreams([...this.depthSymbols]);
    });

    ws.on("message", (raw) => {
      this.parseTradeMessage(raw);
    });

    ws.on("pong", () => {
      this.touchMessage(Date.now());
    });

    ws.on("close", () => {
      if (!this.started) return;
      this.pushReason("trade_fast_lane_close");
      this.scheduleTradeReconnect();
    });

    ws.on("error", (error) => {
      if (!this.started) return;
      this.lastError = error instanceof Error ? error.message : "trade_ws_error";
      this.pushReason(`trade_fast_lane_error:${this.lastError}`);
      this.scheduleTradeReconnect();
    });
  }

  /** Parse messages on the fast-lane trade WS — ONLY handles trade events */
  private parseTradeMessage(raw: WebSocket.RawData): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(toText(raw));
    } catch {
      return;
    }
    const rec = parsed as Record<string, unknown>;
    if ("result" in rec && rec.result === null) return; // subscription ack
    const eventType = String(rec.e ?? "");
    if (eventType === "trade" || eventType === "aggTrade") {
      this.onTrade(rec);
    }
  }

  private scheduleTradeReconnect(): void {
    if (!this.started || this.tradeReconnectTimer) return;
    this.tradeReconnectAttempts += 1;
    this.reconnects += 1;
    this.tradeUrlIndex = (this.tradeUrlIndex + 1) % BINANCE_TRADE_URLS.length;
    const waitMs = computeBackoff(this.tradeReconnectAttempts);
    this.tradeReconnectTimer = setTimeout(() => {
      this.tradeReconnectTimer = null;
      this.connectTrade();
    }, waitMs);
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      if (this.aggregateWs && this.aggregateWs.readyState === WebSocket.OPEN) {
        try {
          this.aggregateWs.ping();
        } catch {
          // no-op
        }
      }
      if (this.depthWs && this.depthWs.readyState === WebSocket.OPEN) {
        try {
          this.depthWs.ping();
        } catch {
          // no-op
        }
      }
      if (this.tradeWs && this.tradeWs.readyState === WebSocket.OPEN) {
        try {
          this.tradeWs.ping();
        } catch {
          // no-op
        }
      }
    }, HEARTBEAT_PING_MS);
  }

  private startWatchdog(): void {
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
    this.watchdogTimer = setInterval(() => {
      if (!this.started) return;
      const ageMs = this.lastMessageAt > 0 ? Date.now() - this.lastMessageAt : Number.POSITIVE_INFINITY;
      if (ageMs <= WATCHDOG_STALE_MS) return;
      this.pushReason(`watchdog_reconnect_${Math.round(ageMs)}ms`);
      if (this.aggregateWs) {
        try {
          this.aggregateWs.terminate();
        } catch {
          // no-op
        }
      }
      if (this.depthWs) {
        try {
          this.depthWs.terminate();
        } catch {
          // no-op
        }
      }
      if (this.tradeWs) {
        try {
          this.tradeWs.terminate();
        } catch {
          // no-op
        }
      }
    }, WATCHDOG_TICK_MS);
  }

  private startSnapshotSanity(): void {
    if (this.snapshotSanityTimer) clearInterval(this.snapshotSanityTimer);
    // ═══ SNAPSHOT POLICY: State-machine driven, REST-minimal ═══
    // REST snapshots are ONLY for recovery, NEVER for routine data.
    // State machine prevents fail→retry→fail loops that cause 418 IP bans.
    this.snapshotSanityTimer = setInterval(() => {
      if (!this.started) return;
      const now = Date.now();

      for (const symbol of this.depthSymbols) {
        if (!this.isDepthEligible(symbol)) continue;
        const state = this.getSymbolState(symbol);
        const stateAge = now - (this.symbolStateChangedAt.get(symbol) ?? 0);
        const lastDeltaAt = this.lastBookDeltaAtBySymbol.get(symbol) ?? 0;
        const wsStaleMs = lastDeltaAt > 0 ? now - lastDeltaAt : Infinity;

        switch (state) {
          case DepthSymbolState.INIT: {
            // Never had a snapshot — enqueue one (enqueueSnapshot handles INIT → SYNCING)
            if (!this.pendingSnapshotSymbols.has(symbol)) {
              this.enqueueSnapshot(symbol);
            }
            break;
          }

          case DepthSymbolState.SYNCING: {
            // Initial snapshot in-flight — do nothing, wait for requestDepthSnapshot result
            break;
          }

          case DepthSymbolState.READY: {
            // Book healthy — check if WS deltas stopped
            if (wsStaleMs > WS_STALE_THRESHOLD_MS) {
              this.transitionState(symbol, DepthSymbolState.DESYNC_SUSPECTED, `ws_stale_${Math.round(wsStaleMs / 1000)}s`);
            }
            // WS healthy → do nothing, zero REST calls
            break;
          }

          case DepthSymbolState.DESYNC_SUSPECTED: {
            // Wait for confirmation delay before recovering (not immediate!)
            if (stateAge >= DESYNC_CONFIRMATION_DELAY_MS) {
              const attempts = this.symbolRecoveryAttempts.get(symbol) ?? 0;
              this.symbolRecoveryAttempts.set(symbol, attempts + 1);
              this.transitionState(symbol, DepthSymbolState.RECOVERING, `desync_confirmed_after_${Math.round(stateAge / 1000)}s`);
              this.symbolStaleResyncs += 1;
              this.resetSymbolSyncState(symbol);
              this.enqueueSnapshot(symbol);
            }
            // else: still within confirmation delay, wait
            break;
          }

          case DepthSymbolState.RECOVERING: {
            // Recovery snapshot in-flight — do nothing, wait for requestDepthSnapshot result
            break;
          }

          case DepthSymbolState.COOLDOWN: {
            // Check if cooldown has expired
            const attempts = this.symbolRecoveryAttempts.get(symbol) ?? 0;
            if (attempts >= RECOVERY_MAX_BEFORE_BLOCK) {
              // Too many failures → BLOCKED
              this.transitionState(symbol, DepthSymbolState.BLOCKED, `${attempts}_recovery_attempts_failed`);
            } else {
              const cooldownMs = this.getRecoveryCooldownMs(attempts);
              if (stateAge >= cooldownMs) {
                // Cooldown expired → retry recovery
                this.transitionState(symbol, DepthSymbolState.RECOVERING, `cooldown_expired_attempt_${attempts + 1}`);
                this.resetSymbolSyncState(symbol);
                this.enqueueSnapshot(symbol);
              }
            }
            break;
          }

          case DepthSymbolState.BLOCKED: {
            // Long block — check if block period expired
            if (stateAge >= RECOVERY_BLOCK_MS) {
              // Reset and try once from scratch
              this.symbolRecoveryAttempts.set(symbol, 0);
              this.snapshotFailuresBySymbol.set(symbol, 0);
              this.excludedDepthSymbols.delete(symbol);
              this.transitionState(symbol, DepthSymbolState.INIT, `block_expired_${Math.round(stateAge / 1000)}s`);
            }
            break;
          }
        }
      }
    }, SNAPSHOT_SANITY_INTERVAL_MS);
  }

  private startContractRefresh(): void {
    if (this.contractRefreshTimer) clearInterval(this.contractRefreshTimer);
    this.contractRefreshTimer = setInterval(() => {
      void this.refreshContracts();
    }, CONTRACT_REFRESH_INTERVAL_MS);
  }

  /**
   * Event loop lag monitor + message rate diagnostics.
   * Detects what's blocking the Node.js event loop.
   */
  private startDiagnostics(): void {
    // Event loop lag: measure timer drift every 200ms
    this._lastElCheck = Date.now();
    this._elLagTimer = setInterval(() => {
      const now = Date.now();
      const expected = 200; // timer interval
      const lag = now - this._lastElCheck - expected;
      this._lastElCheck = now;
      // Log if event loop was blocked for > 50ms
      if (lag > 50) {
        console.log(`[EL_LAG] ${lag}ms event loop block detected`);
      }
    }, 200);

    // Message rate diagnostics: every 30s log message counts
    this._diagTimer = setInterval(() => {
      console.log(`[MSG_RATE] 30s: kline=${this._diagKlineCount} trade=${this._diagTradeCount} depth=${this._diagDepthCount} tickerArr=${this._diagTickerCount} depthSymbols=${this.depthSymbols.size} snapshots=${this.snapshots.size}`);
      this._diagKlineCount = 0;
      this._diagTradeCount = 0;
      this._diagDepthCount = 0;
      this._diagTickerCount = 0;
    }, 30_000);
  }

  /**
   * 500ms batch flush for ticker + markPrice events.
   * tickerArr/markPriceArr are CACHE-ONLY (update snapshots instantly, no emit).
   * This timer emits ticker + mark_price events for depth symbols every 500ms.
   * Result: event loop stays clean during !ticker@arr processing (300+ rows),
   * and the hub/bridge still gets periodic updates for Redis live snapshot.
   */
  private startTickerFlush(): void {
    if (this._tickerFlushTimer) clearInterval(this._tickerFlushTimer);
    this._tickerFlushTimer = setInterval(() => {
      if (!this.started) return;
      const now = Date.now();
      for (const symbol of this.depthSymbols) {
        const snap = this.snapshots.get(symbol);
        if (!snap) continue;
        if (snap.price !== null) {
          this.emit({
            type: "ticker",
            exchange: this.exchange,
            symbol,
            ts: snap.sourceTs ?? now,
            recvTs: now,
            price: snap.price,
            change24hPct: snap.change24hPct ?? 0,
            volume24hUsd: snap.volume24hUsd ?? 0,
          });
        }
        if (snap.markPrice !== null) {
          this.emit({
            type: "mark_price",
            exchange: this.exchange,
            symbol,
            ts: snap.sourceTs ?? now,
            recvTs: now,
            markPrice: snap.markPrice,
            fundingRate: snap.fundingRate,
            nextFundingTime: snap.nextFundingTime,
          });
        }
      }
    }, 500);
  }

  /** Subscribe depth + kline streams on the depth WS (NO trade — trade is on fast lane) */
  private subscribeDepthStreams(symbols: string[]): void {
    const ws = this.depthWs;
    if (!ws || ws.readyState !== WebSocket.OPEN || !symbols.length) return;
    const params: string[] = [];
    for (const symbol of symbols) {
      if (!this.isDepthEligible(symbol)) continue;
      const lower = symbol.toLowerCase();
      params.push(`${lower}@depth@500ms`);
      // NOTE: @trade removed from depth WS — now on dedicated tradeWs fast lane
      for (const frame of BINANCE_CANDLE_INTERVALS) {
        params.push(`${lower}@kline_${frame}`);
      }
    }
    const chunkSize = 120;
    let messageId = Date.now();
    for (let i = 0; i < params.length; i += chunkSize) {
      const chunk = params.slice(i, i + chunkSize);
      ws.send(
        JSON.stringify({
          method: "SUBSCRIBE",
          params: chunk,
          id: messageId,
        }),
      );
      messageId += 1;
    }
  }

  /** Subscribe ONLY trade streams on the dedicated fast-lane WS */
  private subscribeTradeStreams(symbols: string[]): void {
    const ws = this.tradeWs;
    if (!ws || ws.readyState !== WebSocket.OPEN || !symbols.length) return;
    const params: string[] = [];
    for (const symbol of symbols) {
      if (!this.isDepthEligible(symbol)) continue;
      params.push(`${symbol.toLowerCase()}@trade`);
    }
    if (!params.length) return;
    const chunkSize = 200; // trade-only: can use larger chunks
    let messageId = Date.now();
    for (let i = 0; i < params.length; i += chunkSize) {
      const chunk = params.slice(i, i + chunkSize);
      ws.send(
        JSON.stringify({
          method: "SUBSCRIBE",
          params: chunk,
          id: messageId,
        }),
      );
      messageId += 1;
    }
  }

  private parseAggregateMessage(raw: WebSocket.RawData): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(toText(raw));
    } catch {
      return;
    }
    const root = parsed as Record<string, unknown>;
    const stream = String(root.stream ?? "").toLowerCase();
    const data = root.data;
    if (!stream || data === undefined) return;

    // ══════════════════════════════════════════════════════════════
    // tickerArr: CACHE-ONLY — direct mutate snapshots, NO emit.
    // Ticker events are batched via 500ms flush timer (startTickerFlush).
    // This keeps the event loop clean for trade latency.
    // ══════════════════════════════════════════════════════════════
    if (stream.includes("!ticker@arr") && Array.isArray(data)) {
      this._diagTickerCount += 1;
      this.touchMessage(Date.now());
      for (const row of data) {
        const rec = row as Record<string, unknown>;
        const rawSymbol = String(rec.s ?? "");
        // Skip non-USDT pairs (COIN-margined futures like BTCUSD_PERP)
        if (!rawSymbol || !rawSymbol.endsWith("USDT")) continue;
        const price = toNum(rec.c);
        if (price === null) continue;
        // Direct cache mutation — no patchSnapshot, no ensureUsdtPair, no intermediate object
        let snap = this.snapshots.get(rawSymbol);
        if (!snap) {
          snap = {
            exchange: this.exchange, symbol: rawSymbol, price: null,
            change24hPct: null, volume24hUsd: null, topBid: null, topAsk: null,
            bidQty: null, askQty: null, spreadBps: null, depthUsd: null,
            imbalance: null, markPrice: null, fundingRate: null,
            nextFundingTime: null, lastTradePrice: null, lastTradeQty: null,
            lastTradeSide: null, sourceTs: null, updatedAt: Date.now(),
          };
          this.snapshots.set(rawSymbol, snap);
        }
        snap.price = price;
        const change = toNum(rec.P);
        if (change !== null) snap.change24hPct = change;
        const vol = toNum(rec.q);
        if (vol !== null) snap.volume24hUsd = vol;
        snap.sourceTs = toNum(rec.E) ?? Date.now();
        snap.updatedAt = Date.now();
      }
      return;
    }

    // ══════════════════════════════════════════════════════════════
    // markPriceArr: CACHE-ONLY — same strategy as tickerArr.
    // ══════════════════════════════════════════════════════════════
    if (stream.includes("!markprice@arr") && Array.isArray(data)) {
      this.touchMessage(Date.now());
      for (const row of data) {
        const rec = row as Record<string, unknown>;
        const rawSymbol = String(rec.s ?? "");
        if (!rawSymbol || !rawSymbol.endsWith("USDT")) continue;
        const markPrice = toNum(rec.p);
        if (markPrice === null) continue;
        let snap = this.snapshots.get(rawSymbol);
        if (!snap) {
          snap = {
            exchange: this.exchange, symbol: rawSymbol, price: null,
            change24hPct: null, volume24hUsd: null, topBid: null, topAsk: null,
            bidQty: null, askQty: null, spreadBps: null, depthUsd: null,
            imbalance: null, markPrice: null, fundingRate: null,
            nextFundingTime: null, lastTradePrice: null, lastTradeQty: null,
            lastTradeSide: null, sourceTs: null, updatedAt: Date.now(),
          };
          this.snapshots.set(rawSymbol, snap);
        }
        snap.markPrice = markPrice;
        const fr = toNum(rec.r);
        if (fr !== null) snap.fundingRate = fr;
        const nft = toNum(rec.T);
        if (nft !== null) snap.nextFundingTime = nft;
        snap.sourceTs = toNum(rec.E) ?? Date.now();
        snap.updatedAt = Date.now();
      }
      return;
    }

    if (stream.includes("!bookticker")) {
      const rec = (data ?? {}) as Record<string, unknown>;
      const symbol = ensureUsdtPair(rec.s);
      if (!symbol) return;
      const bid = toNum(rec.b);
      const ask = toNum(rec.a);
      if (bid === null || ask === null || bid <= 0 || ask <= 0) return;
      const bidQty = toNum(rec.B);
      const askQty = toNum(rec.A);
      const ts = toNum(rec.E) ?? Date.now();
      const mid = (bid + ask) / 2;
      const spreadBps = mid > 0 ? ((ask - bid) / mid) * 10_000 : null;
      const bidDepthUsd = bidQty !== null && bidQty > 0 ? bid * bidQty : null;
      const askDepthUsd = askQty !== null && askQty > 0 ? ask * askQty : null;
      const depthUsd =
        bidDepthUsd !== null || askDepthUsd !== null
          ? Math.max(0, (bidDepthUsd ?? 0) + (askDepthUsd ?? 0))
          : null;
      const imbalance =
        depthUsd && depthUsd > 0
          ? (((bidDepthUsd ?? 0) - (askDepthUsd ?? 0)) / depthUsd)
          : null;
      this.touchMessage(ts);
      this.patchSnapshot(symbol, {
        topBid: bid,
        topAsk: ask,
        bidQty: bidQty ?? null,
        askQty: askQty ?? null,
        spreadBps,
        depthUsd,
        imbalance,
        sourceTs: ts,
      });
      this.emit({
        type: "book_ticker",
        exchange: this.exchange,
        symbol,
        ts,
        recvTs: Date.now(),
        bid,
        ask,
        bidQty: bidQty ?? undefined,
        askQty: askQty ?? undefined,
      });
    }
  }

  /** Parse depth WS messages — handles ONLY kline + depthUpdate (trade moved to fast lane) */
  private parseDepthMessage(raw: WebSocket.RawData): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(toText(raw));
    } catch {
      return;
    }
    const rec = parsed as Record<string, unknown>;
    if ("result" in rec && rec.result === null) return;
    const eventType = String(rec.e ?? "");
    // NOTE: trade events are NO LONGER processed here — they arrive on the dedicated tradeWs
    if (eventType === "kline") {
      this.onKline(rec);
      return;
    }
    if (eventType === "depthUpdate") {
      this.onDepthDelta(rec);
    }
  }

  /** Diagnostic counter for raw trade timestamp debugging */
  private _rawTradeDiag = 0;

  private onTrade(rec: Record<string, unknown>): void {
    this._diagTradeCount += 1;
    const raw = String(rec.s ?? "");
    // Fast path: Binance sends uppercase USDT pairs — skip regex normalize
    const symbol = raw.endsWith("USDT") ? raw : ensureUsdtPair(raw);
    if (!symbol) return;
    const price = toNum(rec.p);
    const qty = toNum(rec.q);
    if (price === null || qty === null || price <= 0 || qty <= 0) return;
    const ts = toNum(rec.T) ?? toNum(rec.E) ?? Date.now();

    // Diagnostic: log raw timestamp fields for BTCUSDT (1 in 500)
    if (symbol === "BTCUSDT" && ++this._rawTradeDiag % 500 === 0) {
      const now = Date.now();
      console.log(`[RAW_TRADE] BTCUSDT T=${rec.T} E=${rec.E} ts=${ts} now=${now} T-now=${now - ts}ms E-now=${now - (toNum(rec.E) ?? 0)}ms price=${price}`);
    }

    this.touchMessage(ts);
    const side: "BUY" | "SELL" = rec.m === true ? "SELL" : "BUY";
    // Inline snapshot patch — skip patchSnapshot overhead (ensureUsdtPair + for..in + object alloc)
    const snap = this.snapshots.get(symbol);
    if (snap) {
      snap.lastTradePrice = price;
      snap.lastTradeQty = qty;
      snap.lastTradeSide = side;
      snap.sourceTs = ts;
      snap.updatedAt = Date.now();
    } else {
      this.patchSnapshot(symbol, { lastTradePrice: price, lastTradeQty: qty, lastTradeSide: side, sourceTs: ts });
    }
    this.appendRecentTrade(symbol, { ts, price, amount: qty, side });
    const event: NormalizedTradeEvent = {
      type: "trade",
      exchange: this.exchange,
      symbol,
      ts,
      recvTs: Date.now(),
      tradeId: rec.t !== undefined ? String(rec.t) : undefined,
      price,
      qty,
      side,
    };
    this.emit(event);
  }

  private onKline(rec: Record<string, unknown>): void {
    this._diagKlineCount += 1;
    const raw = String(rec.s ?? "");
    const symbol = raw.endsWith("USDT") ? raw : ensureUsdtPair(raw);
    if (!symbol) return;
    const k = (rec.k ?? {}) as Record<string, unknown>;
    const interval = String(k.i ?? "").toLowerCase();
    if (!interval) return;
    const openTime = toNum(k.t);
    const open = toNum(k.o);
    const high = toNum(k.h);
    const low = toNum(k.l);
    const close = toNum(k.c);
    const volume = toNum(k.v) ?? 0;
    const closed = Boolean(k.x); // true if candle is final/closed
    if (openTime === null || open === null || high === null || low === null || close === null) return;
    const candle: AdapterCandlePoint = {
      time: Math.floor(openTime / 1000),
      open,
      high,
      low,
      close,
      volume: Math.max(0, volume),
    };
    this.upsertCandle(symbol, interval, candle);
    // Use Binance event time (rec.E), NOT kline close time (k.T) which is in the future for open candles
    const ts = toNum(rec.E) ?? Date.now();
    this.touchMessage(ts);
    // Inline snapshot patch for hot path
    const snap = this.snapshots.get(symbol);
    if (snap) {
      snap.price = close;
      snap.sourceTs = ts;
      snap.updatedAt = Date.now();
    } else {
      this.patchSnapshot(symbol, { price: close, sourceTs: ts });
    }
    // Emit canonical kline event for real-time candle push
    const klineEvent: NormalizedKlineEvent = {
      type: "kline",
      exchange: this.exchange,
      symbol,
      ts,
      recvTs: Date.now(),
      interval,
      openTime: Math.floor(openTime / 1000),
      open,
      high,
      low,
      close,
      volume: Math.max(0, volume),
      closed,
    };
    this.emit(klineEvent);
  }

  private onDepthDelta(rec: Record<string, unknown>): void {
    this._diagDepthCount += 1;
    const symbol = ensureUsdtPair(rec.s);
    if (!symbol) return;
    const startSeq = toNum(rec.U);
    const endSeq = toNum(rec.u);
    if (startSeq === null || endSeq === null) return;
    const bids = levelRows(rec.b);
    const asks = levelRows(rec.a);
    const ts = toNum(rec.E) ?? Date.now();
    this.touchMessage(ts);
    this.lastBookDeltaAtBySymbol.set(symbol, Date.now());

    const delta: NormalizedBookDeltaEvent = {
      type: "book_delta",
      exchange: this.exchange,
      symbol,
      ts,
      recvTs: Date.now(),
      startSeq,
      endSeq,
      bids,
      asks,
    };
    this.emit(delta);

    // ── State machine: WS delta arrived — if in DESYNC_SUSPECTED, WS recovered ──
    const currentState = this.getSymbolState(symbol);
    if (currentState === DepthSymbolState.DESYNC_SUSPECTED) {
      // WS came back before we triggered recovery — cancel desync
      this.transitionState(symbol, DepthSymbolState.READY, "ws_delta_resumed");
    }

    if (!this.orderbooks.isReady(symbol)) {
      const queue = this.deltaBufferBySymbol.get(symbol) ?? [];
      queue.push(delta);
      if (queue.length > DEPTH_BUFFER_MAX) queue.splice(0, queue.length - DEPTH_BUFFER_MAX);
      this.deltaBufferBySymbol.set(symbol, queue);
      if (!this.pendingSnapshotSymbols.has(symbol)) {
        this.enqueueSnapshot(symbol);
      }
      // ── Incremental depth cache: emit partial book from buffered deltas ──
      // Even without REST snapshot, build a partial book from WS deltas
      // so depth cache is never empty
      this.emitIncrementalDepth(symbol, bids, asks, ts);
      return;
    }

    const applied = this.orderbooks.applyDelta(symbol, startSeq, endSeq, bids, asks);
    if (!applied.ok && applied.gap) {
      this.gapCount += 1;
      this.pushReason(`depth_gap:${symbol}:${startSeq}-${endSeq}`);
      this.resetSymbolSyncState(symbol);
      // ── State machine: gap detected → trigger recovery through state machine ──
      const gapAttempts = this.symbolRecoveryAttempts.get(symbol) ?? 0;
      this.symbolRecoveryAttempts.set(symbol, gapAttempts + 1);
      if (gapAttempts + 1 >= RECOVERY_MAX_BEFORE_BLOCK) {
        this.transitionState(symbol, DepthSymbolState.BLOCKED, `gap_${gapAttempts + 1}_attempts`);
      } else {
        this.transitionState(symbol, DepthSymbolState.RECOVERING, `depth_gap_seq_${startSeq}`);
        this.enqueueSnapshot(symbol);
      }
      return;
    }
    if (applied.applied) {
      this.updateBookDerivedFields(symbol, ts);
      // ── Emit periodic book_snapshot from live orderbook for depth cache ──
      this.emitThrottledBookSnapshot(symbol, ts);
    }
  }

  // ── Incremental depth: build partial book from WS deltas even without REST snapshot ──
  private incrementalBooks = new Map<string, Map<number, number>>(); // symbol → bids map
  private incrementalAsks = new Map<string, Map<number, number>>(); // symbol → asks map
  private incrementalLastEmit = new Map<string, number>();

  private emitIncrementalDepth(symbol: string, bids: Array<[number, number]>, asks: Array<[number, number]>, ts: number): void {
    // Initialize maps if needed
    if (!this.incrementalBooks.has(symbol)) this.incrementalBooks.set(symbol, new Map());
    if (!this.incrementalAsks.has(symbol)) this.incrementalAsks.set(symbol, new Map());

    const bidsMap = this.incrementalBooks.get(symbol)!;
    const asksMap = this.incrementalAsks.get(symbol)!;

    // Always accumulate deltas — even when throttled — so the book stays current
    for (const [p, q] of bids) {
      if (q <= 0) bidsMap.delete(p);
      else bidsMap.set(p, q);
    }
    for (const [p, q] of asks) {
      if (q <= 0) asksMap.delete(p);
      else asksMap.set(p, q);
    }

    // Throttle emission only — accumulation happens above
    const now = Date.now();
    const last = this.incrementalLastEmit.get(symbol) ?? 0;
    if (now - last < 1000) return; // throttle: max 1 per 1s

    // Need at least 3 levels each side to emit
    if (bidsMap.size < 3 || asksMap.size < 3) return;

    this.incrementalLastEmit.set(symbol, now);

    // Sort and take top 20
    const sortedBids = Array.from(bidsMap.entries()).sort((a, b) => b[0] - a[0]).slice(0, 20);
    const sortedAsks = Array.from(asksMap.entries()).sort((a, b) => a[0] - b[0]).slice(0, 20);

    const bookState = this.orderbooks.isReady(symbol) ? "LIVE_FULL" : "LIVE_DEGRADED";

    this.emit({
      type: "book_snapshot",
      exchange: this.exchange,
      symbol,
      ts,
      recvTs: now,
      seq: 0,
      bids: sortedBids,
      asks: sortedAsks,
      bookState,
    } as any);
  }

  private bookSnapshotLastEmit = new Map<string, number>();
  private emitThrottledBookSnapshot(symbol: string, ts: number): void {
    const now = Date.now();
    const last = this.bookSnapshotLastEmit.get(symbol) ?? 0;
    if (now - last < 1000) return; // throttle: max 1 per 1s per symbol
    this.bookSnapshotLastEmit.set(symbol, now);
    const top = this.orderbooks.getTopLevels(symbol, 20);
    if (!top || top.bids.length === 0 || top.asks.length === 0) return;
    this.emit({
      type: "book_snapshot",
      exchange: this.exchange,
      symbol,
      ts,
      recvTs: now,
      seq: top.seq,
      bids: top.bids,
      asks: top.asks,
      bookState: "LIVE_FULL",
    } as any);
  }

  private enqueueSnapshot(symbol: string): void {
    const normalized = ensureUsdtPair(symbol);
    if (!normalized || !this.isDepthEligible(normalized)) return;
    if (this.pendingSnapshotSymbols.has(normalized)) return;
    if (this.snapshotQueueSet.has(normalized)) return;
    // Global block: if REST API returned 418/429, don't enqueue anything
    if (this.snapshotBlockedUntil > Date.now()) return;

    // ── State machine gate: only allow snapshots in INIT or RECOVERING ──
    const state = this.getSymbolState(normalized);
    if (state !== DepthSymbolState.INIT && state !== DepthSymbolState.RECOVERING) {
      // Symbol is in READY, SYNCING, COOLDOWN, BLOCKED, or DESYNC_SUSPECTED — no snapshot
      return;
    }

    // Transition to SYNCING (first snapshot) or stay RECOVERING (recovery snapshot)
    if (state === DepthSymbolState.INIT) {
      this.transitionState(normalized, DepthSymbolState.SYNCING, "initial_snapshot_requested");
    }
    // RECOVERING state already set by the sanity timer — no transition needed

    // Global queue cap: never queue more than 5 snapshots at once
    if (this.snapshotQueue.length >= 5) return;
    this.snapshotQueue.push(normalized);
    this.snapshotQueueSet.add(normalized);
    void this.drainSnapshotQueue();
  }

  private async drainSnapshotQueue(): Promise<void> {
    if (this.snapshotDrainInFlight) return;
    this.snapshotDrainInFlight = true;
    try {
      while (this.started && this.snapshotQueue.length > 0) {
        const now = Date.now();
        if (this.snapshotBlockedUntil > now) {
          await new Promise((resolve) => setTimeout(resolve, Math.min(1_500, this.snapshotBlockedUntil - now)));
          continue;
        }
        const symbol = this.snapshotQueue.shift()!;
        this.snapshotQueueSet.delete(symbol);
        await this.requestDepthSnapshot(symbol);
        if (this.snapshotQueue.length > 0) {
          await new Promise((resolve) => setTimeout(resolve, SNAPSHOT_REQUEST_GAP_MS));
        }
      }
    } finally {
      this.snapshotDrainInFlight = false;
    }
  }

  private async requestDepthSnapshot(symbol: string): Promise<void> {
    if (!symbol || this.pendingSnapshotSymbols.has(symbol)) return;
    if (!this.isDepthEligible(symbol)) return;
    this.pendingSnapshotSymbols.add(symbol);
    let timeout: ReturnType<typeof setTimeout> | null = null;
    try {
      const res = await guardedBinanceFetch(
        `${BINANCE_DEPTH_SNAPSHOT_BASE}/fapi/v1/depth?symbol=${encodeURIComponent(symbol)}&limit=100`,
        { timeoutMs: 3_800, dedupKey: `hub-depth-${symbol}`, reason: "depth_snapshot" },
      );
      if (timeout) { clearTimeout(timeout); timeout = null; }
      if (!res.ok) {
        throw new Error(`snapshot_http_${res.status}`);
      }
      const snapshotRaw = (await res.json()) as Record<string, unknown>;
      const seq = toNum(snapshotRaw.lastUpdateId);
      if (seq === null) throw new Error("snapshot_no_seq");
      const bids = levelRows(snapshotRaw.bids);
      const asks = levelRows(snapshotRaw.asks);
      const ts = Date.now();
      const snapshotEvent: NormalizedBookSnapshotEvent = {
        type: "book_snapshot",
        exchange: this.exchange,
        symbol,
        ts,
        recvTs: ts,
        seq,
        bids,
        asks,
      };
      this.emit(snapshotEvent);
      this.orderbooks.applySnapshot(symbol, seq, bids, asks);
      this.lastSnapshotAtBySymbol.set(symbol, Date.now());
      this.snapshotFailuresBySymbol.set(symbol, 0);
      this.snapshotFailures = Math.max(0, this.snapshotFailures - 1);
      // ── State machine: snapshot succeeded → READY ──
      this.symbolRecoveryAttempts.set(symbol, 0);
      this.transitionState(symbol, DepthSymbolState.READY, "snapshot_success");

      const buffered = this.deltaBufferBySymbol.get(symbol) ?? [];
      this.deltaBufferBySymbol.delete(symbol);
      if (buffered.length) {
        buffered.sort((a, b) => a.endSeq - b.endSeq);
        for (const delta of buffered) {
          if (delta.endSeq <= seq) continue;
          const applied = this.orderbooks.applyDelta(
            symbol,
            delta.startSeq,
            delta.endSeq,
            delta.bids,
            delta.asks,
          );
          if (!applied.ok && applied.gap) {
            this.gapCount += 1;
            this.pushReason(`snapshot_reconcile_gap:${symbol}`);
            this.resetSymbolSyncState(symbol);
            this.resyncs += 1;
            this.pendingSnapshotSymbols.delete(symbol);
            // Use state machine for reconciliation gap recovery
            const reconAttempts = this.symbolRecoveryAttempts.get(symbol) ?? 0;
            this.symbolRecoveryAttempts.set(symbol, reconAttempts + 1);
            if (reconAttempts + 1 >= RECOVERY_MAX_BEFORE_BLOCK) {
              this.transitionState(symbol, DepthSymbolState.BLOCKED, `reconcile_gap_${reconAttempts + 1}_attempts`);
            } else {
              this.transitionState(symbol, DepthSymbolState.RECOVERING, "reconcile_gap");
              this.enqueueSnapshot(symbol);
            }
            return;
          }
        }
      }

      this.updateBookDerivedFields(symbol, ts);
      this.resyncs += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "snapshot_error";
      this.lastError = `snapshot:${message}`;
      this.pushReason(`snapshot_fail:${symbol}:${message}`);
      const currentFail = (this.snapshotFailuresBySymbol.get(symbol) ?? 0) + 1;
      this.snapshotFailuresBySymbol.set(symbol, currentFail);
      this.snapshotFailures += 1;
      const statusMatch = message.match(/snapshot_http_(\d{3})/);
      const statusCode = statusMatch ? Number(statusMatch[1]) : null;
      if (statusCode === 403 || statusCode === 418 || statusCode === 429) {
        // IP blocked or rate limited — stop ALL snapshot requests for cooldown period
        this.snapshotBlockedUntil = Date.now() + SNAPSHOT_BLOCK_COOLDOWN_MS;
        this.pushReason(`snapshot_blocked:${statusCode}`);
        this.snapshotQueue.length = 0;
        this.snapshotQueueSet.clear();
        console.log(`[BinanceFuturesAdapter] REST API ${statusCode} — blocking snapshots for ${SNAPSHOT_BLOCK_COOLDOWN_MS / 1000}s`);
        // All symbols in SYNCING/RECOVERING → BLOCKED immediately on IP ban
        for (const sym of this.depthSymbols) {
          const symState = this.getSymbolState(sym);
          if (symState === DepthSymbolState.SYNCING || symState === DepthSymbolState.RECOVERING) {
            this.transitionState(sym, DepthSymbolState.BLOCKED, `ip_ban_${statusCode}`);
          }
        }
      } else if (statusCode === 400 && currentFail >= 3) {
        this.excludedDepthSymbols.add(symbol);
        this.transitionState(symbol, DepthSymbolState.BLOCKED, `bad_request_${currentFail}_fails`);
        this.pushReason(`exclude_depth_symbol:${symbol}`);
      } else {
        // ── State machine: snapshot failed → COOLDOWN or BLOCKED ──
        const attempts = this.symbolRecoveryAttempts.get(symbol) ?? 0;
        const newAttempts = attempts + 1;
        this.symbolRecoveryAttempts.set(symbol, newAttempts);
        if (newAttempts >= RECOVERY_MAX_BEFORE_BLOCK) {
          this.transitionState(symbol, DepthSymbolState.BLOCKED, `${newAttempts}_attempts_exhausted`);
          this.excludedDepthSymbols.add(symbol);
          console.log(`[BinanceFuturesAdapter] ${symbol} → BLOCKED after ${newAttempts} failed attempts (WS still running)`);
        } else {
          const cooldownMs = this.getRecoveryCooldownMs(newAttempts);
          this.transitionState(symbol, DepthSymbolState.COOLDOWN, `attempt_${newAttempts}_failed_cooldown_${Math.round(cooldownMs / 1000)}s`);
        }
      }
    } finally {
      if (timeout) clearTimeout(timeout);
      this.pendingSnapshotSymbols.delete(symbol);
    }
  }

  private isDepthEligible(symbol: string): boolean {
    const normalized = ensureUsdtPair(symbol);
    if (!normalized) return false;
    if (this.excludedDepthSymbols.has(normalized)) return false;
    if (!this.futuresContracts.size) return true;
    return this.futuresContracts.has(normalized);
  }

  private resetSymbolSyncState(symbol: string): void {
    const normalized = ensureUsdtPair(symbol);
    if (!normalized) return;
    this.orderbooks.reset(normalized);
    this.deltaBufferBySymbol.delete(normalized);
    this.pendingSnapshotSymbols.delete(normalized);
    this.lastBookDeltaAtBySymbol.delete(normalized);
  }

  private async refreshContracts(): Promise<void> {
    if (this.contractsLoading) return;
    this.contractsLoading = true;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    try {
      const res = await guardedBinanceFetch(
        `${BINANCE_DEPTH_SNAPSHOT_BASE}/fapi/v1/exchangeInfo`,
        { timeoutMs: 6_000, dedupKey: "hub-exchangeInfo", reason: "contract_refresh" },
      );
      if (timeout) { clearTimeout(timeout); timeout = null; }
      if (!res.ok) {
        throw new Error(`contracts_http_${res.status}`);
      }
      const raw = (await res.json()) as Record<string, unknown>;
      const symbols = Array.isArray(raw.symbols) ? raw.symbols : [];
      const next = new Set<string>();
      for (const row of symbols) {
        const rec = row as Record<string, unknown>;
        const contractType = String(rec.contractType ?? "").toUpperCase();
        const status = String(rec.status ?? "").toUpperCase();
        const quoteAsset = String(rec.quoteAsset ?? "").toUpperCase();
        if (status !== "TRADING") continue;
        if (quoteAsset !== "USDT") continue;
        if (contractType && contractType !== "PERPETUAL") continue;
        const symbol = ensureUsdtPair(rec.symbol);
        if (symbol) next.add(symbol);
      }
      if (next.size > 0) {
        this.futuresContracts.clear();
        for (const symbol of next) this.futuresContracts.add(symbol);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "contracts_error";
      this.pushReason(`contracts_refresh_fail:${message}`);
    } finally {
      if (timeout) clearTimeout(timeout);
      this.contractsLoading = false;
    }
  }

  private updateBookDerivedFields(symbol: string, ts: number): void {
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

  private patchSnapshot(symbol: string, patch: Partial<AdapterSymbolSnapshot>): void {
    const key = ensureUsdtPair(symbol);
    if (!key) return;
    let existing = this.snapshots.get(key);
    if (!existing) {
      existing = {
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
      };
      this.snapshots.set(key, existing);
    }
    // Mutate in place — avoid 300+ object allocations per !ticker@arr
    for (const k in patch) {
      (existing as Record<string, unknown>)[k] = (patch as Record<string, unknown>)[k];
    }
    existing.updatedAt = Date.now();
  }

  private appendRecentTrade(symbol: string, row: AdapterTradePoint): void {
    const key = ensureUsdtPair(symbol);
    if (!key) return;
    const current = this.recentTradesBySymbol.get(key) ?? [];
    current.push(row);
    if (current.length > TRADE_STORE_MAX) current.splice(0, current.length - TRADE_STORE_MAX);
    this.recentTradesBySymbol.set(key, current);
  }

  // ── Reconnect backfill: fetch last 2 candles per symbol via REST ──
  // Only backfill critical intervals (1m, 15m, 1h) — others will fill from WS kline stream.
  // Staggered with jitter to avoid burst.
  private async backfillCandles(symbols: string[]): Promise<void> {
    const BACKFILL_INTERVALS = ["1m", "15m"] as const; // only critical timeframes
    const MAX_BACKFILL_SYMBOLS = 3; // minimal reconnect backfill
    const limited = symbols.slice(0, MAX_BACKFILL_SYMBOLS);

    for (const symbol of limited) {
      if (!this.started) return;
      for (const interval of BACKFILL_INTERVALS) {
        try {
          const res = await guardedBinanceFetch(
            `${BINANCE_DEPTH_SNAPSHOT_BASE}/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=2`,
            { timeoutMs: 4_000, dedupKey: `hub-klines-${symbol}-${interval}`, reason: "reconnect_backfill" },
          );
          if (!res.ok) continue;
          const rows = (await res.json()) as unknown[];
          if (!Array.isArray(rows)) continue;
          for (const row of rows) {
            if (!Array.isArray(row) || row.length < 6) continue;
            const openTime = Number(row[0]);
            const open = Number(row[1]);
            const high = Number(row[2]);
            const low = Number(row[3]);
            const close = Number(row[4]);
            const volume = Number(row[5]);
            if (!Number.isFinite(openTime) || !Number.isFinite(close)) continue;
            this.upsertCandle(symbol, interval, {
              time: Math.floor(openTime / 1000),
              open, high, low, close,
              volume: Math.max(0, volume),
            });
            const closed = Number(row[6]) < Date.now();
            this.emit({
              type: "kline",
              exchange: this.exchange,
              symbol,
              ts: Date.now(),
              recvTs: Date.now(),
              interval,
              openTime: Math.floor(openTime / 1000),
              open, high, low, close,
              volume: Math.max(0, volume),
              closed,
            });
          }
        } catch {
          // backfill is best-effort; continue with next
        }
      }
      // 1.5s base delay + random 0-2.5s jitter between symbols
      const delay = 1500 + Math.floor(Math.random() * 2500);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    this.pushReason(`backfill_done:${symbols.length}_symbols`);
  }

  private upsertCandle(symbol: string, interval: string, row: AdapterCandlePoint): void {
    const key = ensureUsdtPair(symbol);
    if (!key) return;
    const frame = interval.toLowerCase();
    const byInterval = this.candlesBySymbol.get(key) ?? new Map<string, AdapterCandlePoint[]>();
    const list = byInterval.get(frame) ?? [];
    const last = list[list.length - 1];
    if (last && last.time === row.time) {
      list[list.length - 1] = row;
    } else if (!last || row.time > last.time) {
      list.push(row);
      if (list.length > CANDLE_STORE_MAX) list.splice(0, list.length - CANDLE_STORE_MAX);
    } else {
      const idx = list.findIndex((item) => item.time === row.time);
      if (idx >= 0) list[idx] = row;
    }
    byInterval.set(frame, list);
    this.candlesBySymbol.set(key, byInterval);
  }
}
