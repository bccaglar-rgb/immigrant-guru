import { useEffect, useMemo, useRef, useState } from "react";
import { deriveKeyLevels } from "../data/liveConsensusEngine";
import { buildBitriumIntelligenceSnapshot } from "../data/bitriumIntelligenceEngine";
import { useMarketData } from "./useMarketData";
import type {
  Coin,
  ConsensusInputConfig,
  DashboardSnapshot,
  FeedConfig,
  FlowScoringTuningConfig,
  FlowSignalInputsConfig,
  FlowSignalWeightsConfig,
  IndicatorsState,
  RiskChecksInputsConfig,
  ScoringMode,
  ScenarioConfig,
  TimeframeConfig,
} from "../types";

export const useMarketDashboard = (
  coin: Coin,
  timeframe: TimeframeConfig,
  feeds: FeedConfig,
  scenario: ScenarioConfig,
  indicators: IndicatorsState,
  consensusInputs: ConsensusInputConfig,
  scoringMode: ScoringMode,
  _selectedExchange: string,
  sourceOverride?: "FALLBACK_API" | "BINANCE" | "BYBIT" | "OKX" | "GATEIO",
  flowSignalInputs?: FlowSignalInputsConfig,
  flowSignalWeights?: FlowSignalWeightsConfig,
  riskChecksInputs?: RiskChecksInputsConfig,
  flowScoringTuning?: FlowScoringTuningConfig,
): DashboardSnapshot | null => {
  const symbol = `${coin}USDT`;
  const market = useMarketData({
    symbol,
    interval: timeframe.primary,
    lookback: timeframe.lookbackBars,
    publicSourceOverride: sourceOverride,
    overrideKey: "dashboard-main-source",
  });

  const [onChain, setOnChain] = useState<{
    exchangeNetflowUsd: number | null;
    exchangeInflowUsd: number | null;
    exchangeOutflowUsd: number | null;
    whaleTxCount: number | null;
    walletConcentrationPct: number | null;
    activeAddresses: number | null;
    nvtRatio: number | null;
    mvrvRatio: number | null;
    dormancyDays: number | null;
  } | null>(null);
  const [onChainFeedAlive, setOnChainFeedAlive] = useState(false);
  const onChainLastSeenRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    const load = async () => {
      try {
        const qs = new URLSearchParams({ symbol });
        const res = await fetch(`/api/market/onchain?${qs.toString()}`);
        if (!res.ok) {
          const stale = !onChainLastSeenRef.current || Date.now() - onChainLastSeenRef.current > 180_000;
          if (stale) setOnChainFeedAlive(false);
          return;
        }
        const body = (await res.json()) as {
          ok?: boolean;
          dataAvailable?: boolean;
          metrics?: {
            exchangeNetflowUsd?: number | null;
            exchangeInflowUsd?: number | null;
            exchangeOutflowUsd?: number | null;
            whaleTxCount?: number | null;
            walletConcentrationPct?: number | null;
            activeAddresses?: number | null;
            nvtRatio?: number | null;
            mvrvRatio?: number | null;
            dormancyDays?: number | null;
          };
        };
        if (cancelled) return;
        if (!body.ok) {
          const stale = !onChainLastSeenRef.current || Date.now() - onChainLastSeenRef.current > 180_000;
          if (stale) setOnChainFeedAlive(false);
          return;
        }
        setOnChainFeedAlive(true);
        onChainLastSeenRef.current = Date.now();
        if (!body.dataAvailable || !body.metrics) {
          setOnChain(null);
          return;
        }
        setOnChain({
          exchangeNetflowUsd: Number.isFinite(Number(body.metrics.exchangeNetflowUsd)) ? Number(body.metrics.exchangeNetflowUsd) : null,
          exchangeInflowUsd: Number.isFinite(Number(body.metrics.exchangeInflowUsd)) ? Number(body.metrics.exchangeInflowUsd) : null,
          exchangeOutflowUsd: Number.isFinite(Number(body.metrics.exchangeOutflowUsd)) ? Number(body.metrics.exchangeOutflowUsd) : null,
          whaleTxCount: Number.isFinite(Number(body.metrics.whaleTxCount)) ? Number(body.metrics.whaleTxCount) : null,
          walletConcentrationPct: Number.isFinite(Number(body.metrics.walletConcentrationPct)) ? Number(body.metrics.walletConcentrationPct) : null,
          activeAddresses: Number.isFinite(Number(body.metrics.activeAddresses)) ? Number(body.metrics.activeAddresses) : null,
          nvtRatio: Number.isFinite(Number(body.metrics.nvtRatio)) ? Number(body.metrics.nvtRatio) : null,
          mvrvRatio: Number.isFinite(Number(body.metrics.mvrvRatio)) ? Number(body.metrics.mvrvRatio) : null,
          dormancyDays: Number.isFinite(Number(body.metrics.dormancyDays)) ? Number(body.metrics.dormancyDays) : null,
        });
      } catch {
        const stale = !onChainLastSeenRef.current || Date.now() - onChainLastSeenRef.current > 180_000;
        if (stale) setOnChainFeedAlive(false);
        // keep previous snapshot on transient failure
      }
    };
    void load();
    timer = window.setInterval(() => {
      void load();
    }, 60_000);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearInterval(timer);
    };
  }, [symbol]);

  const liveState = useMemo(() => {
    const seenAt = Date.now() - market.staleAgeSec * 1000;
    const hasRawFeed =
      Boolean(market.candles?.length) ||
      Boolean(market.orderbook) ||
      Boolean(market.trades) ||
      Boolean(market.derivatives);
    const hasOnChain =
      !!onChain &&
      (onChain.exchangeNetflowUsd !== null ||
        onChain.exchangeInflowUsd !== null ||
        onChain.exchangeOutflowUsd !== null ||
        onChain.whaleTxCount !== null ||
        onChain.walletConcentrationPct !== null ||
        onChain.activeAddresses !== null ||
        onChain.nvtRatio !== null ||
        onChain.mvrvRatio !== null ||
        onChain.dormancyDays !== null);
    const hasOnChainFeed = hasOnChain || onChainFeedAlive || hasRawFeed;
    return {
      ohlcv: market.candles,
      orderbook: market.orderbook,
      trades: market.trades,
      derivatives: market.derivatives,
      onchain: onChain ?? undefined,
      latencyMs: market.latencyMs ?? 120,
      feedLatencyMs: market.latencyMs ?? 0,
      uiLatencyMs: undefined,
      lastSeen: {
        ...(market.candles ? { priceOhlcv: seenAt } : {}),
        ...(market.orderbook ? { orderbook: seenAt } : {}),
        ...(market.trades ? { trades: seenAt } : {}),
        ...(market.derivatives?.fundingRate !== null ? { fundingRate: seenAt } : {}),
        ...(market.derivatives?.oiValue !== null ? { openInterest: seenAt } : {}),
        ...(hasRawFeed ? { rawFeeds: seenAt } : {}),
        ...(hasOnChainFeed ? { netFlow: seenAt } : {}),
      },
    };
  }, [
    market.candles,
    market.derivatives,
    market.orderbook,
    market.staleAgeSec,
    market.trades,
    market.latencyMs,
    onChain,
    onChainFeedAlive,
  ]);

  const mergedState = useMemo(() => {
    const snapshot = buildBitriumIntelligenceSnapshot({
      live: liveState,
      feeds,
      scenario,
      indicators,
      consensusInputs,
      scoringMode,
      flowSignalInputs,
      flowSignalWeights,
      riskChecksInputs,
      flowScoringTuning,
    });
    if (!snapshot) return null;
    return {
      ...snapshot,
      ohlcv: liveState.ohlcv ?? [],
      keyLevels: liveState.ohlcv ? deriveKeyLevels(liveState.ohlcv) : [],
    };
  }, [consensusInputs, feeds, flowSignalInputs, flowSignalWeights, indicators, liveState, riskChecksInputs, scenario, scoringMode]);

  return mergedState;
};
