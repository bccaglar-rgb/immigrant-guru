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
  NormalizedTradeEvent,
} from "./types.ts";
import { SequenceSafeOrderbookStore } from "./sequenceSafeOrderbook.ts";

const GATE_WS_URLS = [
  "wss://fx-ws.gateio.ws/v4/ws/usdt",
];
const GATE_REST_BASE = "https://api.gateio.ws/api/v4";
const WATCHDOG_STALE_MS = 22_000;
const WATCHDOG_TICK_MS = 5_000;
const HEARTBEAT_PING_MS = 9_000;
const SYMBOL_DELTA_STALE_MS = 14_000;
const SNAPSHOT_SANITY_INTERVAL_MS = 10_000;
const SNAPSHOT_REFRESH_MIN_MS = 45_000;
const SNAPSHOT_SANITY_BATCH = 6;
const RECONNECT_BASE_MS = 700;
const RECONNECT_MAX_MS = 14_000;
const DELTA_BUFFER_MAX = 400;
const CANDLE_STORE_MAX = 900;
const TRADE_STORE_MAX = 400;
const GATE_CANDLE_INTERVALS = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"] as const;

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

const normalizeSymbol = (raw: unknown): string => {
  const base = String(raw ?? "").toUpperCase().replace(/[-/]/g, "_").trim();
  if (!base) return "";
  const usdtPair = base.endsWith("_USDT")
    ? base
    : base.endsWith("USDT")
      ? `${base.slice(0, -4)}_USDT`
      : `${base}_USDT`;
  return usdtPair.replace(/__+/g, "_");
};

const symbolToBitrium = (contract: string): string => contract.replace(/_/g, "");

const seqFrom = (payload: Record<string, unknown>, keys: string[]): number | null => {
  for (const key of keys) {
    const n = toNum(payload[key]);
    if (n !== null) return n;
  }
  return null;
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
      const price = toNum(rec.p ?? rec.price);
      const qty = toNum(rec.s ?? rec.size ?? rec.q ?? rec.amount);
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

export class GateFuturesMarketAdapter implements IExchangeMarketAdapter {
  readonly exchange = "GATEIO" as const;

  private ws: WebSocket | null = null;
  private wsUrlIndex = 0;
  private started = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private snapshotSanityTimer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<(event: NormalizedEvent) => void>();

  private readonly snapshots = new Map<string, AdapterSymbolSnapshot>();
  private readonly candlesBySymbol = new Map<string, Map<string, AdapterCandlePoint[]>>();
  private readonly recentTradesBySymbol = new Map<string, AdapterTradePoint[]>();
  private readonly orderbooks = new SequenceSafeOrderbookStore();
  private readonly deltaBufferBySymbol = new Map<string, NormalizedBookDeltaEvent[]>();
  private readonly lastBookDeltaAtBySymbol = new Map<string, number>();
  private readonly lastSnapshotAtBySymbol = new Map<string, number>();
  private readonly symbols = new Set<string>();
  private readonly pendingSnapshotSymbols = new Set<string>();
  private readonly reasons: string[] = [];

  private lastMessageAt = 0;
  private lastError: string | null = null;
  private reconnects = 0;
  private resyncs = 0;
  private gapCount = 0;
  private symbolStaleResyncs = 0;
  private snapshotFailures = 0;
  private snapshotCursor = 0;
  private latencyEmaMs: number | null = null;

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
    const normalized = [...new Set(symbols.map((s) => symbolToBitrium(normalizeSymbol(s))).filter(Boolean))];
    if (!normalized.length) return;
    const added: string[] = [];
    for (const symbol of normalized) {
      if (this.symbols.has(symbol)) continue;
      this.symbols.add(symbol);
      added.push(symbol);
    }
    if (!added.length) return;
    this.sendSubscribeMessages(added);
    for (const symbol of added) {
      void this.requestSnapshot(symbol);
    }
  }

  onEvent(cb: (event: NormalizedEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  getHealth(): AdapterHealthSnapshot {
    const now = Date.now();
    const connected = Boolean(this.ws && this.ws.readyState === WebSocket.OPEN);
    const ageMs = this.lastMessageAt > 0 ? Math.max(0, now - this.lastMessageAt) : Number.POSITIVE_INFINITY;
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
    for (const symbol of this.symbols) {
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
    if (this.pendingSnapshotSymbols.size > 0) reasons.push(`snapshot_pending_${this.pendingSnapshotSymbols.size}`);
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
    const key = symbolToBitrium(normalizeSymbol(symbol));
    if (!key) return null;
    return this.snapshots.get(key) ?? null;
  }

  getCandles(symbol: string, interval: string, limit: number): AdapterCandlePoint[] {
    const key = symbolToBitrium(normalizeSymbol(symbol));
    if (!key) return [];
    const byInterval = this.candlesBySymbol.get(key);
    if (!byInterval) return [];
    const rows = byInterval.get(interval.toLowerCase()) ?? [];
    if (!rows.length) return [];
    return rows.slice(-Math.max(1, Math.min(1500, limit)));
  }

  getRecentTrades(symbol: string, limit: number): AdapterTradePoint[] {
    const key = symbolToBitrium(normalizeSymbol(symbol));
    if (!key) return [];
    const rows = this.recentTradesBySymbol.get(key) ?? [];
    if (!rows.length) return [];
    return rows.slice(-Math.max(1, Math.min(800, limit)));
  }

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
    if (eventTs === null || eventTs === undefined || !Number.isFinite(eventTs) || eventTs <= 0) return;
    const latency = Math.max(0, now - Number(eventTs));
    this.latencyEmaMs = this.latencyEmaMs === null ? latency : this.latencyEmaMs * 0.8 + latency * 0.2;
  }

  private connect(): void {
    if (!this.started) return;
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.terminate();
      this.ws = null;
    }
    const url = GATE_WS_URLS[this.wsUrlIndex] ?? GATE_WS_URLS[0];
    const ws = new WebSocket(url, { handshakeTimeout: 10_000 });
    this.ws = ws;

    ws.on("open", () => {
      this.reconnectAttempts = 0;
      this.lastError = null;
      this.touchMessage(Date.now());
      this.pushReason("ws_open");
      for (const symbol of this.symbols) {
        this.resetSymbolSyncState(symbol);
      }
      this.sendSubscribeMessages([...this.symbols]);
      for (const symbol of this.symbols) {
        void this.requestSnapshot(symbol);
      }
    });

    ws.on("message", (raw) => {
      this.parseMessage(raw);
    });

    ws.on("pong", () => {
      this.touchMessage(Date.now());
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
    this.wsUrlIndex = (this.wsUrlIndex + 1) % GATE_WS_URLS.length;
    const waitMs = computeBackoff(this.reconnectAttempts);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, waitMs);
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      try {
        this.ws.ping();
      } catch {
        // no-op
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
      for (const symbol of this.symbols) {
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
            this.pushReason(`symbol_delta_stale:${symbol}:${Math.round(now - lastDeltaAt)}ms`);
            this.resetSymbolSyncState(symbol);
            void this.requestSnapshot(symbol);
          }
        }
      }
      const symbols = [...this.symbols];
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

  private sendSubscribeMessages(symbols: string[]): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN || !symbols.length) return;
    const tsSec = () => Math.floor(Date.now() / 1000);
    for (const symbol of symbols) {
      const contract = normalizeSymbol(symbol);
      if (!contract) continue;
      const messages = [
        {
          time: tsSec(),
          channel: "futures.trades",
          event: "subscribe",
          payload: [contract],
        },
        {
          time: tsSec(),
          channel: "futures.book_ticker",
          event: "subscribe",
          payload: [contract],
        },
        {
          time: tsSec(),
          channel: "futures.tickers",
          event: "subscribe",
          payload: [contract],
        },
        {
          time: tsSec(),
          channel: "futures.order_book_update",
          event: "subscribe",
          payload: [contract, "100ms", "20"],
        },
      ];
      for (const frame of GATE_CANDLE_INTERVALS) {
        messages.push({
          time: tsSec(),
          channel: "futures.candlesticks",
          event: "subscribe",
          payload: [frame, contract],
        });
      }
      for (const body of messages) {
        ws.send(JSON.stringify(body));
      }
    }
  }

  private parseMessage(raw: WebSocket.RawData): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(toText(raw));
    } catch {
      return;
    }
    const rec = asRecord(parsed);
    if (!rec) return;
    const channel = String(rec.channel ?? "");
    const event = String(rec.event ?? "");
    if (!channel) return;
    if (event === "subscribe" || event === "unsubscribe") return;
    if (event === "error") {
      this.lastError = String(rec.message ?? rec.error ?? "ws_channel_error");
      this.pushReason(`channel_error:${channel}:${this.lastError}`);
      return;
    }
    let payloads = asRecordList(rec.result ?? rec.data);
    if (!payloads.length) {
      const direct = asRecord(rec);
      if (direct && (direct.contract || direct.symbol || direct.s)) {
        payloads = [direct];
      }
    }
    if (!payloads.length) return;

    if (channel.includes("order_book_update")) {
      for (const payload of payloads) this.onBookDelta(payload);
      return;
    }
    if (channel.includes("book_ticker")) {
      for (const payload of payloads) this.onBookTicker(payload);
      return;
    }
    if (channel.includes("futures.trades")) {
      for (const payload of payloads) this.onTrade(payload);
      return;
    }
    if (channel.includes("futures.tickers")) {
      for (const payload of payloads) this.onTicker(payload);
      return;
    }
    if (channel.includes("futures.candlesticks")) {
      for (const payload of payloads) this.onCandle(payload, rec);
      return;
    }
  }

  private onTicker(result: Record<string, unknown>): void {
    const contract = normalizeSymbol(result.contract ?? result.s ?? result.symbol);
    if (!contract) return;
    const symbol = symbolToBitrium(contract);
    const price = toNum(result.last ?? result.last_price ?? result.mark_price ?? result.index_price);
    if (price === null || price <= 0) return;
    const change24hPct =
      toNum(result.change_percentage ?? result.change_24h ?? result.price_change_percent) ?? 0;
    const volume24hUsd =
      toNum(
        result.volume_24h_quote ??
        result.volume_24h_usdt ??
        result.quote_volume ??
        result.turnover_24h ??
        result.volume_24h ??
        result.volume,
      ) ?? 0;
    const ts = toNum(result.t ?? result.time_ms ?? result.create_time_ms) ?? Date.now();
    this.touchMessage(ts);
    this.patchSnapshot(symbol, {
      price,
      change24hPct,
      volume24hUsd,
      markPrice: toNum(result.mark_price),
      fundingRate:
        toNum(
          result.funding_rate ??
          result.fundingRate ??
          result.last_funding_rate ??
          result.funding_rate_indicative,
        ) ?? null,
      sourceTs: ts,
    });
    this.emit({
      type: "ticker",
      exchange: this.exchange,
      symbol,
      ts,
      recvTs: Date.now(),
      price,
      change24hPct,
      volume24hUsd,
    });
  }

  private onBookTicker(result: Record<string, unknown>): void {
    const contract = normalizeSymbol(result.contract ?? result.s ?? result.symbol);
    if (!contract) return;
    const symbol = symbolToBitrium(contract);
    const bid = toNum(result.bid ?? result.best_bid_price ?? result.b);
    const ask = toNum(result.ask ?? result.best_ask_price ?? result.a);
    if (bid === null || ask === null || bid <= 0 || ask <= 0) return;
    const bidQty = toNum(result.bid_size ?? result.bid_qty ?? result.B);
    const askQty = toNum(result.ask_size ?? result.ask_qty ?? result.A);
    const ts = toMs(result.t ?? result.time_ms) ?? Date.now();
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
    const event: NormalizedBookTickerEvent = {
      type: "book_ticker",
      exchange: this.exchange,
      symbol,
      ts,
      recvTs: Date.now(),
      bid,
      ask,
      bidQty: bidQty ?? undefined,
      askQty: askQty ?? undefined,
    };
    this.emit(event);
  }

  private onTrade(result: Record<string, unknown>): void {
    const contract = normalizeSymbol(result.contract ?? result.s ?? result.symbol);
    if (!contract) return;
    const symbol = symbolToBitrium(contract);
    const price = toNum(result.price ?? result.p ?? result.last);
    const qty = [result.size, result.sz, result.q, result.qty, result.amount]
      .map((value) => toNum(value))
      .find((value): value is number => value !== null);
    if (price === null || qty === null || price <= 0 || qty === 0) return;
    const ts = toMs(result.create_time_ms ?? result.t ?? result.time_ms) ?? Date.now();
    const sideRaw = String(result.side ?? "").toLowerCase();
    const side: "BUY" | "SELL" = sideRaw.includes("sell") || qty < 0 ? "SELL" : "BUY";
    this.touchMessage(ts);
    this.patchSnapshot(symbol, {
      lastTradePrice: price,
      lastTradeQty: Math.abs(qty),
      lastTradeSide: side,
      sourceTs: ts,
    });
    this.appendRecentTrade(symbol, { ts, price, amount: Math.abs(qty), side });
    const event: NormalizedTradeEvent = {
      type: "trade",
      exchange: this.exchange,
      symbol,
      ts,
      recvTs: Date.now(),
      tradeId: result.id !== undefined ? String(result.id) : undefined,
      price,
      qty: Math.abs(qty),
      side,
    };
    this.emit(event);
  }

  private onCandle(result: Record<string, unknown>, root: Record<string, unknown>): void {
    let contract = normalizeSymbol(result.contract ?? result.s ?? result.symbol);
    let interval = String(result.interval ?? "").toLowerCase();
    const name = String(result.n ?? root.n ?? "").trim();
    if (name.includes("_")) {
      const [frameRaw, contractRaw] = name.split("_", 2);
      if (!interval && frameRaw) interval = frameRaw.toLowerCase();
      if (!contract && contractRaw) contract = normalizeSymbol(contractRaw);
    }
    if (!contract || !interval) return;
    const symbol = symbolToBitrium(contract);
    const open = toNum(result.o ?? result.open);
    const high = toNum(result.h ?? result.high);
    const low = toNum(result.l ?? result.low);
    const close = toNum(result.c ?? result.close);
    const volume = toNum(result.v ?? result.volume ?? result.amount) ?? 0;
    if (open === null || high === null || low === null || close === null) return;
    const tsMs = toMs(result.t ?? result.time_ms ?? result.create_time_ms);
    if (tsMs === null) return;
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
  }

  private onBookDelta(result: Record<string, unknown>): void {
    const contract = normalizeSymbol(result.contract ?? result.s ?? result.symbol);
    if (!contract) return;
    const symbol = symbolToBitrium(contract);
    const startSeq =
      seqFrom(result, ["U", "first_id", "start", "seq_start", "id"]) ?? null;
    const endSeq =
      seqFrom(result, ["u", "last_id", "end", "seq_end", "id"]) ?? startSeq;
    if (startSeq === null || endSeq === null) return;
    const bids = normalizeLevelRows(result.b ?? result.bids);
    const asks = normalizeLevelRows(result.a ?? result.asks);
    const ts = toMs(result.t ?? result.time_ms) ?? Date.now();
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

    if (!this.orderbooks.isReady(symbol)) {
      const queue = this.deltaBufferBySymbol.get(symbol) ?? [];
      queue.push(delta);
      if (queue.length > DELTA_BUFFER_MAX) queue.splice(0, queue.length - DELTA_BUFFER_MAX);
      this.deltaBufferBySymbol.set(symbol, queue);
      if (!this.pendingSnapshotSymbols.has(symbol)) {
        void this.requestSnapshot(symbol);
      }
      return;
    }

    const applied = this.orderbooks.applyDelta(symbol, startSeq, endSeq, bids, asks);
    if (!applied.ok && applied.gap) {
      this.gapCount += 1;
      this.pushReason(`depth_gap:${symbol}:${startSeq}-${endSeq}`);
      this.resetSymbolSyncState(symbol);
      void this.requestSnapshot(symbol);
      return;
    }
    if (applied.applied) this.updateBookDerivedFields(symbol, ts);
  }

  private async requestSnapshot(symbol: string): Promise<void> {
    if (!symbol || this.pendingSnapshotSymbols.has(symbol)) return;
    this.pendingSnapshotSymbols.add(symbol);
    const contract = normalizeSymbol(symbol);
    let timeout: ReturnType<typeof setTimeout> | null = null;
    try {
      const controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), 4_000);
      const response = await fetch(
        `${GATE_REST_BASE}/futures/usdt/order_book?contract=${encodeURIComponent(contract)}&limit=200&with_id=true`,
        { signal: controller.signal },
      );
      clearTimeout(timeout);
      timeout = null;
      if (!response.ok) {
        throw new Error(`snapshot_http_${response.status}`);
      }
      const raw = (await response.json()) as Record<string, unknown>;
      const seq = seqFrom(raw, ["id", "u", "last_id"]);
      if (seq === null) throw new Error("snapshot_no_seq");
      const bids = normalizeLevelRows(raw.bids ?? raw.b);
      const asks = normalizeLevelRows(raw.asks ?? raw.a);
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

  private resetSymbolSyncState(symbol: string): void {
    const key = symbolToBitrium(normalizeSymbol(symbol));
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

  private patchSnapshot(symbol: string, patch: Partial<AdapterSymbolSnapshot>): void {
    const key = symbolToBitrium(normalizeSymbol(symbol));
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

  private appendRecentTrade(symbol: string, row: AdapterTradePoint): void {
    const key = symbolToBitrium(normalizeSymbol(symbol));
    if (!key) return;
    const current = this.recentTradesBySymbol.get(key) ?? [];
    current.push(row);
    if (current.length > TRADE_STORE_MAX) current.splice(0, current.length - TRADE_STORE_MAX);
    this.recentTradesBySymbol.set(key, current);
  }

  private upsertCandle(symbol: string, interval: string, row: AdapterCandlePoint): void {
    const key = symbolToBitrium(normalizeSymbol(symbol));
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
