/**
 * useLiveMarketData — Shared hook for multi-timeframe live candle data.
 *
 * Reuses the existing MarketDataRouter + FallbackApiAdapter pipeline
 * (same as Exchange Terminal / SuperCharts). Subscribes to multiple
 * timeframes and returns candles + current price for each.
 */
import { useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { MarketDataRouter } from "../data/MarketDataRouter";
import { useDataSourceManager } from "../data/DataSourceManager";
import type { OhlcvPoint, Timeframe } from "../types";

const TIMEFRAMES: Timeframe[] = ["1m", "15m", "1h", "4h", "1d"];
const LOOKBACKS: Record<Timeframe, number> = {
  "1m": 160,
  "5m": 120,
  "15m": 80,
  "30m": 80,
  "1h": 60,
  "4h": 50,
  "1d": 40,
  "1w": 30,
};

export interface LiveMarketDataResult {
  candles1m: OhlcvPoint[];
  candles15m: OhlcvPoint[];
  candles1h: OhlcvPoint[];
  candles4h: OhlcvPoint[];
  candles1d: OhlcvPoint[];
  currentPrice: number;
  priceChange24hPct: number;
  loading: boolean;
}

const EMPTY: OhlcvPoint[] = [];

export const useLiveMarketData = (
  symbol: string,
  exchangeHint?: "BINANCE" | "BYBIT" | "OKX" | "GATEIO",
): LiveMarketDataResult => {
  const selectedSource = useDataSourceManager((s) => s.selectedExchangeId);
  const setSelectedSource = useDataSourceManager((s) => s.setSelectedExchangeId);

  // Mount / unmount the router
  useEffect(() => {
    MarketDataRouter.mount();
    return () => {
      MarketDataRouter.unmount();
    };
  }, []);

  // Sync exchange hint to data source manager
  useEffect(() => {
    if (!exchangeHint) return;
    if (selectedSource !== exchangeHint) setSelectedSource(exchangeHint);
  }, [exchangeHint, selectedSource, setSelectedSource]);

  // Subscribe to all timeframes
  useEffect(() => {
    for (const tf of TIMEFRAMES) {
      MarketDataRouter.subscribe(symbol, tf, LOOKBACKS[tf]);
    }
    return () => {
      for (const tf of TIMEFRAMES) {
        MarketDataRouter.unsubscribe(symbol, tf);
      }
    };
  }, [symbol]);

  // Read candles for all timeframes from the shared store
  const store = MarketDataRouter.useStore(
    useShallow((state) => ({
      c1m: state.candles[`${symbol}:1m`]?.payload,
      c15m: state.candles[`${symbol}:15m`]?.payload,
      c1h: state.candles[`${symbol}:1h`]?.payload,
      c4h: state.candles[`${symbol}:4h`]?.payload,
      c1d: state.candles[`${symbol}:1d`]?.payload,
      ticker: state.tickers[symbol]?.payload,
    })),
  );

  return useMemo(() => {
    const candles1m = store.c1m ?? EMPTY;
    const candles15m = store.c15m ?? EMPTY;
    const candles1h = store.c1h ?? EMPTY;
    const candles4h = store.c4h ?? EMPTY;
    const candles1d = store.c1d ?? EMPTY;
    const currentPrice = store.ticker?.price ?? candles1m[candles1m.length - 1]?.close ?? 0;
    const priceChange24hPct = store.ticker?.change24hPct ?? 0;
    const loading =
      candles1m.length === 0 &&
      candles15m.length === 0 &&
      candles1h.length === 0;

    return {
      candles1m,
      candles15m,
      candles1h,
      candles4h,
      candles1d,
      currentPrice,
      priceChange24hPct,
      loading,
    };
  }, [store]);
};
