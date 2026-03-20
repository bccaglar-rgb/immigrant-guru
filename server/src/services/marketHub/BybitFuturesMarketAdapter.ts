/**
 * Bybit Futures Market Adapter — extends BaseAdapter
 *
 * Bybit-specific logic only:
 *  - WS subscribe/unsubscribe frame format ({op:"subscribe", args:[...]})
 *  - Custom heartbeat ({op:"ping"} instead of WS ping)
 *  - Message parsing (publicTrade, tickers, kline, orderbook topics)
 *  - REST snapshot endpoint (Bybit V5 API)
 *  - Kline interval mapping (1m→"1", 1h→"60", 1d→"D")
 *  - Depth symbol limit (10 max, priority seeding)
 *  - Symbol format: BTCUSDT (same as Bitrium — identity normalization)
 */

import type {
  AdapterCandlePoint,
  NormalizedBookDeltaEvent,
  NormalizedBookSnapshotEvent,
  NormalizedBookTickerEvent,
  NormalizedKlineEvent,
  NormalizedTradeEvent,
} from "./types.ts";
import type { SubscriptionChannel, SubscribeParams } from "./contracts/ExchangeAdapter.ts";
import type { AdapterPolicy, OrderbookSnapshot } from "./contracts/HubModels.ts";
import { BaseAdapter, toNum, toMs, asRecord, asRecordList, normalizeLevelRows } from "./BaseAdapter.ts";

// ── Constants ───────────────────────────────────────────────────────

const BYBIT_WS_URLS = ["wss://stream.bybit.com/v5/public/linear"];
const BYBIT_REST_BASE = "https://api.bybit.com/v5";
const SYMBOL_DELTA_STALE_MS = 14_000;
const SNAPSHOT_SANITY_INTERVAL_MS = 10_000;
const SNAPSHOT_REFRESH_MIN_MS = 45_000;
const SNAPSHOT_SANITY_BATCH = 6;
const MAX_DEPTH_SYMBOLS = 10;

const PRIORITY_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"];

/** Internal interval → Bybit kline interval string. */
const INTERVAL_TO_BYBIT: Record<string, string> = {
  "1m": "1", "5m": "5", "15m": "15", "30m": "30",
  "1h": "60", "4h": "240", "1d": "D",
};

/** Bybit kline interval → internal interval. */
const BYBIT_TO_INTERVAL: Record<string, string> = {};
for (const [internal, bybit] of Object.entries(INTERVAL_TO_BYBIT)) {
  BYBIT_TO_INTERVAL[bybit] = internal;
}

const KLINE_INTERVALS = Object.keys(INTERVAL_TO_BYBIT);

// ── Bybit symbol helper ─────────────────────────────────────────────

/** Bybit uses same format as Bitrium: BTCUSDT */
function normalizeBybitSymbol(raw: unknown): string {
  return String(raw ?? "").toUpperCase().trim();
}

// ═══════════════════════════════════════════════════════════════════
// BYBIT FUTURES MARKET ADAPTER
// ═══════════════════════════════════════════════════════════════════

export class BybitFuturesMarketAdapter extends BaseAdapter {
  readonly exchange = "BYBIT" as const;

  readonly policy: AdapterPolicy = {
    exchange: "BYBIT",
    wsUrls: BYBIT_WS_URLS,
    heartbeatIntervalMs: 20_000,
    watchdogStaleMs: 25_000,
    reconnectBaseMs: 700,
    reconnectMaxMs: 12_000,
    reconnectJitterMs: 250,
    restWeightPerMinute: 600,
    wsSubscriptionsMax: 300,
    hasAggregateStream: false,
    hasPerSymbolDepth: true,
    hasPerSymbolKline: true,
    hasPerSymbolTrade: true,
    hasBookTicker: false,          // Bybit sends bid/ask inside tickers topic
    maxDepthSymbols: MAX_DEPTH_SYMBOLS,
    maxKlineSymbols: 50,
    snapshotSanityIntervalMs: SNAPSHOT_SANITY_INTERVAL_MS,
    snapshotRefreshMinMs: SNAPSHOT_REFRESH_MIN_MS,
    snapshotSanityBatch: SNAPSHOT_SANITY_BATCH,
    symbolSeparator: "",
    symbolSuffix: "",
  };

  // ── Bybit-specific state ──────────────────────────────────────
  private readonly depthSymbolSet = new Set<string>();
  private snapshotSanityTimer: ReturnType<typeof setInterval> | null = null;
  private symbolStaleResyncs = 0;
  private snapshotFailures = 0;
  private snapshotCursor = 0;

  // ══════════════════════════════════════════════════════════════
  //  ABSTRACT HOOK IMPLEMENTATIONS
  // ══════════════════════════════════════════════════════════════

  protected getWsUrls(): string[] {
    return BYBIT_WS_URLS;
  }

  toExchangeSymbol(symbol: string): string {
    return normalizeBybitSymbol(symbol);
  }

  toBitriumSymbol(raw: string): string {
    return normalizeBybitSymbol(raw);
  }

  protected buildSubscribeFrame(
    channel: SubscriptionChannel,
    symbol: string,
    params?: SubscribeParams,
  ): unknown | null {
    const sym = normalizeBybitSymbol(symbol);
    if (!sym) return null;

    const args: string[] = [];
    switch (channel) {
      case "ticker":
        args.push(`tickers.${sym}`);
        break;
      case "depth":
        if (this.depthSymbolSet.size >= MAX_DEPTH_SYMBOLS && !this.depthSymbolSet.has(sym)) {
          return null; // depth limit reached
        }
        this.depthSymbolSet.add(sym);
        args.push(`orderbook.50.${sym}`);
        break;
      case "trade":
        args.push(`publicTrade.${sym}`);
        break;
      case "kline": {
        const bybitInterval = INTERVAL_TO_BYBIT[params?.interval ?? "1m"];
        if (!bybitInterval) return null;
        args.push(`kline.${bybitInterval}.${sym}`);
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
    const sym = normalizeBybitSymbol(symbol);
    if (!sym) return null;

    const args: string[] = [];
    switch (channel) {
      case "ticker":
        args.push(`tickers.${sym}`);
        break;
      case "depth":
        this.depthSymbolSet.delete(sym);
        args.push(`orderbook.50.${sym}`);
        break;
      case "trade":
        args.push(`publicTrade.${sym}`);
        break;
      case "kline": {
        const bybitInterval = INTERVAL_TO_BYBIT[params?.interval ?? "1m"];
        if (!bybitInterval) return null;
        args.push(`kline.${bybitInterval}.${sym}`);
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
      const s = normalizeBybitSymbol(raw);
      if (!s) continue;
      this.subscribeTicker(s);
      this.subscribeTrade(s);
      this.subscribeDepth(s); // respects MAX_DEPTH_SYMBOLS via buildSubscribeFrame
      for (const interval of KLINE_INTERVALS) {
        this.subscribeKline(s, interval);
      }
    }
    // Request depth snapshots for depth-tracked symbols
    for (const raw of symbols) {
      const s = normalizeBybitSymbol(raw);
      if (s && this.depthSymbolSet.has(s)) {
        void this.requestSnapshot(s);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  OPTIONAL HOOK OVERRIDES
  // ══════════════════════════════════════════════════════════════

  protected override onStarted(): void {
    // Pre-seed priority symbols into depth set
    for (const symbol of PRIORITY_SYMBOLS) {
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
    // Reset orderbook sync state and re-request snapshots
    for (const symbol of this.depthSymbolSet) {
      this.resetSymbolSyncState(symbol);
      void this.requestSnapshot(symbol);
    }
  }

  /** Bybit requires {op:"ping"} message instead of WS-level ping */
  protected override onHeartbeatTick(): void {
    this.safeSend({ op: "ping" });
  }

  protected override adjustHealthScore(baseScore: number): number {
    let score = baseScore;
    const now = Date.now();

    // Stale symbol penalty
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
  //  MESSAGE PARSING (Bybit-specific)
  // ══════════════════════════════════════════════════════════════

  protected parseMessage(text: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return;
    }
    const rec = asRecord(parsed);
    if (!rec) return;

    // Handle pong (heartbeat ack)
    const op = String(rec.op ?? "");
    if (op === "pong") {
      this.touchMessage(Date.now());
      return;
    }

    // Handle subscribe confirmations/errors
    if (op === "subscribe") {
      if (rec.success === false) {
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

    if (topic.startsWith("publicTrade.")) {
      for (const row of asRecordList(data)) this.onTrade(row, ts);
      return;
    }
    if (topic.startsWith("tickers.")) {
      const payload = asRecord(data);
      if (payload) this.onTicker(payload, ts);
      return;
    }
    if (topic.startsWith("kline.")) {
      for (const row of asRecordList(data)) this.onKline(row, topic, ts);
      return;
    }
    if (topic.startsWith("orderbook.")) {
      const payload = asRecord(data);
      if (payload) {
        if (msgType === "snapshot") this.onOrderbookSnapshot(payload, ts);
        else if (msgType === "delta") this.onOrderbookDelta(payload, ts);
      }
      return;
    }
  }

  // ── Trade ─────────────────────────────────────────────────────

  private onTrade(result: Record<string, unknown>, msgTs: number): void {
    const symbol = normalizeBybitSymbol(result.s ?? result.S ?? result.symbol);
    if (!symbol) return;
    const price = toNum(result.p);
    const qty = toNum(result.v);
    if (price === null || qty === null || price <= 0 || qty === 0) return;
    const ts = toMs(result.T) ?? msgTs;
    const sideRaw = String(result.S ?? "").toLowerCase();
    const side: "BUY" | "SELL" = sideRaw.includes("sell") ? "SELL" : "BUY";
    const tradeId = result.i !== undefined ? String(result.i) : undefined;
    this.touchMessage(ts);
    this.patchSnapshot(symbol, {
      lastTradePrice: price, lastTradeQty: Math.abs(qty), lastTradeSide: side, sourceTs: ts,
    });
    this.appendRecentTrade(symbol, { ts, price, amount: Math.abs(qty), side });
    const event: NormalizedTradeEvent = {
      type: "trade", exchange: this.exchange, symbol, ts, recvTs: Date.now(),
      tradeId, price, qty: Math.abs(qty), side,
    };
    this.emit(event);
  }

  // ── Ticker ────────────────────────────────────────────────────

  private onTicker(result: Record<string, unknown>, msgTs: number): void {
    const symbol = normalizeBybitSymbol(result.symbol);
    if (!symbol) return;
    const price = toNum(result.lastPrice);
    if (price === null || price <= 0) return;

    const change24hPctRaw = toNum(result.price24hPcnt);
    const change24hPct = change24hPctRaw !== null ? change24hPctRaw * 100 : 0;
    const volume24hUsd = toNum(result.turnover24h) ?? 0;
    const bid = toNum(result.bid1Price);
    const ask = toNum(result.ask1Price);
    const bidQty = toNum(result.bid1Size);
    const askQty = toNum(result.ask1Size);
    const markPrice = toNum(result.markPrice);
    const fundingRate = toNum(result.fundingRate);
    const nextFundingTime = toMs(result.nextFundingTime);

    this.touchMessage(msgTs);

    // Spread metrics from ticker bid/ask
    let spreadBps: number | null = null;
    let depthUsd: number | null = null;
    let imbalance: number | null = null;
    if (bid !== null && ask !== null && bid > 0 && ask > 0) {
      const mid = (bid + ask) / 2;
      spreadBps = mid > 0 ? ((ask - bid) / mid) * 10_000 : null;
      const bidDepthUsd = bidQty !== null && bidQty > 0 ? bid * bidQty : null;
      const askDepthUsd = askQty !== null && askQty > 0 ? ask * askQty : null;
      depthUsd = bidDepthUsd !== null || askDepthUsd !== null
        ? Math.max(0, (bidDepthUsd ?? 0) + (askDepthUsd ?? 0)) : null;
      imbalance = depthUsd && depthUsd > 0
        ? ((bidDepthUsd ?? 0) - (askDepthUsd ?? 0)) / depthUsd : null;

      const btEvent: NormalizedBookTickerEvent = {
        type: "book_ticker", exchange: this.exchange, symbol, ts: msgTs, recvTs: Date.now(),
        bid, ask, bidQty: bidQty ?? undefined, askQty: askQty ?? undefined,
      };
      this.emit(btEvent);
    }

    this.patchSnapshot(symbol, {
      price, change24hPct, volume24hUsd,
      topBid: bid ?? null, topAsk: ask ?? null,
      bidQty: bidQty ?? null, askQty: askQty ?? null,
      spreadBps, depthUsd, imbalance,
      markPrice: markPrice ?? null,
      fundingRate: fundingRate ?? null,
      nextFundingTime: nextFundingTime ?? null,
      sourceTs: msgTs,
    });

    this.emit({
      type: "ticker", exchange: this.exchange, symbol, ts: msgTs, recvTs: Date.now(),
      price, change24hPct, volume24hUsd,
    });
  }

  // ── Kline ─────────────────────────────────────────────────────

  private onKline(result: Record<string, unknown>, topic: string, msgTs: number): void {
    const parts = topic.split(".");
    if (parts.length < 3) return;
    const bybitInterval = parts[1]!;
    const symbol = normalizeBybitSymbol(parts.slice(2).join("."));
    const interval = BYBIT_TO_INTERVAL[bybitInterval];
    if (!symbol || !interval) return;

    const open = toNum(result.open);
    const high = toNum(result.high);
    const low = toNum(result.low);
    const close = toNum(result.close);
    const volume = toNum(result.volume) ?? 0;
    if (open === null || high === null || low === null || close === null) return;
    const startMs = toMs(result.start);
    if (startMs === null) return;
    const closed = result.confirm === true;

    const candle: AdapterCandlePoint = {
      time: Math.floor(startMs / 1000), open, high, low, close, volume: Math.max(0, volume),
    };
    this.upsertCandle(symbol, interval, candle);
    this.touchMessage(msgTs);
    this.patchSnapshot(symbol, { price: close, sourceTs: msgTs });

    const event: NormalizedKlineEvent = {
      type: "kline", exchange: this.exchange, symbol, ts: msgTs, recvTs: Date.now(),
      interval, openTime: Math.floor(startMs / 1000),
      open, high, low, close, volume: Math.max(0, volume), closed,
    };
    this.emit(event);
  }

  // ── Orderbook Snapshot (WS) ───────────────────────────────────

  private onOrderbookSnapshot(result: Record<string, unknown>, msgTs: number): void {
    const symbol = normalizeBybitSymbol(result.s);
    if (!symbol || !this.depthSymbolSet.has(symbol)) return;
    const seq = toNum(result.seq ?? result.u);
    if (seq === null) return;
    const bids = normalizeLevelRows(result.b);
    const asks = normalizeLevelRows(result.a);
    this.touchMessage(msgTs);

    const snapshotEvent: NormalizedBookSnapshotEvent = {
      type: "book_snapshot", exchange: this.exchange, symbol, ts: msgTs, recvTs: Date.now(),
      seq, bids, asks,
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
        const applied = this.orderbooks.applyDelta(symbol, delta.startSeq, delta.endSeq, delta.bids, delta.asks);
        if (!applied.ok && applied.gap) {
          this.gapCount += 1;
          this.pushReason(`ws_snapshot_reconcile_gap:${symbol}`);
          this.resetSymbolSyncState(symbol);
          this.resyncCount += 1;
          void this.requestSnapshot(symbol);
          return;
        }
      }
    }

    this.updateBookDerivedFields(symbol, msgTs);
    this.resyncCount += 1;
  }

  // ── Orderbook Delta (WS) ─────────────────────────────────────

  private onOrderbookDelta(result: Record<string, unknown>, msgTs: number): void {
    const symbol = normalizeBybitSymbol(result.s);
    if (!symbol || !this.depthSymbolSet.has(symbol)) return;
    const seq = toNum(result.seq ?? result.u);
    if (seq === null) return;

    const startSeq = seq;
    const endSeq = seq;
    const bids = normalizeLevelRows(result.b);
    const asks = normalizeLevelRows(result.a);

    this.touchMessage(msgTs);
    this.lastBookDeltaAtBySymbol.set(symbol, Date.now());

    const delta: NormalizedBookDeltaEvent = {
      type: "book_delta", exchange: this.exchange, symbol, ts: msgTs, recvTs: Date.now(),
      startSeq, endSeq, bids, asks,
    };
    this.emit(delta);

    if (!this.orderbooks.isReady(symbol)) {
      this.bufferDelta(symbol, delta);
      if (!this.pendingSnapshotSymbols.has(symbol)) {
        void this.requestSnapshot(symbol);
      }
      return;
    }

    const applied = this.orderbooks.applyDelta(symbol, startSeq, endSeq, bids, asks);
    if (!applied.ok && applied.gap) {
      this.gapCount += 1;
      this.pushReason(`depth_gap:${symbol}:${seq}`);
      this.resetSymbolSyncState(symbol);
      void this.requestSnapshot(symbol);
      return;
    }
    if (applied.applied) this.updateBookDerivedFields(symbol, msgTs);
  }

  // ══════════════════════════════════════════════════════════════
  //  REST FALLBACK
  // ══════════════════════════════════════════════════════════════

  async fetchDepthSnapshot(symbol: string, _levels = 200): Promise<OrderbookSnapshot> {
    const sym = normalizeBybitSymbol(symbol);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4_000);
    try {
      const response = await fetch(
        `${BYBIT_REST_BASE}/market/orderbook?category=linear&symbol=${encodeURIComponent(sym)}&limit=200`,
        { signal: controller.signal },
      );
      if (!response.ok) throw new Error(`snapshot_http_${response.status}`);
      const body = (await response.json()) as Record<string, unknown>;
      const retCode = toNum(body.retCode);
      if (retCode !== 0) throw new Error(`snapshot_api_${retCode}:${String(body.retMsg ?? "")}`);
      const raw = asRecord(body.result);
      if (!raw) throw new Error("snapshot_no_result");
      const seq = toNum(raw.seq ?? raw.u);
      if (seq === null) throw new Error("snapshot_no_seq");
      const bids = normalizeLevelRows(raw.b);
      const asks = normalizeLevelRows(raw.a);
      return {
        exchange: this.exchange, symbol: sym, seq,
        bids: bids.map(([price, qty]) => ({ price, qty })),
        asks: asks.map(([price, qty]) => ({ price, qty })),
        ts: Date.now(),
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async fetchKlines(symbol: string, interval: string, limit = 200): Promise<AdapterCandlePoint[]> {
    const sym = normalizeBybitSymbol(symbol);
    const bybitInterval = INTERVAL_TO_BYBIT[interval];
    if (!bybitInterval) return [];
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4_000);
    try {
      const response = await fetch(
        `${BYBIT_REST_BASE}/market/kline?category=linear&symbol=${encodeURIComponent(sym)}&interval=${bybitInterval}&limit=${limit}`,
        { signal: controller.signal },
      );
      if (!response.ok) return [];
      const body = (await response.json()) as Record<string, unknown>;
      if (toNum(body.retCode) !== 0) return [];
      const result = asRecord(body.result);
      if (!result) return [];
      const list = Array.isArray(result.list) ? result.list : [];
      return (list as Array<unknown[]>).map((row) => ({
        time: Math.floor((toNum(row[0]) ?? 0) / 1000),
        open: toNum(row[1]) ?? 0,
        high: toNum(row[2]) ?? 0,
        low: toNum(row[3]) ?? 0,
        close: toNum(row[4]) ?? 0,
        volume: toNum(row[5]) ?? 0,
      })).filter((c) => c.time > 0).reverse(); // Bybit returns newest first
    } finally {
      clearTimeout(timeout);
    }
  }

  async fetchRecentTrades(symbol: string, limit = 100): Promise<AdapterCandlePoint[]> {
    return []; // Served from WS buffer via getRecentTrades()
  }

  // ══════════════════════════════════════════════════════════════
  //  BYBIT-SPECIFIC: SNAPSHOT LIFECYCLE
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

      const depthArr = [...this.depthSymbolSet];
      if (!depthArr.length) return;
      const total = depthArr.length;
      const batch = Math.min(SNAPSHOT_SANITY_BATCH, total);
      for (let i = 0; i < batch; i += 1) {
        const idx = (this.snapshotCursor + i) % total;
        const symbol = depthArr[idx]!;
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
