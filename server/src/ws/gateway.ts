import type { Server as HttpServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { fetchMarketLiveBundle } from "../routes/market.ts";
import type { ExchangeMarketHub } from "../services/marketHub/ExchangeMarketHub.ts";
import type { NormalizedTradeEvent } from "../services/marketHub/types.ts";
import { OrderflowAggregator } from "../services/marketHub/OrderflowAggregator.ts";

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
  domSynced: Set<string>; // symbols for which we've sent dom_snapshot
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
const requestKeyOf = (sub: MarketSub) =>
  `${sub.symbol}:${sub.interval}:${sub.lookback}:${sub.exchange}:${sub.sourceMode}`;
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
const WS_TICK_MS = 800;
const WS_MAX_CONCURRENCY = 6;

// ── Pipeline constants ──
const TICK_RING_BUFFER_SIZE = 5000;
const TICK_BATCH_INTERVAL_MS = 33;  // ~30fps flush rate
const TICK_SNAPSHOT_SIZE = 500;     // initial ticks on subscribe

const runWithConcurrency = async (jobs: Array<() => Promise<void>>, concurrency: number) => {
  if (!jobs.length) return;
  const max = Math.max(1, Math.min(concurrency, jobs.length));
  let index = 0;
  const workers = new Array(max).fill(0).map(async () => {
    while (index < jobs.length) {
      const current = jobs[index];
      index += 1;
      if (!current) continue;
      try {
        await current();
      } catch {
        // each job handles its own socket error notifications
      }
    }
  });
  await Promise.allSettled(workers);
};

interface GatewayOpts {
  exchangeMarketHub?: ExchangeMarketHub;
}

export const createGateway = (httpServer: HttpServer, opts?: GatewayOpts) => {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  const sockets = new Map<WebSocket, SocketState>();
  let tickInFlight = false;

  // ═══════════════════════════════════════════════════════════════════
  // PIPELINE 1: Canonical Candle (kline → candle_update)
  // ═══════════════════════════════════════════════════════════════════
  const lastKlineOpenTime = new Map<string, number>();

  const broadcastCandleUpdate = (
    symbol: string, interval: string,
    openTime: number, open: number, high: number, low: number, close: number, volume: number,
    closed: boolean, ts: number,
  ) => {
    const key = `${symbol}:${interval}`;
    const lastOt = lastKlineOpenTime.get(key) ?? 0;
    if (openTime < lastOt) return;
    lastKlineOpenTime.set(key, openTime);

    const body = JSON.stringify({
      type: "candle_update", symbol, interval,
      openTime, open, high, low, close, volume, closed, ts,
    });

    for (const [socket, state] of sockets.entries()) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      const hasSub = Object.values(state.subs).some(
        (s) => s.symbol === symbol && s.interval === interval,
      );
      if (hasSub) socket.send(body);
    }
  };

  // ═══════════════════════════════════════════════════════════════════
  // PIPELINE 2: Tick Engine (trade → tick_batch, 33ms micro-batch)
  // ═══════════════════════════════════════════════════════════════════
  const tickBuffers = new Map<string, TickEntry[]>();   // symbol → ring buffer (5000)
  const tickPending = new Map<string, TickEntry[]>();   // symbol → unflushed batch

  const ingestTick = (event: NormalizedTradeEvent) => {
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
    if (ring.length > TICK_RING_BUFFER_SIZE) ring.splice(0, ring.length - TICK_RING_BUFFER_SIZE);

    // Append to pending batch
    let pending = tickPending.get(event.symbol);
    if (!pending) { pending = []; tickPending.set(event.symbol, pending); }
    pending.push(entry);
  };

  // 33ms flush timer — micro-batch ticks to subscribed clients
  const tickFlushTimer = setInterval(() => {
    if (!tickPending.size) return;
    for (const [symbol, batch] of tickPending.entries()) {
      if (!batch.length) continue;
      const body = JSON.stringify({ type: "tick_batch", symbol, ticks: batch });
      for (const [socket, state] of sockets.entries()) {
        if (socket.readyState !== WebSocket.OPEN) continue;
        const hasSub = Object.values(state.subs).some((s) => s.symbol === symbol);
        if (hasSub) socket.send(body);
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
    const body = JSON.stringify({ type: "dom_snapshot", symbol, seq, bids, asks, ts });
    for (const [socket, state] of sockets.entries()) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      const hasSub = Object.values(state.subs).some((s) => s.symbol === symbol);
      if (hasSub) {
        state.domSynced.add(symbol);
        socket.send(body);
      }
    }
  };

  const broadcastDomDelta = (
    symbol: string, startSeq: number, endSeq: number,
    bids: Array<[number, number]>, asks: Array<[number, number]>, ts: number,
  ) => {
    const body = JSON.stringify({ type: "dom_delta", symbol, startSeq, endSeq, bids, asks, ts });
    for (const [socket, state] of sockets.entries()) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      if (!state.domSynced.has(symbol)) continue;
      const hasSub = Object.values(state.subs).some((s) => s.symbol === symbol);
      if (hasSub) socket.send(body);
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
      const hasSub = Object.values(state.subs).some((s) => s.symbol === frame.symbol);
      if (hasSub) socket.send(body);
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // Hub event router — feeds all 4 pipelines
  // ═══════════════════════════════════════════════════════════════════
  if (opts?.exchangeMarketHub) {
    opts.exchangeMarketHub.onEvent((event) => {
      // Pipeline 1: Candle
      if (event.type === "kline" && event.close > 0) {
        broadcastCandleUpdate(
          event.symbol, event.interval,
          event.openTime, event.open, event.high, event.low, event.close, event.volume,
          event.closed, event.ts,
        );
      }

      // Pipeline 2 + 4: Tick + Orderflow (both consume trade events)
      if (event.type === "trade") {
        ingestTick(event);
        orderflowAggregator.ingestTrade(event);
      }

      // Pipeline 3: DOM
      if (event.type === "book_snapshot") {
        broadcastDomSnapshot(event.symbol, event.seq, event.bids, event.asks, event.ts);
      }
      if (event.type === "book_delta") {
        broadcastDomDelta(
          event.symbol, event.startSeq, event.endSeq,
          event.bids, event.asks, event.ts,
        );
      }
    });
  }

  // ── Full bundle tick (candles, orderbook, derivatives) — every WS_TICK_MS ──
  const tick = async () => {
    const requestRoutes = new Map<string, Array<{ socket: WebSocket; sub: MarketSub }>>();
    for (const [socket, state] of sockets.entries()) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      const subs = Object.values(state.subs);
      for (const sub of subs) {
        const requestKey = requestKeyOf(sub);
        const list = requestRoutes.get(requestKey) ?? [];
        list.push({ socket, sub });
        requestRoutes.set(requestKey, list);
      }
    }
    const jobs = [...requestRoutes.entries()].map(([, routes]) => async () => {
      const first = routes[0];
      if (!first) return;
      const { sub } = first;
      try {
        const payload = await fetchMarketLiveBundle({
          symbol: sub.symbol,
          interval: sub.interval,
          limit: sub.lookback,
          exchange: sub.exchange,
          apiKey,
          sourceMode: sub.sourceMode,
        });
        const body = JSON.stringify({
          type: "market_live",
          symbol: sub.symbol,
          interval: sub.interval,
          sourceMode: sub.sourceMode,
          data: payload,
        });
        for (const route of routes) {
          if (route.socket.readyState === WebSocket.OPEN) {
            route.socket.send(body);
          }
        }
      } catch (err) {
        const errorBody = JSON.stringify({
          type: "market_error",
          symbol: sub.symbol,
          interval: sub.interval,
          error: err instanceof Error ? err.message : "live stream fetch failed",
        });
        for (const route of routes) {
          if (route.socket.readyState === WebSocket.OPEN) {
            route.socket.send(errorBody);
          }
        }
      }
    });
    if (jobs.length) await runWithConcurrency(jobs, WS_MAX_CONCURRENCY);
  };

  const bundleTimer = setInterval(() => {
    if (tickInFlight) return;
    tickInFlight = true;
    void tick().finally(() => {
      tickInFlight = false;
    });
  }, WS_TICK_MS);

  wss.on("close", () => {
    clearInterval(bundleTimer);
    clearInterval(tickFlushTimer);
    orderflowAggregator.stop();
  });

  wss.on("connection", (socket) => {
    sockets.set(socket, { subs: {}, domSynced: new Set() });
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
        const sub: MarketSub = {
          symbol,
          interval,
          lookback: Math.max(120, Math.min(1000, Number(parsed.lookback ?? 360))),
          exchange: asExchange(parsed.exchange),
          sourceMode: asSourceMode(parsed.sourceMode),
        };
        state.subs[keyOf(symbol, interval)] = sub;
        socket.send(JSON.stringify({ type: "subscribed_market", symbol, interval }));

        // Send initial tick snapshot for trade tape
        sendTickSnapshot(socket, symbol);

        // Ensure the hub is watching this symbol (triggers depth subscription + snapshot)
        opts?.exchangeMarketHub?.ensureSymbol(symbol);
      } else if (parsed?.type === "unsubscribe_market") {
        const symbol = String(parsed.symbol ?? "BTCUSDT").toUpperCase();
        const interval = asInterval(parsed.interval);
        delete state.subs[keyOf(symbol, interval)];
        state.domSynced.delete(symbol);
        socket.send(JSON.stringify({ type: "unsubscribed_market", symbol, interval }));
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
