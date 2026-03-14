import type { ScoringMode, Timeframe } from "../types";

export interface FallbackLivePayload {
  ok: boolean;
  symbol: string;
  interval: Timeframe;
  exchange?: string;
  sourceUsed?: "EXCHANGE" | "FALLBACK_API";
  ohlcv: Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
  orderbook: {
    spreadBps: number;
    depthUsd: number;
    imbalance: number;
    topBid?: number | null;
    topAsk?: number | null;
    midPrice?: number | null;
  };
  orderbookLevels?: {
    bids: Array<{ price: number; amount: number; total: number }>;
    asks: Array<{ price: number; amount: number; total: number }>;
  };
  recentTrades?: Array<{
    id: string;
    ts: number;
    price: number;
    amount: number;
    side: "BUY" | "SELL";
    time: string;
  }>;
  trades: {
    deltaBtc1m: number;
    volumeBtc1m: number;
    speedTpm: number;
    volumeZ: number;
  };
  derivatives: {
    fundingRate: number | null;
    oiValue: number | null;
    oiChange1h: number | null;
    liquidationUsd: number | null;
  };
  feedLatencyMs?: number;
  fetchedAt: string;
}

type ExchangeHint = "BINANCE" | "BYBIT" | "OKX" | "GATEIO";

const fetchJson = async <T,>(url: string, timeoutMs = 9000): Promise<T> => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const body = (await res.json()) as { error?: string; reason?: string };
        const message = String(body?.error ?? body?.reason ?? "").trim();
        if (message) detail = `${detail}:${message}`;
      } catch {
        // ignore body parse failures
      }
      throw new Error(detail);
    }
    return (await res.json()) as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("TIMEOUT_ABORT");
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
};

export const FallbackApiAdapter = {
  fetchLive: async (input: {
    symbol: string;
    interval: Timeframe;
    lookback: number;
    exchangeHint: ExchangeHint;
    orderbookStep?: number;
    orderbookLimit?: number;
    sourceMode?: "exchange" | "fallback" | "exchange_strict";
  }): Promise<FallbackLivePayload> => {
    const apiKey = (() => {
      try {
        return window.localStorage.getItem("market-data-api-key") || "4f8430d3a7a14b44a16bd10f3a4dd61d";
      } catch {
        return "4f8430d3a7a14b44a16bd10f3a4dd61d";
      }
    })();
    const exchange = input.exchangeHint === "BYBIT" ? "Bybit" : input.exchangeHint === "OKX" ? "OKX" : input.exchangeHint === "GATEIO" ? "Gate.io" : "Binance";
    const qs = new URLSearchParams({
      symbol: input.symbol,
      interval: input.interval,
      limit: String(Math.max(120, Math.min(1000, input.lookback))),
      exchange,
      apiKey,
      source: input.sourceMode === "exchange_strict" ? "exchange" : input.sourceMode ?? "exchange",
      strict: input.sourceMode === "exchange_strict" ? "1" : "0",
      bookStep: String(input.orderbookStep ?? 0.1),
      bookLimit: String(input.orderbookLimit ?? 20),
    });
    return fetchJson<FallbackLivePayload>(`/api/market/live?${qs.toString()}`);
  },
  fetchTradeIdea: async (input: {
    symbol: string;
    timeframe: Timeframe;
    horizon: "SCALP" | "INTRADAY" | "SWING";
    exchangeHint: ExchangeHint;
    sourceMode?: "exchange" | "fallback";
    scoringMode?: ScoringMode;
    strict?: boolean;
    timeoutMs?: number;
  }): Promise<{
    ok: boolean;
    text: string;
    sourceUsed?: "EXCHANGE" | "FALLBACK_API";
    exchangeUsed?: "Binance" | "Bybit" | "OKX" | "Gate.io";
    sourceDetail?: string;
    fetchedAt?: string;
    scoring_mode?: ScoringMode;
    approved_modes?: ScoringMode[];
    mode_scores?: Partial<Record<ScoringMode, number>>;
    mode_breakdown?: Partial<Record<ScoringMode, {
      raw?: number;
      base?: number;
      final?: number;
      penaltyRate?: number;
      riskAdj?: number;
      gatingFlags?: string[];
      decision?: string;
    }>>;
    decision_trace?: {
      selected?: {
        stage?: "PASS" | "BLOCKED" | "GATED" | "FILTERED";
        reasons?: string[];
        capMultiplier?: number;
        dominantReducer?: "tradeability" | "reliability" | "penalty" | "cap";
        coreAlpha?: number;
        tradeability?: number;
        reliability?: number;
        penaltyFactor?: number;
        finalScore?: number;
        confidence?: number;
      };
      by_mode?: Partial<Record<ScoringMode, {
        stage?: "PASS" | "BLOCKED" | "GATED" | "FILTERED";
        reasons?: string[];
        capMultiplier?: number;
        dominantReducer?: "tradeability" | "reliability" | "penalty" | "cap";
        coreAlpha?: number;
        tradeability?: number;
        reliability?: number;
        penaltyFactor?: number;
        finalScore?: number;
        confidence?: number;
      }>>;
    };
    oi_change_1h?: number | null;
  }> => {
    const apiKey = (() => {
      try {
        return window.localStorage.getItem("market-data-api-key") || "4f8430d3a7a14b44a16bd10f3a4dd61d";
      } catch {
        return "4f8430d3a7a14b44a16bd10f3a4dd61d";
      }
    })();
    const exchange = input.exchangeHint === "BYBIT" ? "Bybit" : input.exchangeHint === "OKX" ? "OKX" : input.exchangeHint === "GATEIO" ? "Gate.io" : "Binance";
    const qs = new URLSearchParams({
      symbol: input.symbol,
      timeframe: input.timeframe,
      horizon: input.horizon,
      exchange,
      apiKey,
      source: input.sourceMode ?? "exchange",
      scoring_mode: input.scoringMode ?? "BALANCED",
      strict: input.strict === true ? "1" : "0",
    });
    return fetchJson(`/api/market/trade-idea?${qs.toString()}`, Math.max(10_000, input.timeoutMs ?? 30_000));
  },
};
