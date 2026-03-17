import type { Server as HttpServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { fetchMarketLiveBundle } from "../routes/market.ts";
import type { ExchangeMarketHub } from "../services/marketHub/ExchangeMarketHub.ts";
import type { HubEventBridge } from "../services/marketHub/HubEventBridge.ts";
import type { NormalizedTradeEvent } from "../services/marketHub/types.ts";
import { OrderflowAggregator } from "../services/marketHub/OrderflowAggregator.ts";
import type { BinanceFuturesHub, BinanceFuturesHubEvent } from "../services/binanceFuturesHub.ts";

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
}

export const createGateway = (httpServer: HttpServer, opts?: GatewayOpts) => {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  const sockets = new Map<WebSocket, SocketState>();

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
        opts?.exchangeMarketHub?.ensureSymbol(symbol);
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

  // Primary worker: listen to hub via setImmediate (async decoupling WITHOUT Redis roundtrip).
  // This saves ~500 JSON.parse/sec that the Redis subscriber would do.
  // The bridge publisher still runs for Workers 1,2 (they get events via Redis).
  // Secondary workers: get events via Redis bridge as before.
  if (opts?.isPrimary && opts?.exchangeMarketHub) {
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

  // Worker 0: listen to BinanceFuturesHub for market list dirty tracking
  if (opts?.isPrimary && opts?.binanceFuturesHub) {
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

    // If primary, publish to Redis for secondary workers
    if (opts?.isPrimary && opts?.hubEventBridge) {
      try {
        opts.hubEventBridge.publishMarketListPatch(body);
      } catch {
        // best-effort
      }
    }
  }, MARKET_LIST_FLUSH_MS);

  // Worker 0: store full universe snapshot in Redis every 5s for secondary workers
  if (opts?.isPrimary && opts?.binanceFuturesHub && opts?.hubEventBridge) {
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

  // Secondary workers: receive market_patch from Redis
  if (!opts?.isPrimary && opts?.hubEventBridge) {
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
    orderflowAggregator.stop();
  });

  wss.on("connection", (socket) => {
    sockets.set(socket, { subs: {}, subscribedSymbols: new Set(), domSynced: new Set(), marketListSubscribed: false });
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

        // Ensure the hub is watching this symbol (triggers depth subscription + snapshot)
        opts?.exchangeMarketHub?.ensureSymbol(symbol);
      } else if (parsed?.type === "unsubscribe_market") {
        const symbol = String(parsed.symbol ?? "BTCUSDT").toUpperCase();
        const interval = asInterval(parsed.interval);
        delete state.subs[keyOf(symbol, interval)];
        // Rebuild subscribedSymbols — symbol may still have other interval subs
        const stillHasSymbol = Object.values(state.subs).some((s) => s.symbol === symbol);
        if (!stillHasSymbol) {
          state.subscribedSymbols.delete(symbol);
          state.domSynced.delete(symbol);
        }
        socket.send(JSON.stringify({ type: "unsubscribed_market", symbol, interval }));
      } else if (parsed?.type === "subscribe_market_list") {
        // Pipeline 6: Market list subscription — 300+ Binance Futures symbols
        state.marketListSubscribed = true;
        socket.send(JSON.stringify({ type: "subscribed_market_list", ts: Date.now() }));

        // Send initial snapshot
        if (opts?.isPrimary && opts?.binanceFuturesHub) {
          // Worker 0: direct access to hub data
          try {
            const rows = opts.binanceFuturesHub.getUniverseRows();
            socket.send(JSON.stringify({ type: "market_snapshot", rows, ts: Date.now() }));
          } catch {
            socket.send(JSON.stringify({ type: "market_snapshot", rows: [], ts: Date.now() }));
          }
        } else {
          // Workers 1-2: read snapshot from Redis (Worker 0 stores it every 5s)
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
      } else if (parsed?.type === "ping") {
        socket.send(JSON.stringify({ type: "pong", ts: Date.now() }));
      }
    });
    socket.on("close", () => {
      sockets.delete(socket);
    });
  });
  return wss;
};
