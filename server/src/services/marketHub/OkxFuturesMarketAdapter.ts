/**
 * OKX Futures Market Adapter — extends BaseAdapter
 *
 * OKX-specific logic only:
 *  - Symbol normalization: BTCUSDT ↔ BTC-USDT-SWAP
 *  - WS subscribe format: {op:"subscribe", args:[{channel,instId}]}
 *  - Custom heartbeat: raw "ping" string, receives raw "pong" string
 *  - Message format: {arg:{channel,instId}, data:[...], action:"snapshot"|"update"}
 *  - Candle channels: candle1m, candle5m, candle15m, etc.
 *  - REST: OKX V5 API response format
 *  - Depth symbol limit (10 max, priority seeding)
 */

import type {
  AdapterCandlePoint,
  NormalizedBookDeltaEvent,
  NormalizedBookSnapshotEvent,
  NormalizedBookTickerEvent,
  NormalizedKlineEvent,
  NormalizedTickerEvent,
  NormalizedTradeEvent,
} from "./types.ts";
import type { SubscriptionChannel, SubscribeParams } from "./contracts/ExchangeAdapter.ts";
import type { AdapterPolicy, OrderbookSnapshot } from "./contracts/HubModels.ts";
import { BaseAdapter, toNum, toMs, asRecord, asRecordList, normalizeLevelRows } from "./BaseAdapter.ts";

// ── Constants ───────────────────────────────────────────────────────

const OKX_WS_URLS = ["wss://ws.okx.com:8443/ws/v5/public"];
const OKX_REST_BASE = "https://www.okx.com/api/v5";
const SYMBOL_DELTA_STALE_MS = 14_000;
const SNAPSHOT_SANITY_INTERVAL_MS = 10_000;
const SNAPSHOT_REFRESH_MIN_MS = 45_000;
const SNAPSHOT_SANITY_BATCH = 6;
const MAX_DEPTH_SYMBOLS = 10;

const PRIORITY_DEPTH_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];

/** OKX candle channel names */
const OKX_CANDLE_CHANNELS = [
  "candle1m", "candle5m", "candle15m", "candle30m", "candle1H", "candle4H", "candle1D",
] as const;

/** OKX channel → internal interval */
const OKX_CHANNEL_TO_INTERVAL: Record<string, string> = {
  candle1m: "1m", candle5m: "5m", candle15m: "15m", candle30m: "30m",
  "candle1H": "1h", "candle4H": "4h", "candle1D": "1d",
};

/** Internal interval → OKX candle channel */
const INTERVAL_TO_OKX_CHANNEL: Record<string, string> = {};
for (const [ch, iv] of Object.entries(OKX_CHANNEL_TO_INTERVAL)) {
  INTERVAL_TO_OKX_CHANNEL[iv] = ch;
}

// ── OKX symbol helpers ──────────────────────────────────────────────

/** "BTCUSDT" → "BTC-USDT-SWAP" */
function toOkxInstId(symbol: string): string {
  const s = symbol.toUpperCase().replace(/[-_]/g, "");
  if (s.endsWith("USDT")) return `${s.slice(0, -4)}-USDT-SWAP`;
  return symbol;
}

/** "BTC-USDT-SWAP" → "BTCUSDT" */
function fromOkxInstId(instId: string): string {
  return instId.replace(/-USDT-SWAP$/, "USDT").replace(/-/g, "");
}

/** Normalize any symbol-like string to "BTCUSDT" */
function normalizeOkxSymbol(raw: unknown): string {
  const s = String(raw ?? "").toUpperCase().replace(/[-_/]/g, "").trim();
  if (!s) return "";
  if (s.endsWith("USDTSWAP")) return s.replace(/SWAP$/, "");
  return s;
}

// ═══════════════════════════════════════════════════════════════════
// OKX FUTURES MARKET ADAPTER
// ═══════════════════════════════════════════════════════════════════

export class OkxFuturesMarketAdapter extends BaseAdapter {
  readonly exchange = "OKX" as const;

  readonly policy: AdapterPolicy = {
    exchange: "OKX",
    wsUrls: OKX_WS_URLS,
    heartbeatIntervalMs: 25_000,
    watchdogStaleMs: 30_000,
    reconnectBaseMs: 700,
    reconnectMaxMs: 12_000,
    reconnectJitterMs: 250,
    restWeightPerMinute: 600,
    wsSubscriptionsMax: 300,
    hasAggregateStream: false,
    hasPerSymbolDepth: true,
    hasPerSymbolKline: true,
    hasPerSymbolTrade: true,
    hasBookTicker: false,          // OKX sends bid/ask inside tickers channel
    maxDepthSymbols: MAX_DEPTH_SYMBOLS,
    maxKlineSymbols: 50,
    snapshotSanityIntervalMs: SNAPSHOT_SANITY_INTERVAL_MS,
    snapshotRefreshMinMs: SNAPSHOT_REFRESH_MIN_MS,
    snapshotSanityBatch: SNAPSHOT_SANITY_BATCH,
    symbolSeparator: "-",
    symbolSuffix: "-SWAP",
  };

  // ── OKX-specific state ────────────────────────────────────────
  private readonly depthSymbolSet = new Set<string>();
  private snapshotSanityTimer: ReturnType<typeof setInterval> | null = null;
  private symbolStaleResyncs = 0;
  private snapshotFailures = 0;
  private snapshotCursor = 0;

  // ══════════════════════════════════════════════════════════════
  //  ABSTRACT HOOK IMPLEMENTATIONS
  // ══════════════════════════════════════════════════════════════

  protected getWsUrls(): string[] {
    return OKX_WS_URLS;
  }

  toExchangeSymbol(symbol: string): string {
    return toOkxInstId(symbol);
  }

  toBitriumSymbol(raw: string): string {
    return normalizeOkxSymbol(raw);
  }

  protected buildSubscribeFrame(
    channel: SubscriptionChannel,
    symbol: string,
    params?: SubscribeParams,
  ): unknown | null {
    const instId = toOkxInstId(symbol);
    if (!instId) return null;

    const args: Array<{ channel: string; instId: string }> = [];
    switch (channel) {
      case "ticker":
        args.push({ channel: "tickers", instId });
        break;
      case "depth":
        if (this.depthSymbolSet.size >= MAX_DEPTH_SYMBOLS && !this.depthSymbolSet.has(symbol)) {
          return null;
        }
        this.depthSymbolSet.add(symbol);
        args.push({ channel: "books", instId });
        break;
      case "trade":
        args.push({ channel: "trades", instId });
        break;
      case "kline": {
        const okxChannel = INTERVAL_TO_OKX_CHANNEL[params?.interval ?? "1m"];
        if (!okxChannel) return null;
        args.push({ channel: okxChannel, instId });
        break;
      }
      default:
        return null;
    }
    return { op: "subscribe", args };
  }

  protected buildUnsubscribeFrame(
    channel: SubscriptionChannel,
    symbol: string,
    params?: SubscribeParams,
  ): unknown | null {
    const instId = toOkxInstId(symbol);
    if (!instId) return null;

    const args: Array<{ channel: string; instId: string }> = [];
    switch (channel) {
      case "ticker":
        args.push({ channel: "tickers", instId });
        break;
      case "depth":
        this.depthSymbolSet.delete(symbol);
        args.push({ channel: "books", instId });
        break;
      case "trade":
        args.push({ channel: "trades", instId });
        break;
      case "kline": {
        const okxChannel = INTERVAL_TO_OKX_CHANNEL[params?.interval ?? "1m"];
        if (!okxChannel) return null;
        args.push({ channel: okxChannel, instId });
        break;
      }
      default:
        return null;
    }
    return { op: "unsubscribe", args };
  }

  // ── Legacy subscribeSymbols override ──────────────────────────
  override subscribeSymbols(symbols: string[]): void {
    for (const raw of symbols) {
      const s = normalizeOkxSymbol(raw);
      if (!s) continue;
      this.subscribeTicker(s);
      this.subscribeTrade(s);
      this.subscribeDepth(s);
      for (const interval of Object.keys(INTERVAL_TO_OKX_CHANNEL)) {
        this.subscribeKline(s, interval);
      }
    }
    for (const raw of symbols) {
      const s = normalizeOkxSymbol(raw);
      if (s && this.depthSymbolSet.has(s)) {
        void this.requestSnapshot(s);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  OPTIONAL HOOK OVERRIDES
  // ══════════════════════════════════════════════════════════════

  protected override onStarted(): void {
    for (const symbol of PRIORITY_DEPTH_SYMBOLS) {
      this.depthSymbolSet.add(symbol);
    }
    this.startSnapshotSanity();
  }

  protected override onStopped(): void {
    if (this.snapshotSanityTimer) {
      clearInterval(this.snapshotSanityTimer);
      this.snapshotSanityTimer = null;
    }
  }

  protected override onConnected(): void {
    for (const symbol of this.depthSymbolSet) {
      this.resetSymbolSyncState(symbol);
      void this.requestSnapshot(symbol);
    }
  }

  /** OKX expects raw "ping" string, replies raw "pong" */
  protected override onHeartbeatTick(): void {
    this.safeSend("ping");
  }

  protected override adjustHealthScore(baseScore: number): number {
    let score = baseScore;
    const now = Date.now();

    let staleSymbolCount = 0;
    for (const symbol of this.depthSymbolSet) {
      if (!this.orderbooks.isReady(symbol)) continue;
      const lastDeltaAt = this.lastBookDeltaAtBySymbol.get(symbol) ?? 0;
      if (!lastDeltaAt) continue;
      if (now - lastDeltaAt > SYMBOL_DELTA_STALE_MS) staleSymbolCount += 1;
    }
    if (staleSymbolCount > 0) score -= Math.min(10, staleSymbolCount * 1.2);

    score -= Math.min(9, this.symbolStaleResyncs * 0.4);
    score -= Math.min(12, this.snapshotFailures * 1.1);
    score -= Math.min(6, this.pendingSnapshotSymbols.size * 0.8);

    return score;
  }

  // ══════════════════════════════════════════════════════════════
  //  MESSAGE PARSING (OKX-specific)
  // ══════════════════════════════════════════════════════════════

  protected parseMessage(text: string): void {
    // OKX sends raw "pong" string
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

    // Subscribe/unsubscribe ack
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

    // Data messages: {arg: {channel, instId}, data: [...], action: ...}
    const argObj = asRecord(rec.arg);
    if (!argObj) return;
    const channel = String(argObj.channel ?? "");
    const instId = String(argObj.instId ?? "");
    if (!channel || !instId) return;
    const data = rec.data;
    if (!Array.isArray(data) || data.length === 0) return;
    const action = String(rec.action ?? "");

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
      if (interval) this.onCandleMessage(instId, interval, data);
      return;
    }
  }

  // ── Trades ────────────────────────────────────────────────────

  private onTradesMessage(instId: string, data: unknown[]): void {
    const symbol = fromOkxInstId(instId);
    if (!symbol) return;
    for (const payload of asRecordList(data)) {
      const price = toNum(payload.px);
      const qty = toNum(payload.sz);
      if (price === null || qty === null || price <= 0 || qty === 0) continue;
      const ts = toMs(payload.ts) ?? Date.now();
      const side: "BUY" | "SELL" = String(payload.side ?? "").toLowerCase() === "sell" ? "SELL" : "BUY";
      this.touchMessage(ts);
      this.patchSnapshot(symbol, {
        lastTradePrice: price, lastTradeQty: Math.abs(qty), lastTradeSide: side, sourceTs: ts,
      });
      this.appendRecentTrade(symbol, { ts, price, amount: Math.abs(qty), side });
      const event: NormalizedTradeEvent = {
        type: "trade", exchange: this.exchange, symbol, ts, recvTs: Date.now(),
        tradeId: payload.tradeId !== undefined ? String(payload.tradeId) : undefined,
        price, qty: Math.abs(qty), side,
      };
      this.emit(event);
    }
  }

  // ── Tickers ───────────────────────────────────────────────────

  private onTickersMessage(instId: string, data: unknown[]): void {
    const symbol = fromOkxInstId(instId);
    if (!symbol) return;
    for (const payload of asRecordList(data)) {
      const last = toNum(payload.last);
      if (last === null || last <= 0) continue;
      const open24h = toNum(payload.open24h);
      const change24hPct = open24h !== null && open24h > 0 ? ((last - open24h) / open24h) * 100 : 0;
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

      let spreadBps: number | null = null;
      let depthUsd: number | null = null;
      let imbalance: number | null = null;
      if (bidPx !== null && askPx !== null && bidPx > 0 && askPx > 0) {
        const mid = (bidPx + askPx) / 2;
        spreadBps = mid > 0 ? ((askPx - bidPx) / mid) * 10_000 : null;
        const bidDepthUsd = bidSz !== null && bidSz > 0 ? bidPx * bidSz : null;
        const askDepthUsd = askSz !== null && askSz > 0 ? askPx * askSz : null;
        depthUsd = bidDepthUsd !== null || askDepthUsd !== null
          ? Math.max(0, (bidDepthUsd ?? 0) + (askDepthUsd ?? 0)) : null;
        imbalance = depthUsd && depthUsd > 0
          ? ((bidDepthUsd ?? 0) - (askDepthUsd ?? 0)) / depthUsd : null;
      }

      this.patchSnapshot(symbol, {
        price: last, change24hPct, volume24hUsd: volCcy24h,
        topBid: bidPx, topAsk: askPx, bidQty: bidSz, askQty: askSz,
        spreadBps, depthUsd, imbalance,
        markPrice: markPx, fundingRate: fundingRate ?? null,
        nextFundingTime: nextFundingTime ?? null, sourceTs: ts,
      });

      const tickerEvent: NormalizedTickerEvent = {
        type: "ticker", exchange: this.exchange, symbol, ts, recvTs: Date.now(),
        price: last, change24hPct, volume24hUsd: volCcy24h,
      };
      this.emit(tickerEvent);

      if (bidPx !== null && askPx !== null && bidPx > 0 && askPx > 0) {
        const btEvent: NormalizedBookTickerEvent = {
          type: "book_ticker", exchange: this.exchange, symbol, ts, recvTs: Date.now(),
          bid: bidPx, ask: askPx, bidQty: bidSz ?? undefined, askQty: askSz ?? undefined,
        };
        this.emit(btEvent);
      }
    }
  }

  // ── Candles ───────────────────────────────────────────────────

  private onCandleMessage(instId: string, interval: string, data: unknown[]): void {
    const symbol = fromOkxInstId(instId);
    if (!symbol) return;
    for (const item of data) {
      if (!Array.isArray(item) || item.length < 6) continue;
      const tsMs = toMs(item[0]);
      if (tsMs === null) continue;
      const open = toNum(item[1]);
      const high = toNum(item[2]);
      const low = toNum(item[3]);
      const close = toNum(item[4]);
      const volume = toNum(item[5]) ?? 0;
      if (open === null || high === null || low === null || close === null) continue;
      const closed = item.length >= 9 ? String(item[8]) === "1" : false;

      const candle: AdapterCandlePoint = {
        time: Math.floor(tsMs / 1000), open, high, low, close, volume: Math.max(0, volume),
      };
      this.upsertCandle(symbol, interval, candle);
      this.touchMessage(tsMs);
      this.patchSnapshot(symbol, { price: close, sourceTs: tsMs });

      const event: NormalizedKlineEvent = {
        type: "kline", exchange: this.exchange, symbol, ts: tsMs, recvTs: Date.now(),
        interval, openTime: Math.floor(tsMs / 1000),
        open, high, low, close, volume: Math.max(0, volume), closed,
      };
      this.emit(event);
    }
  }

  // ── Orderbook ─────────────────────────────────────────────────

  private onBookMessage(instId: string, action: string, data: unknown[]): void {
    const symbol = fromOkxInstId(instId);
    if (!symbol) return;

    for (const payload of asRecordList(data)) {
      const bids = normalizeLevelRows(payload.bids);
      const asks = normalizeLevelRows(payload.asks);
      const ts = toMs(payload.ts) ?? Date.now();
      const seqId = toNum(payload.seqId);
      const prevSeqId = toNum(payload.prevSeqId);
      this.touchMessage(ts);

      if (action === "snapshot") {
        if (seqId === null) continue;
        const snapshotEvent: NormalizedBookSnapshotEvent = {
          type: "book_snapshot", exchange: this.exchange, symbol, ts, recvTs: Date.now(),
          seq: seqId, bids, asks,
        };
        this.emit(snapshotEvent);
        this.orderbooks.applySnapshot(symbol, seqId, bids, asks);
        this.lastSnapshotAtBySymbol.set(symbol, Date.now());
        this.deltaBufferBySymbol.delete(symbol);
        this.pendingSnapshotSymbols.delete(symbol);
        this.snapshotFailures = 0;
        this.updateBookDerivedFields(symbol, ts);
        this.resyncCount += 1;
      } else if (action === "update") {
        if (seqId === null) continue;
        const startSeq = prevSeqId ?? seqId;
        const endSeq = seqId;
        this.lastBookDeltaAtBySymbol.set(symbol, Date.now());

        const delta: NormalizedBookDeltaEvent = {
          type: "book_delta", exchange: this.exchange, symbol, ts, recvTs: Date.now(),
          startSeq, endSeq, bids, asks,
        };
        this.emit(delta);

        if (!this.orderbooks.isReady(symbol)) {
          this.bufferDelta(symbol, delta);
          if (!this.pendingSnapshotSymbols.has(symbol)) void this.requestSnapshot(symbol);
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
        if (applied.applied) this.updateBookDerivedFields(symbol, ts);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  REST FALLBACK
  // ══════════════════════════════════════════════════════════════

  async fetchDepthSnapshot(symbol: string, _levels = 200): Promise<OrderbookSnapshot> {
    const instId = toOkxInstId(symbol);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4_000);
    try {
      const response = await fetch(
        `${OKX_REST_BASE}/market/books?instId=${encodeURIComponent(instId)}&sz=200`,
        { signal: controller.signal },
      );
      if (!response.ok) throw new Error(`snapshot_http_${response.status}`);
      const raw = (await response.json()) as Record<string, unknown>;
      if (String(raw.code ?? "") !== "0") throw new Error(`snapshot_api_code_${raw.code}`);
      const dataArr = Array.isArray(raw.data) ? raw.data : [];
      const bookData = asRecord(dataArr[0]);
      if (!bookData) throw new Error("snapshot_empty_data");
      const seq = toNum(bookData.seqId);
      if (seq === null) throw new Error("snapshot_no_seq");
      const bids = normalizeLevelRows(bookData.bids);
      const asks = normalizeLevelRows(bookData.asks);
      return {
        exchange: this.exchange, symbol: fromOkxInstId(instId), seq,
        bids: bids.map(([price, qty]) => ({ price, qty })),
        asks: asks.map(([price, qty]) => ({ price, qty })),
        ts: Date.now(),
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async fetchKlines(symbol: string, interval: string, limit = 200): Promise<AdapterCandlePoint[]> {
    const instId = toOkxInstId(symbol);
    const bar = interval; // OKX uses same format: 1m, 5m, 1H, 4H, 1D
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4_000);
    try {
      const response = await fetch(
        `${OKX_REST_BASE}/market/candles?instId=${encodeURIComponent(instId)}&bar=${bar}&limit=${limit}`,
        { signal: controller.signal },
      );
      if (!response.ok) return [];
      const raw = (await response.json()) as Record<string, unknown>;
      if (String(raw.code ?? "") !== "0") return [];
      const dataArr = Array.isArray(raw.data) ? raw.data : [];
      return (dataArr as Array<unknown[]>).map((row) => ({
        time: Math.floor((toNum(row[0]) ?? 0) / 1000),
        open: toNum(row[1]) ?? 0,
        high: toNum(row[2]) ?? 0,
        low: toNum(row[3]) ?? 0,
        close: toNum(row[4]) ?? 0,
        volume: toNum(row[5]) ?? 0,
      })).filter((c) => c.time > 0).reverse(); // OKX returns newest first
    } finally {
      clearTimeout(timeout);
    }
  }

  async fetchRecentTrades(symbol: string, _limit = 100): Promise<AdapterCandlePoint[]> {
    return []; // Served from WS buffer
  }

  // ══════════════════════════════════════════════════════════════
  //  OKX-SPECIFIC: SNAPSHOT LIFECYCLE
  // ══════════════════════════════════════════════════════════════

  private async requestSnapshot(symbol: string): Promise<void> {
    if (!symbol || this.pendingSnapshotSymbols.has(symbol)) return;
    this.pendingSnapshotSymbols.add(symbol);
    try {
      const snap = await this.fetchDepthSnapshot(symbol);
      const snapshotEvent: NormalizedBookSnapshotEvent = {
        type: "book_snapshot", exchange: this.exchange, symbol, ts: snap.ts, recvTs: snap.ts,
        seq: snap.seq,
        bids: snap.bids.map((l) => [l.price, l.qty] as [number, number]),
        asks: snap.asks.map((l) => [l.price, l.qty] as [number, number]),
      };
      this.emit(snapshotEvent);
      this.orderbooks.applySnapshot(
        symbol, snap.seq,
        snap.bids.map((l) => [l.price, l.qty] as [number, number]),
        snap.asks.map((l) => [l.price, l.qty] as [number, number]),
      );
      this.lastSnapshotAtBySymbol.set(symbol, Date.now());
      this.snapshotFailures = 0;

      const buffered = this.deltaBufferBySymbol.get(symbol) ?? [];
      this.deltaBufferBySymbol.delete(symbol);
      if (buffered.length) {
        buffered.sort((a, b) => a.endSeq - b.endSeq);
        for (const delta of buffered) {
          if (delta.endSeq <= snap.seq) continue;
          const applied = this.orderbooks.applyDelta(symbol, delta.startSeq, delta.endSeq, delta.bids, delta.asks);
          if (!applied.ok && applied.gap) {
            this.gapCount += 1;
            this.pushReason(`snapshot_reconcile_gap:${symbol}`);
            this.resetSymbolSyncState(symbol);
            this.resyncCount += 1;
            this.pendingSnapshotSymbols.delete(symbol);
            void this.requestSnapshot(symbol);
            return;
          }
        }
      }

      this.updateBookDerivedFields(symbol, snap.ts);
      this.resyncCount += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "snapshot_error";
      this.lastError = `snapshot:${message}`;
      this.pushReason(`snapshot_fail:${symbol}:${message}`);
      this.snapshotFailures += 1;
      if (this.snapshotFailures >= 4 && this.isWsOpen()) {
        this.pushReason("snapshot_fail_threshold_reconnect");
        if (this.ws) {
          try { this.ws.terminate(); } catch { /* no-op */ }
        }
      }
    } finally {
      this.pendingSnapshotSymbols.delete(symbol);
    }
  }

  private startSnapshotSanity(): void {
    if (this.snapshotSanityTimer) clearInterval(this.snapshotSanityTimer);
    this.snapshotSanityTimer = setInterval(() => {
      if (!this.started) return;
      const now = Date.now();

      for (const symbol of this.depthSymbolSet) {
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

      const symbols = [...this.depthSymbolSet];
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
}
