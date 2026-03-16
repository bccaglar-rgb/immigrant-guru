import { create } from "zustand";
import type { OhlcvPoint, Timeframe } from "../types";
import type { ConnectionStatus } from "../types/exchange";
import { FallbackApiAdapter, type FallbackLivePayload } from "./FallbackApiAdapter";
import { normalizeExchangeSource, useDataSourceManager, type ExchangeSourceId, type SourceId } from "./DataSourceManager";
import { useTickStore } from "../hooks/useTickStore";
import { useDomStore } from "../hooks/useDomStore";
import { useOrderflowStore } from "../hooks/useOrderflowStore";
import { useLivePriceStore } from "../hooks/useLivePriceStore";

export interface MarketDatum<T> {
  sourceId: SourceId;
  ts: number;
  payload: T;
}

interface SubscriptionKey {
  symbol: string;
  interval: Timeframe;
  lookback: number;
}

interface CandleUpdate {
  interval: string;
  openTime: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closed: boolean;
  ts: number;
}

interface RouterState {
  activeSource: SourceId;
  sourceChip: string;
  fallbackActive: boolean;
  bannerMessage: string | null;
  stale: boolean;
  staleAgeSec: number;
  latencyMs: number | null;
  tickers: Record<string, MarketDatum<{ price: number; change24hPct: number; volume24h: number }>>;
  candles: Record<string, MarketDatum<OhlcvPoint[]>>;
  orderbook: Record<string, MarketDatum<{ spreadBps: number; depthUsd: number; imbalance: number }>>;
  trades: Record<string, MarketDatum<{ deltaBtc1m: number; volumeBtc1m: number; speedTpm: number; volumeZ: number }>>;
  derivatives: Record<string, MarketDatum<{ fundingRate: number | null; oiValue: number | null; oiChange1h: number | null; liquidationUsd: number | null }>>;
  candleUpdates: Record<string, CandleUpdate>; // "SYMBOL:interval" → canonical candle
  lastUpdateAt: number;
  subscriptions: Record<string, SubscriptionKey>;
  publicSourceOverride: SourceId | null;
  setRouterStatus: (patch: Partial<Pick<RouterState, "activeSource" | "sourceChip" | "fallbackActive" | "bannerMessage" | "stale" | "staleAgeSec" | "latencyMs" | "publicSourceOverride">>) => void;
  ingestLivePacket: (sourceId: SourceId, symbol: string, interval: Timeframe, packet: FallbackLivePayload) => void;
  ingestCandleUpdate: (symbol: string, update: CandleUpdate) => void;
  subscribe: (sub: SubscriptionKey) => void;
  unsubscribe: (symbol: string, interval: Timeframe) => void;
  clearSourceScopedCaches: () => void;
}

const subKey = (symbol: string, interval: Timeframe) => `${symbol}:${interval}`;
const connectionSnapshot = { exchange: "BINANCE" as ExchangeSourceId, status: "DISCONNECTED" as ConnectionStatus };
const parseSourceId = (raw: unknown): ExchangeSourceId | null => {
  const normalized = String(raw ?? "").toUpperCase().trim();
  if (!normalized) return null;
  if (normalized.includes("BYBIT")) return "BYBIT";
  if (normalized.includes("OKX")) return "OKX";
  if (normalized.includes("GATE")) return "GATEIO";
  if (normalized.includes("BINANCE")) return "BINANCE";
  return null;
};
const normalizeCandles = (input: FallbackLivePayload["ohlcv"] | undefined): OhlcvPoint[] => {
  if (!Array.isArray(input) || !input.length) return [];
  const dedup = new Map<number, OhlcvPoint>();
  for (const row of input) {
    const time = Number(row?.time ?? 0);
    const open = Number(row?.open ?? NaN);
    const high = Number(row?.high ?? NaN);
    const low = Number(row?.low ?? NaN);
    const close = Number(row?.close ?? NaN);
    const volume = Number(row?.volume ?? NaN);
    if (!Number.isFinite(time) || time <= 0) continue;
    if (!Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) continue;
    if (!Number.isFinite(volume) || volume < 0) continue;
    dedup.set(time, { time, open, high, low, close, volume });
  }
  return [...dedup.values()].sort((a, b) => a.time - b.time);
};

let pollTimer: number | null = null;
let staleTimer: number | null = null;
let currentSource: SourceId | null = null;
let reconnectAttempts = 0;
const publicSourceOverrides: Record<string, SourceId> = {};
let ws: WebSocket | null = null;
let wsConnected = false;
let wsReconnectTimer: number | null = null;
let stopped = false;
let lastWsKeepalivePollAt = 0;
const ROUTER_POLL_MS = 5000;
const ROUTER_STALE_THRESHOLD_MS = 45_000;
const ROUTER_STALE_TICK_MS = 3000;
const ROUTER_WS_KEEPALIVE_POLL_MS = 20_000;

const getPublicSourceOverride = (): SourceId | null => {
  const values = Object.values(publicSourceOverrides);
  return values.length ? values[0] : null;
};

const setConnectionSnapshot = (exchange: ExchangeSourceId, status: ConnectionStatus) => {
  connectionSnapshot.exchange = exchange;
  connectionSnapshot.status = status;
};

const toExchangeApiName = (exchange: ExchangeSourceId): string => {
  if (exchange === "BYBIT") return "Bybit";
  if (exchange === "OKX") return "OKX";
  if (exchange === "GATEIO") return "Gate.io";
  return "Binance";
};

const useMarketDataRouterStore = create<RouterState>((set) => ({
  activeSource: "FALLBACK_API",
  sourceChip: "Source: FALLBACK API",
  fallbackActive: true,
  bannerMessage: "Selected exchange not connected or data stale. Using fallback API.",
  stale: false,
  staleAgeSec: 0,
  latencyMs: null,
  tickers: {},
  candles: {},
  orderbook: {},
  trades: {},
  derivatives: {},
  candleUpdates: {},
  lastUpdateAt: 0,
  subscriptions: {},
  publicSourceOverride: null,
  setRouterStatus: (patch) => set((state) => ({ ...state, ...patch })),
  ingestCandleUpdate: (symbol, update) =>
    set((state) => ({
      candleUpdates: { ...state.candleUpdates, [`${symbol}:${update.interval}`]: update },
    })),
  ingestLivePacket: (sourceId, symbol, interval, packet) => {
    let activeSource = useMarketDataRouterStore.getState().activeSource;
    const sourceUsed = String(packet.sourceUsed ?? "").toUpperCase();
    const fallbackPacket = sourceId === "FALLBACK_API" || sourceUsed === "FALLBACK_API";
    if (sourceId !== activeSource) {
      if (!fallbackPacket) return;
      if (activeSource !== "FALLBACK_API") {
        useDataSourceManager.getState().setHealth(activeSource, { stale: true, reason: "fallback packet received" });
      }
      useDataSourceManager.getState().markPacket("FALLBACK_API", 1);
      const switched = evaluateAndSwitchSource();
      if (switched !== "FALLBACK_API") {
        useMarketDataRouterStore.getState().setRouterStatus({
          activeSource: "FALLBACK_API",
          sourceChip: "Source: FALLBACK API",
          fallbackActive: true,
          bannerMessage: null,
        });
        currentSource = "FALLBACK_API";
        activeSource = "FALLBACK_API";
      } else {
        activeSource = switched;
      }
    }
    const writeSource: SourceId = activeSource === "FALLBACK_API" ? "FALLBACK_API" : sourceId;
    const ts = Date.now();
    const candles = normalizeCandles(packet.ohlcv);
    if (!candles.length) return;
    const close = candles.at(-1)?.close ?? 0;
    const base = candles.length > 24 ? candles[candles.length - 25].close : candles[0]?.close ?? close;
    const change24hPct = base > 0 ? ((close - base) / base) * 100 : 0;
    const volume24h = candles.slice(-96).reduce((sum, c) => sum + c.volume, 0);
    set((state) => {
      // ── Candle dedup: reuse existing reference if data unchanged ──
      // Without this, every WS push creates a new candle array reference which
      // cascades through useMarketData → useMarketDashboard → full page re-render.
      const candleKey = subKey(symbol, interval);
      const existingCandles = state.candles[candleKey]?.payload;
      const candlesSame =
        existingCandles &&
        existingCandles.length === candles.length &&
        existingCandles.length > 0 &&
        existingCandles[existingCandles.length - 1].close === candles[candles.length - 1].close &&
        existingCandles[existingCandles.length - 1].time === candles[candles.length - 1].time &&
        existingCandles[0].time === candles[0].time;
      const stableCandles = candlesSame ? existingCandles : candles;

      // ── Orderbook dedup ──
      const existingOb = state.orderbook[symbol]?.payload;
      const obSame =
        existingOb &&
        packet.orderbook &&
        existingOb.spreadBps === packet.orderbook.spreadBps &&
        existingOb.depthUsd === packet.orderbook.depthUsd &&
        existingOb.imbalance === packet.orderbook.imbalance;
      const stableOb = obSame ? existingOb : packet.orderbook;

      // ── Trades dedup ──
      const existingTr = state.trades[symbol]?.payload;
      const trSame =
        existingTr &&
        packet.trades &&
        existingTr.deltaBtc1m === packet.trades.deltaBtc1m &&
        existingTr.volumeBtc1m === packet.trades.volumeBtc1m &&
        existingTr.speedTpm === packet.trades.speedTpm;
      const stableTr = trSame ? existingTr : packet.trades;

      // ── Derivatives dedup ──
      const existingDv = state.derivatives[symbol]?.payload;
      const dvSame =
        existingDv &&
        packet.derivatives &&
        existingDv.fundingRate === packet.derivatives.fundingRate &&
        existingDv.oiValue === packet.derivatives.oiValue &&
        existingDv.oiChange1h === packet.derivatives.oiChange1h;
      const stableDv = dvSame ? existingDv : packet.derivatives;

      // ── Ticker dedup ──
      const existingTk = state.tickers[symbol]?.payload;
      const tkSame = existingTk && existingTk.price === close && existingTk.change24hPct === change24hPct;
      const stableTk = tkSame ? existingTk : { price: close, change24hPct, volume24h };

      return {
        lastUpdateAt: ts,
        stale: false,
        staleAgeSec: 0,
        tickers: {
          ...state.tickers,
          [symbol]: { sourceId: writeSource, ts, payload: stableTk },
        },
        candles: {
          ...state.candles,
          [candleKey]: { sourceId: writeSource, ts, payload: stableCandles },
        },
        orderbook: {
          ...state.orderbook,
          [symbol]: { sourceId: writeSource, ts, payload: stableOb },
        },
        trades: {
          ...state.trades,
          [symbol]: { sourceId: writeSource, ts, payload: stableTr },
        },
        derivatives: {
          ...state.derivatives,
          [symbol]: { sourceId: writeSource, ts, payload: stableDv },
        },
      };
    });
  },
  subscribe: (sub) =>
    set((state) => ({
      subscriptions: {
        ...state.subscriptions,
        [subKey(sub.symbol, sub.interval)]: sub,
      },
    })),
  unsubscribe: (symbol, interval) =>
    set((state) => {
      const next = { ...state.subscriptions };
      delete next[subKey(symbol, interval)];
      return { subscriptions: next };
    }),
  clearSourceScopedCaches: () =>
    set({
      tickers: {},
      candles: {},
      orderbook: {},
      trades: {},
      derivatives: {},
      lastUpdateAt: 0,
      stale: false,
      staleAgeSec: 0,
    }),
}));

const evaluateAndSwitchSource = () => {
  const manager = useDataSourceManager.getState();
  const computed = manager.evaluateActiveSource({
    connection: {
      exchange: connectionSnapshot.exchange,
      status: connectionSnapshot.status,
    },
    staleThresholdMs: ROUTER_STALE_THRESHOLD_MS,
  });
  const override = getPublicSourceOverride();
  const nextSource = override ?? computed;
  const prevSource = currentSource;
  if (prevSource !== nextSource) {
    useMarketDataRouterStore.getState().clearSourceScopedCaches();
    reconnectAttempts = 0;
    currentSource = nextSource;
  }
  // Only update router status if values actually changed —
  // avoids triggering useShallow selectors on every WS message.
  const state = useMarketDataRouterStore.getState();
  const nextFallbackActive = nextSource === "FALLBACK_API";
  const nextChip = nextFallbackActive ? "Source: FALLBACK API" : `Source: ${nextSource}`;
  const nextBanner = nextFallbackActive
    ? "Selected exchange not connected or data stale. Using fallback API."
    : useDataSourceManager.getState().bannerMessage;
  if (
    state.activeSource !== nextSource ||
    state.sourceChip !== nextChip ||
    state.fallbackActive !== nextFallbackActive ||
    state.bannerMessage !== nextBanner ||
    state.publicSourceOverride !== (override ?? null)
  ) {
    state.setRouterStatus({
      activeSource: nextSource,
      sourceChip: nextChip,
      fallbackActive: nextFallbackActive,
      bannerMessage: nextBanner,
      publicSourceOverride: override,
    });
  }
  return nextSource;
};

const fetchOne = async (sourceId: SourceId, sub: SubscriptionKey) => {
  const started = performance.now();
  const exchangeHint: ExchangeSourceId =
    sourceId === "FALLBACK_API"
      ? useDataSourceManager.getState().selectedExchangeId === "AUTO"
        ? connectionSnapshot.exchange
        : (useDataSourceManager.getState().selectedExchangeId as ExchangeSourceId)
      : (sourceId as ExchangeSourceId);
  const payload = await FallbackApiAdapter.fetchLive({
    symbol: sub.symbol,
    interval: sub.interval,
    lookback: sub.lookback,
    exchangeHint,
    sourceMode: sourceId === "FALLBACK_API" ? "fallback" : "exchange",
  });
  const roundTripMs = Math.round(performance.now() - started);
  const latencyMs = Number.isFinite(Number(payload.feedLatencyMs))
    ? Math.max(0, Math.round(Number(payload.feedLatencyMs)))
    : roundTripMs;
  useDataSourceManager.getState().markPacket(sourceId, latencyMs);
  useMarketDataRouterStore.getState().ingestLivePacket(sourceId, sub.symbol, sub.interval, payload);
  useMarketDataRouterStore.getState().setRouterStatus({ latencyMs });
};

const wsUrl = () => {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
};

const sendWsSubscriptions = () => {
  if (!ws || !wsConnected) return;
  const sourceId = useMarketDataRouterStore.getState().activeSource;
  const sourceMode = sourceId === "FALLBACK_API" ? "fallback" : "exchange";
  const subs = Object.values(useMarketDataRouterStore.getState().subscriptions);
  for (const sub of subs) {
    const exchangeHint: ExchangeSourceId =
      sourceId === "FALLBACK_API"
        ? useDataSourceManager.getState().selectedExchangeId === "AUTO"
          ? connectionSnapshot.exchange
          : (useDataSourceManager.getState().selectedExchangeId as ExchangeSourceId)
        : (sourceId as ExchangeSourceId);
    ws.send(
      JSON.stringify({
        type: "subscribe_market",
        symbol: sub.symbol,
        interval: sub.interval,
        lookback: sub.lookback,
        exchange: toExchangeApiName(exchangeHint),
        sourceMode,
      }),
    );
  }
};

const scheduleWsReconnect = () => {
  if (stopped || wsReconnectTimer !== null) return;
  const backoffMs = Math.min(15000, 1000 * Math.max(1, reconnectAttempts));
  wsReconnectTimer = window.setTimeout(() => {
    wsReconnectTimer = null;
    if (!stopped) connectWebSocket();
  }, backoffMs);
};

const connectWebSocket = () => {
  try {
    if (ws) {
      ws.close();
      ws = null;
    }
    ws = new WebSocket(wsUrl());
    ws.onopen = () => {
      wsConnected = true;
      reconnectAttempts = 0;
      // Clear stale pipeline data on reconnect — fresh snapshots will repopulate on subscribe
      useTickStore.getState().clear();
      useDomStore.getState().clear();
      useOrderflowStore.getState().clear();
      useLivePriceStore.getState().clear();
      sendWsSubscriptions();
    };
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data ?? "{}")) as any;
        const payload =
          msg && typeof msg.data === "object" && msg.data
            ? (msg.data as Partial<FallbackLivePayload>)
            : null;
        const symbol = String(msg?.symbol ?? payload?.symbol ?? "").toUpperCase();
        const intervalRaw = String(msg?.interval ?? payload?.interval ?? "");
        const interval =
          intervalRaw === "1m" ||
          intervalRaw === "5m" ||
          intervalRaw === "15m" ||
          intervalRaw === "30m" ||
          intervalRaw === "1h" ||
          intervalRaw === "4h" ||
          intervalRaw === "1d"
            ? (intervalRaw as Timeframe)
            : null;
        if (msg.type === "market_live" && payload && symbol && interval) {
          const store = useMarketDataRouterStore.getState();
          const sourceUsed = String(payload.sourceUsed ?? msg?.sourceUsed ?? "").toUpperCase();
          const payloadMeta = payload as Record<string, unknown>;
          const exchangeSource =
            parseSourceId(payloadMeta.exchangeUsed ?? msg?.exchangeUsed ?? payload.exchange ?? msg?.exchange ?? payloadMeta.sourceDetail ?? msg?.sourceDetail) ??
            (store.activeSource === "FALLBACK_API" ? connectionSnapshot.exchange : store.activeSource);
          const sourceId: SourceId = sourceUsed === "FALLBACK_API" ? "FALLBACK_API" : exchangeSource;
          const normalizedPayload = {
            ...payload,
            symbol,
            interval,
          } as FallbackLivePayload;
          store.ingestLivePacket(sourceId, symbol, interval, normalizedPayload);
          const fetchedAtMs = Date.parse(String(payload.fetchedAt ?? msg?.fetchedAt ?? ""));
          const wsLatencyFromPayload = Number(payload.feedLatencyMs ?? msg?.feedLatencyMs);
          const wsLatency = Number.isFinite(wsLatencyFromPayload)
            ? Math.max(0, Math.round(wsLatencyFromPayload))
            : (Number.isFinite(fetchedAtMs) ? Math.max(0, Date.now() - fetchedAtMs) : 50);
          useDataSourceManager.getState().markPacket(sourceId, wsLatency);
          store.setRouterStatus({ latencyMs: wsLatency });
          const prevSource = store.activeSource;
          const nextSource = evaluateAndSwitchSource();
          if (prevSource !== nextSource) sendWsSubscriptions();
        } else if (msg.type === "candle_update" && symbol) {
          // Canonical candle update from exchange kline stream
          const cu = {
            interval: String(msg.interval ?? ""),
            openTime: Number(msg.openTime ?? 0),
            open: Number(msg.open ?? 0),
            high: Number(msg.high ?? 0),
            low: Number(msg.low ?? 0),
            close: Number(msg.close ?? 0),
            volume: Number(msg.volume ?? 0),
            closed: Boolean(msg.closed),
            ts: Number(msg.ts ?? Date.now()),
          };
          if (cu.interval && cu.openTime > 0 && cu.close > 0) {
            useMarketDataRouterStore.getState().ingestCandleUpdate(symbol, cu);
          }
        } else if (msg.type === "tick_batch" && symbol) {
          // Pipeline 2: Tick micro-batch from trade events
          const ticks = Array.isArray(msg.ticks) ? msg.ticks : [];
          if (ticks.length) {
            useTickStore.getState().ingestBatch(symbol, ticks);
            // Feed last tick into live price store for chart overlay
            const last = ticks[ticks.length - 1] as Record<string, unknown> | undefined;
            if (last && typeof last.price === "number" && last.price > 0) {
              useLivePriceStore.getState().setLivePrice(
                symbol,
                last.price,
                Number(last.ts ?? Date.now()),
                last.side === "BUY" || last.side === "SELL" ? last.side : undefined,
              );
            }
          }
        } else if (msg.type === "tick_snapshot" && symbol) {
          // Pipeline 2: Initial tick buffer on subscribe
          const ticks = Array.isArray(msg.ticks) ? msg.ticks : [];
          if (ticks.length) {
            useTickStore.getState().ingestSnapshot(symbol, ticks);
            // Seed live price from last tick in snapshot
            const last = ticks[ticks.length - 1] as Record<string, unknown> | undefined;
            if (last && typeof last.price === "number" && last.price > 0) {
              useLivePriceStore.getState().setLivePrice(
                symbol,
                last.price,
                Number(last.ts ?? Date.now()),
                last.side === "BUY" || last.side === "SELL" ? last.side : undefined,
              );
            }
          }
        } else if (msg.type === "dom_snapshot" && symbol) {
          // Pipeline 3: Full orderbook snapshot
          const bids = Array.isArray(msg.bids) ? msg.bids : [];
          const asks = Array.isArray(msg.asks) ? msg.asks : [];
          const seq = Number(msg.seq ?? 0);
          useDomStore.getState().applySnapshot(symbol, seq, bids, asks);
        } else if (msg.type === "dom_delta" && symbol) {
          // Pipeline 3: Incremental orderbook delta
          const bids = Array.isArray(msg.bids) ? msg.bids : [];
          const asks = Array.isArray(msg.asks) ? msg.asks : [];
          const endSeq = Number(msg.endSeq ?? 0);
          useDomStore.getState().applyDelta(symbol, endSeq, bids, asks);
        } else if (msg.type === "orderflow_frame" && symbol) {
          // Pipeline 4: 1s aggregated orderflow frame
          const frame = {
            windowStart: Number(msg.windowStart ?? 0),
            windowEnd: Number(msg.windowEnd ?? 0),
            delta: Number(msg.delta ?? 0),
            cvd: Number(msg.cvd ?? 0),
            buyVolume: Number(msg.buyVolume ?? 0),
            sellVolume: Number(msg.sellVolume ?? 0),
            buyCount: Number(msg.buyCount ?? 0),
            sellCount: Number(msg.sellCount ?? 0),
            totalCount: Number(msg.totalCount ?? 0),
            avgTradeSize: Number(msg.avgTradeSize ?? 0),
            maxTradeSize: Number(msg.maxTradeSize ?? 0),
            vwap: Number(msg.vwap ?? 0),
            aggressionScore: Number(msg.aggressionScore ?? 0),
          };
          if (frame.windowStart > 0) {
            useOrderflowStore.getState().ingestFrame(symbol, frame);
          }
        } else if (msg.type === "market_error") {
          const state = useMarketDataRouterStore.getState();
          useDataSourceManager.getState().markError(
            state.activeSource,
            typeof msg.error === "string" ? msg.error : "ws market error",
          );
        }
      } catch {
        // noop
      }
    };
    ws.onerror = () => {
      wsConnected = false;
    };
    ws.onclose = () => {
      wsConnected = false;
      reconnectAttempts += 1;
      scheduleWsReconnect();
    };
  } catch {
    wsConnected = false;
    reconnectAttempts += 1;
    scheduleWsReconnect();
  }
};

const pollLoop = async () => {
  let sourceId = evaluateAndSwitchSource();
  const subs = Object.values(useMarketDataRouterStore.getState().subscriptions);
  if (!subs.length) return;

  // If we are on fallback while user has a forced exchange selection, probe the selected
  // exchange in the background and switch back immediately when it is healthy again.
  const manager = useDataSourceManager.getState();
  const forcedExchange = manager.selectedExchangeId !== "AUTO" ? manager.selectedExchangeId : null;
  if (
    sourceId === "FALLBACK_API" &&
    forcedExchange &&
    connectionSnapshot.exchange === forcedExchange &&
    connectionSnapshot.status === "CONNECTED"
  ) {
    const probe = subs[0];
    if (probe) {
      try {
        await fetchOne(forcedExchange, probe);
        reconnectAttempts = 0;
        sourceId = evaluateAndSwitchSource();
      } catch (err) {
        useDataSourceManager
          .getState()
          .markError(forcedExchange, err instanceof Error ? err.message : "exchange probe failed");
      }
    }
  }

  for (const sub of subs) {
    try {
      await fetchOne(sourceId, sub);
      reconnectAttempts = 0;
    } catch (err) {
      reconnectAttempts += 1;
      useDataSourceManager
        .getState()
        .markError(sourceId, err instanceof Error ? err.message : "live fetch failed");
      if (sourceId !== "FALLBACK_API" && reconnectAttempts >= 1) {
        useDataSourceManager.getState().setHealth(sourceId, { stale: true, reason: "reconnect failed" });
        sourceId = evaluateAndSwitchSource();
      } else {
        // Do not spam same error across all subscriptions in the same tick.
        break;
      }
      if (reconnectAttempts > 6) reconnectAttempts = 6;
    }
  }
};

const startRouter = () => {
  if (pollTimer !== null) return;
  stopped = false;
  connectWebSocket();
  pollTimer = window.setInterval(() => {
    const now = Date.now();
    const state = useMarketDataRouterStore.getState();
    const shouldKeepalivePoll = wsConnected && now - lastWsKeepalivePollAt >= ROUTER_WS_KEEPALIVE_POLL_MS;
    if (!wsConnected || state.stale || shouldKeepalivePoll) {
      if (shouldKeepalivePoll) lastWsKeepalivePollAt = now;
      void pollLoop();
    }
  }, ROUTER_POLL_MS);
  staleTimer = window.setInterval(() => {
    const state = useMarketDataRouterStore.getState();
    const ageMs = state.lastUpdateAt ? Date.now() - state.lastUpdateAt : 99_999;
    const nextStale = ageMs > ROUTER_STALE_THRESHOLD_MS;
    const nextStaleAgeSec = Math.max(0, Math.floor(ageMs / 1000));
    // Only write to store when stale status or staleAgeSec actually changed —
    // avoids triggering useShallow selectors (and the full render cascade) every 3s.
    if (nextStale !== state.stale || nextStaleAgeSec !== state.staleAgeSec) {
      state.setRouterStatus({ stale: nextStale, staleAgeSec: nextStaleAgeSec });
    }
    if (nextStale && state.activeSource !== "FALLBACK_API") {
      useDataSourceManager.getState().setHealth(state.activeSource, { stale: true, reason: "stale >25s" });
      evaluateAndSwitchSource();
      sendWsSubscriptions();
    }
  }, ROUTER_STALE_TICK_MS);
};

const stopRouter = () => {
  stopped = true;
  if (pollTimer !== null) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
  if (staleTimer !== null) {
    window.clearInterval(staleTimer);
    staleTimer = null;
  }
  if (wsReconnectTimer !== null) {
    window.clearTimeout(wsReconnectTimer);
    wsReconnectTimer = null;
  }
  if (ws) {
    ws.close();
    ws = null;
  }
  wsConnected = false;
};

let mountCount = 0;

export const MarketDataRouter = {
  mount: () => {
    mountCount += 1;
    if (mountCount === 1) startRouter();
  },
  unmount: () => {
    mountCount = Math.max(0, mountCount - 1);
    if (mountCount === 0) stopRouter();
  },
  setConnectionState: (exchange: string, status: ConnectionStatus) => {
    setConnectionSnapshot(normalizeExchangeSource(exchange as never), status);
    evaluateAndSwitchSource();
    sendWsSubscriptions();
  },
  setPublicSourceOverride: (key: string, sourceId: SourceId | null) => {
    if (sourceId === null) {
      delete publicSourceOverrides[key];
    } else {
      publicSourceOverrides[key] = sourceId;
    }
    evaluateAndSwitchSource();
    sendWsSubscriptions();
  },
  subscribe: (symbol: string, interval: Timeframe, lookback = 360) => {
    useMarketDataRouterStore.getState().subscribe({ symbol, interval, lookback });
    if (ws && wsConnected) {
      const sourceId = useMarketDataRouterStore.getState().activeSource;
      const sourceMode = sourceId === "FALLBACK_API" ? "fallback" : "exchange";
      const exchangeHint: ExchangeSourceId =
        sourceId === "FALLBACK_API"
          ? useDataSourceManager.getState().selectedExchangeId === "AUTO"
            ? connectionSnapshot.exchange
            : (useDataSourceManager.getState().selectedExchangeId as ExchangeSourceId)
          : (sourceId as ExchangeSourceId);
      ws.send(
        JSON.stringify({
          type: "subscribe_market",
          symbol,
          interval,
          lookback,
          exchange: toExchangeApiName(exchangeHint),
          sourceMode,
        }),
      );
    }
  },
  unsubscribe: (symbol: string, interval: Timeframe) => {
    useMarketDataRouterStore.getState().unsubscribe(symbol, interval);
    if (ws && wsConnected) {
      ws.send(
        JSON.stringify({
          type: "unsubscribe_market",
          symbol,
          interval,
        }),
      );
    }
  },
  useStore: useMarketDataRouterStore,
};
