/**
 * Gate.io Futures Market Adapter — extends BaseAdapter
 *
 * Migrated from standalone implementation to BaseAdapter.
 * All common transport logic (WS lifecycle, reconnect, heartbeat, watchdog,
 * data stores, health scoring) is inherited from BaseAdapter.
 *
 * This file contains ONLY Gate.io-specific logic:
 *  - WS subscribe/unsubscribe frame format
 *  - Message parsing (trades, tickers, book_ticker, depth, candles)
 *  - REST snapshot endpoint
 *  - Symbol normalization (BTCUSDT ↔ BTC_USDT)
 *  - Snapshot sanity timer
 *  - Health score adjustments
 */

import WebSocket from "ws";
import type {
  AdapterCandlePoint,
  NormalizedBookDeltaEvent,
  NormalizedBookSnapshotEvent,
  NormalizedBookTickerEvent,
  NormalizedTradeEvent,
} from "./types.ts";
import type { SubscriptionChannel, SubscribeParams } from "./contracts/ExchangeAdapter.ts";
import type { AdapterPolicy, OrderbookSnapshot } from "./contracts/HubModels.ts";
import { BaseAdapter, toNum, toMs, asRecord, asRecordList, normalizeLevelRows, seqFrom } from "./BaseAdapter.ts";

// ── Constants ───────────────────────────────────────────────────────

const GATE_WS_URLS = [
  "wss://fx-ws.gateio.ws/v4/ws/usdt",
];
const GATE_REST_BASE = "https://api.gateio.ws/api/v4";
const SYMBOL_DELTA_STALE_MS = 14_000;
const SNAPSHOT_SANITY_INTERVAL_MS = 10_000;
const SNAPSHOT_REFRESH_MIN_MS = 45_000;
const SNAPSHOT_SANITY_BATCH = 6;
const GATE_CANDLE_INTERVALS = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"] as const;

// ── Gate symbol helpers ─────────────────────────────────────────────

/** "BTCUSDT" → "BTC_USDT" (Gate format) */
function toGateSymbol(symbol: string): string {
  const base = String(symbol ?? "").toUpperCase().replace(/[-/]/g, "_").trim();
  if (!base) return "";
  if (base.endsWith("_USDT")) return base.replace(/__+/g, "_");
  if (base.endsWith("USDT")) return `${base.slice(0, -4)}_USDT`;
  return `${base}_USDT`;
}

/** "BTC_USDT" → "BTCUSDT" (Bitrium format) */
function fromGateSymbol(contract: string): string {
  return contract.replace(/_/g, "");
}

// ═══════════════════════════════════════════════════════════════════
// GATE FUTURES MARKET ADAPTER
// ═══════════════════════════════════════════════════════════════════

export class GateFuturesMarketAdapter extends BaseAdapter {
  readonly exchange = "GATEIO" as const;

  readonly policy: AdapterPolicy = {
    exchange: "GATEIO",
    wsUrls: GATE_WS_URLS,
    heartbeatIntervalMs: 9_000,
    watchdogStaleMs: 22_000,
    reconnectBaseMs: 700,
    reconnectMaxMs: 14_000,
    reconnectJitterMs: 250,
    restWeightPerMinute: 900,
    wsSubscriptionsMax: 200,
    hasAggregateStream: false,
    hasPerSymbolDepth: true,
    hasPerSymbolKline: true,
    hasPerSymbolTrade: true,
    hasBookTicker: true,
    maxDepthSymbols: 50,
    maxKlineSymbols: 50,
    snapshotSanityIntervalMs: SNAPSHOT_SANITY_INTERVAL_MS,
    snapshotRefreshMinMs: SNAPSHOT_REFRESH_MIN_MS,
    snapshotSanityBatch: SNAPSHOT_SANITY_BATCH,
    symbolSeparator: "_",
    symbolSuffix: "",
  };

  // ── Gate-specific state ───────────────────────────────────────
  private snapshotSanityTimer: ReturnType<typeof setInterval> | null = null;
  private symbolStaleResyncs = 0;
  private snapshotFailures = 0;
  private snapshotCursor = 0;

  // ══════════════════════════════════════════════════════════════
  //  ABSTRACT HOOK IMPLEMENTATIONS
  // ══════════════════════════════════════════════════════════════

  protected getWsUrls(): string[] {
    return GATE_WS_URLS;
  }

  toExchangeSymbol(symbol: string): string {
    return toGateSymbol(symbol);
  }

  toBitriumSymbol(raw: string): string {
    return fromGateSymbol(toGateSymbol(raw));
  }

  protected buildSubscribeFrame(
    channel: SubscriptionChannel,
    symbol: string,
    params?: SubscribeParams,
  ): unknown | null {
    const contract = toGateSymbol(symbol);
    if (!contract) return null;
    const tsSec = Math.floor(Date.now() / 1000);

    switch (channel) {
      case "ticker":
        return { time: tsSec, channel: "futures.tickers", event: "subscribe", payload: [contract] };
      case "depth":
        return { time: tsSec, channel: "futures.order_book_update", event: "subscribe", payload: [contract, "100ms", "20"] };
      case "trade":
        return { time: tsSec, channel: "futures.trades", event: "subscribe", payload: [contract] };
      case "kline":
        return { time: tsSec, channel: "futures.candlesticks", event: "subscribe", payload: [params?.interval ?? "1m", contract] };
      default:
        return null;
    }
  }

  protected buildUnsubscribeFrame(
    channel: SubscriptionChannel,
    symbol: string,
    params?: SubscribeParams,
  ): unknown | null {
    const contract = toGateSymbol(symbol);
    if (!contract) return null;
    const tsSec = Math.floor(Date.now() / 1000);

    switch (channel) {
      case "ticker":
        return { time: tsSec, channel: "futures.tickers", event: "unsubscribe", payload: [contract] };
      case "depth":
        return { time: tsSec, channel: "futures.order_book_update", event: "unsubscribe", payload: [contract, "100ms", "20"] };
      case "trade":
        return { time: tsSec, channel: "futures.trades", event: "unsubscribe", payload: [contract] };
      case "kline":
        return { time: tsSec, channel: "futures.candlesticks", event: "unsubscribe", payload: [params?.interval ?? "1m", contract] };
      default:
        return null;
    }
  }

  // ── Legacy subscribeSymbols override ──────────────────────────
  // Gate needs book_ticker + all candle intervals per symbol
  override subscribeSymbols(symbols: string[]): void {
    for (const raw of symbols) {
      const s = this.toBitriumSymbol(raw) || raw;
      if (!s) continue;
      this.subscribeTicker(s);
      this.subscribeDepth(s);
      this.subscribeTrade(s);
      // book_ticker — separate channel on Gate
      const bookTickerFrame = this.buildBookTickerSubscribeFrame(s);
      if (bookTickerFrame) this.safeSend(bookTickerFrame);
      // all candle intervals
      for (const interval of GATE_CANDLE_INTERVALS) {
        this.subscribeKline(s, interval);
      }
    }
    // Request depth snapshots for new symbols
    for (const raw of symbols) {
      const s = this.toBitriumSymbol(raw) || raw;
      if (s) void this.requestSnapshot(s);
    }
  }

  private buildBookTickerSubscribeFrame(symbol: string): unknown | null {
    const contract = toGateSymbol(symbol);
    if (!contract) return null;
    return { time: Math.floor(Date.now() / 1000), channel: "futures.book_ticker", event: "subscribe", payload: [contract] };
  }

  // ══════════════════════════════════════════════════════════════
  //  OPTIONAL HOOK OVERRIDES
  // ══════════════════════════════════════════════════════════════

  protected override onStarted(): void {
    this.startSnapshotSanity();
  }

  protected override onStopped(): void {
    if (this.snapshotSanityTimer) {
      clearInterval(this.snapshotSanityTimer);
      this.snapshotSanityTimer = null;
    }
  }

  protected override onConnected(): void {
    // Reset orderbook state for all symbols and re-request snapshots
    for (const symbol of this.allSymbols) {
      this.resetSymbolSyncState(symbol);
      void this.requestSnapshot(symbol);
    }
    // Re-send book_ticker subscriptions (not in base per-channel model)
    for (const symbol of this.allSymbols) {
      const frame = this.buildBookTickerSubscribeFrame(symbol);
      if (frame) this.safeSend(frame);
    }
  }

  protected override adjustHealthScore(baseScore: number): number {
    let score = baseScore;
    const now = Date.now();

    // Stale symbol penalty
    let staleSymbolCount = 0;
    for (const symbol of this.allSymbols) {
      if (!this.orderbooks.isReady(symbol)) continue;
      const lastDeltaAt = this.lastBookDeltaAtBySymbol.get(symbol) ?? 0;
      if (!lastDeltaAt) continue;
      if (now - lastDeltaAt > SYMBOL_DELTA_STALE_MS) staleSymbolCount += 1;
    }
    if (staleSymbolCount > 0) score -= Math.min(10, staleSymbolCount * 1.2);

    // Snapshot failure penalty
    score -= Math.min(12, this.snapshotFailures * 1.1);

    // Pending snapshot penalty
    score -= Math.min(6, this.pendingSnapshotSymbols.size * 0.8);

    // Stale resync penalty
    score -= Math.min(9, this.symbolStaleResyncs * 0.4);

    return score;
  }

  // ══════════════════════════════════════════════════════════════
  //  MESSAGE PARSING (Gate-specific)
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

  // ── Ticker ────────────────────────────────────────────────────

  private onTicker(result: Record<string, unknown>): void {
    const contract = toGateSymbol(String(result.contract ?? result.s ?? result.symbol ?? ""));
    if (!contract) return;
    const symbol = fromGateSymbol(contract);
    const price = toNum(result.last ?? result.last_price ?? result.mark_price ?? result.index_price);
    if (price === null || price <= 0) return;
    const change24hPct =
      toNum(result.change_percentage ?? result.change_24h ?? result.price_change_percent) ?? 0;
    const volume24hUsd =
      toNum(
        result.volume_24h_quote ?? result.volume_24h_usdt ?? result.quote_volume ??
        result.turnover_24h ?? result.volume_24h ?? result.volume,
      ) ?? 0;
    const ts = toNum(result.t ?? result.time_ms ?? result.create_time_ms) ?? Date.now();
    this.touchMessage(ts);
    this.patchSnapshot(symbol, {
      price,
      change24hPct,
      volume24hUsd,
      markPrice: toNum(result.mark_price),
      fundingRate:
        toNum(result.funding_rate ?? result.fundingRate ?? result.last_funding_rate ?? result.funding_rate_indicative) ?? null,
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

  // ── Book Ticker ───────────────────────────────────────────────

  private onBookTicker(result: Record<string, unknown>): void {
    const contract = toGateSymbol(String(result.contract ?? result.s ?? result.symbol ?? ""));
    if (!contract) return;
    const symbol = fromGateSymbol(contract);
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
      topBid: bid, topAsk: ask,
      bidQty: bidQty ?? null, askQty: askQty ?? null,
      spreadBps, depthUsd, imbalance, sourceTs: ts,
    });
    const event: NormalizedBookTickerEvent = {
      type: "book_ticker", exchange: this.exchange, symbol, ts, recvTs: Date.now(),
      bid, ask, bidQty: bidQty ?? undefined, askQty: askQty ?? undefined,
    };
    this.emit(event);
  }

  // ── Trade ─────────────────────────────────────────────────────

  private onTrade(result: Record<string, unknown>): void {
    const contract = toGateSymbol(String(result.contract ?? result.s ?? result.symbol ?? ""));
    if (!contract) return;
    const symbol = fromGateSymbol(contract);
    const price = toNum(result.price ?? result.p ?? result.last);
    const qty = [result.size, result.sz, result.q, result.qty, result.amount]
      .map((v) => toNum(v))
      .find((v): v is number => v !== null);
    if (price === null || qty === null || price <= 0 || qty === 0) return;
    const ts = toMs(result.create_time_ms ?? result.t ?? result.time_ms) ?? Date.now();
    const sideRaw = String(result.side ?? "").toLowerCase();
    const side: "BUY" | "SELL" = sideRaw.includes("sell") || qty < 0 ? "SELL" : "BUY";
    this.touchMessage(ts);
    this.patchSnapshot(symbol, {
      lastTradePrice: price, lastTradeQty: Math.abs(qty), lastTradeSide: side, sourceTs: ts,
    });
    this.appendRecentTrade(symbol, { ts, price, amount: Math.abs(qty), side });
    const event: NormalizedTradeEvent = {
      type: "trade", exchange: this.exchange, symbol, ts, recvTs: Date.now(),
      tradeId: result.id !== undefined ? String(result.id) : undefined,
      price, qty: Math.abs(qty), side,
    };
    this.emit(event);
  }

  // ── Candle ────────────────────────────────────────────────────

  private onCandle(result: Record<string, unknown>, root: Record<string, unknown>): void {
    let contract = toGateSymbol(String(result.contract ?? result.s ?? result.symbol ?? ""));
    let interval = String(result.interval ?? "").toLowerCase();
    const name = String(result.n ?? root.n ?? "").trim();
    if (name.includes("_")) {
      const [frameRaw, contractRaw] = name.split("_", 2);
      if (!interval && frameRaw) interval = frameRaw.toLowerCase();
      if (!contract && contractRaw) contract = toGateSymbol(contractRaw);
    }
    if (!contract || !interval) return;
    const symbol = fromGateSymbol(contract);
    const open = toNum(result.o ?? result.open);
    const high = toNum(result.h ?? result.high);
    const low = toNum(result.l ?? result.low);
    const close = toNum(result.c ?? result.close);
    const volume = toNum(result.v ?? result.volume ?? result.amount) ?? 0;
    if (open === null || high === null || low === null || close === null) return;
    const tsMs = toMs(result.t ?? result.time_ms ?? result.create_time_ms);
    if (tsMs === null) return;
    const candle: AdapterCandlePoint = {
      time: Math.floor(tsMs / 1000), open, high, low, close, volume: Math.max(0, volume),
    };
    this.upsertCandle(symbol, interval, candle);
    this.touchMessage(tsMs);
    this.patchSnapshot(symbol, { price: close, sourceTs: tsMs });
  }

  // ── Book Delta ────────────────────────────────────────────────

  private onBookDelta(result: Record<string, unknown>): void {
    const contract = toGateSymbol(String(result.contract ?? result.s ?? result.symbol ?? ""));
    if (!contract) return;
    const symbol = fromGateSymbol(contract);
    const startSeq = seqFrom(result, ["U", "first_id", "start", "seq_start", "id"]) ?? null;
    const endSeq = seqFrom(result, ["u", "last_id", "end", "seq_end", "id"]) ?? startSeq;
    if (startSeq === null || endSeq === null) return;
    const bids = normalizeLevelRows(result.b ?? result.bids);
    const asks = normalizeLevelRows(result.a ?? result.asks);
    const ts = toMs(result.t ?? result.time_ms) ?? Date.now();
    this.touchMessage(ts);
    this.lastBookDeltaAtBySymbol.set(symbol, Date.now());

    const delta: NormalizedBookDeltaEvent = {
      type: "book_delta", exchange: this.exchange, symbol, ts, recvTs: Date.now(),
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
      this.pushReason(`depth_gap:${symbol}:${startSeq}-${endSeq}`);
      this.resetSymbolSyncState(symbol);
      void this.requestSnapshot(symbol);
      return;
    }
    if (applied.applied) this.updateBookDerivedFields(symbol, ts);
  }

  // ══════════════════════════════════════════════════════════════
  //  REST FALLBACK
  // ══════════════════════════════════════════════════════════════

  async fetchDepthSnapshot(symbol: string, levels = 200): Promise<OrderbookSnapshot> {
    const contract = toGateSymbol(symbol);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4_000);
    try {
      const response = await fetch(
        `${GATE_REST_BASE}/futures/usdt/order_book?contract=${encodeURIComponent(contract)}&limit=${levels}&with_id=true`,
        { signal: controller.signal },
      );
      if (!response.ok) throw new Error(`snapshot_http_${response.status}`);
      const raw = (await response.json()) as Record<string, unknown>;
      const seq = seqFrom(raw, ["id", "u", "last_id"]);
      if (seq === null) throw new Error("snapshot_no_seq");
      const bids = normalizeLevelRows(raw.bids ?? raw.b);
      const asks = normalizeLevelRows(raw.asks ?? raw.a);
      return {
        exchange: this.exchange,
        symbol: fromGateSymbol(contract),
        seq,
        bids: bids.map(([price, qty]) => ({ price, qty })),
        asks: asks.map(([price, qty]) => ({ price, qty })),
        ts: Date.now(),
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async fetchKlines(symbol: string, interval: string, limit = 200): Promise<AdapterCandlePoint[]> {
    const contract = toGateSymbol(symbol);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4_000);
    try {
      const response = await fetch(
        `${GATE_REST_BASE}/futures/usdt/candlesticks?contract=${encodeURIComponent(contract)}&interval=${interval}&limit=${limit}`,
        { signal: controller.signal },
      );
      if (!response.ok) return [];
      const rows = (await response.json()) as Array<Record<string, unknown>>;
      return rows.map((r) => ({
        time: Math.floor((toNum(r.t) ?? 0) / (toNum(r.t) !== null && (toNum(r.t)!) < 1e12 ? 1 : 1000)),
        open: toNum(r.o) ?? 0,
        high: toNum(r.h) ?? 0,
        low: toNum(r.l) ?? 0,
        close: toNum(r.c) ?? 0,
        volume: toNum(r.v) ?? 0,
      })).filter((c) => c.time > 0);
    } finally {
      clearTimeout(timeout);
    }
  }

  async fetchRecentTrades(symbol: string, limit = 100): Promise<AdapterCandlePoint[]> {
    // Gate REST trades endpoint — returns raw trades, not candles
    // For now return empty; adapter getRecentTrades() serves from WS buffer
    return [];
  }

  // ══════════════════════════════════════════════════════════════
  //  GATE-SPECIFIC: SNAPSHOT LIFECYCLE
  // ══════════════════════════════════════════════════════════════

  private async requestSnapshot(symbol: string): Promise<void> {
    if (!symbol || this.pendingSnapshotSymbols.has(symbol)) return;
    this.pendingSnapshotSymbols.add(symbol);
    try {
      const snap = await this.fetchDepthSnapshot(symbol);
      const snapshotEvent: NormalizedBookSnapshotEvent = {
        type: "book_snapshot",
        exchange: this.exchange,
        symbol,
        ts: snap.ts,
        recvTs: snap.ts,
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

      // Replay buffered deltas
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

      // Check for unready or stale symbols
      for (const symbol of this.allSymbols) {
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

      // Periodic refresh — round-robin batch
      const symbols = [...this.allSymbols];
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
