import type { Server as HttpServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { fetchMarketLiveBundle } from "../routes/market.ts";

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

export const createGateway = (httpServer: HttpServer) => {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  const sockets = new Map<WebSocket, SocketState>();
  let tickInFlight = false;

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

  const timer = setInterval(() => {
    if (tickInFlight) return;
    tickInFlight = true;
    void tick().finally(() => {
      tickInFlight = false;
    });
  }, WS_TICK_MS);

  wss.on("close", () => clearInterval(timer));

  wss.on("connection", (socket) => {
    sockets.set(socket, { subs: {} });
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
      } else if (parsed?.type === "unsubscribe_market") {
        const symbol = String(parsed.symbol ?? "BTCUSDT").toUpperCase();
        const interval = asInterval(parsed.interval);
        delete state.subs[keyOf(symbol, interval)];
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
