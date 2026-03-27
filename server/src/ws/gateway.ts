import type { Server as HttpServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { fetchMarketLiveBundle } from "../routes/market.ts";
import type { ExchangeMarketHub } from "../services/marketHub/ExchangeMarketHub.ts";
import type { HubEventBridge } from "../services/marketHub/HubEventBridge.ts";
import type { NormalizedTradeEvent } from "../services/marketHub/types.ts";
import { OrderflowAggregator } from "../services/marketHub/OrderflowAggregator.ts";
import type { BinanceFuturesHub, BinanceFuturesHubEvent } from "../services/binanceFuturesHub.ts";
import { getSharedBinanceWsPool } from "../services/marketHub/SharedBinanceWsPool.ts";

type Interval = "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d";
type ExchangeName = "Binance" | "Bybit" | "OKX" | "Gate.io";
type SourceMode = "exchange" | "fallback";

interface MarketSub {
  symbol: string;
  interval: Interval;
  lookback: number;
  exchange: ExchangeName;
  sourceMode: SourceMode;
}

interface SocketState {
  subs: Record<string, MarketSub>;
  subscribedSymbols: Set<string>; // fast O(1) lookup for broadcasts (avoids Object.values().some())
  domSynced: Set<string>; // symbols for which we've sent dom_snapshot
  marketListSubscribed: boolean; // Pipeline 6: market list dirty-patch subscription
}

// ── Tick engine types ──
interface TickEntry {
  ts: number;        // Binance event timestamp (ms)
  price: number;
  qty: number;
  side: "BUY" | "SELL";
  tradeId?: string;
}

const keyOf = (symbol: string, interval: Interval) => `${symbol}:${interval}`;
const asInterval = (value: unknown): Interval => {
  const v = String(value ?? "15m");
  if (v === "1m" || v === "5m" || v === "15m" || v === "30m" || v === "1h" || v === "4h" || v === "1d") return v;
  return "15m";
};
const asExchange = (value: unknown): ExchangeName => {
  const v = String(value ?? "Binance").toLowerCase();
  if (v === "bybit") return "Bybit";
  if (v === "okx") return "OKX";
  if (v === "gate.io" || v === "gateio" || v === "gate") return "Gate.io";
  return "Binance";
};
const asSourceMode = (value: unknown): SourceMode => (String(value ?? "exchange").toLowerCase() === "fallback" ? "fallback" : "exchange");
const apiKey = process.env.CG_API_KEY ?? "4f8430d3a7a14b44a16bd10f3a4dd61d";
const MAX_SUBS_PER_CLIENT = 5;
// Derivatives (OI, liquidation) fetched every 30s — only REST-available data.
// mark_price + funding come via WS pipeline (real-time, no REST needed).
const DERIVATIVES_POLL_MS = 30_000;
const DERIVATIVES_CONCURRENCY = 2;

// ── Pipeline constants ──
const TICK_RING_BUFFER_SIZE = 5000;
const TICK_BATCH_INTERVAL_MS = 50;  // ~20fps flush rate — balances latency vs CPU
const TICK_SNAPSHOT_SIZE = 500;     // initial ticks on subscribe

interface GatewayOpts {
  exchangeMarketHub?: ExchangeMarketHub;
  hubEventBridge?: HubEventBridge;
  binanceFuturesHub?: BinanceFuturesHub; // Pipeline 6: market list universe data
  isPrimary?: boolean; // Worker 0: use direct hub (skip Redis roundtrip)
  hubExternal?: boolean; // When true, hub runs as separate service — all workers use Redis
}

// Auth function type — injected from index.ts to avoid circular dependency
type WsAuthFn = (token: string) => Promise<{ userId: string; role: string } | null>;
let _wsAuthFn: WsAuthFn | null = null;

export const setWsAuthFunction = (fn: WsAuthFn) => { _wsAuthFn = fn; };

// FAZ 1: Health module reference — set lazily when Pipeline 9 loads
let _healthRef: { updateTicker(s: string, src: string): void; updateDepth(s: string, opts: { source: string; levels: number; seqSynced: boolean; wsConnected: boolean }): void; onStatusChange(cb: (s: string, p: string, n: string, h: unknown) => void): () => void; start(): void } | null = null;

export const createGateway = (httpServer: HttpServer, opts?: GatewayOpts) => {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  const sockets = new Map<WebSocket, SocketState>();

  // ═══════════════════════════════════════════════════════════════════
  // BINANCE DEPTH STREAM RELAY — depth20@500ms via SharedBinanceWsPool
  // Uses SharedBinanceWsPool for multiplexed WS — shares connection with Hub adapter.
  // Subscribes dynamically when clients view a symbol, unsubscribes when no clients need it.
  // ═══════════════════════════════════════════════════════════════════
  const depthRefCounts = new Map<string, number>(); // symbol → number of clients needing depth
  const depthPool = getSharedBinanceWsPool();
  const DEPTH_CONSUMER_ID = "gateway-depth";

  // Register Gateway as a consumer of the shared pool
  depthPool.registerConsumer(DEPTH_CONSUMER_ID, (stream: string, data: unknown) => {
    try {
      const d = data as Record<string, unknown>;
      // Determine symbol from stream name or event data
      let symbol = "";
      if (typeof stream === "string" && stream.includes("@")) {
        symbol = stream.split("@")[0]?.toUpperCase() ?? "";
      } else if (d.s) {
        symbol = String(d.s).toUpperCase();
      }
      if (!symbol || (!d.bids && !d.b)) return;
      const bids: Array<[number, number]> = ((d.bids ?? d.b) as Array<[string, string]> ?? []).map((r) => [Number(r[0]), Number(r[1])]);
      const asks: Array<[number, number]> = ((d.asks ?? d.a) as Array<[string, string]> ?? []).map((r) => [Number(r[0]), Number(r[1])]);
      const seq = Number(d.lastUpdateId ?? d.u ?? 0);
      const ts = Number(d.T ?? d.E ?? Date.now());
      if (bids.length < 2) return; // skip if not enough depth data
      // Broadcast as dom_snapshot to subscribed clients (reuses existing Pipeline 3)
      const body = JSON.stringify({ type: "dom_snapshot", symbol, seq, bids, asks, ts, serverTs: Date.now() });
      for (const [socket, state] of sockets.entries()) {
        if (socket.readyState !== WebSocket.OPEN) continue;
        if (state.subscribedSymbols.has(symbol)) {
          state.domSynced.add(symbol);
          socket.send(body);
        }
      }
    } catch { /* ignore parse errors */ }
  });
  console.log(`[DepthRelay] Using SharedBinanceWsPool (consumers=${depthPool.getConsumerCount()})`);

  const depthSubscribe = (symbol: string) => {
    const prev = depthRefCounts.get(symbol) ?? 0;
    depthRefCounts.set(symbol, prev + 1);
    if (prev > 0) return; // already subscribed via pool
    console.log(`[DepthRelay] Subscribe depth for ${symbol} via SharedPool`);
    depthPool.subscribe(DEPTH_CONSUMER_ID, [`${symbol.toLowerCase()}@depth20@500ms`]);
  };

  const depthUnsubscribe = (symbol: string) => {
    const prev = depthRefCounts.get(symbol) ?? 0;
    if (prev <= 1) {
      depthRefCounts.delete(symbol);
      depthPool.unsubscribe(DEPTH_CONSUMER_ID, [`${symbol.toLowerCase()}@depth20@500ms`]);
    } else {
      depthRefCounts.set(symbol, prev - 1);
    }
  };

  // ═══════════════════════════════════════════════════════════════════
  // PIPELINE 1: Canonical Candle (kline → candle_update)
  //  Guards: out-of-order, duplicate, stale stream
  // ═══════════════════════════════════════════════════════════════════
  const lastKlineOpenTime = new Map<string, number>();
  const lastKlineEventTs = new Map<string, number>();       // out-of-order guard
  const lastKlineFingerprint = new Map<string, string>();   // duplicate guard
  const lastKlineAtBySymbol = new Map<string, number>();    // stale stream detector

  const broadcastCandleUpdate = (
    symbol: string, interval: string,
    openTime: number, open: number, high: number, low: number, close: number, volume: number,
    closed: boolean, ts: number,
  ) => {
    const key = `${symbol}:${interval}`;

    // ── Guard 1: out-of-order (event time older than last seen) ──
    const prevTs = lastKlineEventTs.get(key) ?? 0;
    if (ts > 0 && prevTs > 0 && ts < prevTs) return;
    lastKlineEventTs.set(key, ts);

    // ── Guard 2: duplicate packet (same openTime + same close) ──
    const fingerprint = `${openTime}:${close}`;
    if (lastKlineFingerprint.get(key) === fingerprint) return;
    lastKlineFingerprint.set(key, fingerprint);

    // ── Guard 3: stale stream tracker (timestamp for detector timer) ──
    lastKlineAtBySymbol.set(symbol, Date.now());

    const lastOt = lastKlineOpenTime.get(key) ?? 0;
    if (openTime < lastOt) return;
    lastKlineOpenTime.set(key, openTime);

    const body = JSON.stringify({
      type: "candle_update", symbol, interval,
      openTime, open, high, low, close, volume, closed, ts,
      brt: Date.now(), // backendRelayTs — latency debug
    });

    for (const [socket, state] of sockets.entries()) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      if (!state.subscribedSymbols.has(symbol)) continue;
      const matchesInterval = Object.values(state.subs).some(
        (s) => s.symbol === symbol && s.interval === interval,
      );
      if (matchesInterval) socket.send(body);
    }
  };

  // ═══════════════════════════════════════════════════════════════════
  // PIPELINE 2: Tick Engine (trade → tick_batch, 33ms micro-batch)
  // ═══════════════════════════════════════════════════════════════════
  const tickBuffers = new Map<string, TickEntry[]>();   // symbol → ring buffer (5000)
  const tickPending = new Map<string, TickEntry[]>();   // symbol → unflushed batch

  // ── Latency diagnostic: pipeline percentile tracking for BTCUSDT ──
  let _tickDiagCount = 0;
  const _latencySamples: Array<{ binanceToAdapter: number; adapterToGateway: number; total: number }> = [];
  let _lastPercentileLog = Date.now();
  const PERCENTILE_LOG_INTERVAL_MS = 30_000; // Log percentiles every 30s

  const ingestTick = (event: NormalizedTradeEvent) => {
    const now = Date.now();

    // Collect ALL BTCUSDT latency samples
    if (event.symbol === "BTCUSDT" && event.recvTs) {
      _latencySamples.push({
        binanceToAdapter: event.recvTs - event.ts,
        adapterToGateway: now - event.recvTs,
        total: now - event.ts,
      });
    }

    // Log percentiles every 30 seconds
    if (now - _lastPercentileLog >= PERCENTILE_LOG_INTERVAL_MS && _latencySamples.length >= 10) {
      _lastPercentileLog = now;
      const n = _latencySamples.length;
      const sorted = (arr: number[]) => [...arr].sort((a, b) => a - b);
      const pct = (arr: number[], p: number) => arr[Math.floor(arr.length * p / 100)] ?? 0;

      const b2a = sorted(_latencySamples.map((s) => s.binanceToAdapter));
      const a2g = sorted(_latencySamples.map((s) => s.adapterToGateway));
      const tot = sorted(_latencySamples.map((s) => s.total));

      console.log(
        `[LATENCY_PCT] n=${n} | binance→adapter p50=${pct(b2a, 50)}ms p95=${pct(b2a, 95)}ms p99=${pct(b2a, 99)}ms | ` +
        `adapter→gateway p50=${pct(a2g, 50)}ms p95=${pct(a2g, 95)}ms p99=${pct(a2g, 99)}ms | ` +
        `total p50=${pct(tot, 50)}ms p95=${pct(tot, 95)}ms p99=${pct(tot, 99)}ms`,
      );

      // Reset samples for next window
      _latencySamples.length = 0;
    }

    // Sample 1 in 500 for individual log lines (low overhead)
    if (event.symbol === "BTCUSDT" && ++_tickDiagCount % 500 === 0) {
      const binanceToAdapter = event.recvTs ? event.recvTs - event.ts : -1;
      const adapterToGateway = event.recvTs ? now - event.recvTs : -1;
      const totalMs = now - event.ts;
      console.log(`[PIPELINE] BTCUSDT price=${event.price} binance→adapter=${binanceToAdapter}ms adapter→gateway=${adapterToGateway}ms total=${totalMs}ms`);
    }
    const entry: TickEntry = {
      ts: event.ts,
      price: event.price,
      qty: event.qty,
      side: event.side,
      tradeId: event.tradeId,
    };

    // Append to ring buffer
    let ring = tickBuffers.get(event.symbol);
    if (!ring) { ring = []; tickBuffers.set(event.symbol, ring); }
    ring.push(entry);
    // Trim periodically at 2x capacity to avoid frequent splice() GC stalls
    if (ring.length > TICK_RING_BUFFER_SIZE * 2) {
      tickBuffers.set(event.symbol, ring.slice(-TICK_RING_BUFFER_SIZE));
      ring = tickBuffers.get(event.symbol)!;
    }

    // Append to pending batch
    let pending = tickPending.get(event.symbol);
    if (!pending) { pending = []; tickPending.set(event.symbol, pending); }
    pending.push(entry);
  };

  // 50ms flush timer — micro-batch ticks to subscribed clients (20fps)
  const tickFlushTimer = setInterval(() => {
    if (!tickPending.size) return;
    _gwTickFlushCount += 1;
    for (const [symbol, batch] of tickPending.entries()) {
      if (!batch.length) continue;
      const body = JSON.stringify({ type: "tick_batch", symbol, ticks: batch, serverTs: Date.now() });
      for (const [socket, state] of sockets.entries()) {
        if (socket.readyState !== WebSocket.OPEN) continue;
        if (state.subscribedSymbols.has(symbol)) socket.send(body);
      }
    }
    tickPending.clear();
  }, TICK_BATCH_INTERVAL_MS);

  const sendTickSnapshot = (socket: WebSocket, symbol: string) => {
    const ring = tickBuffers.get(symbol);
    if (ring && ring.length > 0) {
      socket.send(JSON.stringify({
        type: "tick_snapshot", symbol,
        ticks: ring.slice(-TICK_SNAPSHOT_SIZE),
      }));
    }
  };

  // ═══════════════════════════════════════════════════════════════════
  // PIPELINE 3: DOM Engine (book_snapshot + book_delta → dom_*)
  // ═══════════════════════════════════════════════════════════════════
  const broadcastDomSnapshot = (
    symbol: string, seq: number,
    bids: Array<[number, number]>, asks: Array<[number, number]>, ts: number,
  ) => {
    const body = JSON.stringify({ type: "dom_snapshot", symbol, seq, bids, asks, ts, serverTs: Date.now() });
    for (const [socket, state] of sockets.entries()) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      if (state.subscribedSymbols.has(symbol)) {
        state.domSynced.add(symbol);
        socket.send(body);
      }
    }
  };

  const broadcastDomDelta = (
    symbol: string, startSeq: number, endSeq: number,
    bids: Array<[number, number]>, asks: Array<[number, number]>, ts: number,
  ) => {
    const body = JSON.stringify({ type: "dom_delta", symbol, startSeq, endSeq, bids, asks, ts, serverTs: Date.now() });
    for (const [socket, state] of sockets.entries()) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      if (!state.domSynced.has(symbol)) continue;
      if (state.subscribedSymbols.has(symbol)) socket.send(body);
    }
  };

  // ═══════════════════════════════════════════════════════════════════
  // PIPELINE 4: Orderflow Engine (1s aggregated frames)
  // ═══════════════════════════════════════════════════════════════════
  const orderflowAggregator = new OrderflowAggregator();
  orderflowAggregator.start();

  orderflowAggregator.onFrame((frame) => {
    const body = JSON.stringify({ type: "orderflow_frame", ...frame });
    for (const [socket, state] of sockets.entries()) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      if (state.subscribedSymbols.has(frame.symbol)) socket.send(body);
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // PIPELINE 1b: Stale Stream Detector (5s no-candle → log + re-ensure)
  // ═══════════════════════════════════════════════════════════════════
  const STALE_KLINE_MS = 30_000; // 30s — klines can arrive infrequently
  const staleCheckTimer = setInterval(() => {
    const now = Date.now();
    // Collect all symbols that have active subscribers
    const allSubscribedSymbols = new Set<string>();
    for (const [socket, state] of sockets.entries()) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      for (const sym of state.subscribedSymbols) allSubscribedSymbols.add(sym);
    }
    for (const symbol of allSubscribedSymbols) {
      const lastAt = lastKlineAtBySymbol.get(symbol) ?? 0;
      if (lastAt > 0 && now - lastAt > STALE_KLINE_MS) {
        console.warn(`[STALE_STREAM] No candle for ${symbol} in ${Math.round(now - lastAt)}ms — re-ensuring symbol`);
        // Reset stale timestamp to avoid spamming
        lastKlineAtBySymbol.set(symbol, now);
        // Re-ensure symbol triggers re-subscribe on the adapter
        if (opts?.hubExternal) {
          opts?.hubEventBridge?.publishCommand({ cmd: "ensure_symbol", symbol });
        } else {
          opts?.exchangeMarketHub?.ensureSymbol(symbol);
        }
      }
    }
  }, 5_000);

  // ═══════════════════════════════════════════════════════════════════
  // Hub event router — feeds all 4 pipelines
  //  Source: Redis bridge (preferred) OR direct hub (fallback/primary)
  // ═══════════════════════════════════════════════════════════════════
  const handleHubEvent = (event: { type: string; [k: string]: unknown }) => {
    // Pipeline 1: Candle
    if (event.type === "kline" && typeof event.close === "number" && event.close > 0) {
      broadcastCandleUpdate(
        String(event.symbol), String(event.interval),
        Number(event.openTime), Number(event.open), Number(event.high),
        Number(event.low), Number(event.close), Number(event.volume),
        Boolean(event.closed), Number(event.ts),
      );
    }

    // Pipeline 2 + 4: Tick + Orderflow (both consume trade events)
    // CRITICAL: Only allow Binance trades into the tick pipeline.
    // Gate.io trades have different prices (premium/discount vs Binance) and contaminate
    // useLivePriceStore, chart candle highs, and all displayed prices.
    if (event.type === "trade") {
      const tradeExchange = String(event.exchange ?? "").toUpperCase();
      if (!tradeExchange || tradeExchange.includes("BINANCE")) {
        const tradeEvent = event as unknown as NormalizedTradeEvent;
        ingestTick(tradeEvent);
        orderflowAggregator.ingestTrade(tradeEvent);
        // FAZ 1: Update ticker health on ALL workers (via handleHubEvent)
        try { _healthRef?.updateTicker(String(event.symbol), "BINANCE"); } catch { /* best-effort */ }
      }
    }

    // Pipeline 5: Derivatives (mark_price + ticker → real-time push)
    if (event.type === "mark_price") {
      const symbol = String(event.symbol);
      const body = JSON.stringify({
        type: "derivatives_update", symbol,
        derivatives: {
          markPrice: event.markPrice ?? null,
          fundingRate: event.fundingRate ?? null,
          nextFundingTime: event.nextFundingTime ?? null,
        },
      });
      for (const [socket, state] of sockets.entries()) {
        if (socket.readyState !== WebSocket.OPEN) continue;
        if (state.subscribedSymbols.has(symbol)) socket.send(body);
      }
    }
    if (event.type === "ticker") {
      const symbol = String(event.symbol);
      const body = JSON.stringify({
        type: "ticker_update", symbol,
        price: event.price ?? null,
        change24hPct: event.change24hPct ?? null,
        volume24hUsd: event.volume24hUsd ?? null,
      });
      for (const [socket, state] of sockets.entries()) {
        if (socket.readyState !== WebSocket.OPEN) continue;
        if (state.subscribedSymbols.has(symbol)) socket.send(body);
      }
    }

    // Pipeline 3: DOM
    if (event.type === "book_snapshot") {
      broadcastDomSnapshot(
        String(event.symbol), Number(event.seq),
        event.bids as Array<[number, number]>,
        event.asks as Array<[number, number]>,
        Number(event.ts),
      );
      // FAZ 1: Update depth health on ALL workers
      try {
        const bids = event.bids as Array<[number, number]> | undefined;
        _healthRef?.updateDepth(String(event.symbol), {
          source: "BINANCE_WS",
          levels: Math.min(bids?.length ?? 0, 20),
          seqSynced: true,
          wsConnected: true,
        });
      } catch { /* best-effort */ }
    }
    if (event.type === "book_delta") {
      broadcastDomDelta(
        String(event.symbol), Number(event.startSeq), Number(event.endSeq),
        event.bids as Array<[number, number]>,
        event.asks as Array<[number, number]>,
        Number(event.ts),
      );
    }
  };

  // Hub event listening:
  // - HUB_EXTERNAL mode: ALL workers use Redis bridge (hub is a separate service)
  // - LOCAL mode: Worker 0 (primary) listens directly to hub (saves ~500 JSON.parse/sec)
  //              Workers 1-2 use Redis bridge
  if (opts?.hubExternal) {
    // EXTERNAL hub: all workers use Redis bridge
    if (opts?.hubEventBridge) {
      opts.hubEventBridge.onEvent(handleHubEvent);
      console.log("[Gateway] EXTERNAL hub — Redis bridge listener");
    }
  } else if (opts?.isPrimary && opts?.exchangeMarketHub) {
    opts.exchangeMarketHub.onEvent((event) => {
      setImmediate(() => handleHubEvent(event as { type: string; [k: string]: unknown }));
    });
    console.log("[Gateway] PRIMARY — hub+setImmediate (no Redis roundtrip)");
  } else if (opts?.hubEventBridge) {
    opts.hubEventBridge.onEvent(handleHubEvent);
    console.log("[Gateway] SECONDARY — Redis bridge listener");
  } else if (opts?.exchangeMarketHub) {
    opts.exchangeMarketHub.onEvent(handleHubEvent);
  }

  // ═══════════════════════════════════════════════════════════════════
  // PIPELINE 7: Depth Cache Updates (FAZ 2.2/2.3)
  //  Source: MarketDataCache Redis Pub/Sub (mdc:depth_update channel)
  //  Output: depth_cache_update → subscribed clients (250ms batched)
  // ═══════════════════════════════════════════════════════════════════
  const DEPTH_BATCH_MS = 250;
  const pendingDepthUpdates = new Map<string, { bids: string[][]; asks: string[][]; source: string }>();
  let depthBatchTimer: ReturnType<typeof setInterval> | null = null;

  import("../services/marketDataCache.ts").then(({ onDepthUpdate }) => {
    onDepthUpdate((symbol, data) => {
      // Collect into batch — 250ms flush
      pendingDepthUpdates.set(symbol, { bids: data.bids, asks: data.asks, source: data.source });
    });

    depthBatchTimer = setInterval(() => {
      if (pendingDepthUpdates.size === 0) return;
      for (const [symbol, depth] of pendingDepthUpdates.entries()) {
        const body = JSON.stringify({
          type: "depth_cache_update",
          symbol,
          bids: depth.bids.slice(0, 20),
          asks: depth.asks.slice(0, 20),
          source: depth.source,
          ts: Date.now(),
        });
        for (const [socket, state] of sockets.entries()) {
          if (socket.readyState !== WebSocket.OPEN) continue;
          if (state.subscribedSymbols.has(symbol)) socket.send(body);
        }
      }
      pendingDepthUpdates.clear();
    }, DEPTH_BATCH_MS);

    console.log("[Gateway] Pipeline 7: Depth cache Pub/Sub listener active (250ms batch)");
  }).catch(() => {
    console.warn("[Gateway] MarketDataCache import failed — depth Pub/Sub disabled");
  });

  // ═══════════════════════════════════════════════════════════════════
  // PIPELINE 9: Health Status Updates (FAZ 1.5)
  //  Source: marketHealth.onStatusChange() — fires on status transitions
  //  Output: health_update → subscribed clients (per-symbol)
  // ═══════════════════════════════════════════════════════════════════
  import("../services/marketHealth.ts").then(({ marketHealth }) => {
    marketHealth.start(); // start 5s sweep timer
    _healthRef = marketHealth as any; // FAZ 1: expose to handleHubEvent for all-worker health tracking

    marketHealth.onStatusChange((symbol, prev, next, health) => {
      const body = JSON.stringify({
        type: "health_update",
        symbol,
        prev,
        status: next,
        confidence: health.confidence,
        source: health.source,
        depthAgeMs: health.depthAgeMs,
        tickerAgeMs: health.tickerAgeMs,
        depthLevels: health.depthLevels,
        wsConnected: health.wsConnected,
        seqSynced: health.seqSynced,
        ts: Date.now(),
      });
      for (const [socket, state] of sockets.entries()) {
        if (socket.readyState !== WebSocket.OPEN) continue;
        if (state.subscribedSymbols.has(symbol)) socket.send(body);
      }
    });

    console.log("[Gateway] Pipeline 9: Market health status broadcast active");
  }).catch(() => {
    console.warn("[Gateway] MarketHealth import failed — Pipeline 9 disabled");
  });

  // ═══════════════════════════════════════════════════════════════════
  // PIPELINE 10: Signal Broadcast (FAZ 5.2)
  //  Source: MarketDataCache Redis Pub/Sub (mdc:signal_update channel)
  //  Output: signal_update → subscribed clients (1s batched)
  //  Cold-start: on subscribe, send cached signal immediately (FAZ 5.3)
  // ═══════════════════════════════════════════════════════════════════
  const SIGNAL_BATCH_MS = 1_000;
  const pendingSignalUpdates = new Map<string, Record<string, unknown>>();
  let signalBatchTimer: ReturnType<typeof setInterval> | null = null;

  // FAZ 5.4: Fan-out metrics
  const pipelineStats = {
    signal_update: { broadcasts: 0, clientsReached: 0, lastTs: 0 },
    depth_cache: { broadcasts: 0, clientsReached: 0, lastTs: 0 },
    health_update: { broadcasts: 0, clientsReached: 0, lastTs: 0 },
  };

  // FAZ 5.5: Backpressure check — skip non-critical sends for slow clients
  const BACKPRESSURE_THRESHOLD = 64 * 1024; // 64KB
  let backpressureDrops = 0;
  function safeSend(socket: WebSocket, body: string, critical: boolean): boolean {
    if (socket.readyState !== WebSocket.OPEN) return false;
    // Non-critical messages (signals, health) are dropped for slow clients
    if (!critical && socket.bufferedAmount > BACKPRESSURE_THRESHOLD) {
      backpressureDrops++;
      return false;
    }
    socket.send(body);
    return true;
  }

  import("../services/marketDataCache.ts").then(({ onSignalUpdate, readSignal: _readSignal }) => {
    // Store readSignal for cold-start use on subscribe (FAZ 5.3)
    _signalCacheReader = _readSignal;

    onSignalUpdate((symbol, data) => {
      // Collect into batch — 1s flush
      pendingSignalUpdates.set(symbol, data as Record<string, unknown>);
    });

    signalBatchTimer = setInterval(() => {
      if (pendingSignalUpdates.size === 0) return;
      for (const [symbol, signal] of pendingSignalUpdates.entries()) {
        const body = JSON.stringify({
          type: "signal_update",
          symbol,
          direction: signal.direction,
          confidence: signal.confidence,
          mode: signal.mode,
          setup: signal.setup,
          entry: { low: signal.entryLow, high: signal.entryHigh },
          sl: signal.slLevels,
          tp: signal.tpLevels,
          timeframe: signal.timeframe,
          ts: signal.scannedAt ?? Date.now(),
        });
        let reached = 0;
        for (const [socket, state] of sockets.entries()) {
          if (!state.subscribedSymbols.has(symbol)) continue;
          if (safeSend(socket, body, false)) reached++;
        }
        if (reached > 0) {
          pipelineStats.signal_update.broadcasts++;
          pipelineStats.signal_update.clientsReached += reached;
          pipelineStats.signal_update.lastTs = Date.now();
        }
      }
      pendingSignalUpdates.clear();
    }, SIGNAL_BATCH_MS);

    console.log("[Gateway] Pipeline 10: Signal broadcast active (1s batch)");
  }).catch(() => {
    console.warn("[Gateway] MarketDataCache signal import failed — Pipeline 10 disabled");
  });

  // FAZ 5.3: Cold-start signal reader — set by Pipeline 10 import above
  let _signalCacheReader: ((symbol: string) => Promise<{ data: unknown } | null>) | null = null;

  // FAZ 5.4: Export pipeline stats for admin endpoint
  (globalThis as Record<string, unknown>).__gwPipelineStats = pipelineStats;
  (globalThis as Record<string, unknown>).__gwBackpressureDrops = () => backpressureDrops;
  (globalThis as Record<string, unknown>).__gwClientCount = () => sockets.size;
  (globalThis as Record<string, unknown>).__gwSubscriptionCount = () => {
    let total = 0;
    for (const [, state] of sockets.entries()) total += state.subscribedSymbols.size;
    return total;
  };
  // FAZ 5.6: Per-channel subscriber counts for scale monitoring
  (globalThis as Record<string, unknown>).__gwChannelStats = () => {
    const channels = new Map<string, number>();
    for (const [, state] of sockets.entries()) {
      for (const sym of state.subscribedSymbols) {
        channels.set(sym, (channels.get(sym) ?? 0) + 1);
      }
    }
    // Return top 20 channels by subscriber count
    return [...channels.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([symbol, count]) => ({ symbol, subscribers: count }));
  };

  // ── Gateway diagnostics: 30s interval ──
  let _gwTickFlushCount = 0;
  let _gwDerivFetchCount = 0;
  let _gwInitialBundleCount = 0;
  setInterval(() => {
    let totalSubs = 0;
    for (const [, state] of sockets.entries()) totalSubs += Object.keys(state.subs).length;
    console.log(`[GW_DIAG] clients=${sockets.size} subs=${totalSubs} tick_flushes=${_gwTickFlushCount} initial_bundles=${_gwInitialBundleCount} deriv_fetches=${_gwDerivFetchCount}`);
    _gwTickFlushCount = 0;
    _gwInitialBundleCount = 0;
    _gwDerivFetchCount = 0;
  }, 30_000);

  // ═══════════════════════════════════════════════════════════════════
  // ONE-SHOT initial bundle: fetch full state on subscribe (candle backfill + derivatives)
  // After this, real-time updates come from pipelines 1-5. No periodic loop.
  // ═══════════════════════════════════════════════════════════════════
  const sendInitialBundle = async (socket: WebSocket, sub: MarketSub) => {
    try {
      const payload = await fetchMarketLiveBundle({
        symbol: sub.symbol,
        interval: sub.interval,
        limit: sub.lookback,
        exchange: sub.exchange,
        apiKey,
        sourceMode: sub.sourceMode,
      });
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          type: "market_live",
          symbol: sub.symbol,
          interval: sub.interval,
          sourceMode: sub.sourceMode,
          data: payload,
        }));
      }
      _gwInitialBundleCount += 1;
    } catch (err) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          type: "market_error",
          symbol: sub.symbol,
          interval: sub.interval,
          error: err instanceof Error ? err.message : "initial bundle fetch failed",
        }));
      }
    }
  };

  // ═══════════════════════════════════════════════════════════════════
  // PIPELINE 5: Derivatives push (30s REST poll for OI/liquidation)
  // mark_price + funding come via WS pipeline (real-time, handled in handleHubEvent)
  // OI + liquidation require REST API — fetched here at a slow cadence.
  // ═══════════════════════════════════════════════════════════════════
  let _derivInFlight = false;
  const derivativesTimer = setInterval(async () => {
    if (_derivInFlight || !sockets.size) return;
    _derivInFlight = true;
    try {
      // Collect unique symbol+interval+exchange combos from all clients
      const seen = new Set<string>();
      const subsToFetch: MarketSub[] = [];
      for (const [socket, state] of sockets.entries()) {
        if (socket.readyState !== WebSocket.OPEN) continue;
        for (const sub of Object.values(state.subs)) {
          const key = `${sub.symbol}:${sub.exchange}`;
          if (seen.has(key)) continue;
          seen.add(key);
          subsToFetch.push(sub);
        }
      }
      // Fetch derivatives for unique symbols (max DERIVATIVES_CONCURRENCY at a time)
      let idx = 0;
      const workers = Array.from({ length: Math.min(DERIVATIVES_CONCURRENCY, subsToFetch.length) }, async () => {
        while (idx < subsToFetch.length) {
          const sub = subsToFetch[idx++];
          if (!sub) continue;
          try {
            const payload = await fetchMarketLiveBundle({
              symbol: sub.symbol,
              interval: sub.interval,
              limit: 1, // minimal candle data — we only need derivatives
              exchange: sub.exchange,
              apiKey,
              sourceMode: sub.sourceMode,
            });
            // Extract only derivatives + trade metrics → send as lightweight update
            const body = JSON.stringify({
              type: "derivatives_update",
              symbol: sub.symbol,
              derivatives: (payload as any).derivatives ?? null,
              trades: (payload as any).trades ?? null,
              orderbook: {
                spreadBps: (payload as any).orderbook?.spreadBps ?? null,
                depthUsd: (payload as any).orderbook?.depthUsd ?? null,
                imbalance: (payload as any).orderbook?.imbalance ?? null,
              },
            });
            for (const [socket, state] of sockets.entries()) {
              if (socket.readyState !== WebSocket.OPEN) continue;
              if (state.subscribedSymbols.has(sub.symbol)) socket.send(body);
            }
            _gwDerivFetchCount += 1;
          } catch {
            // best-effort — derivatives will update next cycle
          }
        }
      });
      await Promise.allSettled(workers);
    } finally {
      _derivInFlight = false;
    }
  }, DERIVATIVES_POLL_MS);

  // ═══════════════════════════════════════════════════════════════════
  // PIPELINE 6: Market List (dirty-patch model for 300+ Binance Futures symbols)
  //  Source: BinanceFuturesHub events (ticker_batch, mark_batch, book)
  //  Output: market_snapshot (one-shot) + market_patch (500ms dirty flush)
  // ═══════════════════════════════════════════════════════════════════
  const MARKET_LIST_FLUSH_MS = 500;
  type MarketListField = "price" | "change24hPct" | "volume24hUsd" | "markPrice" | "fundingRate" | "nextFundingTime" | "topBid" | "topAsk" | "spreadBps" | "depthUsd" | "imbalance";

  const mlDirtyFields = new Map<string, Set<MarketListField>>();
  const mlLatestValues = new Map<string, Record<string, number | null>>();

  const markDirty = (symbol: string, fields: MarketListField[], values: Record<string, number | null>) => {
    let set = mlDirtyFields.get(symbol);
    if (!set) { set = new Set(); mlDirtyFields.set(symbol, set); }
    for (const f of fields) set.add(f);
    let existing = mlLatestValues.get(symbol);
    if (!existing) { existing = {}; mlLatestValues.set(symbol, existing); }
    Object.assign(existing, values);
  };

  const hasMarketListClients = () => {
    for (const [socket, state] of sockets.entries()) {
      if (socket.readyState === WebSocket.OPEN && state.marketListSubscribed) return true;
    }
    return false;
  };

  // Worker 0 LOCAL mode: listen to BinanceFuturesHub for market list dirty tracking
  // HUB_EXTERNAL mode: hub service does this and publishes patches to Redis
  if (!opts?.hubExternal && opts?.isPrimary && opts?.binanceFuturesHub) {
    opts.binanceFuturesHub.onEvent((event: BinanceFuturesHubEvent) => {
      if (!hasMarketListClients()) return;

      if (event.type === "futures_ticker_batch") {
        for (const row of event.rows) {
          markDirty(row.symbol, ["price", "change24hPct", "volume24hUsd"], {
            price: row.price, change24hPct: row.change24hPct, volume24hUsd: row.volume24hUsd,
          });
        }
      } else if (event.type === "futures_mark_batch") {
        for (const row of event.rows) {
          markDirty(row.symbol, ["markPrice", "fundingRate", "nextFundingTime"], {
            markPrice: row.markPrice, fundingRate: row.fundingRate, nextFundingTime: row.nextFundingTime,
          });
        }
      } else if (event.type === "futures_book") {
        markDirty(event.symbol, ["topBid", "topAsk", "spreadBps", "depthUsd", "imbalance"], {
          topBid: event.bid, topAsk: event.ask, spreadBps: event.spreadBps,
          depthUsd: event.depthUsd, imbalance: event.imbalance,
        });
      }
    });
  }

  // 500ms flush timer: collect dirty fields → market_patch → broadcast
  const marketListFlushTimer = setInterval(() => {
    if (!mlDirtyFields.size) return;

    // Build patch: { BTCUSDT: { price: 67000.5 }, ... }
    const patch: Record<string, Record<string, number | null>> = {};
    for (const [symbol, fields] of mlDirtyFields.entries()) {
      const vals = mlLatestValues.get(symbol);
      if (!vals || !fields.size) continue;
      const symbolPatch: Record<string, number | null> = {};
      for (const field of fields) {
        if (field in vals) symbolPatch[field] = vals[field] ?? null;
      }
      if (Object.keys(symbolPatch).length) patch[symbol] = symbolPatch;
    }
    mlDirtyFields.clear();

    if (!Object.keys(patch).length) return;

    const body = JSON.stringify({ type: "market_patch", patch, ts: Date.now() });

    for (const [socket, state] of sockets.entries()) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      if (state.marketListSubscribed) socket.send(body);
    }

    // LOCAL mode: primary publishes to Redis for secondary workers
    // EXTERNAL mode: hub service publishes patches, no local action needed
    if (!opts?.hubExternal && opts?.isPrimary && opts?.hubEventBridge) {
      try {
        opts.hubEventBridge.publishMarketListPatch(body);
      } catch {
        // best-effort
      }
    }
  }, MARKET_LIST_FLUSH_MS);

  // LOCAL mode: Worker 0 stores full universe snapshot in Redis every 5s
  // EXTERNAL mode: hub service does this
  if (!opts?.hubExternal && opts?.isPrimary && opts?.binanceFuturesHub && opts?.hubEventBridge) {
    setInterval(() => {
      try {
        const rows = opts.binanceFuturesHub!.getUniverseRows();
        if (rows.length > 0) {
          opts.hubEventBridge!.storeMarketListSnapshot(
            JSON.stringify({ type: "market_snapshot", rows, ts: Date.now() }),
          );
        }
      } catch {
        // best-effort
      }
    }, 5_000);
  }

  // Receive market_patch from Redis:
  // - LOCAL mode: only secondary workers (Worker 0 generates patches locally)
  // - EXTERNAL mode: ALL workers receive patches from Redis (hub service publishes)
  if ((opts?.hubExternal || !opts?.isPrimary) && opts?.hubEventBridge) {
    opts.hubEventBridge.onMarketListPatch((patchJson: string) => {
      for (const [socket, state] of sockets.entries()) {
        if (socket.readyState !== WebSocket.OPEN) continue;
        if (state.marketListSubscribed) socket.send(patchJson);
      }
    });
  }

  wss.on("close", () => {
    clearInterval(derivativesTimer);
    clearInterval(tickFlushTimer);
    clearInterval(staleCheckTimer);
    clearInterval(marketListFlushTimer);
    if (signalBatchTimer) clearInterval(signalBatchTimer);
    if (depthBatchTimer) clearInterval(depthBatchTimer);
    orderflowAggregator.stop();
  });

  wss.on("connection", async (socket, req) => {
    sockets.set(socket, { subs: {}, subscribedSymbols: new Set(), domSynced: new Set(), marketListSubscribed: false });

    // ── Token-based auth on WS handshake ──
    // Extract token from query: /ws?token=xxx
    try {
      const url = new URL(req.url ?? "", `http://${req.headers.host ?? "localhost"}`);
      const token = url.searchParams.get("token");
      if (token && _wsAuthFn) {
        const ctx = await _wsAuthFn(token);
        if (ctx) {
          (socket as any).__authUserId = ctx.userId;
          (socket as any).__authRole = ctx.role;
        }
      }
    } catch { /* ignore auth errors — public streams still work */ }

    socket.send(JSON.stringify({ type: "connected", ts: Date.now() }));
    socket.on("message", (raw) => {
      let parsed: any;
      try {
        parsed = JSON.parse(String(raw));
      } catch {
        return;
      }
      const state = sockets.get(socket);
      if (!state) return;
      if (parsed?.type === "subscribe_market") {
        const symbol = String(parsed.symbol ?? "BTCUSDT").toUpperCase();
        const interval = asInterval(parsed.interval);
        // Enforce max subscriptions per client to prevent CPU abuse
        const currentCount = Object.keys(state.subs).length;
        if (currentCount >= MAX_SUBS_PER_CLIENT && !state.subs[keyOf(symbol, interval)]) {
          socket.send(JSON.stringify({ type: "subscribe_error", symbol, interval, error: `max ${MAX_SUBS_PER_CLIENT} subscriptions` }));
          return;
        }
        const sub: MarketSub = {
          symbol,
          interval,
          lookback: Math.max(120, Math.min(1000, Number(parsed.lookback ?? 360))),
          exchange: asExchange(parsed.exchange),
          sourceMode: asSourceMode(parsed.sourceMode),
        };
        state.subs[keyOf(symbol, interval)] = sub;
        state.subscribedSymbols.add(symbol);
        socket.send(JSON.stringify({ type: "subscribed_market", symbol, interval }));

        // Send initial tick snapshot for trade tape
        sendTickSnapshot(socket, symbol);

        // ONE-SHOT: fetch full bundle (candle backfill + derivatives + orderbook)
        // After this, real-time updates come from pipelines 1-5.
        void sendInitialBundle(socket, sub);

        // Ensure the hub is watching this symbol (triggers kline/trade/ticker streams)
        if (opts?.hubExternal) {
          opts?.hubEventBridge?.publishCommand({ cmd: "ensure_symbol", symbol });
        } else {
          opts?.exchangeMarketHub?.ensureSymbol(symbol);
        }

        // Subscribe to Binance depth@20@500ms WebSocket stream for real-time orderbook
        depthSubscribe(symbol);

        // FAZ 5.3: Cold-start — send cached signal immediately on subscribe
        if (_signalCacheReader) {
          _signalCacheReader(symbol).then((cached) => {
            if (cached?.data && socket.readyState === WebSocket.OPEN) {
              const sig = cached.data as Record<string, unknown>;
              socket.send(JSON.stringify({
                type: "signal_snapshot",
                symbol,
                direction: sig.direction,
                confidence: sig.confidence,
                mode: sig.mode,
                setup: sig.setup,
                entry: { low: sig.entryLow, high: sig.entryHigh },
                sl: sig.slLevels,
                tp: sig.tpLevels,
                timeframe: sig.timeframe,
                ts: sig.scannedAt ?? Date.now(),
              }));
            }
          }).catch(() => { /* best-effort */ });
        }
      } else if (parsed?.type === "unsubscribe_market") {
        const symbol = String(parsed.symbol ?? "BTCUSDT").toUpperCase();
        const interval = asInterval(parsed.interval);
        delete state.subs[keyOf(symbol, interval)];
        // Rebuild subscribedSymbols — symbol may still have other interval subs
        const stillHasSymbol = Object.values(state.subs).some((s) => s.symbol === symbol);
        if (!stillHasSymbol) {
          state.subscribedSymbols.delete(symbol);
          state.domSynced.delete(symbol);
          depthUnsubscribe(symbol);
        }
        socket.send(JSON.stringify({ type: "unsubscribed_market", symbol, interval }));
      } else if (parsed?.type === "subscribe_market_list") {
        // Pipeline 6: Market list subscription — 300+ Binance Futures symbols
        state.marketListSubscribed = true;
        socket.send(JSON.stringify({ type: "subscribed_market_list", ts: Date.now() }));

        // Send initial snapshot
        if (!opts?.hubExternal && opts?.isPrimary && opts?.binanceFuturesHub) {
          // LOCAL mode Worker 0: direct access to hub data
          try {
            const rows = opts.binanceFuturesHub.getUniverseRows();
            socket.send(JSON.stringify({ type: "market_snapshot", rows, ts: Date.now() }));
          } catch {
            socket.send(JSON.stringify({ type: "market_snapshot", rows: [], ts: Date.now() }));
          }
        } else {
          // EXTERNAL mode (all workers) or LOCAL mode Workers 1-2:
          // Read snapshot from Redis (hub service / Worker 0 stores it every 5s)
          void (async () => {
            try {
              const json = await opts?.hubEventBridge?.getMarketListSnapshot();
              if (json && socket.readyState === WebSocket.OPEN) {
                socket.send(json);
              } else if (socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ type: "market_snapshot", rows: [], ts: Date.now() }));
              }
            } catch {
              if (socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ type: "market_snapshot", rows: [], ts: Date.now() }));
              }
            }
          })();
        }
      } else if (parsed?.type === "unsubscribe_market_list") {
        state.marketListSubscribed = false;
        socket.send(JSON.stringify({ type: "unsubscribed_market_list", ts: Date.now() }));
      } else if (parsed?.type === "subscribe_private") {
        // ═══════════════════════════════════════════════════════════════════
        // PIPELINE 8: Private User Stream Relay (Faz 9)
        //   Client sends: { type: "subscribe_private", userId, exchangeAccountId, venue }
        //   Server relays: order_update, position_update, balance_update events
        // ═══════════════════════════════════════════════════════════════════
        const userId = String(parsed.userId ?? "");
        const exchangeAccountId = String(parsed.exchangeAccountId ?? "");
        const venue = String(parsed.venue ?? "BINANCE");
        // Auth check: if WS is authenticated, userId must match token-derived identity
        const authUserId = (socket as any).__authUserId;
        if (authUserId && authUserId !== userId) {
          socket.send(JSON.stringify({ type: "subscribe_private_error", error: "unauthorized: userId mismatch" }));
        } else if (!userId || !exchangeAccountId) {
          socket.send(JSON.stringify({ type: "subscribe_private_error", error: "userId and exchangeAccountId required" }));
        } else {
          // Tag this socket for private event relay
          (socket as any).__privateUserId = userId;
          (socket as any).__privateAccountId = exchangeAccountId;
          socket.send(JSON.stringify({ type: "subscribed_private", userId: userId.slice(0, 8), venue, ts: Date.now() }));
        }
      } else if (parsed?.type === "unsubscribe_private") {
        delete (socket as any).__privateUserId;
        delete (socket as any).__privateAccountId;
        socket.send(JSON.stringify({ type: "unsubscribed_private", ts: Date.now() }));
      } else if (parsed?.type === "ping") {
        socket.send(JSON.stringify({ type: "pong", ts: Date.now() }));
      }
    });
    socket.on("close", () => {
      const state = sockets.get(socket);
      if (state) {
        // Cleanup depth subscriptions for all symbols this client was watching
        for (const symbol of state.subscribedSymbols) {
          depthUnsubscribe(symbol);
        }
      }
      sockets.delete(socket);
    });
  });
  // ═══════════════════════════════════════════════════════════════════
  // PIPELINE 8: Private user event broadcast helper
  // Called from PrivateStreamManager callbacks to relay events to connected clients
  // ═══════════════════════════════════════════════════════════════════
  const broadcastPrivateEvent = (userId: string, exchangeAccountId: string, event: Record<string, unknown>) => {
    const payload = JSON.stringify(event);
    for (const [socket] of sockets) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      if ((socket as any).__privateUserId === userId &&
          (socket as any).__privateAccountId === exchangeAccountId) {
        socket.send(payload);
      }
    }
  };

  // Expose for external use (index.ts wires PrivateStreamManager → gateway)
  (wss as any).broadcastPrivateEvent = broadcastPrivateEvent;

  return wss;
};
