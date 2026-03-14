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
  NormalizedTradeEvent,
} from "./types.ts";
import { SequenceSafeOrderbookStore } from "./sequenceSafeOrderbook.ts";

const BINANCE_AGGREGATE_URLS = [
  "wss://fstream.binance.com/stream?streams=!ticker@arr/!markPrice@arr@1s/!bookTicker",
  "wss://fstream.binance.com:443/stream?streams=!ticker@arr/!markPrice@arr@1s/!bookTicker",
];
const BINANCE_DEPTH_URLS = [
  "wss://fstream.binance.com/ws",
  "wss://fstream.binance.com:443/ws",
];
const BINANCE_DEPTH_SNAPSHOT_BASE = "https://fapi.binance.com";
const WATCHDOG_STALE_MS = 20_000;
const WATCHDOG_TICK_MS = 5_000;
const HEARTBEAT_PING_MS = 8_000;
const SYMBOL_DELTA_STALE_MS = 14_000;
const SNAPSHOT_SANITY_INTERVAL_MS = 10_000;
const SNAPSHOT_REFRESH_MIN_MS = 45_000;
const SNAPSHOT_SANITY_BATCH = 6;
const SNAPSHOT_REQUEST_GAP_MS = 130;
const SNAPSHOT_BLOCK_COOLDOWN_MS = 90_000;
const CONTRACT_REFRESH_INTERVAL_MS = 45 * 60_000;
const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 12_000;
const DEPTH_BUFFER_MAX = 400;
const BINANCE_CANDLE_INTERVALS = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"] as const;
const CANDLE_STORE_MAX = 900;
const TRADE_STORE_MAX = 500;

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
  private aggregateUrlIndex = 0;
  private depthUrlIndex = 0;
  private started = false;
  private aggregateReconnectAttempts = 0;
  private depthReconnectAttempts = 0;
  private aggregateReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private depthReconnectTimer: ReturnType<typeof setTimeout> | null = null;
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
  private snapshotCursor = 0;
  private snapshotBlockedUntil = 0;
  private contractsLoading = false;
  private snapshotDrainInFlight = false;
  private latencyEmaMs: number | null = null;

  start(): void {
    if (this.started) return;
    this.started = true;
    this.connectAggregate();
    this.connectDepth();
    this.startHeartbeat();
    this.startWatchdog();
    this.startSnapshotSanity();
    this.startContractRefresh();
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
  }

  subscribeSymbols(symbols: string[]): void {
    const unique = [...new Set(symbols.map((symbol) => ensureUsdtPair(symbol)).filter(Boolean))];
    if (!unique.length) return;
    const eligible = unique.filter((symbol) => this.isDepthEligible(symbol));
    if (!eligible.length) return;
    const newlyAdded: string[] = [];
    for (const symbol of eligible) {
      if (this.depthSymbols.has(symbol)) continue;
      this.depthSymbols.add(symbol);
      newlyAdded.push(symbol);
    }
    if (!newlyAdded.length) return;
    this.subscribeDepthStreams(newlyAdded);
    for (const symbol of newlyAdded) {
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
    const connected = connectedAggregate && connectedDepth;
    const lastMessageAgeMs = this.lastMessageAt > 0 ? Math.max(0, now - this.lastMessageAt) : Number.POSITIVE_INFINITY;
    let score = connected ? 100 : connectedAggregate || connectedDepth ? 58 : 20;
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
    if (lastMessageAgeMs > 6_000) reasons.push(`message_age_${Math.round(lastMessageAgeMs)}ms`);
    if (staleSymbolCount > 0) reasons.push(`stale_symbols_${staleSymbolCount}`);
    if (this.snapshotFailures > 0) reasons.push(`snapshot_failures_${this.snapshotFailures}`);
    if (this.pendingSnapshotSymbols.size > 0) reasons.push(`snapshot_pending_${this.pendingSnapshotSymbols.size}`);
    if (this.snapshotBlockedUntil > now) reasons.push(`snapshot_blocked_${Math.max(1, Math.round((this.snapshotBlockedUntil - now) / 1000))}s`);
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
    const ws = new WebSocket(url, { handshakeTimeout: 10_000 });
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
    const ws = new WebSocket(url, { handshakeTimeout: 10_000 });
    this.depthWs = ws;

    ws.on("open", () => {
      this.depthReconnectAttempts = 0;
      this.lastError = null;
      this.touchMessage(Date.now());
      this.pushReason("depth_open");
      this.subscribeDepthStreams([...this.depthSymbols]);
      for (const symbol of this.depthSymbols) {
        this.resetSymbolSyncState(symbol);
        this.enqueueSnapshot(symbol);
      }
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
    }, WATCHDOG_TICK_MS);
  }

  private startSnapshotSanity(): void {
    if (this.snapshotSanityTimer) clearInterval(this.snapshotSanityTimer);
    this.snapshotSanityTimer = setInterval(() => {
      if (!this.started) return;
      const now = Date.now();
      for (const symbol of this.depthSymbols) {
        if (!this.isDepthEligible(symbol)) continue;
        if (!this.orderbooks.isReady(symbol)) {
          if (!this.pendingSnapshotSymbols.has(symbol)) this.enqueueSnapshot(symbol);
          continue;
        }
        const lastDeltaAt = this.lastBookDeltaAtBySymbol.get(symbol) ?? 0;
        if (lastDeltaAt > 0 && now - lastDeltaAt > SYMBOL_DELTA_STALE_MS) {
          if (!this.pendingSnapshotSymbols.has(symbol)) {
            this.symbolStaleResyncs += 1;
            this.pushReason(`symbol_delta_stale:${symbol}:${Math.round(now - lastDeltaAt)}ms`);
            this.resetSymbolSyncState(symbol);
            this.enqueueSnapshot(symbol);
          }
        }
      }

      const symbols = [...this.depthSymbols].filter((symbol) => this.isDepthEligible(symbol));
      if (!symbols.length) return;
      const total = symbols.length;
      const batch = Math.min(SNAPSHOT_SANITY_BATCH, total);
      for (let i = 0; i < batch; i += 1) {
        const idx = (this.snapshotCursor + i) % total;
        const symbol = symbols[idx]!;
        const lastSnapshotAt = this.lastSnapshotAtBySymbol.get(symbol) ?? 0;
        if (lastSnapshotAt > 0 && now - lastSnapshotAt < SNAPSHOT_REFRESH_MIN_MS) continue;
        if (this.pendingSnapshotSymbols.has(symbol)) continue;
        this.enqueueSnapshot(symbol);
      }
      this.snapshotCursor = (this.snapshotCursor + batch) % total;
    }, SNAPSHOT_SANITY_INTERVAL_MS);
  }

  private startContractRefresh(): void {
    if (this.contractRefreshTimer) clearInterval(this.contractRefreshTimer);
    this.contractRefreshTimer = setInterval(() => {
      void this.refreshContracts();
    }, CONTRACT_REFRESH_INTERVAL_MS);
  }

  private subscribeDepthStreams(symbols: string[]): void {
    const ws = this.depthWs;
    if (!ws || ws.readyState !== WebSocket.OPEN || !symbols.length) return;
    const params: string[] = [];
    for (const symbol of symbols) {
      if (!this.isDepthEligible(symbol)) continue;
      const lower = symbol.toLowerCase();
      params.push(`${lower}@depth@100ms`);
      params.push(`${lower}@trade`);
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

    if (stream.includes("!ticker@arr") && Array.isArray(data)) {
      for (const row of data) {
        const rec = row as Record<string, unknown>;
        const symbol = ensureUsdtPair(rec.s);
        if (!symbol) continue;
        const price = toNum(rec.c);
        const change24hPct = toNum(rec.P);
        const volume24hUsd = toNum(rec.q);
        if (price === null || change24hPct === null || volume24hUsd === null) continue;
        const ts = toNum(rec.E) ?? Date.now();
        this.touchMessage(ts);
        this.patchSnapshot(symbol, {
          price,
          change24hPct,
          volume24hUsd,
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
      return;
    }

    if (stream.includes("!markprice@arr") && Array.isArray(data)) {
      for (const row of data) {
        const rec = row as Record<string, unknown>;
        const symbol = ensureUsdtPair(rec.s);
        if (!symbol) continue;
        const markPrice = toNum(rec.p);
        if (markPrice === null) continue;
        const fundingRate = toNum(rec.r);
        const nextFundingTime = toNum(rec.T);
        const ts = toNum(rec.E) ?? Date.now();
        this.touchMessage(ts);
        this.patchSnapshot(symbol, {
          markPrice,
          fundingRate,
          nextFundingTime,
          sourceTs: ts,
        });
        this.emit({
          type: "mark_price",
          exchange: this.exchange,
          symbol,
          ts,
          recvTs: Date.now(),
          markPrice,
          fundingRate,
          nextFundingTime,
        });
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
    if (eventType === "trade") {
      this.onTrade(rec);
      return;
    }
    if (eventType === "kline") {
      this.onKline(rec);
      return;
    }
    if (eventType === "depthUpdate") {
      this.onDepthDelta(rec);
    }
  }

  private onTrade(rec: Record<string, unknown>): void {
    const symbol = ensureUsdtPair(rec.s);
    if (!symbol) return;
    const price = toNum(rec.p);
    const qty = toNum(rec.q);
    if (price === null || qty === null || price <= 0 || qty <= 0) return;
    const ts = toNum(rec.T) ?? toNum(rec.E) ?? Date.now();
    this.touchMessage(ts);
    const side: "BUY" | "SELL" = rec.m === true ? "SELL" : "BUY";
    this.patchSnapshot(symbol, {
      lastTradePrice: price,
      lastTradeQty: qty,
      lastTradeSide: side,
      sourceTs: ts,
    });
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
    const symbol = ensureUsdtPair(rec.s);
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
    const ts = toNum(k.T) ?? toNum(rec.E) ?? Date.now();
    this.touchMessage(ts);
    this.patchSnapshot(symbol, {
      price: close,
      sourceTs: ts,
    });
  }

  private onDepthDelta(rec: Record<string, unknown>): void {
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

    if (!this.orderbooks.isReady(symbol)) {
      const queue = this.deltaBufferBySymbol.get(symbol) ?? [];
      queue.push(delta);
      if (queue.length > DEPTH_BUFFER_MAX) queue.splice(0, queue.length - DEPTH_BUFFER_MAX);
      this.deltaBufferBySymbol.set(symbol, queue);
      if (!this.pendingSnapshotSymbols.has(symbol)) {
        this.enqueueSnapshot(symbol);
      }
      return;
    }

    const applied = this.orderbooks.applyDelta(symbol, startSeq, endSeq, bids, asks);
    if (!applied.ok && applied.gap) {
      this.gapCount += 1;
      this.pushReason(`depth_gap:${symbol}:${startSeq}-${endSeq}`);
      this.resetSymbolSyncState(symbol);
      this.enqueueSnapshot(symbol);
      return;
    }
    if (applied.applied) {
      this.updateBookDerivedFields(symbol, ts);
    }
  }

  private enqueueSnapshot(symbol: string): void {
    const normalized = ensureUsdtPair(symbol);
    if (!normalized || !this.isDepthEligible(normalized)) return;
    if (this.pendingSnapshotSymbols.has(normalized)) return;
    if (this.snapshotQueueSet.has(normalized)) return;
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
      const controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), 3_800);
      const res = await fetch(
        `${BINANCE_DEPTH_SNAPSHOT_BASE}/fapi/v1/depth?symbol=${encodeURIComponent(symbol)}&limit=100`,
        { signal: controller.signal },
      );
      clearTimeout(timeout);
      timeout = null;
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
            this.enqueueSnapshot(symbol);
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
      if (statusCode === 418 || statusCode === 429) {
        this.snapshotBlockedUntil = Date.now() + SNAPSHOT_BLOCK_COOLDOWN_MS;
        this.pushReason(`snapshot_rate_limited:${statusCode}`);
      } else if (statusCode === 400 && currentFail >= 3) {
        this.excludedDepthSymbols.add(symbol);
        this.pushReason(`exclude_depth_symbol:${symbol}`);
      } else if (currentFail >= 6) {
        this.pushReason(`snapshot_fail_threshold_reconnect:${symbol}`);
        if (this.depthWs && this.depthWs.readyState === WebSocket.OPEN) {
          try {
            this.depthWs.terminate();
          } catch {
            // no-op
          }
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
      const controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), 6_000);
      const res = await fetch(`${BINANCE_DEPTH_SNAPSHOT_BASE}/fapi/v1/exchangeInfo`, { signal: controller.signal });
      clearTimeout(timeout);
      timeout = null;
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
    const key = ensureUsdtPair(symbol);
    if (!key) return;
    const current = this.recentTradesBySymbol.get(key) ?? [];
    current.push(row);
    if (current.length > TRADE_STORE_MAX) current.splice(0, current.length - TRADE_STORE_MAX);
    this.recentTradesBySymbol.set(key, current);
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
