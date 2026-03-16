import { useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useExchangeTerminalStore } from "./useExchangeTerminalStore";
import { MarketDataRouter } from "../data/MarketDataRouter";
import { useDataSourceManager } from "../data/DataSourceManager";
import type { Timeframe } from "../types";

interface Args {
  symbol: string;
  interval: Timeframe;
  lookback?: number;
  publicSourceOverride?: "FALLBACK_API" | "BINANCE" | "BYBIT" | "OKX" | "GATEIO";
  overrideKey?: string;
  disabled?: boolean;
}

export const useMarketData = ({
  symbol,
  interval,
  lookback = 360,
  publicSourceOverride,
  overrideKey,
  disabled = false,
}: Args) => {
  const connectionStatus = useExchangeTerminalStore((state) => state.connectionStatus);
  const selectedExchange = useExchangeTerminalStore((state) => state.selectedExchange);
  const selectedSource = useDataSourceManager((state) => state.selectedExchangeId);
  const setSelectedSource = useDataSourceManager((state) => state.setSelectedExchangeId);

  useEffect(() => {
    if (disabled) return;
    MarketDataRouter.mount();
    return () => {
      MarketDataRouter.unmount();
    };
  }, [disabled]);

  useEffect(() => {
    if (disabled) return;
    if (!overrideKey) return;
    MarketDataRouter.setPublicSourceOverride(overrideKey, publicSourceOverride ?? null);
    return () => {
      MarketDataRouter.setPublicSourceOverride(overrideKey, null);
    };
  }, [disabled, overrideKey, publicSourceOverride]);

  useEffect(() => {
    if (disabled) return;
    const lower = selectedExchange.toLowerCase();
    const normalized =
      lower === "binance"
        ? "BINANCE"
        : lower === "bybit"
          ? "BYBIT"
          : lower === "okx"
            ? "OKX"
            : lower === "gate.io" || lower === "gateio" || lower === "gate"
              ? "GATEIO"
              : null;
    if (!normalized) {
      if (selectedSource !== "AUTO") setSelectedSource("AUTO");
      return;
    }
    if (selectedSource !== normalized) setSelectedSource(normalized);
  }, [disabled, selectedExchange, selectedSource, setSelectedSource]);

  useEffect(() => {
    if (disabled) return;
    MarketDataRouter.setConnectionState(selectedExchange, connectionStatus);
  }, [disabled, selectedExchange, connectionStatus]);

  useEffect(() => {
    if (disabled) return;
    MarketDataRouter.subscribe(symbol, interval, lookback);
    return () => {
      MarketDataRouter.unsubscribe(symbol, interval);
    };
  }, [disabled, symbol, interval, lookback]);

  // ── Shallow-equality selector: prevents re-render when field values haven't changed ──
  // Without useShallow, the object literal `{}` is always a new reference and React
  // re-renders on every zustand state tick (staleTimer every 3s, every WS push, etc.).
  const store = MarketDataRouter.useStore(
    useShallow((state) => ({
      activeSource: state.activeSource,
      sourceChip: state.sourceChip,
      fallbackActive: state.fallbackActive,
      bannerMessage: state.bannerMessage,
      stale: state.stale,
      staleAgeSec: state.staleAgeSec,
      latencyMs: state.latencyMs,
      ticker: state.tickers[symbol]?.payload,
      candles: state.candles[`${symbol}:${interval}`]?.payload,
      orderbook: state.orderbook[symbol]?.payload,
      trades: state.trades[symbol]?.payload,
      derivatives: state.derivatives[symbol]?.payload,
    })),
  );

  return useMemo(
    () => ({
      ...store,
    }),
    [store],
  );
};

export const useMarketDataStatus = () =>
  MarketDataRouter.useStore(
    useShallow((state) => ({
      activeSource: state.activeSource,
      sourceChip: state.sourceChip,
      fallbackActive: state.fallbackActive,
      bannerMessage: state.bannerMessage,
      stale: state.stale,
      staleAgeSec: state.staleAgeSec,
      latencyMs: state.latencyMs,
    })),
  );

export const usePageSourceChip = () => {
  const status = useMarketDataStatus();
  const sourceName = status.activeSource === "FALLBACK_API" ? "Bitrium Labs API" : status.activeSource;
  return {
    labelText: "Source:",
    sourceName,
    fallbackActive: status.fallbackActive,
    stale: status.stale,
  };
};
