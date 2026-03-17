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
  NormalizedTradeEvent,
} from "./types.ts";
import { SequenceSafeOrderbookStore } from "./sequenceSafeOrderbook.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BYBIT_WS_URL = "wss://stream.bybit.com/v5/public/linear";
const BYBIT_REST_BASE = "https://api.bybit.com/v5";
const WATCHDOG_STALE_MS = 25_000;
const WATCHDOG_TICK_MS = 5_000;
const HEARTBEAT_PING_MS = 20_000;
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

const PRIORITY_SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
];

/** Internal interval label -> Bybit kline interval string. */
const INTERVAL_TO_BYBIT: Record<string, string> = {
  "1m": "1",
  "5m": "5",
  "15m": "15",
  "30m": "30",
  "1h": "60",
  "4h": "240",
  "1d": "D",
};

/** Bybit kline interval string -> internal interval label. */
const BYBIT_TO_INTERVAL: Record<string, string> = {};
for (const [internal, bybit] of Object.entries(INTERVAL_TO_BYBIT)) {
  BYBIT_TO_INTERVAL[bybit] = internal;
}

const KLINE_INTERVALS = Object.keys(INTERVAL_TO_BYBIT);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  // If the timestamp looks like seconds (< 1 trillion), convert to ms.
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
 * Bybit uses the same symbol format as our internal representation
 * (e.g. BTCUSDT), so normalization is a simple uppercase + trim.
 */
const normalizeSymbol = (raw: unknown): string => {
  return String(raw ?? "").toUpperCase().trim();
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
    }
  }
  return out;
};

const computeBackoff = (attempt: number): number => {
  const expo = Math.round(
    RECONNECT_BASE_MS * Math.pow(1.9, Math.max(0, attempt - 1)),
  );
  const jitter = Math.floor(Math.random() * 250);
  return Math.min(RECONNECT_MAX_MS, expo + jitter);
};

const nowIso = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class BybitFuturesMarketAdapter implements IExchangeMarketAdapter {
  readonly exchange = "BYBIT" as const;

  // -- connection state --
  private ws: WebSocket | null = null;
  private started = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private snapshotSanityTimer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<(event: NormalizedEvent) => void>();

  // -- data stores --
  private readonly snapshots = new Map<string, AdapterSymbolSnapshot>();
  private readonly candlesBySymbol = new Map<
    string,
    Map<string, AdapterCandlePoint[]>
  >();
  private readonly recentTradesBySymbol = new Map<
    string,
    AdapterTradePoint[]
  >();
  private readonly orderbooks = new SequenceSafeOrderbookStore();
  private readonly deltaBufferBySymbol = new Map<
    string,
    NormalizedBookDeltaEvent[]
  >();
  private readonly lastBookDeltaAtBySymbol = new Map<string, number>();
  private readonly lastSnapshotAtBySymbol = new Map<string, number>();

  // -- subscriptions --
  private readonly symbols = new Set<string>();
  private readonly depthSymbols = new Set<string>();
  private readonly pendingSnapshotSymbols = new Set<string>();
  private readonly reasons: string[] = [];

  // -- health counters --
  private lastMessageAt = 0;
  private lastError: string | null = null;
  private reconnects = 0;
  private resyncs = 0;
  private gapCount = 0;
  private symbolStaleResyncs = 0;
  private snapshotFailures = 0;
  private snapshotCursor = 0;
  private latencyEmaMs: number | null = null;

  // ===================================================================
  // Public interface
  // ===================================================================

  start(): void {
    if (this.started) return;
    this.started = true;
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

    // Track depth subscriptions up to the limit
    for (const symbol of added) {
      if (this.depthSymbols.size < MAX_DEPTH_SYMBOLS) {
        this.depthSymbols.add(symbol);
      }
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
    const connected = Boolean(
      this.ws && this.ws.readyState === WebSocket.OPEN,
    );
    const ageMs =
      this.lastMessageAt > 0
        ? Math.max(0, now - this.lastMessageAt)
        : Number.POSITIVE_INFINITY;

    let score = connected ? 96 : 20;
    if (ageMs > 3_000) score -= 8;
    if (ageMs > 7_000) score -= 13;
    if (ageMs > 12_000) score -= 18;
    if (ageMs > 25_000) score -= 25;
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
    if (staleSymbolCount > 0)
      reasons.push(`stale_symbols_${staleSymbolCount}`);
    if (this.snapshotFailures > 0)
      reasons.push(`snapshot_failures_${this.snapshotFailures}`);
    if (this.pendingSnapshotSymbols.size > 0)
      reasons.push(`snapshot_pending_${this.pendingSnapshotSymbols.size}`);
    if (this.lastError) reasons.push(this.lastError);
    for (const reason of this.reasons.slice(-3)) reasons.push(reason);

    return {
      exchange: this.exchange,
      score,
      state,
      connected,
      latencyMs:
        this.latencyEmaMs !== null ? Math.round(this.latencyEmaMs) : null,
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

  getCandles(
    symbol: string,
    interval: string,
    limit: number,
  ): AdapterCandlePoint[] {
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

  // ===================================================================
  // Event emission
  // ===================================================================

  private emit(event: NormalizedEvent): void {
    for (const cb of this.listeners) cb(event);
  }

  private pushReason(reason: string): void {
    this.reasons.push(`${nowIso()}:${reason}`);
    if (this.reasons.length > 30)
      this.reasons.splice(0, this.reasons.length - 30);
  }

  private touchMessage(eventTs?: number | null): void {
    const now = Date.now();
    this.lastMessageAt = now;
    if (
      eventTs === null ||
      eventTs === undefined ||
      !Number.isFinite(eventTs) ||
      eventTs <= 0
    )
      return;
    const latency = Math.max(0, now - Number(eventTs));
    this.latencyEmaMs =
      this.latencyEmaMs === null
        ? latency
        : this.latencyEmaMs * 0.8 + latency * 0.2;
  }

  // ===================================================================
  // WebSocket lifecycle
  // ===================================================================

  private connect(): void {
    if (!this.started) return;
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.terminate();
      this.ws = null;
    }

    const ws = new WebSocket(BYBIT_WS_URL, { handshakeTimeout: 10_000 });
    this.ws = ws;

    ws.on("open", () => {
      this.reconnectAttempts = 0;
      this.lastError = null;
      this.touchMessage(Date.now());
      this.pushReason("ws_open");

      // Reset orderbook sync state on fresh connection
      for (const symbol of this.depthSymbols) {
        this.resetSymbolSyncState(symbol);
      }

      // Subscribe priority symbols first, then others
      const prioritySet = new Set(PRIORITY_SYMBOLS);
      const priority: string[] = [];
      const rest: string[] = [];
      for (const symbol of this.symbols) {
        if (prioritySet.has(symbol)) priority.push(symbol);
        else rest.push(symbol);
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
      this.lastError =
        error instanceof Error ? error.message : "ws_error";
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

  // ===================================================================
  // Heartbeat & watchdog
  // ===================================================================

  private startHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      try {
        this.ws.send(JSON.stringify({ op: "ping" }));
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

  private startSnapshotSanity(): void {
    if (this.snapshotSanityTimer) clearInterval(this.snapshotSanityTimer);
    this.snapshotSanityTimer = setInterval(() => {
      if (!this.started) return;
      const now = Date.now();

      // Check for symbols that need initial snapshot or became stale
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

      // Periodic rotating snapshot refresh
      const depthArr = [...this.depthSymbols];
      if (!depthArr.length) return;
      const total = depthArr.length;
      const batch = Math.min(SNAPSHOT_SANITY_BATCH, total);
      for (let i = 0; i < batch; i += 1) {
        const idx = (this.snapshotCursor + i) % total;
        const symbol = depthArr[idx]!;
        const lastSnapshotAt =
          this.lastSnapshotAtBySymbol.get(symbol) ?? 0;
        if (
          lastSnapshotAt > 0 &&
          now - lastSnapshotAt < SNAPSHOT_REFRESH_MIN_MS
        )
          continue;
        if (this.pendingSnapshotSymbols.has(symbol)) continue;
        this.pushReason(`snapshot_sanity:${symbol}`);
        void this.requestSnapshot(symbol);
      }
      this.snapshotCursor = (this.snapshotCursor + batch) % total;
    }, SNAPSHOT_SANITY_INTERVAL_MS);
  }

  // ===================================================================
  // Subscription
  // ===================================================================

  private sendSubscribeMessages(symbols: string[]): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN || !symbols.length) return;

    for (const symbol of symbols) {
      const sym = normalizeSymbol(symbol);
      if (!sym) continue;

      const args: string[] = [
        `publicTrade.${sym}`,
        `tickers.${sym}`,
      ];

      // Orderbook depth only for depth-tracked symbols
      if (this.depthSymbols.has(sym)) {
        args.push(`orderbook.50.${sym}`);
      }

      // Subscribe kline channels for all supported intervals
      for (const bybitInterval of Object.values(INTERVAL_TO_BYBIT)) {
        args.push(`kline.${bybitInterval}.${sym}`);
      }

      try {
        ws.send(JSON.stringify({ op: "subscribe", args }));
      } catch {
        // will reconnect
      }
    }
  }

  // ===================================================================
  // Message routing
  // ===================================================================

  private parseMessage(raw: WebSocket.RawData): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(toText(raw));
    } catch {
      return;
    }
    const rec = asRecord(parsed);
    if (!rec) return;

    // Handle pong response (heartbeat ack)
    const op = String(rec.op ?? "");
    if (op === "pong") {
      this.touchMessage(Date.now());
      return;
    }

    // Handle subscribe confirmations / errors
    if (op === "subscribe") {
      const success = rec.success;
      if (success === false) {
        const msg = String(rec.ret_msg ?? rec.msg ?? "subscribe_error");
        this.lastError = msg;
        this.pushReason(`subscribe_error:${msg}`);
      }
      return;
    }

    const topic = String(rec.topic ?? "");
    if (!topic) return;

    const data = rec.data;
    if (data === undefined || data === null) return;

    const msgType = String(rec.type ?? "");
    const ts = toNum(rec.ts) ?? Date.now();

    // Route by topic prefix
    if (topic.startsWith("publicTrade.")) {
      const rows = asRecordList(data);
      for (const row of rows) this.onTrade(row, ts);
      return;
    }
    if (topic.startsWith("tickers.")) {
      const payload = asRecord(data);
      if (payload) this.onTicker(payload, ts);
      return;
    }
    if (topic.startsWith("kline.")) {
      const rows = asRecordList(data);
      for (const row of rows) this.onKline(row, topic, ts);
      return;
    }
    if (topic.startsWith("orderbook.")) {
      const payload = asRecord(data);
      if (payload) {
        if (msgType === "snapshot") {
          this.onOrderbookSnapshot(payload, ts);
        } else if (msgType === "delta") {
          this.onOrderbookDelta(payload, ts);
        }
      }
      return;
    }
  }

  // ===================================================================
  // Topic handlers
  // ===================================================================

  private onTrade(result: Record<string, unknown>, msgTs: number): void {
    const symbol = normalizeSymbol(result.s ?? result.S ?? result.symbol);
    if (!symbol) return;
    const price = toNum(result.p);
    const qty = toNum(result.v);
    if (price === null || qty === null || price <= 0 || qty === 0) return;

    const ts = toMs(result.T) ?? msgTs;
    const sideRaw = String(result.S ?? "").toLowerCase();
    const side: "BUY" | "SELL" = sideRaw.includes("sell") ? "SELL" : "BUY";
    const tradeId =
      result.i !== undefined ? String(result.i) : undefined;

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
      tradeId,
      price,
      qty: Math.abs(qty),
      side,
    };
    this.emit(event);
  }

  private onTicker(result: Record<string, unknown>, msgTs: number): void {
    const symbol = normalizeSymbol(result.symbol);
    if (!symbol) return;

    const price = toNum(result.lastPrice);
    if (price === null || price <= 0) return;

    const change24hPctRaw = toNum(result.price24hPcnt);
    // Bybit returns price24hPcnt as a decimal (e.g. 0.05 for 5%)
    const change24hPct =
      change24hPctRaw !== null ? change24hPctRaw * 100 : 0;
    const volume24hUsd = toNum(result.turnover24h) ?? 0;
    const bid = toNum(result.bid1Price);
    const ask = toNum(result.ask1Price);
    const bidQty = toNum(result.bid1Size);
    const askQty = toNum(result.ask1Size);
    const markPrice = toNum(result.markPrice);
    const fundingRate = toNum(result.fundingRate);
    const nextFundingTime = toMs(result.nextFundingTime);

    this.touchMessage(msgTs);

    // Compute spread metrics from top-of-book in ticker
    let spreadBps: number | null = null;
    let depthUsd: number | null = null;
    let imbalance: number | null = null;
    if (bid !== null && ask !== null && bid > 0 && ask > 0) {
      const mid = (bid + ask) / 2;
      spreadBps = mid > 0 ? ((ask - bid) / mid) * 10_000 : null;
      const bidDepthUsd =
        bidQty !== null && bidQty > 0 ? bid * bidQty : null;
      const askDepthUsd =
        askQty !== null && askQty > 0 ? ask * askQty : null;
      depthUsd =
        bidDepthUsd !== null || askDepthUsd !== null
          ? Math.max(0, (bidDepthUsd ?? 0) + (askDepthUsd ?? 0))
          : null;
      imbalance =
        depthUsd && depthUsd > 0
          ? ((bidDepthUsd ?? 0) - (askDepthUsd ?? 0)) / depthUsd
          : null;

      // Emit a book_ticker event from ticker data
      const btEvent: NormalizedBookTickerEvent = {
        type: "book_ticker",
        exchange: this.exchange,
        symbol,
        ts: msgTs,
        recvTs: Date.now(),
        bid,
        ask,
        bidQty: bidQty ?? undefined,
        askQty: askQty ?? undefined,
      };
      this.emit(btEvent);
    }

    this.patchSnapshot(symbol, {
      price,
      change24hPct,
      volume24hUsd,
      topBid: bid ?? null,
      topAsk: ask ?? null,
      bidQty: bidQty ?? null,
      askQty: askQty ?? null,
      spreadBps,
      depthUsd,
      imbalance,
      markPrice: markPrice ?? null,
      fundingRate: fundingRate ?? null,
      nextFundingTime: nextFundingTime ?? null,
      sourceTs: msgTs,
    });

    this.emit({
      type: "ticker",
      exchange: this.exchange,
      symbol,
      ts: msgTs,
      recvTs: Date.now(),
      price,
      change24hPct,
      volume24hUsd,
    });
  }

  private onKline(
    result: Record<string, unknown>,
    topic: string,
    msgTs: number,
  ): void {
    // topic format: "kline.{interval}.{symbol}"
    const parts = topic.split(".");
    if (parts.length < 3) return;
    const bybitInterval = parts[1]!;
    const symbol = normalizeSymbol(parts.slice(2).join("."));
    const interval = BYBIT_TO_INTERVAL[bybitInterval];
    if (!symbol || !interval) return;

    const open = toNum(result.open);
    const high = toNum(result.high);
    const low = toNum(result.low);
    const close = toNum(result.close);
    const volume = toNum(result.volume) ?? 0;
    if (open === null || high === null || low === null || close === null)
      return;

    const startMs = toMs(result.start);
    if (startMs === null) return;

    const closed = result.confirm === true;

    const candle: AdapterCandlePoint = {
      time: Math.floor(startMs / 1000),
      open,
      high,
      low,
      close,
      volume: Math.max(0, volume),
    };
    this.upsertCandle(symbol, interval, candle);
    this.touchMessage(msgTs);

    this.patchSnapshot(symbol, {
      price: close,
      sourceTs: msgTs,
    });

    const event: NormalizedKlineEvent = {
      type: "kline",
      exchange: this.exchange,
      symbol,
      ts: msgTs,
      recvTs: Date.now(),
      interval,
      openTime: Math.floor(startMs / 1000),
      open,
      high,
      low,
      close,
      volume: Math.max(0, volume),
      closed,
    };
    this.emit(event);
  }

  private onOrderbookSnapshot(
    result: Record<string, unknown>,
    msgTs: number,
  ): void {
    const symbol = normalizeSymbol(result.s);
    if (!symbol) return;
    if (!this.depthSymbols.has(symbol)) return;

    const seq = toNum(result.seq ?? result.u);
    if (seq === null) return;
    const bids = normalizeLevelRows(result.b);
    const asks = normalizeLevelRows(result.a);

    this.touchMessage(msgTs);

    const snapshotEvent: NormalizedBookSnapshotEvent = {
      type: "book_snapshot",
      exchange: this.exchange,
      symbol,
      ts: msgTs,
      recvTs: Date.now(),
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
          this.pushReason(`ws_snapshot_reconcile_gap:${symbol}`);
          this.resetSymbolSyncState(symbol);
          this.resyncs += 1;
          void this.requestSnapshot(symbol);
          return;
        }
      }
    }

    this.updateBookDerivedFields(symbol, msgTs);
    this.resyncs += 1;
  }

  private onOrderbookDelta(
    result: Record<string, unknown>,
    msgTs: number,
  ): void {
    const symbol = normalizeSymbol(result.s);
    if (!symbol) return;
    if (!this.depthSymbols.has(symbol)) return;

    const seq = toNum(result.seq ?? result.u);
    if (seq === null) return;

    // Bybit delta: seq is the new sequence, previous was seq-1
    // We treat startSeq = endSeq = seq for the SequenceSafeOrderbookStore
    const startSeq = seq;
    const endSeq = seq;
    const bids = normalizeLevelRows(result.b);
    const asks = normalizeLevelRows(result.a);

    this.touchMessage(msgTs);
    this.lastBookDeltaAtBySymbol.set(symbol, Date.now());

    const delta: NormalizedBookDeltaEvent = {
      type: "book_delta",
      exchange: this.exchange,
      symbol,
      ts: msgTs,
      recvTs: Date.now(),
      startSeq,
      endSeq,
      bids,
      asks,
    };
    this.emit(delta);

    if (!this.orderbooks.isReady(symbol)) {
      const queue = this.deltaBufferBySymbol.get(symbol) ?? [];
      queue.push(delta);
      if (queue.length > DELTA_BUFFER_MAX)
        queue.splice(0, queue.length - DELTA_BUFFER_MAX);
      this.deltaBufferBySymbol.set(symbol, queue);
      if (!this.pendingSnapshotSymbols.has(symbol)) {
        void this.requestSnapshot(symbol);
      }
      return;
    }

    const applied = this.orderbooks.applyDelta(
      symbol,
      startSeq,
      endSeq,
      bids,
      asks,
    );
    if (!applied.ok && applied.gap) {
      this.gapCount += 1;
      this.pushReason(`depth_gap:${symbol}:${seq}`);
      this.resetSymbolSyncState(symbol);
      void this.requestSnapshot(symbol);
      return;
    }
    if (applied.applied) this.updateBookDerivedFields(symbol, msgTs);
  }

  // ===================================================================
  // REST snapshot
  // ===================================================================

  private async requestSnapshot(symbol: string): Promise<void> {
    if (!symbol || this.pendingSnapshotSymbols.has(symbol)) return;
    this.pendingSnapshotSymbols.add(symbol);

    let timeout: ReturnType<typeof setTimeout> | null = null;
    try {
      const controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), 4_000);
      const response = await fetch(
        `${BYBIT_REST_BASE}/market/orderbook?category=linear&symbol=${encodeURIComponent(symbol)}&limit=200`,
        { signal: controller.signal },
      );
      clearTimeout(timeout);
      timeout = null;

      if (!response.ok) {
        throw new Error(`snapshot_http_${response.status}`);
      }

      const body = (await response.json()) as Record<string, unknown>;
      // Bybit REST response: { retCode: 0, result: { s, b, a, seq, u, ts } }
      const retCode = toNum(body.retCode);
      if (retCode !== 0) {
        throw new Error(
          `snapshot_api_${retCode}:${String(body.retMsg ?? "")}`,
        );
      }

      const raw = asRecord(body.result);
      if (!raw) throw new Error("snapshot_no_result");

      const seq = toNum(raw.seq ?? raw.u);
      if (seq === null) throw new Error("snapshot_no_seq");

      const bids = normalizeLevelRows(raw.b);
      const asks = normalizeLevelRows(raw.a);
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

      // Replay buffered deltas
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
      const message =
        error instanceof Error ? error.message : "snapshot_error";
      this.lastError = `snapshot:${message}`;
      this.pushReason(`snapshot_fail:${symbol}:${message}`);
      this.snapshotFailures += 1;
      if (
        this.snapshotFailures >= 4 &&
        this.ws &&
        this.ws.readyState === WebSocket.OPEN
      ) {
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

  // ===================================================================
  // Orderbook helpers
  // ===================================================================

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

  // ===================================================================
  // Snapshot store
  // ===================================================================

  private patchSnapshot(
    symbol: string,
    patch: Partial<AdapterSymbolSnapshot>,
  ): void {
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

  // ===================================================================
  // Trade & candle stores
  // ===================================================================

  private appendRecentTrade(symbol: string, row: AdapterTradePoint): void {
    const key = normalizeSymbol(symbol);
    if (!key) return;
    const current = this.recentTradesBySymbol.get(key) ?? [];
    current.push(row);
    if (current.length > TRADE_STORE_MAX)
      current.splice(0, current.length - TRADE_STORE_MAX);
    this.recentTradesBySymbol.set(key, current);
  }

  private upsertCandle(
    symbol: string,
    interval: string,
    row: AdapterCandlePoint,
  ): void {
    const key = normalizeSymbol(symbol);
    if (!key) return;
    const frame = interval.toLowerCase();
    const byInterval =
      this.candlesBySymbol.get(key) ??
      new Map<string, AdapterCandlePoint[]>();
    const list = byInterval.get(frame) ?? [];
    const last = list[list.length - 1];
    if (last && last.time === row.time) {
      list[list.length - 1] = row;
    } else if (!last || row.time > last.time) {
      list.push(row);
      if (list.length > CANDLE_STORE_MAX)
        list.splice(0, list.length - CANDLE_STORE_MAX);
    } else {
      const idx = list.findIndex((item) => item.time === row.time);
      if (idx >= 0) list[idx] = row;
    }
    byInterval.set(frame, list);
    this.candlesBySymbol.set(key, byInterval);
  }
}
