import WebSocket from "ws";
import type { IExchangeMarketAdapter } from "./adapter.ts";
import type {
  AdapterCandlePoint,
  AdapterHealthSnapshot,
  AdapterSymbolSnapshot,
  AdapterTradePoint,
  NormalizedBookDeltaEvent,
  NormalizedBookSnapshotEvent,
  NormalizedBookTickerEvent,
  NormalizedEvent,
  NormalizedKlineEvent,
  NormalizedTickerEvent,
  NormalizedTradeEvent,
} from "./types.ts";
import { SequenceSafeOrderbookStore } from "./sequenceSafeOrderbook.ts";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const OKX_WS_URL = "wss://ws.okx.com:8443/ws/v5/public";
const OKX_REST_BASE = "https://www.okx.com/api/v5";
const WATCHDOG_STALE_MS = 30_000;
const WATCHDOG_TICK_MS = 5_000;
const HEARTBEAT_PING_MS = 25_000;
const SYMBOL_DELTA_STALE_MS = 14_000;
const SNAPSHOT_SANITY_INTERVAL_MS = 10_000;
const SNAPSHOT_REFRESH_MIN_MS = 45_000;
const SNAPSHOT_SANITY_BATCH = 6;
const RECONNECT_BASE_MS = 700;
const RECONNECT_MAX_MS = 12_000;
const DELTA_BUFFER_MAX = 400;
const CANDLE_STORE_MAX = 900;
const TRADE_STORE_MAX = 500;
const MAX_DEPTH_SYMBOLS = 10;

const PRIORITY_DEPTH_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];

/** OKX candle channel names for each interval we track. */
const OKX_CANDLE_CHANNELS = [
  "candle1m",
  "candle5m",
  "candle15m",
  "candle30m",
  "candle1H",
  "candle4H",
  "candle1D",
] as const;

/** Maps OKX channel suffix back to a normalised interval string. */
const OKX_CHANNEL_TO_INTERVAL: Record<string, string> = {
  candle1m: "1m",
  candle5m: "5m",
  candle15m: "15m",
  candle30m: "30m",
  "candle1H": "1h",
  "candle4H": "4h",
  "candle1D": "1d",
};

/* ------------------------------------------------------------------ */
/*  Utility helpers                                                    */
/* ------------------------------------------------------------------ */

const toText = (raw: WebSocket.RawData): string => {
  if (typeof raw === "string") return raw;
  if (Buffer.isBuffer(raw)) return raw.toString("utf8");
  if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString("utf8");
  if (Array.isArray(raw)) return Buffer.concat(raw).toString("utf8");
  return String(raw ?? "");
};

const toNum = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const toMs = (value: unknown): number | null => {
  const n = toNum(value);
  if (n === null || n <= 0) return null;
  // OKX timestamps are in milliseconds already
  return n < 1_000_000_000_000 ? Math.round(n * 1000) : Math.round(n);
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asRecordList = (value: unknown): Array<Record<string, unknown>> => {
  if (Array.isArray(value)) {
    return value
      .map((item) => asRecord(item))
      .filter((item): item is Record<string, unknown> => Boolean(item));
  }
  const one = asRecord(value);
  return one ? [one] : [];
};

/**
 * Convert internal symbol (e.g. "BTCUSDT") to OKX instId (e.g. "BTC-USDT-SWAP").
 */
function toOkxInstId(symbol: string): string {
  const s = symbol.toUpperCase().replace(/[-_]/g, "");
  if (s.endsWith("USDT")) return `${s.slice(0, -4)}-USDT-SWAP`;
  return symbol;
}

/**
 * Convert OKX instId (e.g. "BTC-USDT-SWAP") to internal symbol (e.g. "BTCUSDT").
 */
function fromOkxInstId(instId: string): string {
  return instId.replace(/-USDT-SWAP$/, "USDT").replace(/-/g, "");
}

/**
 * Normalise any symbol-like string to internal "BTCUSDT" form.
 */
const normalizeSymbol = (raw: unknown): string => {
  const s = String(raw ?? "").toUpperCase().replace(/[-_/]/g, "").trim();
  if (!s) return "";
  if (s.endsWith("USDTSWAP")) return s.replace(/SWAP$/, "");
  return s;
};

const normalizeLevelRows = (input: unknown): Array<[number, number]> => {
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
      const price = toNum(rec.px ?? rec.p ?? rec.price);
      const qty = toNum(rec.sz ?? rec.s ?? rec.size ?? rec.q ?? rec.amount);
      if (price !== null && price > 0 && qty !== null) {
        out.push([price, Math.max(0, qty)]);
      }
    }
  }
  return out;
};

const computeBackoff = (attempt: number): number => {
  const expo = Math.round(RECONNECT_BASE_MS * Math.pow(1.9, Math.max(0, attempt - 1)));
  const jitter = Math.floor(Math.random() * 250);
  return Math.min(RECONNECT_MAX_MS, expo + jitter);
};

const nowIso = () => new Date().toISOString();

/* ------------------------------------------------------------------ */
/*  Adapter                                                            */
/* ------------------------------------------------------------------ */

export class OkxFuturesMarketAdapter implements IExchangeMarketAdapter {
  readonly exchange = "OKX" as const;

  /* -- WebSocket state ------------------------------------------------ */
  private ws: WebSocket | null = null;
  private started = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private snapshotSanityTimer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<(event: NormalizedEvent) => void>();

  /* -- Data stores ---------------------------------------------------- */
  private readonly snapshots = new Map<string, AdapterSymbolSnapshot>();
  private readonly candlesBySymbol = new Map<string, Map<string, AdapterCandlePoint[]>>();
  private readonly recentTradesBySymbol = new Map<string, AdapterTradePoint[]>();
  private readonly orderbooks = new SequenceSafeOrderbookStore();
  private readonly deltaBufferBySymbol = new Map<string, NormalizedBookDeltaEvent[]>();
  private readonly lastBookDeltaAtBySymbol = new Map<string, number>();
  private readonly lastSnapshotAtBySymbol = new Map<string, number>();

  /* -- Symbol tracking ------------------------------------------------ */
  private readonly symbols = new Set<string>();
  private readonly depthSymbols = new Set<string>();
  private readonly pendingSnapshotSymbols = new Set<string>();
  private readonly reasons: string[] = [];

  /* -- Metrics -------------------------------------------------------- */
  private lastMessageAt = 0;
  private lastError: string | null = null;
  private reconnects = 0;
  private resyncs = 0;
  private gapCount = 0;
  private symbolStaleResyncs = 0;
  private snapshotFailures = 0;
  private snapshotCursor = 0;
  private latencyEmaMs: number | null = null;

  /* ================================================================== */
  /*  Public interface                                                   */
  /* ================================================================== */

  start(): void {
    if (this.started) return;
    this.started = true;

    // Pre-seed priority symbols so they always get depth subscriptions
    for (const symbol of PRIORITY_DEPTH_SYMBOLS) {
      if (this.depthSymbols.size >= MAX_DEPTH_SYMBOLS) break;
      this.symbols.add(symbol);
      this.depthSymbols.add(symbol);
    }

    this.connect();
    this.startHeartbeat();
    this.startWatchdog();
    this.startSnapshotSanity();
  }

  stop(): void {
    this.started = false;
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
    if (this.snapshotSanityTimer) {
      clearInterval(this.snapshotSanityTimer);
      this.snapshotSanityTimer = null;
    }
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.terminate();
      this.ws = null;
    }
  }

  subscribeSymbols(symbols: string[]): void {
    const normalized = [
      ...new Set(symbols.map((s) => normalizeSymbol(s)).filter(Boolean)),
    ];
    if (!normalized.length) return;

    const added: string[] = [];
    for (const symbol of normalized) {
      if (this.symbols.has(symbol)) continue;
      this.symbols.add(symbol);
      added.push(symbol);
    }
    if (!added.length) return;

    // Track which symbols get depth subscriptions (up to MAX_DEPTH_SYMBOLS)
    for (const symbol of added) {
      if (this.depthSymbols.size >= MAX_DEPTH_SYMBOLS) break;
      this.depthSymbols.add(symbol);
    }

    this.sendSubscribeMessages(added);
    for (const symbol of added) {
      if (this.depthSymbols.has(symbol)) {
        void this.requestSnapshot(symbol);
      }
    }
  }

  onEvent(cb: (event: NormalizedEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  getHealth(): AdapterHealthSnapshot {
    const now = Date.now();
    const connected = Boolean(this.ws && this.ws.readyState === WebSocket.OPEN);
    const ageMs =
      this.lastMessageAt > 0
        ? Math.max(0, now - this.lastMessageAt)
        : Number.POSITIVE_INFINITY;

    let score = connected ? 96 : 20;

    if (ageMs > 3_000) score -= 8;
    if (ageMs > 7_000) score -= 13;
    if (ageMs > 12_000) score -= 18;
    if (ageMs > 22_000) score -= 25;

    if (this.latencyEmaMs !== null) {
      if (this.latencyEmaMs > 700) score -= 6;
      if (this.latencyEmaMs > 1_500) score -= 8;
      if (this.latencyEmaMs > 2_500) score -= 10;
    }

    score -= Math.min(10, this.gapCount * 0.5);
    score -= Math.min(10, this.resyncs * 0.45);
    score -= Math.min(9, this.symbolStaleResyncs * 0.4);
    score -= Math.min(12, this.snapshotFailures * 1.1);
    score -= Math.min(6, this.pendingSnapshotSymbols.size * 0.8);

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
      !connected || ageMs > WATCHDOG_STALE_MS
        ? "down"
        : score >= 75
          ? "healthy"
          : "degraded";

    const reasons: string[] = [];
    if (!connected) reasons.push("ws_disconnected");
    if (ageMs > 7_000) reasons.push(`message_age_${Math.round(ageMs)}ms`);
    if (staleSymbolCount > 0) reasons.push(`stale_symbols_${staleSymbolCount}`);
    if (this.snapshotFailures > 0) reasons.push(`snapshot_failures_${this.snapshotFailures}`);
    if (this.pendingSnapshotSymbols.size > 0)
      reasons.push(`snapshot_pending_${this.pendingSnapshotSymbols.size}`);
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
      reconnects: this.reconnects,
      resyncs: this.resyncs,
      gapCount: this.gapCount,
      reasons: [...new Set(reasons)].slice(0, 8),
    };
  }

  getSnapshot(symbol: string): AdapterSymbolSnapshot | null {
    const key = normalizeSymbol(symbol);
    if (!key) return null;
    return this.snapshots.get(key) ?? null;
  }

  getCandles(symbol: string, interval: string, limit: number): AdapterCandlePoint[] {
    const key = normalizeSymbol(symbol);
    if (!key) return [];
    const byInterval = this.candlesBySymbol.get(key);
    if (!byInterval) return [];
    const rows = byInterval.get(interval.toLowerCase()) ?? [];
    if (!rows.length) return [];
    return rows.slice(-Math.max(1, Math.min(1500, limit)));
  }

  getRecentTrades(symbol: string, limit: number): AdapterTradePoint[] {
    const key = normalizeSymbol(symbol);
    if (!key) return [];
    const rows = this.recentTradesBySymbol.get(key) ?? [];
    if (!rows.length) return [];
    return rows.slice(-Math.max(1, Math.min(800, limit)));
  }

  /* ================================================================== */
  /*  Internal helpers                                                   */
  /* ================================================================== */

  private emit(event: NormalizedEvent): void {
    for (const cb of this.listeners) cb(event);
  }

  private pushReason(reason: string): void {
    this.reasons.push(`${nowIso()}:${reason}`);
    if (this.reasons.length > 30) this.reasons.splice(0, this.reasons.length - 30);
  }

  private touchMessage(eventTs?: number | null): void {
    const now = Date.now();
    this.lastMessageAt = now;
    if (eventTs === null || eventTs === undefined || !Number.isFinite(eventTs) || eventTs <= 0)
      return;
    const latency = Math.max(0, now - Number(eventTs));
    this.latencyEmaMs =
      this.latencyEmaMs === null ? latency : this.latencyEmaMs * 0.8 + latency * 0.2;
  }

  /* ------------------------------------------------------------------ */
  /*  WebSocket lifecycle                                                */
  /* ------------------------------------------------------------------ */

  private connect(): void {
    if (!this.started) return;
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.terminate();
      this.ws = null;
    }

    const ws = new WebSocket(OKX_WS_URL, { handshakeTimeout: 10_000 });
    this.ws = ws;

    ws.on("open", () => {
      this.reconnectAttempts = 0;
      this.lastError = null;
      this.touchMessage(Date.now());
      this.pushReason("ws_open");

      // Reset sync state for all depth symbols
      for (const symbol of this.depthSymbols) {
        this.resetSymbolSyncState(symbol);
      }

      // Subscribe priority symbols first, then remaining
      const priority: string[] = [];
      const rest: string[] = [];
      for (const symbol of this.symbols) {
        if (PRIORITY_DEPTH_SYMBOLS.includes(symbol)) {
          priority.push(symbol);
        } else {
          rest.push(symbol);
        }
      }
      this.sendSubscribeMessages([...priority, ...rest]);

      // Request orderbook snapshots for depth symbols
      for (const symbol of this.depthSymbols) {
        void this.requestSnapshot(symbol);
      }
    });

    ws.on("message", (raw) => {
      this.parseMessage(raw);
    });

    ws.on("close", () => {
      if (!this.started) return;
      this.pushReason("ws_close");
      this.scheduleReconnect();
    });

    ws.on("error", (error) => {
      if (!this.started) return;
      this.lastError = error instanceof Error ? error.message : "ws_error";
      this.pushReason(`ws_error:${this.lastError}`);
      this.scheduleReconnect();
    });
  }

  private scheduleReconnect(): void {
    if (!this.started || this.reconnectTimer) return;
    this.reconnectAttempts += 1;
    this.reconnects += 1;
    const waitMs = computeBackoff(this.reconnectAttempts);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, waitMs);
  }

  /* ------------------------------------------------------------------ */
  /*  Heartbeat & watchdog                                               */
  /* ------------------------------------------------------------------ */

  private startHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      try {
        // OKX V5 expects a raw "ping" string, server replies "pong"
        this.ws.send("ping");
      } catch {
        // no-op
      }
    }, HEARTBEAT_PING_MS);
  }

  private startWatchdog(): void {
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
    this.watchdogTimer = setInterval(() => {
      if (!this.started) return;
      const ageMs =
        this.lastMessageAt > 0
          ? Date.now() - this.lastMessageAt
          : Number.POSITIVE_INFINITY;
      if (ageMs <= WATCHDOG_STALE_MS) return;
      this.pushReason(`watchdog_reconnect_${Math.round(ageMs)}ms`);
      if (this.ws) {
        try {
          this.ws.terminate();
        } catch {
          // no-op
        }
      }
    }, WATCHDOG_TICK_MS);
  }

  /* ------------------------------------------------------------------ */
  /*  Snapshot sanity (periodic health-check & resync)                   */
  /* ------------------------------------------------------------------ */

  private startSnapshotSanity(): void {
    if (this.snapshotSanityTimer) clearInterval(this.snapshotSanityTimer);
    this.snapshotSanityTimer = setInterval(() => {
      if (!this.started) return;
      const now = Date.now();

      // Check for symbols that need warming up or have stale deltas
      for (const symbol of this.depthSymbols) {
        if (!this.orderbooks.isReady(symbol)) {
          if (!this.pendingSnapshotSymbols.has(symbol)) {
            this.pushReason(`snapshot_warmup:${symbol}`);
            void this.requestSnapshot(symbol);
          }
          continue;
        }
        const lastDeltaAt = this.lastBookDeltaAtBySymbol.get(symbol) ?? 0;
        if (lastDeltaAt > 0 && now - lastDeltaAt > SYMBOL_DELTA_STALE_MS) {
          if (!this.pendingSnapshotSymbols.has(symbol)) {
            this.symbolStaleResyncs += 1;
            this.pushReason(
              `symbol_delta_stale:${symbol}:${Math.round(now - lastDeltaAt)}ms`,
            );
            this.resetSymbolSyncState(symbol);
            void this.requestSnapshot(symbol);
          }
        }
      }

      // Rotate through depth symbols for periodic refresh
      const symbols = [...this.depthSymbols];
      if (!symbols.length) return;
      const total = symbols.length;
      const batch = Math.min(SNAPSHOT_SANITY_BATCH, total);
      for (let i = 0; i < batch; i += 1) {
        const idx = (this.snapshotCursor + i) % total;
        const symbol = symbols[idx]!;
        const lastSnapshotAt = this.lastSnapshotAtBySymbol.get(symbol) ?? 0;
        if (lastSnapshotAt > 0 && now - lastSnapshotAt < SNAPSHOT_REFRESH_MIN_MS) continue;
        if (this.pendingSnapshotSymbols.has(symbol)) continue;
        this.pushReason(`snapshot_sanity:${symbol}`);
        void this.requestSnapshot(symbol);
      }
      this.snapshotCursor = (this.snapshotCursor + batch) % total;
    }, SNAPSHOT_SANITY_INTERVAL_MS);
  }

  /* ------------------------------------------------------------------ */
  /*  Subscribe                                                          */
  /* ------------------------------------------------------------------ */

  private sendSubscribeMessages(symbols: string[]): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN || !symbols.length) return;

    for (const symbol of symbols) {
      const instId = toOkxInstId(symbol);
      if (!instId) continue;

      // Build args for this symbol
      const args: Array<{ channel: string; instId: string }> = [];

      // Trades & tickers for ALL subscribed symbols
      args.push({ channel: "trades", instId });
      args.push({ channel: "tickers", instId });

      // Orderbook depth only for depth-eligible symbols
      if (this.depthSymbols.has(symbol)) {
        args.push({ channel: "books", instId });
      }

      // Candle channels for all symbols
      for (const candleChannel of OKX_CANDLE_CHANNELS) {
        args.push({ channel: candleChannel, instId });
      }

      // OKX supports batching args in a single subscribe message
      // but we chunk to avoid overly large frames
      const CHUNK_SIZE = 15;
      for (let i = 0; i < args.length; i += CHUNK_SIZE) {
        const chunk = args.slice(i, i + CHUNK_SIZE);
        try {
          ws.send(JSON.stringify({ op: "subscribe", args: chunk }));
        } catch {
          // no-op, connection may have closed
        }
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Message parsing                                                    */
  /* ------------------------------------------------------------------ */

  private parseMessage(raw: WebSocket.RawData): void {
    const text = toText(raw);

    // OKX sends "pong" as a plain string reply to our "ping"
    if (text === "pong") {
      this.touchMessage(Date.now());
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return;
    }

    const rec = asRecord(parsed);
    if (!rec) return;

    // Handle subscribe/unsubscribe ack or error events
    const event = String(rec.event ?? "");
    if (event === "subscribe" || event === "unsubscribe") {
      this.touchMessage(Date.now());
      return;
    }
    if (event === "error") {
      this.lastError = String(rec.msg ?? rec.message ?? "ws_channel_error");
      this.pushReason(`channel_error:${this.lastError}`);
      return;
    }

    // Data messages have { arg: { channel, instId }, data: [...] }
    const argObj = asRecord(rec.arg);
    if (!argObj) return;

    const channel = String(argObj.channel ?? "");
    const instId = String(argObj.instId ?? "");
    if (!channel || !instId) return;

    const data = rec.data;
    if (!Array.isArray(data) || data.length === 0) return;

    const action = String(rec.action ?? "");

    // Route to handler based on channel
    if (channel === "books") {
      this.onBookMessage(instId, action, data);
      return;
    }
    if (channel === "trades") {
      this.onTradesMessage(instId, data);
      return;
    }
    if (channel === "tickers") {
      this.onTickersMessage(instId, data);
      return;
    }
    if (channel.startsWith("candle")) {
      const interval = OKX_CHANNEL_TO_INTERVAL[channel];
      if (interval) {
        this.onCandleMessage(instId, interval, data);
      }
      return;
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Trades handler                                                     */
  /* ------------------------------------------------------------------ */

  private onTradesMessage(instId: string, data: unknown[]): void {
    const symbol = fromOkxInstId(instId);
    if (!symbol) return;

    const payloads = asRecordList(data);
    for (const payload of payloads) {
      const price = toNum(payload.px);
      const qty = toNum(payload.sz);
      if (price === null || qty === null || price <= 0 || qty === 0) continue;

      const ts = toMs(payload.ts) ?? Date.now();
      const sideRaw = String(payload.side ?? "").toLowerCase();
      const side: "BUY" | "SELL" = sideRaw === "sell" ? "SELL" : "BUY";

      this.touchMessage(ts);

      this.patchSnapshot(symbol, {
        lastTradePrice: price,
        lastTradeQty: Math.abs(qty),
        lastTradeSide: side,
        sourceTs: ts,
      });

      this.appendRecentTrade(symbol, {
        ts,
        price,
        amount: Math.abs(qty),
        side,
      });

      const event: NormalizedTradeEvent = {
        type: "trade",
        exchange: this.exchange,
        symbol,
        ts,
        recvTs: Date.now(),
        tradeId: payload.tradeId !== undefined ? String(payload.tradeId) : undefined,
        price,
        qty: Math.abs(qty),
        side,
      };
      this.emit(event);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Tickers handler                                                    */
  /* ------------------------------------------------------------------ */

  private onTickersMessage(instId: string, data: unknown[]): void {
    const symbol = fromOkxInstId(instId);
    if (!symbol) return;

    const payloads = asRecordList(data);
    for (const payload of payloads) {
      const last = toNum(payload.last);
      if (last === null || last <= 0) continue;

      const open24h = toNum(payload.open24h);
      const change24hPct =
        open24h !== null && open24h > 0
          ? ((last - open24h) / open24h) * 100
          : 0;

      const volCcy24h = toNum(payload.volCcy24h) ?? 0;
      const ts = toMs(payload.ts) ?? Date.now();

      this.touchMessage(ts);

      const bidPx = toNum(payload.bidPx);
      const askPx = toNum(payload.askPx);
      const bidSz = toNum(payload.bidSz);
      const askSz = toNum(payload.askSz);
      const markPx = toNum(payload.markPx);
      const fundingRate = toNum(payload.fundingRate);
      const nextFundingTime = toMs(payload.nextFundingTime);

      // Compute spread from ticker bid/ask
      let spreadBps: number | null = null;
      let depthUsd: number | null = null;
      let imbalance: number | null = null;
      if (bidPx !== null && askPx !== null && bidPx > 0 && askPx > 0) {
        const mid = (bidPx + askPx) / 2;
        spreadBps = mid > 0 ? ((askPx - bidPx) / mid) * 10_000 : null;
        const bidDepthUsd = bidSz !== null && bidSz > 0 ? bidPx * bidSz : null;
        const askDepthUsd = askSz !== null && askSz > 0 ? askPx * askSz : null;
        depthUsd =
          bidDepthUsd !== null || askDepthUsd !== null
            ? Math.max(0, (bidDepthUsd ?? 0) + (askDepthUsd ?? 0))
            : null;
        imbalance =
          depthUsd && depthUsd > 0
            ? ((bidDepthUsd ?? 0) - (askDepthUsd ?? 0)) / depthUsd
            : null;
      }

      this.patchSnapshot(symbol, {
        price: last,
        change24hPct,
        volume24hUsd: volCcy24h,
        topBid: bidPx,
        topAsk: askPx,
        bidQty: bidSz,
        askQty: askSz,
        spreadBps,
        depthUsd,
        imbalance,
        markPrice: markPx,
        fundingRate: fundingRate ?? null,
        nextFundingTime: nextFundingTime ?? null,
        sourceTs: ts,
      });

      // Emit ticker event
      const tickerEvent: NormalizedTickerEvent = {
        type: "ticker",
        exchange: this.exchange,
        symbol,
        ts,
        recvTs: Date.now(),
        price: last,
        change24hPct,
        volume24hUsd: volCcy24h,
      };
      this.emit(tickerEvent);

      // Emit book ticker from ticker data
      if (bidPx !== null && askPx !== null && bidPx > 0 && askPx > 0) {
        const bookTickerEvent: NormalizedBookTickerEvent = {
          type: "book_ticker",
          exchange: this.exchange,
          symbol,
          ts,
          recvTs: Date.now(),
          bid: bidPx,
          ask: askPx,
          bidQty: bidSz ?? undefined,
          askQty: askSz ?? undefined,
        };
        this.emit(bookTickerEvent);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Kline / candle handler                                             */
  /* ------------------------------------------------------------------ */

  private onCandleMessage(
    instId: string,
    interval: string,
    data: unknown[],
  ): void {
    const symbol = fromOkxInstId(instId);
    if (!symbol) return;

    for (const item of data) {
      // OKX candle data: [ts, open, high, low, close, vol, volCcy, volCcyQuote, confirm]
      if (!Array.isArray(item) || item.length < 6) continue;

      const tsMs = toMs(item[0]);
      if (tsMs === null) continue;

      const open = toNum(item[1]);
      const high = toNum(item[2]);
      const low = toNum(item[3]);
      const close = toNum(item[4]);
      const volume = toNum(item[5]) ?? 0;
      if (open === null || high === null || low === null || close === null) continue;

      const confirm = item.length >= 9 ? String(item[8]) : "0";
      const closed = confirm === "1";

      const candle: AdapterCandlePoint = {
        time: Math.floor(tsMs / 1000),
        open,
        high,
        low,
        close,
        volume: Math.max(0, volume),
      };

      this.upsertCandle(symbol, interval, candle);
      this.touchMessage(tsMs);

      this.patchSnapshot(symbol, {
        price: close,
        sourceTs: tsMs,
      });

      const klineEvent: NormalizedKlineEvent = {
        type: "kline",
        exchange: this.exchange,
        symbol,
        ts: tsMs,
        recvTs: Date.now(),
        interval,
        openTime: Math.floor(tsMs / 1000),
        open,
        high,
        low,
        close,
        volume: Math.max(0, volume),
        closed,
      };
      this.emit(klineEvent);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Orderbook handler                                                  */
  /* ------------------------------------------------------------------ */

  private onBookMessage(instId: string, action: string, data: unknown[]): void {
    const symbol = fromOkxInstId(instId);
    if (!symbol) return;

    const payloads = asRecordList(data);
    for (const payload of payloads) {
      const bids = normalizeLevelRows(payload.bids);
      const asks = normalizeLevelRows(payload.asks);
      const ts = toMs(payload.ts) ?? Date.now();
      const seqId = toNum(payload.seqId);
      const prevSeqId = toNum(payload.prevSeqId);

      this.touchMessage(ts);

      if (action === "snapshot") {
        // Full orderbook snapshot from WebSocket
        if (seqId === null) continue;

        const snapshotEvent: NormalizedBookSnapshotEvent = {
          type: "book_snapshot",
          exchange: this.exchange,
          symbol,
          ts,
          recvTs: Date.now(),
          seq: seqId,
          bids,
          asks,
        };
        this.emit(snapshotEvent);

        this.orderbooks.applySnapshot(symbol, seqId, bids, asks);
        this.lastSnapshotAtBySymbol.set(symbol, Date.now());
        this.deltaBufferBySymbol.delete(symbol);
        this.pendingSnapshotSymbols.delete(symbol);
        this.snapshotFailures = 0;

        this.updateBookDerivedFields(symbol, ts);
        this.resyncs += 1;
      } else if (action === "update") {
        // Incremental delta
        if (seqId === null) continue;
        const startSeq = prevSeqId ?? seqId;
        const endSeq = seqId;

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

        if (!this.orderbooks.isReady(symbol)) {
          // Buffer deltas until we have a snapshot
          const queue = this.deltaBufferBySymbol.get(symbol) ?? [];
          queue.push(delta);
          if (queue.length > DELTA_BUFFER_MAX) {
            queue.splice(0, queue.length - DELTA_BUFFER_MAX);
          }
          this.deltaBufferBySymbol.set(symbol, queue);

          if (!this.pendingSnapshotSymbols.has(symbol)) {
            void this.requestSnapshot(symbol);
          }
          continue;
        }

        const applied = this.orderbooks.applyDelta(symbol, startSeq, endSeq, bids, asks);
        if (!applied.ok && applied.gap) {
          this.gapCount += 1;
          this.pushReason(`depth_gap:${symbol}:${startSeq}-${endSeq}`);
          this.resetSymbolSyncState(symbol);
          void this.requestSnapshot(symbol);
          continue;
        }
        if (applied.applied) {
          this.updateBookDerivedFields(symbol, ts);
        }
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /*  REST snapshot fetch                                                */
  /* ------------------------------------------------------------------ */

  private async requestSnapshot(symbol: string): Promise<void> {
    if (!symbol || this.pendingSnapshotSymbols.has(symbol)) return;
    this.pendingSnapshotSymbols.add(symbol);

    const instId = toOkxInstId(symbol);
    let timeout: ReturnType<typeof setTimeout> | null = null;

    try {
      const controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), 4_000);

      const response = await fetch(
        `${OKX_REST_BASE}/market/books?instId=${encodeURIComponent(instId)}&sz=200`,
        { signal: controller.signal },
      );
      clearTimeout(timeout);
      timeout = null;

      if (!response.ok) {
        throw new Error(`snapshot_http_${response.status}`);
      }

      const raw = (await response.json()) as Record<string, unknown>;

      // OKX REST response: { code: "0", data: [{ asks, bids, ts, seqId }] }
      const code = String(raw.code ?? "");
      if (code !== "0") {
        throw new Error(`snapshot_api_code_${code}`);
      }

      const dataArr = Array.isArray(raw.data) ? raw.data : [];
      const bookData = asRecord(dataArr[0]);
      if (!bookData) {
        throw new Error("snapshot_empty_data");
      }

      const seq = toNum(bookData.seqId);
      if (seq === null) throw new Error("snapshot_no_seq");

      const bids = normalizeLevelRows(bookData.bids);
      const asks = normalizeLevelRows(bookData.asks);
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
      this.snapshotFailures = 0;

      // Replay any buffered deltas
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
            void this.requestSnapshot(symbol);
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
      this.snapshotFailures += 1;

      if (this.snapshotFailures >= 4 && this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.pushReason("snapshot_fail_threshold_reconnect");
        try {
          this.ws.terminate();
        } catch {
          // no-op
        }
      }
    } finally {
      if (timeout) clearTimeout(timeout);
      this.pendingSnapshotSymbols.delete(symbol);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Sync state management                                              */
  /* ------------------------------------------------------------------ */

  private resetSymbolSyncState(symbol: string): void {
    const key = normalizeSymbol(symbol);
    if (!key) return;
    this.orderbooks.reset(key);
    this.deltaBufferBySymbol.delete(key);
    this.pendingSnapshotSymbols.delete(key);
    this.lastBookDeltaAtBySymbol.delete(key);
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

  /* ------------------------------------------------------------------ */
  /*  Snapshot patching                                                  */
  /* ------------------------------------------------------------------ */

  private patchSnapshot(symbol: string, patch: Partial<AdapterSymbolSnapshot>): void {
    const key = normalizeSymbol(symbol);
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

  /* ------------------------------------------------------------------ */
  /*  Trade & candle stores                                              */
  /* ------------------------------------------------------------------ */

  private appendRecentTrade(symbol: string, row: AdapterTradePoint): void {
    const key = normalizeSymbol(symbol);
    if (!key) return;
    const current = this.recentTradesBySymbol.get(key) ?? [];
    current.push(row);
    if (current.length > TRADE_STORE_MAX) current.splice(0, current.length - TRADE_STORE_MAX);
    this.recentTradesBySymbol.set(key, current);
  }

  private upsertCandle(symbol: string, interval: string, row: AdapterCandlePoint): void {
    const key = normalizeSymbol(symbol);
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
