import type { Express } from "express";
import { buildBitriumIntelligenceSnapshot } from "../../../src/data/bitriumIntelligenceEngine.ts";
import { deriveKeyLevels } from "../../../src/data/liveConsensusEngine.ts";
import { computeBalancedConsensus } from "../../../src/data/balancedConsensus.ts";
import { computeCapitalGuardConsensus } from "../../../src/data/capitalGuardConsensus.ts";
import { getConsensusBucketLabel, isTradeIdeaEligibleBucket } from "../../../src/data/consensusBuckets.ts";
import { computeExtremeConsensus } from "../../../src/data/extremeConsensus.ts";
import { computeVelocityConsensus } from "../../../src/data/velocityConsensus.ts";
import { normalizeScoringMode, SCORING_MODES, type ScoringMode } from "../services/scoringMode.ts";
import type { AdminProviderStore } from "../services/adminProviderStore.ts";
import type { BinanceFuturesHub } from "../services/binanceFuturesHub.ts";
import type { ExchangeMarketHub } from "../services/marketHub/index.ts";
import type { SystemScannerService } from "../services/systemScannerService.ts";
import type { CoinUniverseEngine } from "../services/coinUniverseEngine.ts";
import { computeEnhancedScore } from "../services/coinScoring.ts";

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };
type ExchangeName = "Binance" | "Bybit" | "OKX" | "Gate.io";
type Interval = "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d" | "1w";
type SourceMode = "exchange" | "fallback";

const ENGINE_FEEDS = {
  priceOhlcv: true,
  orderbook: true,
  trades: true,
  rawFeeds: false,
  openInterest: true,
  fundingRate: true,
  netFlow: false,
};

const ENGINE_CONSENSUS_INPUTS = {
  tradeValidity: true,
  bias: true,
  intent: true,
  urgency: true,
  slippage: true,
  entryTiming: true,
  riskGate: true,
  marketStress: true,
  modelAgreement: true,
};

const ENGINE_SCENARIO_BY_HORIZON = {
  SCALP: { horizon: "SCALP", riskMode: "NORMAL", breakoutOnly: false },
  INTRADAY: { horizon: "INTRADAY", riskMode: "NORMAL", breakoutOnly: false },
  SWING: { horizon: "SWING", riskMode: "NORMAL", breakoutOnly: false },
} as const;

const enabledIndicator = { enabled: true, settings: {} };

const ENGINE_INDICATORS = {
  masterEnabled: true,
  groups: {
    trend: { enabled: true },
    momentum: { enabled: true },
    volatility: { enabled: true },
    volumeFlow: { enabled: true },
    structureHelpers: { enabled: true },
  },
  indicators: {
    rsi: enabledIndicator,
    macd: enabledIndicator,
    adx: enabledIndicator,
    bbands: enabledIndicator,
    supertrend: enabledIndicator,
    ichimoku: enabledIndicator,
    divergence: enabledIndicator,
  },
};

type BitriumSnapshot = NonNullable<ReturnType<typeof buildBitriumIntelligenceSnapshot>>;

type ModeBreakdown = {
  raw: number;
  base: number;
  final: number;
  penaltyModel: "SUBTRACT" | "MULTIPLY";
  penaltyApplied: number;
  penaltyRate: number;
  edgeAdj: number;
  riskAdj: number;
  gatingFlags: string[];
  decision: "TRADE" | "WATCH" | "NO_TRADE";
};

type DecisionTraceStage = "PASS" | "BLOCKED" | "GATED" | "FILTERED";

type ModeDecisionTrace = {
  stage: DecisionTraceStage;
  reasons: string[];
  capMultiplier: number;
  dominantReducer: "tradeability" | "reliability" | "penalty" | "cap";
  coreAlpha: number;
  tradeability: number;
  reliability: number;
  penaltyFactor: number;
  finalScore: number;
  confidence: number;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const normalizeEpochMs = (value: unknown): number | null => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Candle time often arrives as seconds.
  return n < 1_000_000_000_000 ? Math.round(n * 1000) : Math.round(n);
};

const collectFeedTimestamps = (live: Record<string, unknown>): { primary: number[]; candle: number[] } => {
  const primary: number[] = [];
  const candle: number[] = [];
  const directKeys = ["feedTs", "feedTimestamp", "sourceTs", "exchangeTs", "lastEventTs"];
  for (const key of directKeys) {
    const ts = normalizeEpochMs((live as Record<string, unknown>)[key]);
    if (ts) primary.push(ts);
  }
  const ohlcv = Array.isArray(live.ohlcv) ? live.ohlcv : [];
  const lastCandle = ohlcv.length ? (ohlcv[ohlcv.length - 1] as Record<string, unknown>) : null;
  const candleTs = normalizeEpochMs(lastCandle?.time);
  if (candleTs) candle.push(candleTs);

  const recentTrades = Array.isArray(live.recentTrades) ? live.recentTrades : [];
  for (const trade of recentTrades.slice(-10)) {
    const ts = normalizeEpochMs((trade as Record<string, unknown>).ts);
    if (ts) primary.push(ts);
  }
  return { primary, candle };
};

const inferFeedLatencyMs = (live: Record<string, unknown>, nowMs: number): number => {
  const candidates = collectFeedTimestamps(live);
  if (candidates.primary.length) {
    const freshestTs = Math.max(...candidates.primary);
    return clamp(nowMs - freshestTs, 0, 60_000);
  }
  // Candle timestamps alone are not reliable execution-latency signal
  // on higher timeframes (e.g. 15m/1h). Avoid false penalty collapse.
  if (candidates.candle.length) {
    const freshestCandleTs = Math.max(...candidates.candle);
    const diff = Math.max(0, nowMs - freshestCandleTs);
    return diff <= 5_000 ? diff : 0;
  }
  return 0;
};

const inferFreshestFeedTimestampMs = (live: Record<string, unknown>, nowMs: number): number => {
  const candidates = collectFeedTimestamps(live);
  if (candidates.primary.length) return Math.max(...candidates.primary);
  return nowMs;
};

const nearestKeyLevelDistancePct = (
  close: number,
  keyLevels: Array<{ price?: number }>,
): number => {
  if (!Number.isFinite(close) || close <= 0 || !Array.isArray(keyLevels) || !keyLevels.length) return Infinity;
  let nearest = Infinity;
  for (const level of keyLevels) {
    const price = Number(level?.price);
    if (!Number.isFinite(price) || price <= 0) continue;
    const distancePct = Math.abs((price - close) / close) * 100;
    if (distancePct < nearest) nearest = distancePct;
  }
  return nearest;
};

const supportResistanceBoost = (distancePct: number): number => {
  if (!Number.isFinite(distancePct)) return 0;
  if (distancePct <= 0.15) return 14;
  if (distancePct <= 0.35) return 10;
  if (distancePct <= 0.7) return 6;
  if (distancePct <= 1.2) return 3;
  return 0;
};

const snapshotTile = (snapshot: BitriumSnapshot, key: string) => snapshot.tiles.find((tile) => tile.key === key);

const snapshotTileState = (snapshot: BitriumSnapshot, key: string, fallback = "UNKNOWN"): string =>
  snapshotTile(snapshot, key)?.state ?? fallback;

const snapshotTileRaw = (snapshot: BitriumSnapshot, key: string): string | null => {
  const tile = snapshotTile(snapshot, key);
  if (!tile) return null;
  if (typeof tile.rawValue === "string" && tile.rawValue.trim()) return tile.rawValue.trim();
  if (typeof tile.value === "number" && Number.isFinite(tile.value)) return String(tile.value);
  return null;
};

const parsePercentFromRaw = (raw: string | null): number | null => {
  if (!raw) return null;
  const matched = raw.match(/-?\d+(?:\.\d+)?/);
  if (!matched) return null;
  const numeric = Number(matched[0]);
  if (!Number.isFinite(numeric)) return null;
  return numeric;
};

const mapRegime = (value: string): "TREND" | "RANGE" | "MIXED" | "UNKNOWN" => {
  if (value === "TREND") return "TREND";
  if (value === "RANGE") return "RANGE";
  if (value === "CHOP" || value === "MIXED") return "MIXED";
  return "UNKNOWN";
};

const mapTrendStrength = (value: string): "LOW" | "MID" | "HIGH" | "UNKNOWN" => {
  if (value === "WEAK" || value === "LOW") return "LOW";
  if (value === "MID") return "MID";
  if (value === "STRONG" || value === "HIGH") return "HIGH";
  return "UNKNOWN";
};

const mapVwapPosition = (value: string): "ABOVE" | "BELOW" | "AT" | "UNKNOWN" => {
  if (value === "ABOVE") return "ABOVE";
  if (value === "BELOW") return "BELOW";
  if (value === "AROUND" || value === "AT") return "AT";
  return "UNKNOWN";
};

const mapStructureAge = (value: string): "EARLY" | "MATURE" | "UNKNOWN" => {
  if (value === "NEW" || value === "DEVELOPING" || value === "EARLY") return "EARLY";
  if (value === "MATURE") return "MATURE";
  return "UNKNOWN";
};

const mapMarketSpeed = (value: string): "SLOW" | "NORMAL" | "FAST" | "UNKNOWN" => {
  if (value === "SLOW") return "SLOW";
  if (value === "NORMAL") return "NORMAL";
  if (value === "FAST" || value === "VIOLENT") return "FAST";
  return "UNKNOWN";
};

const mapAtrRegime = (value: string): "LOW" | "MID" | "HIGH" | "UNKNOWN" => {
  if (value === "LOW") return "LOW";
  if (value === "NORMAL" || value === "MID") return "MID";
  if (value === "HIGH") return "HIGH";
  return "UNKNOWN";
};

const mapTriRisk = (value: string): "LOW" | "MID" | "HIGH" | "UNKNOWN" => {
  if (value === "LOW") return "LOW";
  if (value === "MID" || value === "MED" || value === "BUILDING") return "MID";
  if (value === "HIGH") return "HIGH";
  return "UNKNOWN";
};

const mapSpreadRegime = (value: string): "TIGHT" | "MID" | "WIDE" | "UNKNOWN" => {
  if (value === "TIGHT") return "TIGHT";
  if (value === "NORMAL" || value === "MID") return "MID";
  if (value === "WIDE") return "WIDE";
  return "UNKNOWN";
};

const mapDepthQuality = (value: string): "GOOD" | "MID" | "POOR" | "UNKNOWN" => {
  if (value === "GOOD") return "GOOD";
  if (value === "OK" || value === "MID") return "MID";
  if (value === "POOR") return "POOR";
  return "UNKNOWN";
};

const mapLiquidityDensity = (value: string): "LOW" | "MID" | "HIGH" | "UNKNOWN" => {
  if (value === "LOW") return "LOW";
  if (value === "MID") return "MID";
  if (value === "HIGH") return "HIGH";
  return "UNKNOWN";
};

const mapSpoofRisk = (value: string): "LOW" | "MID" | "HIGH" | "UNKNOWN" => {
  if (value === "STABLE" || value === "LOW") return "LOW";
  if (value === "SHIFTING" || value === "MID") return "MID";
  if (value === "SPOOF_RISK" || value === "HIGH") return "HIGH";
  return "UNKNOWN";
};

const mapEntryWindow = (value: string): "OPEN" | "CLOSED" | "UNKNOWN" => {
  if (value === "OPEN" || value === "NARROW") return "OPEN";
  if (value === "CLOSED") return "CLOSED";
  return "UNKNOWN";
};

const mapSlippageLevel = (value: string): "LOW" | "MED" | "HIGH" | "UNKNOWN" => {
  if (value === "LOW") return "LOW";
  if (value === "MED" || value === "MID") return "MED";
  if (value === "HIGH") return "HIGH";
  return "UNKNOWN";
};

const mapFundingBiasVelocity = (value: string): "BULLISH" | "BEARISH" | "NEUTRAL" | "EXTREME" => {
  if (value === "CROWDED_LONG") return "BULLISH";
  if (value === "CROWDED_SHORT") return "BEARISH";
  if (value === "EXTREME" || value === "EXTREME_LONG" || value === "EXTREME_SHORT") return "EXTREME";
  if (value === "BULLISH") return "BULLISH";
  if (value === "BEARISH") return "BEARISH";
  return "NEUTRAL";
};

const mapLiquidationPoolBias = (value: string): "UP" | "DOWN" | "MIXED" | "UNKNOWN" => {
  if (value === "ABOVE") return "UP";
  if (value === "BELOW") return "DOWN";
  if (value === "BOTH" || value === "MIXED") return "MIXED";
  return "UNKNOWN";
};

const mapMacroTrend = (value: string): "UP" | "DOWN" | "FLAT" | "UNKNOWN" => {
  if (value === "UP" || value === "BULL" || value === "RISK_ON") return "UP";
  if (value === "DOWN" || value === "BEAR" || value === "RISK_OFF") return "DOWN";
  if (value === "FLAT" || value === "NEUTRAL") return "FLAT";
  return "UNKNOWN";
};

const mapRsiState = (value: string): "OVERSOLD" | "OVERBOUGHT" | "NEUTRAL" | "UNKNOWN" => {
  if (value === "OVERSOLD") return "OVERSOLD";
  if (value === "OVERBOUGHT") return "OVERBOUGHT";
  if (value === "NEUTRAL") return "NEUTRAL";
  return "UNKNOWN";
};

const mapOrderbookImbalance = (value: string): "BUY" | "SELL" | "NEUTRAL" => {
  if (value === "BUY") return "BUY";
  if (value === "SELL") return "SELL";
  return "NEUTRAL";
};

const mapBinaryToggle = (value: string): "ON" | "OFF" => (value === "ON" ? "ON" : "OFF");

const resolveDirectionFromSnapshot = (snapshot: BitriumSnapshot): "LONG" | "SHORT" => {
  const panel = snapshot.aiPanel;
  let longVotes = 0;
  let shortVotes = 0;
  const vote = (dir: "LONG" | "SHORT", weight: number) => {
    if (dir === "LONG") longVotes += weight;
    else shortVotes += weight;
  };

  if (panel.bias === "LONG" || panel.bias === "SHORT") vote(panel.bias, 3);

  const trendDirection = snapshotTileState(snapshot, "trend-direction", "NEUTRAL");
  if (trendDirection === "UP") vote("LONG", 2);
  if (trendDirection === "DOWN") vote("SHORT", 2);

  const ema = snapshotTileState(snapshot, "ema-alignment", "UNKNOWN");
  if (ema === "BULL") vote("LONG", 1);
  if (ema === "BEAR") vote("SHORT", 1);

  const vwap = snapshotTileState(snapshot, "vwap-position", "UNKNOWN");
  if (vwap === "ABOVE") vote("LONG", 1);
  if (vwap === "BELOW") vote("SHORT", 1);

  const obImbalance = snapshotTileState(snapshot, "orderbook-imbalance", "NEUTRAL");
  if (obImbalance === "BUY") vote("LONG", 1);
  if (obImbalance === "SELL") vote("SHORT", 1);

  const fundingBias = snapshotTileState(snapshot, "funding-bias", "NEUTRAL");
  if (fundingBias === "BULLISH" || fundingBias === "CROWDED_SHORT") vote("LONG", 1);
  if (fundingBias === "BEARISH" || fundingBias === "CROWDED_LONG") vote("SHORT", 1);

  if (shortVotes > longVotes) return "SHORT";
  if (longVotes > shortVotes) return "LONG";
  return trendDirection === "DOWN" ? "SHORT" : "LONG";
};

const estimateExtremeFillFromMicro = (
  spreadRegime: "TIGHT" | "MID" | "WIDE" | "UNKNOWN",
  depthQuality: "GOOD" | "MID" | "POOR" | "UNKNOWN",
  liquidityDensity: "LOW" | "MID" | "HIGH" | "UNKNOWN",
  slippageLevel: "LOW" | "MED" | "HIGH" | "UNKNOWN",
): number => {
  let score = 0.5;
  score += spreadRegime === "TIGHT" ? 0.16 : spreadRegime === "MID" ? 0.04 : spreadRegime === "WIDE" ? -0.14 : -0.02;
  score += depthQuality === "GOOD" ? 0.15 : depthQuality === "MID" ? 0.03 : depthQuality === "POOR" ? -0.16 : -0.03;
  score += liquidityDensity === "HIGH" ? 0.11 : liquidityDensity === "MID" ? 0.03 : liquidityDensity === "LOW" ? -0.1 : -0.02;
  score += slippageLevel === "LOW" ? 0.09 : slippageLevel === "MED" ? 0.01 : slippageLevel === "HIGH" ? -0.12 : -0.03;
  return clamp(score, 0.18, 0.9);
};

const mapSpotVsDerivativesPressure = (
  value: string,
): "SPOT_DOM" | "DERIV_DOM" | "BALANCED" => {
  if (value === "DERIV_LED" || value === "DERIV_DOM") return "DERIV_DOM";
  if (value === "SPOT_LED" || value === "SPOT_DOM") return "SPOT_DOM";
  return "BALANCED";
};

const mapExchangeFlow = (value: string): "INFLOW" | "OUTFLOW" | "NEUTRAL" => {
  if (value === "INFLOW_DOMINANT" || value === "INFLOW") return "INFLOW";
  if (value === "OUTFLOW_DOMINANT" || value === "OUTFLOW") return "OUTFLOW";
  return "NEUTRAL";
};

const mapRelativeStrength = (value: string): "STRONG" | "WEAK" | "NEUTRAL" => {
  if (value === "STRONG") return "STRONG";
  if (value === "WEAK") return "WEAK";
  return "NEUTRAL";
};

const inferWhaleActivity = (
  whaleState: string,
  exchangeFlow: "INFLOW" | "OUTFLOW" | "NEUTRAL",
  orderbookImbalance: "BUY" | "SELL" | "NEUTRAL",
): "ACCUMULATION" | "DISTRIBUTION" | "NEUTRAL" => {
  const activeWhale = whaleState === "VERY_HIGH" || whaleState === "HIGH" || whaleState === "NORMAL";
  if (!activeWhale) return "NEUTRAL";
  if (exchangeFlow === "OUTFLOW" || orderbookImbalance === "BUY") return "ACCUMULATION";
  if (exchangeFlow === "INFLOW" || orderbookImbalance === "SELL") return "DISTRIBUTION";
  return "NEUTRAL";
};

const mapOiChangeStrength = (value: string): "LOW" | "MID" | "HIGH" => {
  if (value === "UP" || value === "DOWN" || value === "HIGH") return "HIGH";
  if (value === "MID") return "MID";
  return "LOW";
};

const mapFeedHealthStatus = (healthy: boolean | undefined, staleFeed: boolean): "healthy" | "degraded" | "down" => {
  if (healthy === true) return "healthy";
  if (healthy === false) return staleFeed ? "down" : "degraded";
  return "degraded";
};

const buildConsensusDataHealth = (snapshot: BitriumSnapshot) => {
  const health = snapshot.dataHealth;
  const sources = health.feedSources ?? {};
  return {
    staleFeed: Boolean(health.staleFeed),
    missingFields: Number.isFinite(health.missingFields) ? Number(health.missingFields) : 0,
    latencyMs: Number.isFinite(health.latencyMs) ? Number(health.latencyMs) : 0,
    feeds: {
      ohlcv: mapFeedHealthStatus(sources.priceOhlcv?.healthy, Boolean(health.staleFeed)),
      orderbook: mapFeedHealthStatus(sources.orderbook?.healthy, Boolean(health.staleFeed)),
      oi: mapFeedHealthStatus(sources.openInterest?.healthy, Boolean(health.staleFeed)),
      funding: mapFeedHealthStatus(sources.fundingRate?.healthy, Boolean(health.staleFeed)),
      netflow: mapFeedHealthStatus(sources.netFlow?.healthy, Boolean(health.staleFeed)),
      trades: mapFeedHealthStatus(sources.trades?.healthy, Boolean(health.staleFeed)),
    },
  };
};

const makeModeBreakdown = (
  mode: ScoringMode,
  snapshot: BitriumSnapshot,
  breakoutOnly: boolean,
): ModeBreakdown => {
  const panel = snapshot.aiPanel;
  const dataHealth = buildConsensusDataHealth(snapshot);
  const regime = mapRegime(snapshotTileState(snapshot, "market-regime"));
  const trendStrength = mapTrendStrength(snapshotTileState(snapshot, "trend-strength"));
  const emaAlignment = (() => {
    const state = snapshotTileState(snapshot, "ema-alignment");
    return state === "BULL" || state === "BEAR" || state === "MIXED" ? state : "UNKNOWN";
  })();
  const vwapPosition = mapVwapPosition(snapshotTileState(snapshot, "vwap-position"));
  const structureAge = mapStructureAge(snapshotTileState(snapshot, "structure-age"));
  const marketSpeed = mapMarketSpeed(snapshotTileState(snapshot, "market-speed"));
  const atrRegime = mapAtrRegime(snapshotTileState(snapshot, "atr-regime"));
  const compression = (() => {
    const state = snapshotTileState(snapshot, "compression");
    return state === "ON" || state === "OFF" ? state : "UNKNOWN";
  })();
  const breakoutRisk = mapTriRisk(snapshotTileState(snapshot, "breakout-risk"));
  const fakeBreakoutProb = mapTriRisk(snapshotTileState(snapshot, "fake-breakout-prob"));
  const suddenMoveRisk = mapTriRisk(snapshotTileState(snapshot, "sudden-move-risk"));
  const volumeSpike = (() => {
    const state = snapshotTileState(snapshot, "volume-spike");
    return state === "ON" || state === "OFF" ? state : "UNKNOWN";
  })();
  const impulseReadiness = mapTriRisk(snapshotTileState(snapshot, "impulse-readiness"));
  const liquidityDensity = mapLiquidityDensity(snapshotTileState(snapshot, "liquidity-density"));
  const spoofRisk = mapSpoofRisk(snapshotTileState(snapshot, "orderbook-stability"));
  const spreadRegime = mapSpreadRegime(snapshotTileState(snapshot, "spread-regime"));
  const depthQuality = mapDepthQuality(snapshotTileState(snapshot, "depth-quality"));
  const crowdingRisk = mapTriRisk(String(panel.crowdingRisk ?? "UNKNOWN"));
  const cascadeRisk = mapTriRisk(snapshotTileState(snapshot, "cascade-risk"));
  const stressLevel = mapTriRisk(snapshotTileState(snapshot, "market-stress-level"));
  const entryWindow = mapEntryWindow(snapshotTileState(snapshot, "entry-timing-window"));
  const slippageLevel = mapSlippageLevel(snapshotTileState(snapshot, "slippage-risk"));
  const orderbookImbalance = mapOrderbookImbalance(snapshotTileState(snapshot, "orderbook-imbalance"));
  const oiChangeStrength = mapOiChangeStrength(snapshotTileState(snapshot, "oi-change"));
  const fundingStateRaw = snapshotTileState(snapshot, "funding-bias");
  const fundingBias = mapFundingBiasVelocity(fundingStateRaw);
  const fundingRatePct = parsePercentFromRaw(snapshotTileRaw(snapshot, "funding-bias"));
  const oiChangePct = parsePercentFromRaw(snapshotTileRaw(snapshot, "oi-change"));
  const spotVsDerivativesPressure = mapSpotVsDerivativesPressure(snapshotTileState(snapshot, "spot-vs-derivatives-pressure"));
  const exchangeFlow = mapExchangeFlow(snapshotTileState(snapshot, "exchange-inflow-outflow"));
  const relativeStrength = mapRelativeStrength(snapshotTileState(snapshot, "relative-strength-vs-market"));
  const liquidationPoolBias = mapLiquidationPoolBias(snapshotTileState(snapshot, "liquidity-cluster"));
  const spotVolumeSupport =
    spotVsDerivativesPressure === "SPOT_DOM"
      ? "STRONG"
      : spotVsDerivativesPressure === "DERIV_DOM"
        ? "WEAK"
        : "UNKNOWN";
  const dxyTrend = mapMacroTrend(snapshotTileState(snapshot, "dxy-trend"));
  const nasdaqTrend = mapMacroTrend(snapshotTileState(snapshot, "nasdaq-trend"));
  const rsiState = mapRsiState(snapshotTileState(snapshot, "rsi-state"));
  const whaleActivity = inferWhaleActivity(
    snapshotTileState(snapshot, "whale-activity"),
    exchangeFlow,
    orderbookImbalance,
  );
  const conflictLevel = mapTriRisk(String(panel.conflictLevel ?? "UNKNOWN"));
  const asymmetry = (() => {
    const state = snapshotTileState(snapshot, "asymmetry-score");
    if (state === "REWARD_DOMINANT" || state === "RISK_DOMINANT") return state;
    return "UNKNOWN";
  })();
  const rrPotential = mapTriRisk(snapshotTileState(snapshot, "rr-potential"));
  const entryQuality = (() => {
    const state = snapshotTileState(snapshot, "entry-quality");
    if (state === "BAD" || state === "MID" || state === "GOOD") return state;
    if (state === "POOR" || state === "WEAK") return "BAD";
    if (state === "OK") return "MID";
    if (state === "STRONG") return "GOOD";
    return "UNKNOWN";
  })();

  const consensusCore = panel.consensusEngine;
  const commonFields = {
    structureScore: Number.isFinite(panel.confidenceDrivers.structure) ? panel.confidenceDrivers.structure : 50,
    liquidityScore: Number.isFinite(panel.confidenceDrivers.liquidity) ? panel.confidenceDrivers.liquidity : 50,
    positioningScore: Number.isFinite(panel.confidenceDrivers.positioning) ? panel.confidenceDrivers.positioning : 50,
    executionScore: Number.isFinite(panel.confidenceDrivers.execution) ? panel.confidenceDrivers.execution : 50,
    pFill: clamp(consensusCore.pFill, 0, 1),
    capacity: clamp(consensusCore.capacityFactor, 0, 1),
    slippageLevel,
    eNetR: Number.isFinite(consensusCore.edgeNetR) ? consensusCore.edgeNetR : 0,
    riskAdjEdgeR: Number.isFinite(consensusCore.riskAdjustedEdgeR) ? consensusCore.riskAdjustedEdgeR : 0,
    pWin: clamp(consensusCore.pWin, 0, 1),
    pStop: clamp(consensusCore.pStop, 0, 1),
    expectedRR: Number.isFinite(consensusCore.expectedRR) ? consensusCore.expectedRR : 0,
    costR: Number.isFinite(consensusCore.costR) ? consensusCore.costR : 0,
    asymmetry,
    rrPotential,
    entryQuality,
    alignedCount: Number.isFinite(panel.modelAgreement.aligned) ? panel.modelAgreement.aligned : 0,
    totalModels: Number.isFinite(panel.modelAgreement.totalModels) ? panel.modelAgreement.totalModels : 1,
    conflictLevel,
    dataHealth,
  };

  if (mode === "FLOW") {
    const consensusFill = clamp(consensusCore.pFill, 0, 1);
    const microFill = estimateExtremeFillFromMicro(spreadRegime, depthQuality, liquidityDensity, slippageLevel);
    // Extreme mode is momentum/opportunity-seeking; execution confidence is blended with live microstructure.
    const extremePFill = clamp((consensusFill * 0.45) + (microFill * 0.55), 0, 1);
    const out = computeExtremeConsensus({
      liquidityDensity: liquidityDensity === "UNKNOWN" ? "MID" : liquidityDensity,
      orderbookImbalance,
      depthQuality: depthQuality === "UNKNOWN" ? "MID" : depthQuality,
      spreadRegime: spreadRegime === "UNKNOWN" ? "MID" : spreadRegime,
      spoofRisk: spoofRisk === "UNKNOWN" ? "MID" : spoofRisk,
      oiChangeStrength,
      fundingBias,
      spotVsDerivativesPressure,
      compression: mapBinaryToggle(compression),
      volumeSpike: mapBinaryToggle(volumeSpike),
      marketSpeed: marketSpeed === "UNKNOWN" ? "NORMAL" : marketSpeed,
      suddenMoveRisk: suddenMoveRisk === "UNKNOWN" ? "MID" : suddenMoveRisk,
      cascadeRisk: cascadeRisk === "UNKNOWN" ? "MID" : cascadeRisk,
      pFill: extremePFill,
      slippageLevel: slippageLevel === "UNKNOWN" ? "MED" : slippageLevel,
      whaleActivity,
      exchangeFlow,
      relativeStrength,
      asymmetryScore: asymmetry === "UNKNOWN" ? "NEUTRAL" : asymmetry,
      fundingRate1hPct: fundingRatePct,
      fundingRate8hPct: fundingRatePct,
      oiChange5mPct: oiChangePct,
      oiChange1hPct: oiChangePct,
      liquidationPoolBias,
      spotVolumeSupport,
      dxyTrend,
      nasdaqTrend,
      atrRegime,
      rsiState,
    });
    const decision: ModeBreakdown["decision"] =
      out.phase === "TRADE" || out.phase === "SQUEEZE_EVENT"
        ? "TRADE"
        : out.phase === "WAIT" || out.phase === "SPECULATIVE"
          ? "WATCH"
          : "NO_TRADE";
    return {
      raw: out.extremeScore,
      base: out.extremeScore,
      final: out.extremeScore,
      penaltyModel: "SUBTRACT",
      penaltyApplied: 0,
      penaltyRate: 0,
      edgeAdj: Number.isFinite(consensusCore.edgeNetR) ? consensusCore.edgeNetR : 0,
      riskAdj: Number.isFinite(consensusCore.riskAdjustment) ? consensusCore.riskAdjustment : 0,
      gatingFlags: decision === "NO_TRADE" ? ["LOW_CONFIDENCE"] : [],
      decision,
    };
  }

  if (mode === "AGGRESSIVE") {
    const out = computeVelocityConsensus({
      ...commonFields,
      regime,
      trendStrength,
      emaAlignment,
      vwapPosition,
      marketSpeed,
      atrRegime,
      compression,
      breakoutRisk,
      fakeBreakoutProb,
      suddenMoveRisk,
      volumeSpike,
      impulseReadiness,
      liquidityDensity,
      spoofRisk,
      spreadRegime,
      depthQuality,
      crowdingRisk,
      cascadeRisk,
      stressLevel,
      entryWindow,
      breakoutOnly,
    });
    const gatingFlags = [
      ...(out.gates.risk === "BLOCK" ? ["RISK_BLOCK"] : []),
      ...(out.gates.entry === "BLOCK" ? ["ENTRY_BLOCK"] : []),
      ...(out.gates.fill === "BLOCK" ? ["FILL_BLOCK"] : []),
      ...(out.gates.data === "BLOCK" ? ["DATA_BLOCK"] : []),
    ];
    return {
      raw: out.baseScore,
      base: out.adjustedScore,
      final: out.finalScore,
      penaltyModel: "MULTIPLY",
      penaltyApplied: Math.max(0, out.adjustedScore - out.finalScore),
      penaltyRate: out.penaltyRate,
      edgeAdj: Number.isFinite(consensusCore.edgeNetR) ? consensusCore.edgeNetR : 0,
      riskAdj: Number.isFinite(consensusCore.riskAdjustment) ? consensusCore.riskAdjustment : 0,
      gatingFlags,
      decision: out.decision,
    };
  }

  if (mode === "BALANCED") {
    const out = computeBalancedConsensus({
      ...commonFields,
      regime,
      trendStrength,
      emaAlignment,
      vwapPosition,
      structureAge,
      marketSpeed,
      compression,
      spoofRisk,
      spreadRegime,
      depthQuality,
      crowdingRisk,
      cascadeRisk,
      stressLevel,
      entryWindow,
    });
    const gatingFlags = [
      ...(out.gates.safety === "BLOCK" ? ["SAFETY_BLOCK"] : []),
      ...(out.gates.data === "BLOCK" ? ["DATA_BLOCK"] : []),
    ];
    return {
      raw: out.baseScore,
      base: out.adjustedScore,
      final: out.finalScore,
      penaltyModel: "MULTIPLY",
      penaltyApplied: Math.max(0, out.adjustedScore - out.finalScore),
      penaltyRate: out.penaltyRate,
      edgeAdj: Number.isFinite(consensusCore.edgeNetR) ? consensusCore.edgeNetR : 0,
      riskAdj: Number.isFinite(consensusCore.riskAdjustment) ? consensusCore.riskAdjustment : 0,
      gatingFlags,
      decision: Math.round(out.finalScore) >= 65 && out.gates.data === "PASS" && out.gates.safety === "PASS" ? "TRADE" : Math.round(out.finalScore) >= 45 ? "WATCH" : "NO_TRADE",
    };
  }

  const out = computeCapitalGuardConsensus({
    ...commonFields,
    regime,
    trendStrength,
    emaAlignment,
    vwapPosition,
    structureAge,
    marketSpeed,
    compression,
    spoofRisk,
    spreadRegime,
    depthQuality,
    crowdingRisk,
    cascadeRisk,
    stressLevel,
    entryWindow,
  });
  const gatingFlags = [
    ...(out.gates.safety === "BLOCK" ? ["SAFETY_BLOCK"] : []),
    ...(out.gates.data === "BLOCK" ? ["DATA_BLOCK"] : []),
  ];
  return {
    raw: out.baseScore,
    base: out.adjustedScore,
    final: out.finalScore,
    penaltyModel: "MULTIPLY",
    penaltyApplied: Math.max(0, out.adjustedScore - out.finalScore),
    penaltyRate: out.penaltyRate,
    edgeAdj: Number.isFinite(consensusCore.edgeNetR) ? consensusCore.edgeNetR : 0,
    riskAdj: Number.isFinite(consensusCore.riskAdjustment) ? consensusCore.riskAdjustment : 0,
    gatingFlags,
    decision: Math.round(out.finalScore) >= 68 && out.gates.data === "PASS" && out.gates.safety === "PASS" ? "TRADE" : Math.round(out.finalScore) >= 48 ? "WATCH" : "NO_TRADE",
  };
};

const makeDecisionTrace = (
  breakdown: ModeBreakdown,
  confidence: number,
): ModeDecisionTrace => {
  const coreAlpha = clamp(Number(breakdown.raw) / 100, 0, 1);
  const base01 = clamp(Number(breakdown.base) / 100, 0, 1.2);
  const final01 = clamp(Number(breakdown.final) / 100, 0, 1);
  const tradeability = coreAlpha > 0 ? clamp(base01 / coreAlpha, 0, 1.2) : 1;
  const reliability = Number.isFinite(breakdown.riskAdj) ? clamp(breakdown.riskAdj, 0, 1.2) : 1;
  const penaltyFactor = clamp(1 - (Number.isFinite(breakdown.penaltyRate) ? breakdown.penaltyRate : 0), 0, 1);
  const capMultiplier = base01 > 0 ? clamp(final01 / base01, 0, 1.2) : 1;
  const reducers: Array<{ key: ModeDecisionTrace["dominantReducer"]; value: number }> = [
    { key: "tradeability", value: tradeability },
    { key: "reliability", value: reliability },
    { key: "penalty", value: penaltyFactor },
    { key: "cap", value: capMultiplier },
  ].sort((a, b) => a.value - b.value);
  const dominantReducer = reducers[0]?.key ?? "tradeability";
  const hasHard = breakdown.gatingFlags.some((flag) => flag === "DATA_BLOCK" || flag === "SAFETY_BLOCK");
  const hasGate = breakdown.gatingFlags.length > 0;
  let stage: DecisionTraceStage = "PASS";
  if (hasHard) stage = "BLOCKED";
  else if (hasGate || breakdown.decision === "NO_TRADE") stage = "GATED";
  else if (breakdown.decision === "WATCH") stage = "FILTERED";
  return {
    stage,
    reasons: breakdown.gatingFlags,
    capMultiplier: Number(capMultiplier.toFixed(4)),
    dominantReducer,
    coreAlpha: Number(coreAlpha.toFixed(4)),
    tradeability: Number(tradeability.toFixed(4)),
    reliability: Number(reliability.toFixed(4)),
    penaltyFactor: Number(penaltyFactor.toFixed(4)),
    finalScore: Number(final01.toFixed(4)),
    confidence: Number(clamp(confidence, 0, 1).toFixed(4)),
  };
};

interface IndicatorsMarketCoin {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  market_cap: number;
  price_change_percentage_24h_in_currency?: number;
  price_change_percentage_30d_in_currency?: number;
}

interface OnChainMetricsSnapshot {
  exchangeNetflowUsd: number | null;
  exchangeInflowUsd: number | null;
  exchangeOutflowUsd: number | null;
  whaleTxCount: number | null;
  walletConcentrationPct: number | null;
  activeAddresses: number | null;
  nvtRatio: number | null;
  mvrvRatio: number | null;
  dormancyDays: number | null;
}

const CG_BASE = "https://open-api-v4.coinglass.com";
const BINANCE_SPOT = "https://api.binance.com";
const BINANCE_FUTURES = "https://fapi.binance.com";
const BINANCE_FUTURES_BASES = [
  "https://fapi.binance.com",
  "https://fapi1.binance.com",
  "https://fapi2.binance.com",
  "https://fapi3.binance.com",
  "https://fapi4.binance.com",
];
const BYBIT_BASE = "https://api.bybit.com";
const OKX_BASE = "https://www.okx.com";
const GATE_FUTURES_BASE = "https://fx-api.gateio.ws/api/v4";
const CG_API_KEY = process.env.CG_API_KEY ?? "4f8430d3a7a14b44a16bd10f3a4dd61d";
const DEFAULT_EXCHANGE_CHAIN: ExchangeName[] = ["Binance", "Gate.io", "Bybit", "OKX"];
const ONCHAIN_CACHE_MS = 60_000;

let marketProviderStore: AdminProviderStore | undefined;
let marketBinanceFuturesHub: BinanceFuturesHub | undefined;
let marketExchangeHub: ExchangeMarketHub | undefined;
const onChainCache = new Map<string, { ts: number; providerName: string; metrics: OnChainMetricsSnapshot }>();
const LIVE_BUNDLE_CACHE_MAX = 800;
const LIVE_BUNDLE_EXCHANGE_TTL_MS = 1200;
const LIVE_BUNDLE_FALLBACK_TTL_MS = 2500;
const liveBundleCache = new Map<string, { ts: number; payload: unknown }>();
const liveBundleInFlight = new Map<string, Promise<unknown>>();
const exchangeLiveFailureStreak = new Map<string, { count: number; ts: number }>();
const LIQUIDATION_CACHE_MS = 20_000;
const exchangeComponentCache = new Map<string, { ts: number; payload: unknown }>();
const liquidationCache = new Map<string, { ts: number; value: number }>();

const setMarketProviderStore = (providerStore?: AdminProviderStore) => {
  marketProviderStore = providerStore;
};

const setMarketBinanceHub = (hub?: BinanceFuturesHub) => {
  marketBinanceFuturesHub = hub;
};

const setMarketExchangeHub = (hub?: ExchangeMarketHub) => {
  marketExchangeHub = hub;
};

const getCachedComponent = <T,>(key: string, ttlMs: number): T | null => {
  const cached = exchangeComponentCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.ts > ttlMs) return null;
  return cached.payload as T;
};

const setCachedComponent = (key: string, payload: unknown) => {
  exchangeComponentCache.set(key, { ts: Date.now(), payload });
  if (exchangeComponentCache.size <= 4000) return;
  const overflow = exchangeComponentCache.size - 4000;
  if (overflow <= 0) return;
  const keys = [...exchangeComponentCache.keys()];
  for (let i = 0; i < overflow; i += 1) {
    const oldKey = keys[i];
    if (!oldKey) continue;
    exchangeComponentCache.delete(oldKey);
  }
};

const fetchWithComponentCache = async <T,>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> => {
  const fresh = getCachedComponent<T>(key, ttlMs);
  if (fresh !== null) return fresh;
  try {
    const payload = await loader();
    setCachedComponent(key, payload);
    return payload;
  } catch (error) {
    const stale = getCachedComponent<T>(key, Math.max(ttlMs * 6, ttlMs + 10_000));
    if (stale !== null) return stale;
    throw error;
  }
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value.replace(/,/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return null;
};

const toEpochMs = (value: unknown): number | null => {
  const n = toNumber(value);
  if (n === null) return null;
  if (n > 1_000_000_000_000) return Math.floor(n);
  if (n > 1_000_000_000) return Math.floor(n * 1000);
  return null;
};

const toEpochSec = (value: unknown): number | null => {
  const ms = toEpochMs(value);
  if (ms !== null) return Math.floor(ms / 1000);
  const n = toNumber(value);
  if (n !== null && n > 0 && n < 1_000_000_000) return Math.floor(n);
  return null;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const asList = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  const rec = asRecord(value);
  if (!rec) return [];
  if (Array.isArray(rec.data)) return rec.data;
  if (Array.isArray(rec.list)) return rec.list;
  if (Array.isArray(rec.result)) return rec.result;
  const nested = asRecord(rec.result);
  if (nested && Array.isArray(nested.list)) return nested.list;
  return [];
};

const pickNumberFromRecord = (record: Record<string, unknown>, keys: string[]): number | null => {
  for (const key of keys) {
    const value = toNumber(record[key]);
    if (value !== null) return value;
  }
  return null;
};

const parseCandle = (input: {
  time: unknown;
  open: unknown;
  high: unknown;
  low: unknown;
  close: unknown;
  volume: unknown;
}): { time: number; open: number; high: number; low: number; close: number; volume: number } | null => {
  const time = toEpochSec(input.time);
  const open = toNumber(input.open);
  const high = toNumber(input.high);
  const low = toNumber(input.low);
  const close = toNumber(input.close);
  const volume = Math.abs(toNumber(input.volume) ?? 0);
  if (time === null || ![open, high, low, close].every((v) => v !== null && Number.isFinite(v))) return null;
  if (open! <= 0 || high! <= 0 || low! <= 0 || close! <= 0) return null;
  if (high! < Math.max(open!, close!) || low! > Math.min(open!, close!)) return null;
  return {
    time,
    open: open!,
    high: high!,
    low: low!,
    close: close!,
    volume: Number.isFinite(volume) ? volume : 0,
  };
};

const parseBinanceKlineRow = (
  row: unknown,
): { time: number; open: number; high: number; low: number; close: number; volume: number } | null => {
  if (Array.isArray(row)) {
    return parseCandle({
      time: row[0],
      open: row[1],
      high: row[2],
      low: row[3],
      close: row[4],
      volume: row[5],
    });
  }
  const rec = asRecord(row);
  if (!rec) return null;
  return parseCandle({
    time: rec.openTime ?? rec.t ?? rec.T ?? rec.time ?? rec.ts,
    open: rec.open ?? rec.o,
    high: rec.high ?? rec.h,
    low: rec.low ?? rec.l,
    close: rec.close ?? rec.c,
    volume: rec.volume ?? rec.v ?? rec.baseVolume,
  });
};

const parseBinanceBookRow = (row: unknown): [string, string] | null => {
  if (Array.isArray(row)) {
    const price = String(row[0] ?? "");
    const qty = String(row[1] ?? "");
    if (!price || !qty) return null;
    return [price, qty];
  }
  const rec = asRecord(row);
  if (!rec) return null;
  const price = String(rec.price ?? rec.p ?? rec[0] ?? "");
  const qty = String(rec.qty ?? rec.q ?? rec.amount ?? rec.size ?? rec[1] ?? "");
  if (!price || !qty) return null;
  return [price, qty];
};

const parseBinanceTradeRow = (
  row: unknown,
): { tsMs: number; price: number; qty: number; side: "BUY" | "SELL" } | null => {
  const rec = asRecord(row);
  if (!rec) return null;
  const tsMs = toEpochMs(rec.time ?? rec.T ?? rec.ts ?? rec.timestamp);
  const price = toNumber(rec.price ?? rec.p);
  const qty = Math.abs(toNumber(rec.qty ?? rec.q ?? rec.amount ?? rec.size) ?? 0);
  const makerRaw = rec.isBuyerMaker ?? rec.m;
  const sideRaw = String(rec.side ?? "").toLowerCase();
  if (tsMs === null || price === null || !Number.isFinite(price) || price <= 0 || !Number.isFinite(qty) || qty <= 0) {
    return null;
  }
  let side: "BUY" | "SELL" = "BUY";
  if (typeof makerRaw === "boolean") side = makerRaw ? "SELL" : "BUY";
  else if (sideRaw === "sell") side = "SELL";
  else if (sideRaw === "buy") side = "BUY";
  return { tsMs, price, qty, side };
};

const parseGateBookRow = (row: unknown): [string, string] | null => {
  if (!row) return null;
  if (Array.isArray(row)) {
    const price = String(row[0] ?? "");
    const size = String(row[1] ?? "");
    if (!price || !size) return null;
    return [price, size];
  }
  if (typeof row === "object") {
    const rec = row as Record<string, unknown>;
    const price = String(rec.p ?? rec.price ?? "");
    const size = String(rec.s ?? rec.size ?? rec.amount ?? "");
    if (!price || !size) return null;
    return [price, size];
  }
  return null;
};

const parseGateCandleRow = (row: unknown): { time: number; open: number; high: number; low: number; close: number; volume: number } | null => {
  if (!row) return null;
  if (Array.isArray(row)) {
    const variants = [
      parseCandle({
        time: row[0],
        open: row[5],
        high: row[3],
        low: row[4],
        close: row[2],
        volume: row[1],
      }),
      parseCandle({
        time: row[0],
        open: row[1],
        high: row[2],
        low: row[3],
        close: row[4],
        volume: row[5],
      }),
      parseCandle({
        time: row[0],
        open: row[1],
        high: row[3],
        low: row[4],
        close: row[2],
        volume: row[6] ?? row[5],
      }),
    ];
    return variants.find((item): item is NonNullable<typeof item> => Boolean(item)) ?? null;
  }
  const rec = asRecord(row);
  if (!rec) return null;
  return parseCandle({
    time: rec.t ?? rec.time ?? rec.ts ?? rec.timestamp ?? rec.create_time,
    open: rec.o ?? rec.open ?? rec.open_price,
    high: rec.h ?? rec.high ?? rec.high_price,
    low: rec.l ?? rec.low ?? rec.low_price,
    close: rec.c ?? rec.close ?? rec.last ?? rec.last_price,
    volume: rec.v ?? rec.volume ?? rec.vol ?? rec.amount ?? rec.sum ?? rec.base_volume,
  });
};

const parseGateTradeRow = (
  row: unknown,
): { tsMs: number; price: number; qty: number; side: "BUY" | "SELL" } | null => {
  const rec = asRecord(row);
  if (!rec) return null;
  const tsMs = toEpochMs(rec.create_time_ms ?? rec.create_time ?? rec.t ?? rec.ts ?? rec.time ?? rec.timestamp);
  const price = Number(rec.price ?? rec.px ?? rec.p ?? rec.last ?? 0);
  const sizeRaw = Number(rec.size ?? rec.amount ?? rec.qty ?? rec.volume ?? rec.contracts ?? 0);
  const sideRaw = String(rec.side ?? "").toLowerCase();
  const makerRaw = rec.isBuyerMaker ?? rec.m;
  if (!Number.isFinite(price) || price <= 0) return null;
  if (!Number.isFinite(sizeRaw) || sizeRaw === 0) return null;
  if (!Number.isFinite(tsMs ?? NaN) || (tsMs ?? 0) <= 0) return null;
  const side: "BUY" | "SELL" =
    sideRaw === "buy"
      ? "BUY"
      : sideRaw === "sell"
        ? "SELL"
        : typeof makerRaw === "boolean"
          ? makerRaw
            ? "SELL"
            : "BUY"
          : sizeRaw >= 0
            ? "BUY"
            : "SELL";
  return {
    tsMs: tsMs as number,
    price,
    qty: Math.abs(sizeRaw),
    side,
  };
};

const findLatestNumeric = (input: unknown, keys: string[]): number | null => {
  const queue: unknown[] = [input];
  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== "object") continue;
    if (Array.isArray(current)) {
      for (let i = current.length - 1; i >= 0; i -= 1) queue.push(current[i]);
      continue;
    }
    const rec = current as Record<string, unknown>;
    for (const key of keys) {
      const val = rec[key];
      const parsed = toNumber(val);
      if (parsed !== null) return parsed;
    }
    for (const val of Object.values(rec)) queue.push(val);
  }
  return null;
};

const fetchJson = async <T,>(url: string, headers?: Record<string, string>, timeoutMs = 9000): Promise<T> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        accept: "application/json",
        ...(headers ?? {}),
      },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
};

const fetchBinanceFuturesJson = async <T,>(path: string, timeoutMs = 9000): Promise<T> => {
  let lastError: unknown = null;
  for (const base of BINANCE_FUTURES_BASES) {
    try {
      return await fetchJson<T>(`${base}${path}`, undefined, timeoutMs);
    } catch (err) {
      lastError = err;
    }
  }
  throw (lastError instanceof Error ? lastError : new Error(`BINANCE_FUTURES_UNAVAILABLE:${path}`));
};

/**
 * Fetch klines with cascading fallback: Futures API → Spot API → data-api.binance.vision
 * Spot kline format is identical to futures — safe for chart display.
 */
const fetchBinanceKlinesFallback = async (symbol: string, interval: string, limit: number): Promise<unknown[]> => {
  // 1. Futures API (primary)
  try {
    const data = await fetchBinanceFuturesJson<unknown>(`/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`, 3000);
    if (Array.isArray(data) && data.length >= 10) return data;
  } catch { /* continue */ }
  // 2. Binance Spot API (same kline format, different rate limit pool)
  try {
    const spotData = await fetchJson<unknown>(
      `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
      undefined,
      5000,
    );
    if (Array.isArray(spotData) && spotData.length >= 10) return spotData;
  } catch { /* continue */ }
  // 3. data-api.binance.vision (public, no rate limit)
  try {
    const visionData = await fetchJson<unknown>(
      `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
      undefined,
      5000,
    );
    if (Array.isArray(visionData) && visionData.length >= 10) return visionData;
  } catch { /* all sources failed */ }
  return [];
};

const normalizeExchange = (input: string): ExchangeName => {
  const v = input.toLowerCase();
  if (v === "bybit") return "Bybit";
  if (v === "okx") return "OKX";
  if (v === "gate.io" || v === "gateio" || v === "gate") return "Gate.io";
  return "Binance";
};

const resolveExchangeFromQuery = async (queryValue: unknown): Promise<ExchangeName> => {
  const raw = String(queryValue ?? "").trim();
  if (raw) return normalizeExchange(raw);
  if (!marketProviderStore) return "Binance";
  try {
    const policy = await marketProviderStore.getFallbackPolicy();
    if (policy.defaultExchange) return policy.defaultExchange;
    if (policy.order.length) return policy.order[0];
  } catch {
    // use default below
  }
  return "Binance";
};

const appendSymbolParams = (path: string, symbol: string, baseAsset: string): string => {
  const trimmed = String(path ?? "").trim();
  if (!trimmed) return trimmed;
  const joiner = trimmed.includes("?") ? "&" : "?";
  return `${trimmed}${joiner}symbol=${encodeURIComponent(symbol)}&asset=${encodeURIComponent(baseAsset)}`;
};

const joinProviderUrl = (baseUrl: string, path: string) => {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const base = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
};

const buildSymbolPathCandidates = (baseAsset: string, symbol: string, seeds: string[]) =>
  seeds.flatMap((seed) => {
    const withSymbol = appendSymbolParams(seed, symbol, baseAsset);
    const withBase = appendSymbolParams(seed, `${baseAsset}USDT`, baseAsset);
    return [...new Set([withSymbol, withBase])];
  });

const metricKeys = {
  inflow: ["exchangeInflowUsd", "inflowUsd", "inflow", "exchangeInflow", "inflowVolumeUsd"],
  outflow: ["exchangeOutflowUsd", "outflowUsd", "outflow", "exchangeOutflow", "outflowVolumeUsd"],
  netflow: ["exchangeNetflowUsd", "netflowUsd", "netFlowUsd", "netflow", "netFlow"],
  whale: ["whaleTxCount", "whaleTransactions", "largeTxCount", "largeTransactions"],
  walletDistribution: ["walletConcentrationPct", "top10HoldingsPct", "topHoldersPct", "concentrationPct", "walletDistribution"],
  activeAddresses: ["activeAddresses", "activeAddressCount", "activeAddresses24h", "activeUsers"],
  nvt: ["nvtRatio", "nvt", "networkValueToTransactions"],
  mvrv: ["mvrvRatio", "mvrv", "marketValueToRealizedValue"],
  dormancy: ["dormancyDays", "dormancy", "coinDormancy", "coinDaysDestroyedMean"],
} as const;

const chooseOnChainProvider = async () => {
  if (marketProviderStore) {
    try {
      const rows = await marketProviderStore.getAll();
      const enabled = rows.filter((row) => row.enabled !== false);
      const preferred = enabled.find((row) =>
        String(row.presetKey ?? "").toLowerCase().includes("coinglass") ||
        String(row.name ?? "").toLowerCase().includes("coinglass"),
      );
      const onchainNamed = enabled.find((row) => String(row.notes ?? "").toLowerCase().includes("on-chain"));
      const fallbackOutsource = enabled.find((row) => String(row.providerGroup ?? "").toUpperCase() === "OUTSOURCE");
      const selected = preferred ?? onchainNamed ?? fallbackOutsource;
      if (selected?.baseUrl) {
        return {
          id: selected.id,
          name: selected.name,
          baseUrl: selected.baseUrl,
          apiKey: selected.apiKey ?? CG_API_KEY,
          extraPaths: selected.extraPaths ?? [],
        };
      }
    } catch {
      // fallback below
    }
  }
  return {
    id: "coinglass-rest",
    name: "Coinglass API",
    baseUrl: CG_BASE,
    apiKey: CG_API_KEY,
    extraPaths: [] as string[],
  };
};

const fetchMetricNumber = async (
  baseUrl: string,
  headers: Record<string, string>,
  candidates: string[],
  keys: readonly string[],
): Promise<number | null> => {
  for (const path of candidates) {
    try {
      const data = await fetchJson<JsonValue>(joinProviderUrl(baseUrl, path), headers, 9_000);
      const value = findLatestNumeric(data, [...keys]);
      if (value !== null) return value;
    } catch {
      // try next candidate
    }
  }
  return null;
};

const fetchOnChainMetrics = async (symbol: string): Promise<{ providerName: string; metrics: OnChainMetricsSnapshot }> => {
  const normalized = String(symbol ?? "BTCUSDT").toUpperCase().trim();
  const baseAsset = toBaseSymbol(normalized) ?? "BTC";
  const cacheKey = `${baseAsset}USDT`;
  const cached = onChainCache.get(cacheKey);
  if (cached && Date.now() - cached.ts <= ONCHAIN_CACHE_MS) {
    return { providerName: cached.providerName, metrics: cached.metrics };
  }

  const provider = await chooseOnChainProvider();
  const headers: Record<string, string> = {};
  const key = String(provider.apiKey ?? "").trim();
  if (key) {
    headers["CG-API-KEY"] = key;
    headers["x-api-key"] = key;
    headers["X-API-KEY"] = key;
  }

  const custom = provider.extraPaths;
  const customOf = (needle: string) =>
    custom.filter((path) => String(path ?? "").toLowerCase().includes(needle.toLowerCase()));

  const inflow = await fetchMetricNumber(
    provider.baseUrl,
    headers,
    buildSymbolPathCandidates(baseAsset, cacheKey, [
      ...customOf("inflow"),
      "/api/onchain/exchange-inflow",
      "/api/onchain/exchange-flow/inflow",
    ]),
    metricKeys.inflow,
  );
  const outflow = await fetchMetricNumber(
    provider.baseUrl,
    headers,
    buildSymbolPathCandidates(baseAsset, cacheKey, [
      ...customOf("outflow"),
      "/api/onchain/exchange-outflow",
      "/api/onchain/exchange-flow/outflow",
    ]),
    metricKeys.outflow,
  );
  const explicitNetflow = await fetchMetricNumber(
    provider.baseUrl,
    headers,
    buildSymbolPathCandidates(baseAsset, cacheKey, [
      ...customOf("netflow"),
      "/api/onchain/exchange-netflow",
      "/api/onchain/exchange-flow/net",
      "/api/onchain/netflow",
    ]),
    metricKeys.netflow,
  );
  const whaleTxCount = await fetchMetricNumber(
    provider.baseUrl,
    headers,
    buildSymbolPathCandidates(baseAsset, cacheKey, [
      ...customOf("whale"),
      "/api/onchain/whale-activity",
      "/api/onchain/whale-transactions",
    ]),
    metricKeys.whale,
  );
  const walletConcentrationPct = await fetchMetricNumber(
    provider.baseUrl,
    headers,
    buildSymbolPathCandidates(baseAsset, cacheKey, [
      ...customOf("wallet"),
      ...customOf("distribution"),
      "/api/onchain/wallet-distribution",
      "/api/onchain/holder-distribution",
    ]),
    metricKeys.walletDistribution,
  );
  const activeAddresses = await fetchMetricNumber(
    provider.baseUrl,
    headers,
    buildSymbolPathCandidates(baseAsset, cacheKey, [
      ...customOf("active"),
      "/api/onchain/active-addresses",
      "/api/onchain/network-activity",
    ]),
    metricKeys.activeAddresses,
  );
  const nvtRatio = await fetchMetricNumber(
    provider.baseUrl,
    headers,
    buildSymbolPathCandidates(baseAsset, cacheKey, [
      ...customOf("nvt"),
      "/api/onchain/nvt-ratio",
      "/api/onchain/nvt",
    ]),
    metricKeys.nvt,
  );
  const mvrvRatio = await fetchMetricNumber(
    provider.baseUrl,
    headers,
    buildSymbolPathCandidates(baseAsset, cacheKey, [
      ...customOf("mvrv"),
      "/api/onchain/mvrv-ratio",
      "/api/onchain/mvrv",
    ]),
    metricKeys.mvrv,
  );
  const dormancyDays = await fetchMetricNumber(
    provider.baseUrl,
    headers,
    buildSymbolPathCandidates(baseAsset, cacheKey, [
      ...customOf("dormancy"),
      "/api/onchain/dormancy",
      "/api/onchain/coin-dormancy",
    ]),
    metricKeys.dormancy,
  );

  const exchangeNetflowUsd = explicitNetflow ?? (inflow !== null && outflow !== null ? inflow - outflow : null);
  const metrics: OnChainMetricsSnapshot = {
    exchangeNetflowUsd,
    exchangeInflowUsd: inflow,
    exchangeOutflowUsd: outflow,
    whaleTxCount,
    walletConcentrationPct,
    activeAddresses,
    nvtRatio,
    mvrvRatio,
    dormancyDays,
  };

  onChainCache.set(cacheKey, {
    ts: Date.now(),
    providerName: provider.name,
    metrics,
  });
  return {
    providerName: provider.name,
    metrics,
  };
};

const intervalMap = (tf: string): Interval => {
  const norm = tf.trim().toLowerCase();
  if (["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"].includes(norm)) return norm as Interval;
  return "15m";
};

const bybitInterval = (interval: Interval): string => {
  if (interval === "1m") return "1";
  if (interval === "5m") return "5";
  if (interval === "15m") return "15";
  if (interval === "30m") return "30";
  if (interval === "1h") return "60";
  if (interval === "4h") return "240";
  if (interval === "1d") return "D";
  return "W";
};

const okxBar = (interval: Interval): string => {
  if (interval === "1m") return "1m";
  if (interval === "5m") return "5m";
  if (interval === "15m") return "15m";
  if (interval === "30m") return "30m";
  if (interval === "1h") return "1H";
  if (interval === "4h") return "4H";
  if (interval === "1d") return "1D";
  return "1W";
};

const okxSpotInst = (symbol: string) => `${symbol.replace("USDT", "")}-USDT`;
const okxSwapInst = (symbol: string) => `${symbol.replace("USDT", "")}-USDT-SWAP`;
const gatePair = (symbol: string) => `${symbol.replace("USDT", "")}_USDT`;

const buildTradesMetrics = (trades: Array<{ ts: number; qty: number; side: number }>) => {
  const now = Date.now();
  const oneMinAgo = now - 60_000;
  const fiveMinAgo = now - 5 * 60_000;
  const oneMinute = trades.filter((t) => t.ts >= oneMinAgo);
  const fiveMinute = trades.filter((t) => t.ts >= fiveMinAgo);
  const deltaBtc1m = oneMinute.reduce((sum, t) => sum + t.qty * t.side, 0);
  const volumeBtc1m = oneMinute.reduce((sum, t) => sum + t.qty, 0);
  const speedTpm = oneMinute.length;
  const vol5m = fiveMinute.reduce((sum, t) => sum + t.qty, 0);
  const expected = vol5m / 5;
  const volumeZ = expected > 0 ? (volumeBtc1m - expected) / Math.sqrt(expected) : 0;
  return { deltaBtc1m, volumeBtc1m, speedTpm, volumeZ };
};

const buildOrderbookMetrics = (bids: Array<[string, string]>, asks: Array<[string, string]>) => {
  const bestBid = Number(bids[0]?.[0] ?? 0);
  const bestAsk = Number(asks[0]?.[0] ?? 0);
  const mid = (bestBid + bestAsk) / 2 || 1;
  const spreadBps = ((bestAsk - bestBid) / mid) * 10000;
  const bidDepthUsd = bids.reduce((sum, [p, q]) => sum + Number(p) * Number(q), 0);
  const askDepthUsd = asks.reduce((sum, [p, q]) => sum + Number(p) * Number(q), 0);
  const imbalance = (bidDepthUsd - askDepthUsd) / Math.max(bidDepthUsd + askDepthUsd, 1);
  return {
    spreadBps,
    depthUsd: bidDepthUsd + askDepthUsd,
    imbalance,
    topBid: bestBid > 0 ? bestBid : null,
    topAsk: bestAsk > 0 ? bestAsk : null,
    midPrice: bestBid > 0 && bestAsk > 0 ? (bestBid + bestAsk) / 2 : null,
  };
};

const normalizeBookLevels = (
  levels: Array<[string, string]>,
  side: "bid" | "ask",
  limit = 20,
  step = 0,
): Array<{ price: number; amount: number; total: number }> => {
  const parsedRaw = levels
    .map(([p, q]) => ({ price: Number(p), amount: Number(q) }))
    .filter((row) => Number.isFinite(row.price) && row.price > 0 && Number.isFinite(row.amount) && row.amount > 0)
    .sort((a, b) => (side === "bid" ? b.price - a.price : a.price - b.price))
    .slice(0, Math.max(10, Math.min(100, limit)));

  const parsed =
    step > 0
      ? (() => {
          const grouped = new Map<number, number>();
          for (const row of parsedRaw) {
            const bucket =
              side === "bid"
                ? Math.floor(row.price / step) * step
                : Math.ceil(row.price / step) * step;
            const key = Number(bucket.toFixed(8));
            grouped.set(key, (grouped.get(key) ?? 0) + row.amount);
          }
          return [...grouped.entries()]
            .map(([price, amount]) => ({ price, amount }))
            .sort((a, b) => (side === "bid" ? b.price - a.price : a.price - b.price))
            .slice(0, Math.max(10, Math.min(100, limit)));
        })()
      : parsedRaw;

  let runningTotal = 0;
  return parsed.map((row) => {
    runningTotal += row.price * row.amount;
    return { price: row.price, amount: row.amount, total: runningTotal };
  });
};

const normalizeTradeTape = (
  rows: Array<{ ts: number; price: number; amount: number; side: "BUY" | "SELL" }>,
) =>
  rows
    .filter(
      (row) =>
        Number.isFinite(row.ts) &&
        row.ts > 0 &&
        Number.isFinite(row.price) &&
        row.price > 0 &&
        Number.isFinite(row.amount) &&
        row.amount > 0,
    )
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 60)
    .map((row, idx) => ({
      id: `${row.ts}-${idx}`,
      ts: row.ts,
      price: row.price,
      amount: row.amount,
      side: row.side,
      time: new Date(row.ts).toISOString(),
    }));

const fetchLiquidationUsd = async (exchange: ExchangeName, symbol: string, apiKey: string): Promise<number> => {
  const cacheKey = `${exchange}:${symbol}`.toUpperCase();
  const cached = liquidationCache.get(cacheKey);
  if (cached && Date.now() - cached.ts <= LIQUIDATION_CACHE_MS) {
    return cached.value;
  }
  try {
    const liq = await fetchJson<JsonValue>(
      `${CG_BASE}/api/futures/liquidation/history?exchange=${exchange}&symbol=${symbol}&interval=1h&limit=1`,
      { "CG-API-KEY": apiKey },
      1800,
    );
    const longLiq = findLatestNumeric(liq, ["longUsd", "long", "longVolUsd", "longVolumeUsd"]);
    const shortLiq = findLatestNumeric(liq, ["shortUsd", "short", "shortVolUsd", "shortVolumeUsd"]);
    const value = Math.max(0, (longLiq ?? 0) + (shortLiq ?? 0));
    liquidationCache.set(cacheKey, { ts: Date.now(), value });
    return value;
  } catch {
    if (cached) return cached.value;
    return 0;
  }
};

const hubExchangeToName = (value: string | undefined | null): ExchangeName => {
  const normalized = String(value ?? "").toUpperCase();
  if (normalized.includes("GATE")) return "Gate.io";
  if (normalized.includes("BYBIT")) return "Bybit";
  if (normalized.includes("OKX")) return "OKX";
  return "Binance";
};

const fetchBinanceLive = async (
  symbol: string,
  interval: Interval,
  limit: number,
  exchange: ExchangeName,
  apiKey: string,
  bookLimit = 20,
  bookStep = 0,
) => {
  const normalizedSymbol = String(symbol ?? "").toUpperCase();
  const safeLimit = Math.max(120, Math.min(1000, limit));
  const safeBookLimit = Math.max(10, Math.min(100, bookLimit));
  const routerLive = marketExchangeHub?.getLiveRow(normalizedSymbol, "Binance") ?? null;
  const liveHubRow = routerLive?.row;
  const legacyHubRow = liveHubRow ? null : marketBinanceFuturesHub?.getLiveRow(normalizedSymbol) ?? null;
  const hubRow = liveHubRow ?? legacyHubRow;
  const feedExchange = routerLive?.exchangeUsed ? hubExchangeToName(routerLive.exchangeUsed) : "Binance";
  const wsCandles = marketExchangeHub?.getCandlesFromExchange(normalizedSymbol, "Binance", interval, safeLimit) ?? [];
  const wsTrades = marketExchangeHub?.getRecentTradesFromExchange(normalizedSymbol, "Binance", 240) ?? [];

  const depthRaw = hubRow?.topBid && hubRow?.topAsk && hubRow?.depthUsd && hubRow.depthUsd > 0
    ? (() => {
        const imbalance = Math.max(-0.98, Math.min(0.98, Number(hubRow.imbalance ?? 0)));
        const bidUsd = Math.max(0, (hubRow.depthUsd * (1 + imbalance)) / 2);
        const askUsd = Math.max(0, hubRow.depthUsd - bidUsd);
        const bidQty = hubRow.topBid > 0 ? bidUsd / hubRow.topBid : 0;
        const askQty = hubRow.topAsk > 0 ? askUsd / hubRow.topAsk : 0;
        return {
          bids: [[String(hubRow.topBid), String(Math.max(0, bidQty))]],
          asks: [[String(hubRow.topAsk), String(Math.max(0, askQty))]],
        };
      })()
    : { bids: [], asks: [] };

  const premiumIndexRaw = hubRow && (hubRow.markPrice !== null || hubRow.fundingRate !== null)
    ? {
      markPrice: hubRow?.markPrice ?? undefined,
      fundingRate: hubRow?.fundingRate ?? undefined,
    }
    : {};

  const openInterestRaw = {
    openInterest: hubRow?.depthUsd ?? undefined,
  };

  let ohlcv = wsCandles
    .map((row) => ({
      time: Math.floor(Number(row.time)),
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume ?? 0),
    }))
    .sort((a, b) => a.time - b.time)
    .filter((row) => Number.isFinite(row.time) && row.time > 0 && Number.isFinite(row.close) && row.close > 0)
    .slice(-Math.max(60, safeLimit));

  if (ohlcv.length < Math.min(60, safeLimit)) {
    const klinesRaw = await fetchWithComponentCache<unknown>(
      `binance:bootstrap:klines:${normalizedSymbol}:${interval}:${safeLimit}`,
      30_000,
      () => fetchBinanceKlinesFallback(normalizedSymbol, interval, safeLimit),
    ).catch(() => []);
    const historical = asList(klinesRaw)
      .map((row) => parseBinanceKlineRow(row))
      .filter((row): row is { time: number; open: number; high: number; low: number; close: number; volume: number } => Boolean(row))
      .sort((a, b) => a.time - b.time);
    if (historical.length) {
      const merged = new Map<number, { time: number; open: number; high: number; low: number; close: number; volume: number }>();
      for (const row of historical) merged.set(row.time, row);
      for (const row of ohlcv) merged.set(row.time, row);
      ohlcv = [...merged.values()].sort((a, b) => a.time - b.time).slice(-Math.max(60, safeLimit));
    }
  }

  const depthRec = asRecord(depthRaw) ?? {};
  const depth = asRecord(depthRec.result) ?? depthRec;
  const bids = asList(depth.bids ?? depth.b)
    .slice(0, safeBookLimit)
    .map((row) => parseBinanceBookRow(row))
    .filter((row): row is [string, string] => Boolean(row));
  const asks = asList(depth.asks ?? depth.a)
    .slice(0, safeBookLimit)
    .map((row) => parseBinanceBookRow(row))
    .filter((row): row is [string, string] => Boolean(row));
  const orderbook = buildOrderbookMetrics(bids, asks);
  const bidLevels = normalizeBookLevels(bids, "bid", safeBookLimit, bookStep);
  const askLevels = normalizeBookLevels(asks, "ask", safeBookLimit, bookStep);

  const parsedTrades = wsTrades.length
    ? wsTrades
      .map((row) => ({
        tsMs: Number(row.ts),
        price: Number(row.price),
        qty: Number(row.amount),
        side: row.side,
      }))
      .filter((row) => Number.isFinite(row.tsMs) && row.tsMs > 0 && Number.isFinite(row.price) && row.price > 0 && Number.isFinite(row.qty) && row.qty > 0)
    : hubRow?.lastTradePrice && hubRow.lastTradeQty
      ? [{
          tsMs: hubRow.sourceTs ?? Date.now(),
          price: hubRow.lastTradePrice,
          qty: hubRow.lastTradeQty,
          side: hubRow.lastTradeSide === "SELL" ? "SELL" as const : "BUY" as const,
        }]
      : [];
  const tradesMetrics = buildTradesMetrics(
    parsedTrades.map((t) => ({ ts: t.tsMs, qty: t.qty, side: t.side === "BUY" ? 1 : -1 })),
  );
  const recentTrades = normalizeTradeTape(
    parsedTrades.map((t) => ({
      ts: t.tsMs,
      price: t.price,
      amount: t.qty,
      side: t.side,
    })),
  );

  const premiumIndex = asRecord(premiumIndexRaw) ?? {};
  const openInterest = asRecord(openInterestRaw) ?? {};
  const liquidationUsd = await fetchLiquidationUsd(exchange, normalizedSymbol, apiKey);

  const payload = {
    ohlcv,
    orderbook,
    trades: tradesMetrics,
    orderbookLevels: {
      bids: bidLevels,
      asks: askLevels,
    },
    recentTrades,
    derivatives: {
      fundingRate: pickNumberFromRecord(premiumIndex, ["lastFundingRate", "fundingRate", "funding_rate"]) ?? 0,
      oiValue:
        pickNumberFromRecord(openInterest, [
          "openInterest",
          "open_interest",
          "sumOpenInterestUsd",
          "sumOpenInterest",
          "oi",
        ]) ?? 0,
      oiChange1h: null,
      liquidationUsd,
    },
    feedExchange,
    feedSource: "WS_HUB",
    sourceTs: Date.now(),
  };
  if (!payload.ohlcv.length) throw new Error(`Binance returned empty candles for ${normalizedSymbol}`);
  return payload;
};

const fetchBybitLive = async (
  symbol: string,
  interval: Interval,
  limit: number,
  exchange: ExchangeName,
  apiKey: string,
  bookLimit = 20,
  bookStep = 0,
) => {
  const bybitTf = bybitInterval(interval);

  const [klinesRes, depthRes, tradesRes, tickerRes] = await Promise.all([
    fetchJson<{ result?: { list?: Array<[string, string, string, string, string, string, string]> } }>(
      `${BYBIT_BASE}/v5/market/kline?category=spot&symbol=${symbol}&interval=${bybitTf}&limit=${limit}`,
    ),
    fetchJson<{ result?: { b?: Array<[string, string]>; a?: Array<[string, string]> } }>(
      `${BYBIT_BASE}/v5/market/orderbook?category=spot&symbol=${symbol}&limit=${Math.max(20, Math.min(100, bookLimit))}`,
    ).catch(() => ({ result: { b: [], a: [] } })),
    fetchJson<{ result?: { list?: Array<{ T: number; v: string; S: "Buy" | "Sell" }> } }>(
      `${BYBIT_BASE}/v5/market/recent-trade?category=spot&symbol=${symbol}&limit=200`,
    ).catch(() => ({ result: { list: [] } })),
    fetchJson<{ result?: { list?: Array<Record<string, string>> } }>(
      `${BYBIT_BASE}/v5/market/tickers?category=linear&symbol=${symbol}`,
    ).catch(() => ({ result: { list: [] } })),
  ]);

  const klineList = [...(klinesRes.result?.list ?? [])].reverse();
  const ohlcv = klineList.map((row) => ({
    time: Math.floor(Number(row[0]) / 1000),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5]),
  }));

  const bids = (depthRes.result?.b ?? []).slice(0, Math.max(10, Math.min(100, bookLimit)));
  const asks = (depthRes.result?.a ?? []).slice(0, Math.max(10, Math.min(100, bookLimit)));
  const orderbook = buildOrderbookMetrics(bids, asks);
  const bidLevels = normalizeBookLevels(bids, "bid", bookLimit, bookStep);
  const askLevels = normalizeBookLevels(asks, "ask", bookLimit, bookStep);

  const tradesMetrics = buildTradesMetrics(
    (tradesRes.result?.list ?? []).map((t) => ({
      ts: Number(t.T),
      qty: Number(t.v),
      side: t.S === "Buy" ? 1 : -1,
    })),
  );
  const recentTrades = normalizeTradeTape(
    (tradesRes.result?.list ?? []).map((t) => ({
      ts: Number(t.T),
      price: Number((t as Record<string, string>).p ?? 0),
      amount: Number(t.v),
      side: t.S === "Buy" ? "BUY" : "SELL",
    })),
  );

  const ticker = tickerRes.result?.list?.[0] ?? {};
  const liquidationUsd = await fetchLiquidationUsd(exchange, symbol, apiKey);

  const payload = {
    ohlcv,
    orderbook,
    trades: tradesMetrics,
    orderbookLevels: {
      bids: bidLevels,
      asks: askLevels,
    },
    recentTrades,
    derivatives: {
      fundingRate: Number(ticker.fundingRate ?? 0),
      oiValue: Number(ticker.openInterestValue ?? ticker.openInterest ?? 0),
      oiChange1h: null,
      liquidationUsd,
    },
  };
  if (!payload.ohlcv.length) throw new Error(`Bybit returned empty candles for ${symbol}`);
  return payload;
};

const fetchOkxLive = async (
  symbol: string,
  interval: Interval,
  limit: number,
  exchange: ExchangeName,
  apiKey: string,
  bookLimit = 20,
  bookStep = 0,
) => {
  const instId = okxSpotInst(symbol);
  const swapInstId = okxSwapInst(symbol);

  const [candlesRes, booksRes, tradesRes, fundingRes, oiRes] = await Promise.all([
    fetchJson<{ data?: Array<[string, string, string, string, string, string]> }>(
      `${OKX_BASE}/api/v5/market/candles?instId=${instId}&bar=${okxBar(interval)}&limit=${limit}`,
    ),
    fetchJson<{ data?: Array<{ bids?: Array<[string, string]>; asks?: Array<[string, string]> }> }>(
      `${OKX_BASE}/api/v5/market/books?instId=${instId}&sz=${Math.max(20, Math.min(100, bookLimit))}`,
    ).catch(() => ({ data: [{ bids: [], asks: [] }] })),
    fetchJson<{ data?: Array<{ ts: string; px: string; sz: string; side: "buy" | "sell" }> }>(
      `${OKX_BASE}/api/v5/market/trades?instId=${instId}&limit=100`,
    ).catch(() => ({ data: [] })),
    fetchJson<{ data?: Array<{ fundingRate?: string }> }>(
      `${OKX_BASE}/api/v5/public/funding-rate?instId=${swapInstId}`,
    ).catch(() => ({ data: [] })),
    fetchJson<{ data?: Array<{ oiCcy?: string; oi?: string }> }>(
      `${OKX_BASE}/api/v5/public/open-interest?instType=SWAP&instId=${swapInstId}`,
    ).catch(() => ({ data: [] })),
  ]);

  const candles = [...(candlesRes.data ?? [])].reverse();
  const ohlcv = candles.map((row) => ({
    time: Math.floor(Number(row[0]) / 1000),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5]),
  }));

  const book = booksRes.data?.[0] ?? {};
  const bids = (book.bids ?? []).slice(0, Math.max(10, Math.min(100, bookLimit)));
  const asks = (book.asks ?? []).slice(0, Math.max(10, Math.min(100, bookLimit)));
  const orderbook = buildOrderbookMetrics(bids, asks);
  const bidLevels = normalizeBookLevels(bids, "bid", bookLimit, bookStep);
  const askLevels = normalizeBookLevels(asks, "ask", bookLimit, bookStep);

  const tradesMetrics = buildTradesMetrics(
    (tradesRes.data ?? []).map((t) => ({
      ts: Number(t.ts),
      qty: Number(t.sz),
      side: t.side === "buy" ? 1 : -1,
    })),
  );
  const recentTrades = normalizeTradeTape(
    (tradesRes.data ?? []).map((t) => ({
      ts: Number(t.ts),
      price: Number(t.px),
      amount: Number(t.sz),
      side: t.side === "buy" ? "BUY" : "SELL",
    })),
  );

  const liquidationUsd = await fetchLiquidationUsd(exchange, symbol, apiKey);
  const funding = Number(fundingRes.data?.[0]?.fundingRate ?? 0);
  const oiValue = Number(oiRes.data?.[0]?.oiCcy ?? oiRes.data?.[0]?.oi ?? 0);

  const payload = {
    ohlcv,
    orderbook,
    trades: tradesMetrics,
    orderbookLevels: {
      bids: bidLevels,
      asks: askLevels,
    },
    recentTrades,
    derivatives: {
      fundingRate: funding,
      oiValue,
      oiChange1h: null,
      liquidationUsd,
    },
  };
  if (!payload.ohlcv.length) throw new Error(`OKX returned empty candles for ${symbol}`);
  return payload;
};

const gateInterval = (interval: Interval): string => {
  if (interval === "1m") return "1m";
  if (interval === "5m") return "5m";
  if (interval === "15m") return "15m";
  if (interval === "30m") return "30m";
  if (interval === "1h") return "1h";
  if (interval === "4h") return "4h";
  if (interval === "1d") return "1d";
  return "7d";
};

const fetchGateLive = async (
  symbol: string,
  interval: Interval,
  limit: number,
  exchange: ExchangeName,
  apiKey: string,
  bookLimit = 20,
  bookStep = 0,
) => {
  const pair = gatePair(symbol);
  const normalizedSymbol = String(symbol ?? "").toUpperCase();
  const safeLimit = Math.max(120, Math.min(1000, limit));
  const safeBookLimit = Math.max(10, Math.min(100, bookLimit));
  const routerLive = marketExchangeHub?.getExchangeRow(normalizedSymbol, "Gate.io") ?? null;
  const hubRow = routerLive?.row ?? null;
  const feedExchange = routerLive?.exchangeUsed ? hubExchangeToName(routerLive.exchangeUsed) : "Gate.io";
  const wsCandles = marketExchangeHub?.getCandlesFromExchange(normalizedSymbol, "Gate.io", gateInterval(interval), safeLimit) ?? [];
  const wsTrades = marketExchangeHub?.getRecentTradesFromExchange(normalizedSymbol, "Gate.io", 220) ?? [];

  let ohlcv = wsCandles
    .map((row) => ({
      time: Math.floor(Number(row.time)),
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume ?? 0),
    }))
    .sort((a, b) => a.time - b.time)
    .filter((row) => Number.isFinite(row.time) && row.time > 0 && Number.isFinite(row.close) && row.close > 0)
    .slice(-safeLimit);

  if (ohlcv.length < Math.min(60, safeLimit)) {
    const candlesRaw = await fetchWithComponentCache<unknown>(
      `gate:bootstrap:klines:${pair}:${interval}:${safeLimit}`,
      30_000,
      () =>
        fetchJson<unknown>(
          `${GATE_FUTURES_BASE}/futures/usdt/candlesticks?contract=${pair}&interval=${gateInterval(interval)}&limit=${safeLimit}`,
          undefined,
          3500,
        ),
    ).catch(() => []);
    const historical = asList(candlesRaw)
      .map((row) => parseGateCandleRow(row))
      .filter((row): row is { time: number; open: number; high: number; low: number; close: number; volume: number } => Boolean(row))
      .sort((a, b) => a.time - b.time)
      .filter((row) => Number.isFinite(row.time) && row.time > 0 && Number.isFinite(row.close) && row.close > 0);
    if (historical.length) {
      const merged = new Map<number, { time: number; open: number; high: number; low: number; close: number; volume: number }>();
      for (const row of historical) merged.set(row.time, row);
      for (const row of ohlcv) merged.set(row.time, row);
      ohlcv = [...merged.values()].sort((a, b) => a.time - b.time).slice(-safeLimit);
    }
  }

  const depthRaw = hubRow?.topBid && hubRow?.topAsk && hubRow?.depthUsd && hubRow.depthUsd > 0
    ? (() => {
        const imbalance = Math.max(-0.98, Math.min(0.98, Number(hubRow.imbalance ?? 0)));
        const bidUsd = Math.max(0, (hubRow.depthUsd * (1 + imbalance)) / 2);
        const askUsd = Math.max(0, hubRow.depthUsd - bidUsd);
        const bidQty = hubRow.topBid > 0 ? bidUsd / hubRow.topBid : 0;
        const askQty = hubRow.topAsk > 0 ? askUsd / hubRow.topAsk : 0;
        return {
          bids: [[String(hubRow.topBid), String(Math.max(0, bidQty))]],
          asks: [[String(hubRow.topAsk), String(Math.max(0, askQty))]],
        };
      })()
    : { bids: [], asks: [] };
  const bidRows = asList(depthRaw.bids)
    .slice(0, safeBookLimit)
    .map((row) => parseGateBookRow(row))
    .filter((row): row is [string, string] => Boolean(row));
  const askRows = asList(depthRaw.asks)
    .slice(0, safeBookLimit)
    .map((row) => parseGateBookRow(row))
    .filter((row): row is [string, string] => Boolean(row));
  const orderbook = buildOrderbookMetrics(bidRows, askRows);
  const bidLevels = normalizeBookLevels(bidRows, "bid", safeBookLimit, bookStep);
  const askLevels = normalizeBookLevels(askRows, "ask", safeBookLimit, bookStep);
  const parsedTrades = wsTrades
    .map((row) => ({
      tsMs: Number(row.ts),
      price: Number(row.price),
      qty: Number(row.amount),
      side: row.side,
    }))
    .filter((row) => Number.isFinite(row.tsMs) && row.tsMs > 0 && Number.isFinite(row.price) && row.price > 0 && Number.isFinite(row.qty) && row.qty > 0);
  const tradesMetrics = buildTradesMetrics(
    parsedTrades.map((t) => ({
      ts: t.tsMs,
      qty: t.qty,
      side: t.side === "BUY" ? 1 : -1,
    })),
  );
  const recentTrades = normalizeTradeTape(
    parsedTrades.map((t) => ({
      ts: t.tsMs,
      price: t.price,
      amount: t.qty,
      side: t.side,
    })),
  );

  const liquidationUsd = await fetchLiquidationUsd(exchange, normalizedSymbol, apiKey);
  const contractRes = {
    mark_price: hubRow?.markPrice ?? undefined,
    funding_rate: hubRow?.fundingRate ?? undefined,
    open_interest_usd: hubRow?.depthUsd ?? undefined,
  };
  const payload = {
    ohlcv,
    orderbook,
    trades: tradesMetrics,
    orderbookLevels: {
      bids: bidLevels,
      asks: askLevels,
    },
    recentTrades,
    derivatives: {
      fundingRate:
        pickNumberFromRecord(contractRes, [
          "funding_rate",
          "fundingRate",
          "last_funding_rate",
          "funding_rate_indicative",
        ]) ?? 0,
      oiValue:
        pickNumberFromRecord(contractRes, [
          "open_interest_usd",
          "openInterestUsd",
          "open_interest",
          "openInterest",
          "position_size",
          "oi",
        ]) ?? 0,
      oiChange1h: null,
      liquidationUsd,
    },
    feedExchange,
    feedSource: "WS_HUB",
    sourceTs: Date.now(),
  };
  if (!payload.ohlcv.length) throw new Error(`Gate.io returned empty candles for ${normalizedSymbol}`);
  return payload;
};

const fetchFromSelectedExchange = async (
  exchange: ExchangeName,
  symbol: string,
  interval: Interval,
  limit: number,
  apiKey: string,
  bookLimit = 20,
  bookStep = 0,
) => {
  if (exchange === "Bybit") return fetchBybitLive(symbol, interval, limit, exchange, apiKey, bookLimit, bookStep);
  if (exchange === "OKX") return fetchOkxLive(symbol, interval, limit, exchange, apiKey, bookLimit, bookStep);
  if (exchange === "Gate.io") return fetchGateLive(symbol, interval, limit, exchange, apiKey, bookLimit, bookStep);
  return fetchBinanceLive(symbol, interval, limit, exchange, apiKey, bookLimit, bookStep);
};

const sourceCodeByExchange = (exchange: ExchangeName): "BINANCE" | "BYBIT" | "OKX" | "GATEIO" => {
  if (exchange === "Bybit") return "BYBIT";
  if (exchange === "OKX") return "OKX";
  if (exchange === "Gate.io") return "GATEIO";
  return "BINANCE";
};

const orderedExchangeFallback = async (primary: ExchangeName): Promise<ExchangeName[]> => {
  let configured = DEFAULT_EXCHANGE_CHAIN;
  if (marketProviderStore) {
    try {
      const policy = await marketProviderStore.getFallbackPolicy();
      if (Array.isArray(policy.order) && policy.order.length) {
        configured = [...new Set(policy.order)];
      }
    } catch {
      // fallback to static chain
    }
  }
  const merged = [primary, ...configured, ...DEFAULT_EXCHANGE_CHAIN];
  return [...new Set(merged)];
};

const fetchWithFallbackChain = async (
  symbol: string,
  interval: Interval,
  limit: number,
  apiKey: string,
  primary: ExchangeName,
  bookLimit = 20,
  bookStep = 0,
) => {
  const attempts = await orderedExchangeFallback(primary);
  let lastError: unknown = null;
  for (const exchange of attempts) {
    try {
      const payload = await fetchFromSelectedExchange(exchange, symbol, interval, limit, apiKey, bookLimit, bookStep);
      return { payload, exchangeUsed: exchange };
    } catch (err) {
      lastError = err;
    }
  }
  throw (lastError instanceof Error ? lastError : new Error("all public exchange fallbacks failed"));
};

const fetchFromCgFallback = async (
  symbol: string,
  exchange: ExchangeName,
  interval: Interval,
  limit: number,
  apiKey: string,
  bookLimit = 20,
  bookStep = 0,
) => {
  const { payload: base, exchangeUsed } = await fetchWithFallbackChain(symbol, interval, limit, apiKey, exchange, bookLimit, bookStep);
  const liquidationUsd = await fetchLiquidationUsd(exchangeUsed, symbol, apiKey);
  return {
    payload: {
      ...base,
      derivatives: {
        ...base.derivatives,
        liquidationUsd,
      },
    },
    exchangeUsed,
  };
};

const intervalSeconds = (interval: Interval): number => {
  if (interval === "1m") return 60;
  if (interval === "5m") return 300;
  if (interval === "15m") return 900;
  if (interval === "30m") return 1800;
  if (interval === "1h") return 3600;
  if (interval === "4h") return 14400;
  if (interval === "1d") return 86400;
  return 604800;
};

const resolveCoinGeckoId = async (symbol: string): Promise<string | null> => {
  const base = symbol.toLowerCase().replace("usdt", "");
  try {
    const search = await fetchJson<{ coins?: Array<{ id: string; symbol: string }> }>(
      `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(base)}`,
    );
    const exact = (search.coins ?? []).find((coin) => coin.symbol.toLowerCase() === base);
    return exact?.id ?? search.coins?.[0]?.id ?? null;
  } catch {
    return null;
  }
};

const fetchCoinGeckoLiveFallback = async (symbol: string, interval: Interval, limit: number) => {
  const coinId = await resolveCoinGeckoId(symbol);
  if (!coinId) throw new Error(`coin_gecko_symbol_not_found:${symbol}`);
  const days = interval === "1w" ? 365 : interval === "1d" ? 180 : interval === "4h" ? 90 : interval === "1h" ? 30 : 7;
  const chart = await fetchJson<{ prices?: Array<[number, number]>; total_volumes?: Array<[number, number]> }>(
    `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/market_chart?vs_currency=usd&days=${days}&interval=hourly`,
  );
  const sec = intervalSeconds(interval);
  const buckets = new Map<number, Array<{ p: number; v: number }>>();
  const vols = new Map<number, number>((chart.total_volumes ?? []).map(([ts, vol]) => [Math.floor(ts / 1000), Number(vol)]));
  for (const [tsMs, pRaw] of chart.prices ?? []) {
    const ts = Math.floor(tsMs / 1000);
    const bucket = Math.floor(ts / sec) * sec;
    const p = Number(pRaw);
    const v = Number(vols.get(ts) ?? 0);
    const arr = buckets.get(bucket) ?? [];
    arr.push({ p, v });
    buckets.set(bucket, arr);
  }
  const ohlcv = [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .slice(-Math.max(60, Math.min(1000, limit)))
    .map(([time, rows]) => {
      const open = rows[0]?.p ?? 0;
      const close = rows[rows.length - 1]?.p ?? open;
      const high = rows.reduce((m, r) => Math.max(m, r.p), open);
      const low = rows.reduce((m, r) => Math.min(m, r.p), open);
      const volume = rows.reduce((sum, r) => sum + (Number.isFinite(r.v) ? r.v : 0), 0);
      return { time, open, high, low, close, volume };
    })
    .filter((row) => row.close > 0);

  if (!ohlcv.length) throw new Error(`coin_gecko_empty_ohlcv:${symbol}`);

  return {
    ohlcv,
    orderbook: {
      spreadBps: 0,
      depthUsd: 0,
      imbalance: 0,
      topBid: null as number | null,
      topAsk: null as number | null,
      midPrice: ohlcv.at(-1)?.close ?? null,
    },
    trades: {
      deltaBtc1m: 0,
      volumeBtc1m: 0,
      speedTpm: 0,
      volumeZ: 0,
    },
    orderbookLevels: {
      bids: [] as Array<{ price: number; amount: number; total: number }>,
      asks: [] as Array<{ price: number; amount: number; total: number }>,
    },
    recentTrades: [] as Array<{ id: string; ts: number; price: number; amount: number; side: "BUY" | "SELL"; time: string }>,
    derivatives: {
      fundingRate: null as number | null,
      oiValue: null as number | null,
      oiChange1h: null as number | null,
      liquidationUsd: 0,
    },
  };
};

const toBaseSymbol = (raw: string): string | null => {
  const normalized = raw.toUpperCase().replace(/[-_/]/g, "");
  if (!normalized.endsWith("USDT")) return null;
  const base = normalized.slice(0, -4);
  if (!base || base.length > 20) return null;
  if (!/^[A-Z0-9]+$/.test(base)) return null;
  return base;
};

const uniqueSorted = (items: string[]): string[] =>
  [...new Set(items)]
    .filter((item) => item !== "USDT")
    .sort((a, b) => a.localeCompare(b));

const fetchSymbolsFromBinance = async (): Promise<string[]> => {
  const exchangeInfo = await fetchBinanceFuturesJson<{ symbols?: Array<{ symbol?: string; status?: string; quoteAsset?: string }> }>(
    "/fapi/v1/exchangeInfo",
  );
  const symbols = (exchangeInfo.symbols ?? [])
    .filter((item) => item.status === "TRADING" && item.quoteAsset === "USDT")
    .map((item) => toBaseSymbol(item.symbol ?? ""))
    .filter((item): item is string => Boolean(item));
  return uniqueSorted(symbols);
};

const fetchSymbolsFromGateFutures = async (): Promise<string[]> => {
  const listRaw = await fetchJson<unknown>(`${GATE_FUTURES_BASE}/futures/usdt/contracts`).catch(() => []);
  const list = asList(listRaw).map((row) => asRecord(row)).filter((row): row is Record<string, unknown> => Boolean(row));
  const symbols = list
    .filter((item) => {
      const rawStatus = String(item.trade_status ?? item.status ?? item.state ?? "tradable").toLowerCase();
      const inDelisting = Boolean(item.in_delisting === true || item.delisting === true);
      const tradable = rawStatus.includes("trad") || rawStatus === "open" || rawStatus === "normal";
      return tradable && !inDelisting;
    })
    .map((item) => toBaseSymbol(String(item.contract ?? item.name ?? item.id ?? "")))
    .filter((item): item is string => Boolean(item));
  return uniqueSorted(symbols);
};

const fetchSymbolsFromBybit = async (): Promise<string[]> => {
  const spot = await fetchJson<{ result?: { list?: Array<{ symbol?: string; status?: string }> } }>(
    `${BYBIT_BASE}/v5/market/instruments-info?category=spot&limit=1000`,
  ).catch(() => ({ result: { list: [] } }));
  const linear = await fetchJson<{ result?: { list?: Array<{ symbol?: string; status?: string }> } }>(
    `${BYBIT_BASE}/v5/market/instruments-info?category=linear&limit=1000`,
  ).catch(() => ({ result: { list: [] } }));

  const all = [...(spot.result?.list ?? []), ...(linear.result?.list ?? [])]
    .filter((item) => (item.status ?? "Trading").toLowerCase().includes("trad"))
    .map((item) => toBaseSymbol(item.symbol ?? ""))
    .filter((item): item is string => Boolean(item));
  return uniqueSorted(all);
};

const fetchSymbolsFromOkx = async (): Promise<string[]> => {
  const spot = await fetchJson<{ data?: Array<{ instId?: string; state?: string }> }>(
    `${OKX_BASE}/api/v5/public/instruments?instType=SPOT`,
  ).catch(() => ({ data: [] }));
  const swap = await fetchJson<{ data?: Array<{ instId?: string; state?: string }> }>(
    `${OKX_BASE}/api/v5/public/instruments?instType=SWAP`,
  ).catch(() => ({ data: [] }));

  const all = [...(spot.data ?? []), ...(swap.data ?? [])]
    .filter((item) => (item.state ?? "live").toLowerCase() === "live")
    .map((item) => toBaseSymbol(item.instId ?? ""))
    .filter((item): item is string => Boolean(item));
  return uniqueSorted(all);
};

const fetchSymbolsForExchange = async (exchange: ExchangeName): Promise<string[]> => {
  if (exchange === "Bybit") return fetchSymbolsFromBybit();
  if (exchange === "OKX") return fetchSymbolsFromOkx();
  if (exchange === "Gate.io") return fetchSymbolsFromGateFutures();
  return fetchSymbolsFromBinance();
};

const fetchSymbolsWithFallbackChain = async (primary: ExchangeName): Promise<string[]> => {
  const attempts = await orderedExchangeFallback(primary);
  let lastError: unknown = null;
  for (const exchange of attempts) {
    try {
      const symbols = await fetchSymbolsForExchange(exchange);
      if (symbols.length) return symbols;
    } catch (err) {
      lastError = err;
    }
  }
  throw (lastError instanceof Error ? lastError : new Error("all symbol source fallbacks failed"));
};

interface FetchMarketLiveInput {
  symbol: string;
  interval: Interval;
  limit: number;
  exchange: ExchangeName;
  apiKey: string;
  sourceMode: SourceMode;
  strict?: boolean;
  allowStaleReplay?: boolean;
  bookLimit?: number;
  bookStep?: number;
}

const getLiveBundleKey = (input: FetchMarketLiveInput): string => {
  const limit = Math.max(120, Math.min(1000, Number(input.limit ?? 360)));
  const bookLimit = Math.max(10, Math.min(100, Number(input.bookLimit ?? 20)));
  const rawStep = Number(input.bookStep ?? 0);
  const bookStep = Number.isFinite(rawStep) ? Math.max(0, rawStep) : 0;
  return [
    input.sourceMode,
    input.strict ? "strict" : "default",
    input.allowStaleReplay === false ? "nostale" : "staleok",
    input.exchange,
    String(input.symbol ?? "").toUpperCase(),
    input.interval,
    String(limit),
    String(bookLimit),
    bookStep.toFixed(6),
  ].join("|");
};

const getLiveBundleTtlMs = (input: FetchMarketLiveInput): number =>
  input.sourceMode === "fallback" ? LIVE_BUNDLE_FALLBACK_TTL_MS : LIVE_BUNDLE_EXCHANGE_TTL_MS;

const getLiveBundleCached = (input: FetchMarketLiveInput): unknown | null => {
  const key = getLiveBundleKey(input);
  const ttlMs = getLiveBundleTtlMs(input);
  const cached = liveBundleCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.ts > ttlMs) {
    liveBundleCache.delete(key);
    return null;
  }
  return cached.payload;
};

const getLiveBundleCachedWithGrace = (input: FetchMarketLiveInput, graceMs = 20_000): unknown | null => {
  const key = getLiveBundleKey(input);
  const cached = liveBundleCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.ts > graceMs) return null;
  return cached.payload;
};

const exchangeFailureKey = (input: FetchMarketLiveInput) =>
  `${input.exchange}|${String(input.symbol ?? "").toUpperCase()}|${input.interval}`;

const noteExchangeFailure = (key: string): number => {
  const now = Date.now();
  const prev = exchangeLiveFailureStreak.get(key);
  const count = prev && now - prev.ts <= 60_000 ? prev.count + 1 : 1;
  exchangeLiveFailureStreak.set(key, { count, ts: now });
  return count;
};

const clearExchangeFailure = (key: string): void => {
  exchangeLiveFailureStreak.delete(key);
};

const setLiveBundleCache = (input: FetchMarketLiveInput, payload: unknown) => {
  const key = getLiveBundleKey(input);
  liveBundleCache.set(key, { ts: Date.now(), payload });
  if (liveBundleCache.size <= LIVE_BUNDLE_CACHE_MAX) return;
  const overflow = liveBundleCache.size - LIVE_BUNDLE_CACHE_MAX;
  if (overflow <= 0) return;
  const keys = [...liveBundleCache.keys()];
  for (let i = 0; i < overflow; i += 1) {
    const oldKey = keys[i];
    if (!oldKey) continue;
    liveBundleCache.delete(oldKey);
  }
};

export const fetchMarketLiveBundle = async (input: FetchMarketLiveInput) => {
  const cached = getLiveBundleCached(input);
  if (cached) return cached as any;
  const inFlightKey = getLiveBundleKey(input);
  const inFlight = liveBundleInFlight.get(inFlightKey);
  if (inFlight) {
    const shared = await inFlight;
    return shared as any;
  }

  const job = (async () => {
    let sourceUsed: "EXCHANGE" | "FALLBACK_API" = input.sourceMode === "fallback" ? "FALLBACK_API" : "EXCHANGE";
    let live: Record<string, unknown>;
    let exchangeUsed: ExchangeName = input.exchange;
    let sourceDetail = `${sourceCodeByExchange(input.exchange)}_REST`;
    const liveUnavailableError = new Error("LIVE_DATA_UNAVAILABLE: all exchange sources failed");
    const failureKey = exchangeFailureKey(input);
    if (input.sourceMode === "fallback") {
      try {
        const fallback = await fetchFromCgFallback(
          input.symbol,
          input.exchange,
          input.interval,
          input.limit,
          input.apiKey,
          input.bookLimit ?? 20,
          input.bookStep ?? 0,
        );
        live = fallback.payload as Record<string, unknown>;
        exchangeUsed = fallback.exchangeUsed;
        sourceDetail = `${sourceCodeByExchange(exchangeUsed)}_FALLBACK_REST`;
      } catch {
        throw liveUnavailableError;
      }
    } else if (input.strict) {
      live = await fetchFromSelectedExchange(
        input.exchange,
        input.symbol,
        input.interval,
        input.limit,
        input.apiKey,
        input.bookLimit ?? 20,
        input.bookStep ?? 0,
      ) as Record<string, unknown>;
      exchangeUsed = hubExchangeToName(String(live.feedExchange ?? input.exchange));
      sourceDetail = String(live.feedSource ?? "REST") === "WS_HUB"
        ? `${sourceCodeByExchange(exchangeUsed)}_WS_HUB`
        : `${sourceCodeByExchange(exchangeUsed)}_REST`;
      clearExchangeFailure(failureKey);
    } else {
      try {
        live = await fetchFromSelectedExchange(
          input.exchange,
          input.symbol,
          input.interval,
          input.limit,
          input.apiKey,
          input.bookLimit ?? 20,
          input.bookStep ?? 0,
        ) as Record<string, unknown>;
        exchangeUsed = hubExchangeToName(String(live.feedExchange ?? input.exchange));
        sourceDetail = String(live.feedSource ?? "REST") === "WS_HUB"
          ? `${sourceCodeByExchange(exchangeUsed)}_WS_HUB`
          : `${sourceCodeByExchange(exchangeUsed)}_REST`;
        clearExchangeFailure(failureKey);
      } catch {
        const streak = noteExchangeFailure(failureKey);
        if (input.allowStaleReplay !== false) {
          const staleGrace = getLiveBundleCachedWithGrace(input, 25_000);
          if (staleGrace && streak < 3) {
            const stalePayload = staleGrace as Record<string, unknown>;
            return {
              ...stalePayload,
              fetchedAt: new Date().toISOString(),
              staleReplay: true,
              sourceDetail: `${sourceCodeByExchange(input.exchange)}_STALE_CACHE`,
            };
          }
        }
        try {
          const fallback = await fetchFromCgFallback(
            input.symbol,
            input.exchange,
            input.interval,
            input.limit,
            input.apiKey,
            input.bookLimit ?? 20,
            input.bookStep ?? 0,
          );
          live = fallback.payload as Record<string, unknown>;
          exchangeUsed = fallback.exchangeUsed;
          sourceDetail = `${sourceCodeByExchange(exchangeUsed)}_FALLBACK_REST`;
        } catch {
          throw liveUnavailableError;
        }
        sourceUsed = "FALLBACK_API";
      }
    }

    const nowMs = Date.now();
    const result = {
      ok: true as const,
      symbol: input.symbol,
      interval: input.interval,
      exchange: input.exchange,
      sourceUsed,
      exchangeUsed,
      sourceDetail,
      ...live,
      feedLatencyMs: inferFeedLatencyMs(live, nowMs),
      fetchedAt: new Date(nowMs).toISOString(),
    };
    setLiveBundleCache(input, result);
    return result;
  })()
    .finally(() => {
      liveBundleInFlight.delete(inFlightKey);
    });

  liveBundleInFlight.set(inFlightKey, job);
  const resolved = await job;
  return resolved;
};

interface TickerItem {
  symbol: string;
  price: number;
  change24hPct: number;
  volume24hUsd: number | null;
  oiValue?: number | null;
  oiChange1hPct?: number | null;
}

interface FxCacheState {
  updatedAt: number;
  rates: Record<"USD" | "EUR" | "TRY", number>;
}

interface CoinMetaState {
  updatedAt: number;
  bySymbol: Record<string, { marketCapUsd: number; marketCapRank: number | null }>;
}

let fxCache: FxCacheState | null = null;
let coinMetaCache: CoinMetaState | null = null;
const universeSnapshotByKey = new Map<string, { ts: number; symbols: Set<string> }>();

const MAJORS = new Set(["BTC", "ETH", "SOL", "BNB", "XRP", "ADA", "AVAX", "DOGE"]);
const MEME = new Set(["DOGE", "SHIB", "PEPE", "FLOKI", "WIF", "BONK"]);
const AI_COINS = new Set(["FET", "AGIX", "OCEAN", "RNDR", "TAO", "ARKM"]);
const L1_COINS = new Set(["SOL", "ADA", "AVAX", "DOT", "ATOM", "NEAR", "APT", "SUI"]);
const DEFI_COINS = new Set(["UNI", "AAVE", "CRV", "MKR", "COMP", "SNX", "1INCH"]);

const COIN_ICON_ALIAS: Record<string, string> = {
  SUI: "sui",
  WIF: "wif",
  PEPE: "pepe",
  BONK: "bonk",
};

const coinIconUrl = (baseAsset: string): string => {
  const key = String(baseAsset ?? "").toUpperCase().trim();
  const slug = (COIN_ICON_ALIAS[key] ?? key).toLowerCase();
  return `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/${slug}.png`;
};

const normalizeUniverseSymbol = (raw: string): string => {
  const normalized = String(raw ?? "").toUpperCase().replace(/[-_/]/g, "").trim();
  if (!normalized) return "";
  return normalized.endsWith("USDT") ? normalized : `${normalized}USDT`;
};

const parseSymbolList = (raw: unknown): Set<string> => {
  if (typeof raw !== "string" || !raw.trim()) return new Set<string>();
  return new Set(
    raw
      .split(",")
      .map((item) => normalizeUniverseSymbol(item))
      .filter(Boolean),
  );
};

const fetchCoinMetaMap = async (): Promise<Record<string, { marketCapUsd: number; marketCapRank: number | null }>> => {
  const now = Date.now();
  if (coinMetaCache && now - coinMetaCache.updatedAt < 15 * 60_000) return coinMetaCache.bySymbol;

  const fetchPage = async (page: number) =>
    fetchJson<Array<{ symbol?: string; market_cap?: number; market_cap_rank?: number }>>(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}&sparkline=false`,
    ).catch(() => []);

  const [p1, p2] = await Promise.all([fetchPage(1), fetchPage(2)]);
  const all = [...p1, ...p2];
  const bySymbol: Record<string, { marketCapUsd: number; marketCapRank: number | null }> = {};

  for (const row of all) {
    const symbol = String(row.symbol ?? "").toUpperCase().trim();
    if (!symbol) continue;
    const rank = Number(row.market_cap_rank);
    const cap = Number(row.market_cap);
    const nextRank = Number.isFinite(rank) ? rank : null;
    const nextCap = Number.isFinite(cap) ? cap : 0;
    const existing = bySymbol[symbol];
    if (!existing) {
      bySymbol[symbol] = { marketCapUsd: nextCap, marketCapRank: nextRank };
      continue;
    }
    const existingRank = existing.marketCapRank;
    if (existingRank === null || (nextRank !== null && nextRank < existingRank)) {
      bySymbol[symbol] = { marketCapUsd: nextCap, marketCapRank: nextRank };
    }
  }

  coinMetaCache = {
    updatedAt: now,
    bySymbol,
  };
  return bySymbol;
};

const classifyUniverseGroup = (
  base: string,
  meta?: { marketCapUsd: number; marketCapRank: number | null } | null,
): string => {
  if (MAJORS.has(base)) return "MAJORS";
  if (MEME.has(base)) return "MEME";
  if (AI_COINS.has(base)) return "AI";
  if (L1_COINS.has(base)) return "L1";
  if (DEFI_COINS.has(base)) return "DEFI";
  const rank = meta?.marketCapRank ?? null;
  if (rank !== null && rank <= 30) return "LARGE_CAP";
  if (rank !== null && rank <= 120) return "MID_CAP";
  return "LOW_CAP";
};

// computeOpportunityScore replaced by computeEnhancedScore from coinScoring.ts
// Enhanced scoring adds funding rate (15%) and spread quality (15%) to the formula

const fetchBinanceTickers = async (): Promise<TickerItem[]> => {
  const rowsRaw = await fetchBinanceFuturesJson<unknown>(
    "/fapi/v1/ticker/24hr",
  );
  const rows = asList(rowsRaw).map((row) => asRecord(row)).filter((row): row is Record<string, unknown> => Boolean(row));
  return rows
    .map((row) => {
      const base = toBaseSymbol(String(row.symbol ?? row.s ?? ""));
      const price = pickNumberFromRecord(row, ["lastPrice", "last", "c"]);
      const change = pickNumberFromRecord(row, ["priceChangePercent", "price_change_percent", "P"]);
      const volume24hUsd = pickNumberFromRecord(row, ["quoteVolume", "quote_volume", "q", "volumeQuote"]);
      const oiValue = pickNumberFromRecord(row, ["openInterest", "open_interest", "sumOpenInterest", "sumOpenInterestValue"]);
      const oiChange1hPct = pickNumberFromRecord(row, [
        "openInterestChange1h",
        "open_interest_change_1h",
        "oiChange1h",
        "oi_change_1h",
      ]);
      if (!base || price === null || change === null) return null;
      return { symbol: base, price, change24hPct: change, volume24hUsd, oiValue, oiChange1hPct };
    })
    .filter((row): row is TickerItem => Boolean(row));
};

const fetchGateFuturesTickers = async (): Promise<TickerItem[]> => {
  const rowsRaw = await fetchJson<unknown>(`${GATE_FUTURES_BASE}/futures/usdt/tickers`).catch(() => []);
  const rows = asList(rowsRaw).map((row) => asRecord(row)).filter((row): row is Record<string, unknown> => Boolean(row));
  return rows
    .map((row) => {
      const base = toBaseSymbol(String(row.contract ?? row.name ?? row.id ?? row.symbol ?? ""));
      const price = pickNumberFromRecord(row, ["last", "last_price", "mark_price", "index_price"]);
      const change24hPct =
        pickNumberFromRecord(row, ["change_percentage", "change_24h", "change24h", "price_change_percent"]) ?? 0;
      const volume24hUsd =
        pickNumberFromRecord(row, [
          "volume_24h_quote",
          "volume_24h_usdt",
          "quote_volume",
          "turnover_24h",
          "volume_24h",
          "volume",
        ]) ?? 0;
      const oiValue = pickNumberFromRecord(row, [
        "open_interest_usd",
        "openInterestUsd",
        "open_interest",
        "openInterest",
        "total_size",
      ]);
      const oiChange1hPct = pickNumberFromRecord(row, [
        "open_interest_change_1h",
        "openInterestChange1h",
        "oi_change_1h",
        "oiChange1h",
      ]);
      if (!base || price === null) return null;
      return { symbol: base, price, change24hPct, volume24hUsd, oiValue, oiChange1hPct };
    })
    .filter((row): row is TickerItem => Boolean(row));
};

const fetchBybitTickers = async (): Promise<TickerItem[]> => {
  const res = await fetchJson<{ result?: { list?: Array<Record<string, string>> } }>(
    `${BYBIT_BASE}/v5/market/tickers?category=spot`,
  );
  return (res.result?.list ?? [])
    .map((row) => {
      const base = toBaseSymbol(String(row.symbol ?? ""));
      const price = toNumber(row.lastPrice);
      const changeRatio = toNumber(row.price24hPcnt);
      const change24hPct = changeRatio === null ? null : changeRatio * 100;
      const turnover24h = toNumber((row as Record<string, string>).turnover24h);
      const volume24h = toNumber((row as Record<string, string>).volume24h);
      const volume24hUsd = turnover24h ?? (volume24h !== null ? volume24h * price : null);
      if (!base || price === null || change24hPct === null) return null;
      return { symbol: base, price, change24hPct, volume24hUsd };
    })
    .filter((row): row is TickerItem => Boolean(row));
};

const fetchOkxTickers = async (): Promise<TickerItem[]> => {
  const res = await fetchJson<{ data?: Array<Record<string, string>> }>(
    `${OKX_BASE}/api/v5/market/tickers?instType=SPOT`,
  );
  return (res.data ?? [])
    .map((row) => {
      const base = toBaseSymbol(String(row.instId ?? ""));
      const price = toNumber(row.last);
      const open24h = toNumber(row.open24h);
      const volume24hUsd = toNumber(row.volCcy24h);
      if (!base || price === null || open24h === null || open24h === 0) return null;
      const change24hPct = ((price - open24h) / open24h) * 100;
      return { symbol: base, price, change24hPct, volume24hUsd };
    })
    .filter((row): row is TickerItem => Boolean(row));
};

const fetchTickersForExchange = async (exchange: ExchangeName): Promise<TickerItem[]> => {
  if (exchange === "Bybit") return fetchBybitTickers();
  if (exchange === "OKX") return fetchOkxTickers();
  if (exchange === "Gate.io") return fetchGateFuturesTickers();
  return fetchBinanceTickers();
};

const fetchTickersWithFallbackChain = async (primary: ExchangeName): Promise<TickerItem[]> => {
  const attempts = await orderedExchangeFallback(primary);
  let lastError: unknown = null;
  for (const exchange of attempts) {
    try {
      const items = await fetchTickersForExchange(exchange);
      if (items.length) return items;
    } catch (err) {
      lastError = err;
    }
  }
  throw (lastError instanceof Error ? lastError : new Error("all ticker source fallbacks failed"));
};

const fetchUsdFxRates = async (): Promise<Record<"USD" | "EUR" | "TRY", number>> => {
  const now = Date.now();
  if (fxCache && now - fxCache.updatedAt < 60_000) return fxCache.rates;

  try {
    const res = await fetchJson<{ rates?: Record<string, number> }>("https://open.er-api.com/v6/latest/USD");
    const eur = Number(res.rates?.EUR ?? NaN);
    const tryRate = Number(res.rates?.TRY ?? NaN);
    if (Number.isFinite(eur) && eur > 0 && Number.isFinite(tryRate) && tryRate > 0) {
      fxCache = {
        updatedAt: now,
        rates: {
          USD: 1,
          EUR: eur,
          TRY: tryRate,
        },
      };
      return fxCache.rates;
    }
  } catch {
    // fallback below
  }

  const fallbackRates = {
    USD: 1,
    EUR: 0.92,
    TRY: 36,
  } as const;
  fxCache = {
    updatedAt: now,
    rates: fallbackRates,
  };
  return fallbackRates;
};

const fetchIndicatorsSnapshot = async () => {
  const [coinsRes, globalRes, fgRes, btcChartRes] = await Promise.all([
    fetchJson<IndicatorsMarketCoin[]>(
      "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false&price_change_percentage=24h,30d",
    ),
    fetchJson<{ data?: { market_cap_percentage?: { btc?: number; eth?: number }; total_market_cap?: { usd?: number } } }>(
      "https://api.coingecko.com/api/v3/global",
    ),
    fetchJson<{ data?: Array<{ value: string }> }>("https://api.alternative.me/fng/?limit=180&format=json"),
    fetchJson<{ prices?: Array<[number, number]>; total_volumes?: Array<[number, number]> }>(
      "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=30&interval=daily",
    ),
  ]);

  return {
    fearGreed: {
      current: Number(fgRes.data?.[0]?.value ?? 50),
      history: (fgRes.data ?? []).slice(0, 180).reverse().map((row) => Number(row.value)),
    },
    market: {
      totalMarketCapUsd: Number(globalRes.data?.total_market_cap?.usd ?? 0),
      btcDominance: Number(globalRes.data?.market_cap_percentage?.btc ?? 0),
      ethDominance: Number(globalRes.data?.market_cap_percentage?.eth ?? 0),
      coins: coinsRes,
    },
    btcChart: {
      prices: (btcChartRes.prices ?? []).slice(-180).map((row) => row[1]),
      volumes: (btcChartRes.total_volumes ?? []).slice(-180).map((row) => row[1]),
    },
  };
};

export const registerMarketRoutes = (
  app: Express,
  options?: { providerStore?: AdminProviderStore; binanceFuturesHub?: BinanceFuturesHub; exchangeMarketHub?: ExchangeMarketHub; systemScanner?: SystemScannerService; coinUniverseEngine?: CoinUniverseEngine },
) => {
  setMarketProviderStore(options?.providerStore);
  setMarketBinanceHub(options?.binanceFuturesHub);
  setMarketExchangeHub(options?.exchangeMarketHub);
  const binanceFuturesHub = options?.binanceFuturesHub;
  const exchangeMarketHub = options?.exchangeMarketHub;
  const systemScanner = options?.systemScanner;
  const coinUniverseEngine = options?.coinUniverseEngine;

  // ---- Coin Universe Engine endpoint ----
  app.get("/api/market/universe-engine", (_req, res) => {
    if (!coinUniverseEngine) {
      res.status(503).json({ ok: false, error: "COIN_UNIVERSE_ENGINE_UNAVAILABLE" });
      return;
    }
    const snapshot = coinUniverseEngine.getSnapshot();
    res.json({
      ok: true,
      round: snapshot.round,
      refreshedAt: snapshot.refreshedAt,
      activeCoins: snapshot.activeCoins,
      cooldownCoins: snapshot.cooldownCoins,
    });
  });

  app.get("/api/market/binance-futures-hub", (_req, res) => {
    if (!binanceFuturesHub) {
      res.status(503).json({ ok: false, error: "BINANCE_FUTURES_HUB_UNAVAILABLE" });
      return;
    }
    res.json({
      ok: true,
      ...binanceFuturesHub.getStatus(),
      fetchedAt: new Date().toISOString(),
    });
  });

  app.get("/api/market/exchange-hub", (_req, res) => {
    if (!exchangeMarketHub) {
      res.status(503).json({ ok: false, error: "EXCHANGE_MARKET_HUB_UNAVAILABLE" });
      return;
    }
    res.json({
      ok: true,
      ...exchangeMarketHub.getStatus(),
      fetchedAt: new Date().toISOString(),
    });
  });

  app.get("/api/market/indicators", async (_req, res) => {
    try {
      const snapshot = await fetchIndicatorsSnapshot();
      res.json({
        ok: true,
        ...snapshot,
        fetchedAt: new Date().toISOString(),
      });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : "indicators fetch failed",
      });
    }
  });

  app.get("/api/market/tickers", async (req, res) => {
    const exchange = await resolveExchangeFromQuery(req.query.exchange);
    const sourceMode = String(req.query.source ?? "exchange").toLowerCase() === "fallback" ? "fallback" : "exchange";
    try {
      const hubStatus = binanceFuturesHub?.getStatus();
      const shouldUseHub =
        sourceMode === "exchange" &&
        exchange === "Binance" &&
        Boolean(binanceFuturesHub) &&
        Boolean(hubStatus) &&
        !hubStatus!.stale &&
        hubStatus!.tickerSymbols >= 20;
      const items = shouldUseHub
        ? binanceFuturesHub!.getTickers()
        : sourceMode === "fallback"
          ? await fetchTickersWithFallbackChain(exchange)
          : await fetchTickersForExchange(exchange).catch(() => fetchTickersWithFallbackChain(exchange));
      res.json({
        ok: true,
        exchange,
        sourceUsed: sourceMode === "fallback" ? "FALLBACK_API" : "EXCHANGE",
        sourceDetail: shouldUseHub ? "BINANCE_FUTURES_WS" : "REST",
        items,
        fetchedAt: new Date().toISOString(),
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : "tickers fetch failed", items: [] });
    }
  });

  app.get("/api/market/universe", async (req, res) => {
    const exchange = await resolveExchangeFromQuery(req.query.exchange);
    const sourceMode = String(req.query.source ?? "exchange").toLowerCase() === "fallback" ? "fallback" : "exchange";
    const minVolumeUsd = Math.max(0, Number(req.query.min_volume_usd ?? 20_000_000));
    const topN = Math.max(10, Math.min(2000, Number(req.query.top ?? 80)));
    const excludedSymbols = parseSymbolList(req.query.exclude_symbols);
    const cooldownSymbols = parseSymbolList(req.query.cooldown_symbols);

    try {
      const hubStatus = binanceFuturesHub?.getStatus();
      const shouldUseHub =
        sourceMode === "exchange" &&
        exchange === "Binance" &&
        Boolean(binanceFuturesHub) &&
        Boolean(hubStatus) &&
        !hubStatus!.stale &&
        hubStatus!.tickerSymbols >= 20;

      // Futures-only dual listing universe:
      // Keep only symbols that are listed on BOTH Binance USDT-M Futures and Gate.io USDT Futures.
      {
        const binanceSymbolSetDual = new Set<string>();
        const binanceTickerByBaseDual = new Map<string, TickerItem>();
        const binanceWsByBaseDual = new Map<string, {
          spreadBps: number | null;
          markPrice: number | null;
          fundingRate: number | null;
          nextFundingTime: number | null;
          sourceTs: number | null;
        }>();

        if (shouldUseHub) {
          const wsRows = binanceFuturesHub!.getUniverseRows();
          for (const row of wsRows) {
            const base = String(row.baseAsset ?? "").toUpperCase().trim();
            if (!base) continue;
            binanceSymbolSetDual.add(base);
            binanceTickerByBaseDual.set(base, {
              symbol: base,
              price: Number.isFinite(row.price) ? Number(row.price) : 0,
              change24hPct: Number.isFinite(row.change24hPct) ? Number(row.change24hPct) : 0,
              volume24hUsd: Number.isFinite(row.volume24hUsd) ? Number(row.volume24hUsd) : 0,
            });
            binanceWsByBaseDual.set(base, {
              spreadBps: row.spreadBps !== null && Number.isFinite(row.spreadBps) ? Number(row.spreadBps) : null,
              markPrice: row.markPrice !== null && Number.isFinite(row.markPrice) ? Number(row.markPrice) : null,
              fundingRate: row.fundingRate !== null && Number.isFinite(row.fundingRate) ? Number(row.fundingRate) : null,
              nextFundingTime: row.nextFundingTime ?? null,
              sourceTs: row.sourceTs ?? null,
            });
          }
        } else {
          const [binanceSymbolsDual, binanceTickersDual] = await Promise.all([
            fetchSymbolsFromBinance(),
            fetchBinanceTickers(),
          ]);
          for (const base of binanceSymbolsDual) binanceSymbolSetDual.add(base);
          for (const row of binanceTickersDual) {
            binanceTickerByBaseDual.set(row.symbol, row);
            binanceSymbolSetDual.add(row.symbol);
          }
        }

        const [gateSymbolsDual, gateTickersDual] = await Promise.all([
          fetchSymbolsFromGateFutures(),
          fetchGateFuturesTickers(),
        ]);
        const gateSymbolSetDual = new Set(gateSymbolsDual);
        const gateTickerByBaseDual = new Map(gateTickersDual.map((row) => [row.symbol, row]));

        const commonBasesDual = [...binanceSymbolSetDual]
          .filter((base) => gateSymbolSetDual.has(base))
          .sort((a, b) => a.localeCompare(b));

        const metaBySymbolDual = await fetchCoinMetaMap().catch(
          () => ({} as Record<string, { marketCapUsd: number; marketCapRank: number | null }>)
        );

        const normalizedUniverseDual = commonBasesDual
          .map((base) => {
            const symbol = `${base}USDT`;
            const bTicker = binanceTickerByBaseDual.get(base);
            const gTicker = gateTickerByBaseDual.get(base);
            const wsMeta = binanceWsByBaseDual.get(base);
            const price = Number.isFinite(bTicker?.price ?? Number.NaN)
              ? Number(bTicker!.price)
              : Number.isFinite(gTicker?.price ?? Number.NaN)
                ? Number(gTicker!.price)
                : 0;
            if (!Number.isFinite(price) || price <= 0) return null;
            const change24hPct = Number.isFinite(bTicker?.change24hPct ?? Number.NaN)
              ? Number(bTicker!.change24hPct)
              : Number.isFinite(gTicker?.change24hPct ?? Number.NaN)
                ? Number(gTicker!.change24hPct)
                : 0;
            const volume24hUsd = Math.max(
              Number(bTicker?.volume24hUsd ?? 0),
              Number(gTicker?.volume24hUsd ?? 0),
            );
            const oiValue = Math.max(
              Number(bTicker?.oiValue ?? 0),
              Number(gTicker?.oiValue ?? 0),
            );
            const oiChange1hPctRaw = Number.isFinite(bTicker?.oiChange1hPct ?? Number.NaN)
              ? Number(bTicker?.oiChange1hPct)
              : Number.isFinite(gTicker?.oiChange1hPct ?? Number.NaN)
                ? Number(gTicker?.oiChange1hPct)
                : null;
            const meta = metaBySymbolDual[base] ?? null;
            const group = classifyUniverseGroup(base, meta);
            const opportunityScore = computeEnhancedScore({
              volume24hUsd,
              absChange24hPct: Math.abs(change24hPct),
              marketCapRank: meta?.marketCapRank ?? null,
              fundingRate: wsMeta?.fundingRate ?? null,
              spreadBps: wsMeta?.spreadBps ?? null,
            });
            return {
              symbol,
              baseAsset: base,
              quoteAsset: "USDT" as const,
              type: "PERP" as const,
              status: "TRADING" as const,
              is_active: true,
              exchanges: ["Binance", "Gate.io"],
              price: Number(price.toFixed(8)),
              change24hPct: Number(change24hPct.toFixed(4)),
              volume24hUsd: Number(volume24hUsd.toFixed(2)),
              oiValue: Number.isFinite(oiValue) ? Number(oiValue.toFixed(2)) : null,
              oiChange1hPct: Number.isFinite(oiChange1hPctRaw ?? Number.NaN) ? Number((oiChange1hPctRaw as number).toFixed(4)) : null,
              marketCapUsd: Number((meta?.marketCapUsd ?? 0).toFixed(2)),
              marketCapRank: meta?.marketCapRank ?? null,
              group,
              opportunity_score: opportunityScore,
              spreadBps: wsMeta?.spreadBps ?? null,
              markPrice: wsMeta?.markPrice ?? null,
              fundingRate: wsMeta?.fundingRate ?? null,
              nextFundingTime: wsMeta?.nextFundingTime ?? null,
              sourceTs: wsMeta?.sourceTs ?? null,
            };
          })
          .filter((row): row is NonNullable<typeof row> => Boolean(row));

        const activeUniverseDual = normalizedUniverseDual.filter((row) => row.is_active);
        const snapshotKeyDual = `${sourceMode}:BINANCE_GATE_FUTURES`;
        const currentSymbolsDual = new Set(activeUniverseDual.map((row) => row.symbol));
        const previousSnapshotDual = universeSnapshotByKey.get(snapshotKeyDual);
        const newListingsDual = previousSnapshotDual
          ? [...currentSymbolsDual].filter((symbol) => !previousSnapshotDual.symbols.has(symbol))
          : [];
        const delistedDual = previousSnapshotDual
          ? [...previousSnapshotDual.symbols].filter((symbol) => !currentSymbolsDual.has(symbol))
          : [];
        universeSnapshotByKey.set(snapshotKeyDual, { ts: Date.now(), symbols: currentSymbolsDual });

        const filteredUniverseDual = activeUniverseDual.filter(
          (row) =>
            row.volume24hUsd >= minVolumeUsd &&
            !excludedSymbols.has(row.symbol) &&
            !cooldownSymbols.has(row.symbol),
        );

        const oiIncreaseTop5 = filteredUniverseDual
          .filter((row) => typeof row.oiChange1hPct === "number" && Number.isFinite(row.oiChange1hPct) && row.oiChange1hPct > 0)
          .sort((a, b) => (b.oiChange1hPct as number) - (a.oiChange1hPct as number))
          .slice(0, 5);
        const oiDecreaseTop5 = filteredUniverseDual
          .filter((row) => typeof row.oiChange1hPct === "number" && Number.isFinite(row.oiChange1hPct) && row.oiChange1hPct < 0)
          .sort((a, b) => (a.oiChange1hPct as number) - (b.oiChange1hPct as number))
          .slice(0, 5);
        const oiPriorityRows = [...oiIncreaseTop5, ...oiDecreaseTop5].filter(
          (row, index, rows) => rows.findIndex((item) => item.symbol === row.symbol) === index,
        );
        const oiPriorityMap = new Map<string, "OI_INCREASE_TOP5" | "OI_DECREASE_TOP5">();
        for (const row of oiIncreaseTop5) {
          oiPriorityMap.set(row.symbol, "OI_INCREASE_TOP5");
        }
        for (const row of oiDecreaseTop5) {
          if (!oiPriorityMap.has(row.symbol)) oiPriorityMap.set(row.symbol, "OI_DECREASE_TOP5");
        }

        const rankedRowsDual = [
          ...oiPriorityRows,
          ...filteredUniverseDual
            .slice()
            .filter((row) => !oiPriorityMap.has(row.symbol))
            .sort((a, b) => {
              if (b.opportunity_score !== a.opportunity_score) return b.opportunity_score - a.opportunity_score;
              if (b.volume24hUsd !== a.volume24hUsd) return b.volume24hUsd - a.volume24hUsd;
              return a.symbol.localeCompare(b.symbol);
            }),
        ].slice(0, topN);

        // Build scanner-selected symbol set for badge display
        const scannerSelectedSet = new Set<string>();
        if (systemScanner) {
          const scanCache = systemScanner.getCache();
          for (const tc of scanCache.topScoredCoins) {
            scannerSelectedSet.add(tc.symbol);
          }
        }

        const rankedCandidatesDual = rankedRowsDual
          .map((row, index) => ({
            rank: index + 1,
            symbol: row.symbol,
            baseAsset: row.baseAsset,
            icon_url: coinIconUrl(row.baseAsset),
            quoteAsset: row.quoteAsset,
            exchanges: row.exchanges,
            group: row.group,
            opportunity_score: row.opportunity_score,
            price: row.price,
            change24hPct: row.change24hPct,
            volume24hUsd: row.volume24hUsd,
            marketCapRank: row.marketCapRank,
            spreadBps: row.spreadBps,
            markPrice: row.markPrice,
            fundingRate: row.fundingRate,
            oi_value: row.oiValue ?? null,
            oi_change_1h_pct: row.oiChange1hPct ?? null,
            oi_priority: oiPriorityMap.get(row.symbol) ?? null,
            scanner_selected: scannerSelectedSet.has(row.symbol),
          }));

        const groupOrderDual = ["MAJORS", "LARGE_CAP", "MID_CAP", "LOW_CAP", "MEME", "AI", "L1", "DEFI"];
        const groupCountsDual = new Map<string, number>();
        for (const row of filteredUniverseDual) {
          groupCountsDual.set(row.group, (groupCountsDual.get(row.group) ?? 0) + 1);
        }
        const groupsDual = groupOrderDual
          .map((key) => ({ key, count: groupCountsDual.get(key) ?? 0 }))
          .filter((group) => group.count > 0);

        res.json({
          ok: true,
          source_mode: sourceMode,
          source_detail: shouldUseHub ? "BINANCE_FUTURES_WS+GATE_FUTURES_REST" : "BINANCE_FUTURES_REST+GATE_FUTURES_REST",
          exchange_primary: "Binance",
          connectors: ["Binance", "Gate.io"],
          registry: {
            total_pairs: normalizedUniverseDual.length,
            active_pairs: activeUniverseDual.length,
            new_listings: newListingsDual.length,
            delisted: delistedDual.length,
            last_sync: new Date().toISOString(),
          },
          universe: {
            input_total: activeUniverseDual.length,
            filtered_total: filteredUniverseDual.length,
            candidates_total: rankedCandidatesDual.length,
            min_volume_usd: minVolumeUsd,
            top_n: topN,
          },
          groups: groupsDual,
          excluded_symbols: [...excludedSymbols],
          cooldown_symbols: [...cooldownSymbols],
          events: {
            new_listings: newListingsDual.slice(0, 100),
            delisted: delistedDual.slice(0, 100),
          },
          ranked_candidates: rankedCandidatesDual,
          fetchedAt: new Date().toISOString(),
        });
        return;
      }

      if (shouldUseHub) {
        const wsRows = binanceFuturesHub!.getUniverseRows();
        const metaBySymbol = await fetchCoinMetaMap().catch(
          () => ({} as Record<string, { marketCapUsd: number; marketCapRank: number | null }>)
        );
        const normalizedUniverse = wsRows.map((row) => {
          const meta = metaBySymbol[row.baseAsset] ?? null;
          const group = classifyUniverseGroup(row.baseAsset, meta);
          const opportunityScore = computeEnhancedScore({
            volume24hUsd: row.volume24hUsd,
            absChange24hPct: Math.abs(row.change24hPct),
            marketCapRank: meta?.marketCapRank ?? null,
            fundingRate: row.fundingRate ?? null,
            spreadBps: row.spreadBps ?? null,
          });
          return {
            symbol: row.symbol,
            baseAsset: row.baseAsset,
            quoteAsset: "USDT" as const,
            type: "PERP" as const,
            status: "TRADING" as const,
            is_active: true,
            exchanges: ["Binance"],
            price: Number(row.price.toFixed(8)),
            change24hPct: Number(row.change24hPct.toFixed(4)),
            volume24hUsd: Number(row.volume24hUsd.toFixed(2)),
            marketCapUsd: Number((meta?.marketCapUsd ?? 0).toFixed(2)),
            marketCapRank: meta?.marketCapRank ?? null,
            group,
            opportunity_score: opportunityScore,
            spreadBps: row.spreadBps !== null ? Number(row.spreadBps.toFixed(2)) : null,
            markPrice: row.markPrice,
            fundingRate: row.fundingRate,
            nextFundingTime: row.nextFundingTime,
            sourceTs: row.sourceTs,
          };
        });

        const activeUniverse = normalizedUniverse.filter((row) => row.is_active);
        const snapshotKey = `${sourceMode}:${exchange}:WS`;
        const currentSymbols = new Set(activeUniverse.map((row) => row.symbol));
        const previousSnapshot = universeSnapshotByKey.get(snapshotKey);
        const newListings = previousSnapshot
          ? [...currentSymbols].filter((symbol) => !previousSnapshot.symbols.has(symbol))
          : [];
        const delisted = previousSnapshot
          ? [...previousSnapshot.symbols].filter((symbol) => !currentSymbols.has(symbol))
          : [];
        universeSnapshotByKey.set(snapshotKey, { ts: Date.now(), symbols: currentSymbols });

        const filteredUniverse = activeUniverse.filter(
          (row) =>
            row.volume24hUsd >= minVolumeUsd &&
            !excludedSymbols.has(row.symbol) &&
            !cooldownSymbols.has(row.symbol),
        );

        const rankedCandidates = filteredUniverse
          .slice()
          .sort((a, b) => {
            if (b.opportunity_score !== a.opportunity_score) return b.opportunity_score - a.opportunity_score;
            if (b.volume24hUsd !== a.volume24hUsd) return b.volume24hUsd - a.volume24hUsd;
            return a.symbol.localeCompare(b.symbol);
          })
          .slice(0, topN)
          .map((row, index) => ({
            rank: index + 1,
            symbol: row.symbol,
            baseAsset: row.baseAsset,
            icon_url: coinIconUrl(row.baseAsset),
            quoteAsset: row.quoteAsset,
            exchanges: row.exchanges,
            group: row.group,
            opportunity_score: row.opportunity_score,
            price: row.price,
            change24hPct: row.change24hPct,
            volume24hUsd: row.volume24hUsd,
            marketCapRank: row.marketCapRank,
            spreadBps: row.spreadBps,
            markPrice: row.markPrice,
            fundingRate: row.fundingRate,
          }));

        const groupOrder = ["MAJORS", "LARGE_CAP", "MID_CAP", "LOW_CAP", "MEME", "AI", "L1", "DEFI"];
        const groupCounts = new Map<string, number>();
        for (const row of filteredUniverse) {
          groupCounts.set(row.group, (groupCounts.get(row.group) ?? 0) + 1);
        }
        const groups = groupOrder
          .map((key) => ({ key, count: groupCounts.get(key) ?? 0 }))
          .filter((group) => group.count > 0);

        res.json({
          ok: true,
          source_mode: sourceMode,
          source_detail: "BINANCE_FUTURES_WS",
          exchange_primary: exchange,
          connectors: ["Binance"],
          registry: {
            total_pairs: normalizedUniverse.length,
            active_pairs: activeUniverse.length,
            new_listings: newListings.length,
            delisted: delisted.length,
            last_sync: new Date().toISOString(),
          },
          universe: {
            input_total: activeUniverse.length,
            filtered_total: filteredUniverse.length,
            candidates_total: rankedCandidates.length,
            min_volume_usd: minVolumeUsd,
            top_n: topN,
          },
          groups,
          excluded_symbols: [...excludedSymbols],
          cooldown_symbols: [...cooldownSymbols],
          events: {
            new_listings: newListings.slice(0, 100),
            delisted: delisted.slice(0, 100),
          },
          ranked_candidates: rankedCandidates,
          fetchedAt: new Date().toISOString(),
        });
        return;
      }

      const connectors: ExchangeName[] =
        sourceMode === "fallback"
          ? await orderedExchangeFallback(exchange)
          : [exchange];

      const connectorResults = await Promise.all(
        connectors.map(async (connector) => {
          const [symbols, tickers] = await Promise.all([
            fetchSymbolsForExchange(connector).catch(() => []),
            fetchTickersForExchange(connector).catch(() => []),
          ]);
          return { connector, symbols, tickers };
        }),
      );

      type InternalUniverse = {
        symbol: string;
        baseAsset: string;
        quoteAsset: "USDT";
        type: "SPOT";
        status: "TRADING";
        exchanges: Set<ExchangeName>;
        priceSamples: number[];
        changeSamples: number[];
        volume24hUsd: number;
      };

      const registry = new Map<string, InternalUniverse>();
      const ensureRow = (symbol: string): InternalUniverse => {
        const normalized = normalizeUniverseSymbol(symbol);
        const baseAsset = normalized.replace(/USDT$/, "");
        const existing = registry.get(normalized);
        if (existing) return existing;
        const next: InternalUniverse = {
          symbol: normalized,
          baseAsset,
          quoteAsset: "USDT",
          type: "SPOT",
          status: "TRADING",
          exchanges: new Set<ExchangeName>(),
          priceSamples: [],
          changeSamples: [],
          volume24hUsd: 0,
        };
        registry.set(normalized, next);
        return next;
      };

      for (const result of connectorResults) {
        for (const base of result.symbols) {
          const row = ensureRow(`${base}USDT`);
          row.exchanges.add(result.connector);
        }
        for (const ticker of result.tickers) {
          const row = ensureRow(`${ticker.symbol}USDT`);
          row.exchanges.add(result.connector);
          if (Number.isFinite(ticker.price)) row.priceSamples.push(ticker.price);
          if (Number.isFinite(ticker.change24hPct)) row.changeSamples.push(ticker.change24hPct);
          if (Number.isFinite(ticker.volume24hUsd ?? Number.NaN)) {
            row.volume24hUsd = Math.max(row.volume24hUsd, Number(ticker.volume24hUsd));
          }
        }
      }

      const metaBySymbol = await fetchCoinMetaMap().catch(() => ({} as Record<string, { marketCapUsd: number; marketCapRank: number | null }>));

      const normalizedUniverse = [...registry.values()].map((row) => {
        const avgPrice =
          row.priceSamples.length > 0
            ? row.priceSamples.reduce((sum, value) => sum + value, 0) / row.priceSamples.length
            : 0;
        const avgChange =
          row.changeSamples.length > 0
            ? row.changeSamples.reduce((sum, value) => sum + value, 0) / row.changeSamples.length
            : 0;
        const meta = metaBySymbol[row.baseAsset] ?? null;
        const group = classifyUniverseGroup(row.baseAsset, meta);
        const opportunityScore = computeEnhancedScore({
          volume24hUsd: row.volume24hUsd,
          absChange24hPct: Math.abs(avgChange),
          marketCapRank: meta?.marketCapRank ?? null,
          fundingRate: null,
          spreadBps: null,
        });
        return {
          symbol: row.symbol,
          baseAsset: row.baseAsset,
          quoteAsset: row.quoteAsset,
          type: row.type,
          status: row.status,
          is_active: row.exchanges.size > 0,
          exchanges: [...row.exchanges].sort(),
          price: Number(avgPrice.toFixed(8)),
          change24hPct: Number(avgChange.toFixed(4)),
          volume24hUsd: Number(row.volume24hUsd.toFixed(2)),
          marketCapUsd: Number((meta?.marketCapUsd ?? 0).toFixed(2)),
          marketCapRank: meta?.marketCapRank ?? null,
          group,
          opportunity_score: opportunityScore,
        };
      });

      const activeUniverse = normalizedUniverse.filter((row) => row.is_active);
      const snapshotKey = `${sourceMode}:${exchange}`;
      const currentSymbols = new Set(activeUniverse.map((row) => row.symbol));
      const previousSnapshot = universeSnapshotByKey.get(snapshotKey);
      const newListings = previousSnapshot
        ? [...currentSymbols].filter((symbol) => !previousSnapshot.symbols.has(symbol))
        : [];
      const delisted = previousSnapshot
        ? [...previousSnapshot.symbols].filter((symbol) => !currentSymbols.has(symbol))
        : [];
      universeSnapshotByKey.set(snapshotKey, { ts: Date.now(), symbols: currentSymbols });

      const filteredUniverse = activeUniverse.filter(
        (row) =>
          row.volume24hUsd >= minVolumeUsd &&
          !excludedSymbols.has(row.symbol) &&
          !cooldownSymbols.has(row.symbol),
      );

      const rankedCandidates = filteredUniverse
        .slice()
        .sort((a, b) => {
          if (b.opportunity_score !== a.opportunity_score) return b.opportunity_score - a.opportunity_score;
          if (b.volume24hUsd !== a.volume24hUsd) return b.volume24hUsd - a.volume24hUsd;
          return a.symbol.localeCompare(b.symbol);
        })
        .slice(0, topN)
        .map((row, index) => ({
          rank: index + 1,
          symbol: row.symbol,
          baseAsset: row.baseAsset,
          icon_url: coinIconUrl(row.baseAsset),
          quoteAsset: row.quoteAsset,
          exchanges: row.exchanges,
          group: row.group,
          opportunity_score: row.opportunity_score,
          price: row.price,
          change24hPct: row.change24hPct,
          volume24hUsd: row.volume24hUsd,
          marketCapRank: row.marketCapRank,
        }));

      const groupOrder = ["MAJORS", "LARGE_CAP", "MID_CAP", "LOW_CAP", "MEME", "AI", "L1", "DEFI"];
      const groupCounts = new Map<string, number>();
      for (const row of filteredUniverse) {
        groupCounts.set(row.group, (groupCounts.get(row.group) ?? 0) + 1);
      }
      const groups = groupOrder
        .map((key) => ({ key, count: groupCounts.get(key) ?? 0 }))
        .filter((group) => group.count > 0);

      res.json({
        ok: true,
        source_mode: sourceMode,
        exchange_primary: exchange,
        connectors,
        registry: {
          total_pairs: normalizedUniverse.length,
          active_pairs: activeUniverse.length,
          new_listings: newListings.length,
          delisted: delisted.length,
          last_sync: new Date().toISOString(),
        },
        universe: {
          input_total: activeUniverse.length,
          filtered_total: filteredUniverse.length,
          candidates_total: rankedCandidates.length,
          min_volume_usd: minVolumeUsd,
          top_n: topN,
        },
        groups,
        excluded_symbols: [...excludedSymbols],
        cooldown_symbols: [...cooldownSymbols],
        events: {
          new_listings: newListings.slice(0, 100),
          delisted: delisted.slice(0, 100),
        },
        ranked_candidates: rankedCandidates,
        fetchedAt: new Date().toISOString(),
      });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : "universe fetch failed",
        ranked_candidates: [],
      });
    }
  });

  app.get("/api/market/convert", async (req, res) => {
    const exchange = await resolveExchangeFromQuery(req.query.exchange);
    const sourceMode = String(req.query.source ?? "exchange").toLowerCase() === "fallback" ? "fallback" : "exchange";
    const from = String(req.query.from ?? "BTC").toUpperCase().trim();
    const to = String(req.query.to ?? "USDT").toUpperCase().trim();
    const amount = Number(req.query.amount ?? 1);

    const validFiat = new Set(["USD", "EUR", "TRY"]);
    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ ok: false, error: "amount must be a positive number" });
      return;
    }
    if (!from || !to) {
      res.status(400).json({ ok: false, error: "from and to are required" });
      return;
    }

    try {
      const tickers =
        sourceMode === "fallback"
          ? await fetchTickersWithFallbackChain(exchange)
          : await fetchTickersForExchange(exchange).catch(() => fetchTickersWithFallbackChain(exchange));
      const fx = await fetchUsdFxRates();

      const toUsd = (asset: string): number => {
        if (asset === "USDT" || asset === "USD") return 1;
        if (validFiat.has(asset)) return 1 / fx[asset as "USD" | "EUR" | "TRY"];
        const row = tickers.find((t) => t.symbol === asset);
        if (!row) throw new Error(`unsupported or unavailable asset: ${asset}`);
        return row.price;
      };

      const fromUsd = toUsd(from);
      const toUsdPrice = toUsd(to);
      const rate = fromUsd / toUsdPrice;
      const converted = amount * rate;

      res.json({
        ok: true,
        exchange,
        sourceUsed: sourceMode === "fallback" ? "FALLBACK_API" : "EXCHANGE",
        input: {
          from,
          to,
          amount,
        },
        pricing: {
          fromUsdPrice: fromUsd,
          toUsdPrice: toUsdPrice,
          rate,
          inverseRate: rate > 0 ? 1 / rate : 0,
          converted,
        },
        fx,
        fetchedAt: new Date().toISOString(),
      });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : "conversion failed",
      });
    }
  });

  app.get("/api/market/symbols", async (req, res) => {
    const exchange = await resolveExchangeFromQuery(req.query.exchange);
    const sourceMode = String(req.query.source ?? "exchange").toLowerCase() === "fallback" ? "fallback" : "exchange";

    try {
      const hubStatus = binanceFuturesHub?.getStatus();
      const shouldUseHub =
        sourceMode === "exchange" &&
        exchange === "Binance" &&
        Boolean(binanceFuturesHub) &&
        Boolean(hubStatus) &&
        !hubStatus!.stale &&
        hubStatus!.tickerSymbols >= 20;
      const symbols = shouldUseHub
        ? binanceFuturesHub!.getSymbols()
        : sourceMode === "fallback"
          ? await fetchSymbolsWithFallbackChain(exchange)
          : await fetchSymbolsForExchange(exchange).catch(() => fetchSymbolsWithFallbackChain(exchange));

      res.json({
        ok: true,
        sourceUsed: sourceMode === "fallback" ? "FALLBACK_API" : "EXCHANGE",
        sourceDetail: shouldUseHub ? "BINANCE_FUTURES_WS" : "REST",
        exchange,
        symbols,
        fetchedAt: new Date().toISOString(),
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : "symbols fetch failed", symbols: [] });
    }
  });

  app.get("/api/market/live", async (req, res) => {
    const symbol = String(req.query.symbol ?? "BTCUSDT").toUpperCase();
    const interval = intervalMap(String(req.query.interval ?? "15m"));
    const limit = Math.max(120, Math.min(1000, Number(req.query.limit ?? 360)));
    const exchange = await resolveExchangeFromQuery(req.query.exchange);
    const apiKey = String(req.query.apiKey ?? CG_API_KEY);
    const sourceMode = String(req.query.source ?? "exchange").toLowerCase() === "fallback" ? "fallback" : "exchange";
    const strict = String(req.query.strict ?? "0") === "1";
    const bookLimit = Math.max(10, Math.min(100, Number(req.query.bookLimit ?? 20)));
    const bookStep = Math.max(0, Number(req.query.bookStep ?? 0.1));

    try {
      const payload = await fetchMarketLiveBundle({
        symbol,
        interval,
        limit,
        exchange,
        apiKey,
        sourceMode,
        strict,
        bookLimit,
        bookStep,
      });
      res.json(payload);
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : "live fetch failed" });
    }
  });

  app.get("/api/market/onchain", async (req, res) => {
    const symbol = String(req.query.symbol ?? "BTCUSDT").toUpperCase().trim();
    try {
      const { providerName, metrics } = await fetchOnChainMetrics(symbol);
      const hasAny =
        metrics.exchangeNetflowUsd !== null ||
        metrics.exchangeInflowUsd !== null ||
        metrics.exchangeOutflowUsd !== null ||
        metrics.whaleTxCount !== null ||
        metrics.walletConcentrationPct !== null ||
        metrics.activeAddresses !== null ||
        metrics.nvtRatio !== null ||
        metrics.mvrvRatio !== null ||
        metrics.dormancyDays !== null;
      res.json({
        ok: true,
        symbol,
        provider: providerName,
        dataAvailable: hasAny,
        metrics,
        fetchedAt: new Date().toISOString(),
      });
    } catch (err) {
      res.status(500).json({
        ok: false,
        symbol,
        error: err instanceof Error ? err.message : "onchain_fetch_failed",
      });
    }
  });

  app.get("/api/market/trade-idea", async (req, res) => {
    const symbol = String(req.query.symbol ?? "BTCUSDT").toUpperCase();
    const timeframe = intervalMap(String(req.query.timeframe ?? "15m"));
    const horizon = String(req.query.horizon ?? "INTRADAY").toUpperCase();
    const exchange = await resolveExchangeFromQuery(req.query.exchange);
    const apiKey = String(req.query.apiKey ?? CG_API_KEY);
    const sourceMode = String(req.query.source ?? "exchange").toLowerCase() === "fallback" ? "fallback" : "exchange";
    const strict = String(req.query.strict ?? "0") === "1";
    const scoringMode = normalizeScoringMode(String(req.query.scoring_mode ?? "BALANCED").toUpperCase());

    try {
      const normalizedHorizon = horizon === "SCALP" || horizon === "SWING" ? horizon : "INTRADAY";
      const liveBundle = await fetchMarketLiveBundle({
        symbol,
        interval: timeframe,
        limit: 360,
        exchange,
        apiKey,
        sourceMode,
        strict,
        allowStaleReplay: false,
      });
      const now = new Date();
      const nowMs = now.getTime();
      const seenTs = inferFreshestFeedTimestampMs(liveBundle as Record<string, unknown>, nowMs);
      const uiLatencyMs = Math.max(0, nowMs - Date.parse(liveBundle.fetchedAt));
      const feedLatencyMs = Number.isFinite(Number((liveBundle as Record<string, unknown>).feedLatencyMs))
        ? Math.max(0, Number((liveBundle as Record<string, unknown>).feedLatencyMs))
        : 0;

      const liveState = {
        ohlcv: liveBundle.ohlcv,
        orderbook: liveBundle.orderbook,
        trades: liveBundle.trades,
        derivatives: liveBundle.derivatives,
        latencyMs: uiLatencyMs,
        feedLatencyMs,
        uiLatencyMs,
        lastSeen: {
          priceOhlcv: seenTs,
          orderbook: seenTs,
          trades: seenTs,
          ...(typeof liveBundle.derivatives?.fundingRate === "number" ? { fundingRate: seenTs } : {}),
          ...(typeof liveBundle.derivatives?.oiValue === "number" ? { openInterest: seenTs } : {}),
        },
      };

      const scenario = ENGINE_SCENARIO_BY_HORIZON[normalizedHorizon as keyof typeof ENGINE_SCENARIO_BY_HORIZON];
      const snapshotsByMode = Object.fromEntries(
        SCORING_MODES.map((mode) => [
          mode,
          buildBitriumIntelligenceSnapshot({
            live: liveState,
            feeds: ENGINE_FEEDS,
            scenario,
            indicators: ENGINE_INDICATORS as any,
            consensusInputs: ENGINE_CONSENSUS_INPUTS,
            scoringMode: mode,
          }),
        ]),
      ) as Record<ScoringMode, ReturnType<typeof buildBitriumIntelligenceSnapshot>>;

      const selectedSnapshot = snapshotsByMode[scoringMode];
      if (!selectedSnapshot) throw new Error("BITRIUM_ENGINE_EMPTY_SNAPSHOT");

      const tileState = (key: string, fallback: string): string =>
        selectedSnapshot.tiles.find((tile) => tile.key === key)?.state ?? fallback;

      const modeBreakdown = Object.fromEntries(
        SCORING_MODES.map((mode) => {
          const snapshot = snapshotsByMode[mode];
          if (!snapshot) {
            return [mode, {
              raw: 0,
              base: 0,
              final: 0,
              penaltyModel: "SUBTRACT" as const,
              penaltyApplied: 0,
              penaltyRate: 0,
              edgeAdj: 0,
              riskAdj: 0,
              gatingFlags: ["DATA_BLOCK"],
              decision: "NO_TRADE" as const,
            }];
          }
          return [mode, makeModeBreakdown(mode, snapshot, scenario.breakoutOnly)];
        }),
      ) as Record<ScoringMode, ModeBreakdown>;

      const close = Number(liveBundle.ohlcv.at(-1)?.close ?? 0);
      // Compute key levels: prefer snapshot, fallback to direct OHLCV computation
      const snapshotKeyLevels = (selectedSnapshot.keyLevels ?? []) as Array<{ price: number; type?: string; label?: string; strength?: string; touchCount?: number }>;
      const directKeyLevels = liveBundle.ohlcv && liveBundle.ohlcv.length >= 10
        ? deriveKeyLevels(liveBundle.ohlcv as Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }>)
        : [];
      const effectiveKeyLevels = snapshotKeyLevels.length > 0 ? snapshotKeyLevels : directKeyLevels;
      const nearestLevelDistance = nearestKeyLevelDistancePct(close, effectiveKeyLevels as Array<{ price?: number }>);
      const srBoostBase = supportResistanceBoost(nearestLevelDistance);
      if (srBoostBase > 0) {
        const modeMultiplier: Record<ScoringMode, number> = {
          FLOW: 1.3,
          AGGRESSIVE: 1.1,
          BALANCED: 0.95,
          CAPITAL_GUARD: 0.85,
        };
        // Per-mode TRADE decision thresholds — must stay aligned with consensus functions
        const modeTradeThreshold: Record<ScoringMode, number> = {
          FLOW: 55,
          AGGRESSIVE: 60,
          BALANCED: 65,
          CAPITAL_GUARD: 68,
        };
        const modeWatchThreshold: Record<ScoringMode, number> = {
          FLOW: 35,
          AGGRESSIVE: 40,
          BALANCED: 45,
          CAPITAL_GUARD: 48,
        };
        for (const mode of SCORING_MODES) {
          const boost = srBoostBase * modeMultiplier[mode];
          const boostedFinal = clamp(modeBreakdown[mode].final + boost, 0, 100);
          modeBreakdown[mode] = {
            ...modeBreakdown[mode],
            final: Number(boostedFinal.toFixed(2)),
            decision: Math.round(boostedFinal) >= modeTradeThreshold[mode]
              ? "TRADE"
              : Math.round(boostedFinal) >= modeWatchThreshold[mode]
                ? "WATCH"
                : "NO_TRADE",
          };
        }
      }

      const modeScores = Object.fromEntries(
        SCORING_MODES.map((mode) => [mode, Number((modeBreakdown[mode].final / 100).toFixed(4))]),
      ) as Record<ScoringMode, number>;
      const confidence = modeScores[scoringMode] ?? 0;
      const modeIdeaMinScorePct: Record<ScoringMode, number> = {
        FLOW: 40,
        AGGRESSIVE: 40,
        BALANCED: 40,
        CAPITAL_GUARD: 40,
      };
      const approvedModes = SCORING_MODES.filter((mode) => {
        const scorePct = Number((modeScores[mode] ?? 0) * 100);
        return Number.isFinite(scorePct) && scorePct >= modeIdeaMinScorePct[mode];
      });
      const decisionTraceByMode = Object.fromEntries(
        SCORING_MODES.map((mode) => [mode, makeDecisionTrace(modeBreakdown[mode], modeScores[mode] ?? 0)]),
      ) as Record<ScoringMode, ModeDecisionTrace>;

      const selectedPanel = selectedSnapshot.aiPanel;
      const trendDirection = tileState("trend-direction", "NEUTRAL");
      const direction = resolveDirectionFromSnapshot(selectedSnapshot);
      // Keep trade validity aligned with the active scoring mode decision.
      // This avoids false VALIDITY_BLOCK cases where mode score passes but panel-level static validity lags behind.
      const activeModeDecision = modeBreakdown[scoringMode]?.decision ?? "NO_TRADE";
      const tradeValidity: "VALID" | "WEAK" | "NO-TRADE" =
        activeModeDecision === "TRADE"
          ? "VALID"
          : activeModeDecision === "WATCH"
            ? "WEAK"
            : "NO-TRADE";
      const entryWindow = tileState("entry-timing-window", "CLOSED");
      const slippageRisk = tileState("slippage-risk", "HIGH");

      // --- S/R based Entry / SL / TP calculation ---
      const pricePrecision = binanceFuturesHub?.getPricePrecision(symbol) ?? 8;
      const roundTick = (p: number) => Number(p.toFixed(pricePrecision));

      // Compute ATR from OHLCV for fallback distances
      const ohlcvArr = liveBundle.ohlcv ?? [];
      let atrValue = 0;
      if (ohlcvArr.length >= 16) {
        let trSum = 0;
        for (let i = ohlcvArr.length - 14; i < ohlcvArr.length; i++) {
          const c = ohlcvArr[i], pc = ohlcvArr[i - 1].close;
          trSum += Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
        }
        atrValue = trSum / 14;
      }
      if (!Number.isFinite(atrValue) || atrValue <= 0) atrValue = close * 0.01; // 1% fallback

      // Extract supports and resistances from key levels (effectiveKeyLevels computed above)
      const kl = effectiveKeyLevels;
      const supports = kl
        .filter((l) => (l.type === "support" || l.price < close) && l.price > 0 && l.price < close)
        .sort((a, b) => b.price - a.price); // closest first
      const resistances = kl
        .filter((l) => (l.type === "resistance" || l.price > close) && l.price > 0 && l.price > close)
        .sort((a, b) => a.price - b.price); // closest first

      let sl1: number, sl2: number, tp1: number, tp2: number, entryLow: number, entryHigh: number;
      const buffer = atrValue * 0.15; // small buffer beyond S/R levels

      if (direction === "LONG") {
        sl1 = supports.length >= 1 ? supports[0].price - buffer : close - atrValue * 1.0;
        sl2 = supports.length >= 2 ? supports[1].price - buffer : close - atrValue * 1.5;
        tp1 = resistances.length >= 1 ? resistances[0].price : close + atrValue * 1.5;
        tp2 = resistances.length >= 2 ? resistances[1].price : close + atrValue * 2.5;
        entryLow = close - atrValue * 0.2;
        entryHigh = close + atrValue * 0.1;
      } else {
        sl1 = resistances.length >= 1 ? resistances[0].price + buffer : close + atrValue * 1.0;
        sl2 = resistances.length >= 2 ? resistances[1].price + buffer : close + atrValue * 1.5;
        tp1 = supports.length >= 1 ? supports[0].price : close - atrValue * 1.5;
        tp2 = supports.length >= 2 ? supports[1].price : close - atrValue * 2.5;
        entryLow = close + atrValue * 0.2;
        entryHigh = close - atrValue * 0.1;
      }

      // Ensure correct ordering
      if (entryLow > entryHigh) [entryLow, entryHigh] = [entryHigh, entryLow];
      if (direction === "LONG") {
        if (sl2 > sl1) [sl1, sl2] = [sl2, sl1]; // sl1 closer to price
        if (tp2 < tp1) [tp1, tp2] = [tp2, tp1]; // tp1 closer to price
      } else {
        if (sl2 < sl1) [sl1, sl2] = [sl2, sl1];
        if (tp2 > tp1) [tp1, tp2] = [tp2, tp1];
      }

      // Round all to Binance tick size
      entryLow = roundTick(entryLow);
      entryHigh = roundTick(entryHigh);
      sl1 = roundTick(sl1);
      sl2 = roundTick(sl2);
      tp1 = roundTick(tp1);
      tp2 = roundTick(tp2);

      const validBars = Math.max(0, Number(selectedPanel.freshness.validForBars ?? 0));
      const tfMin = timeframe === "1m" ? 1 : timeframe === "5m" ? 5 : timeframe === "15m" ? 15 : timeframe === "30m" ? 30 : timeframe === "1h" ? 60 : timeframe === "4h" ? 240 : 1440;
      const until = new Date(nowMs + Math.max(1, validBars) * tfMin * 60_000);
      const sourceTs = liveBundle.ohlcv.at(-1)?.time
        ? new Date(Number(liveBundle.ohlcv.at(-1)?.time) * 1000).toISOString()
        : liveBundle.fetchedAt;

      const trendLabel = trendDirection === "UP" ? "Up" : trendDirection === "DOWN" ? "Down" : "Neutral";
      const htfBias = tileState("relative-strength-vs-market", "NEUTRAL");
      const volatilityState = tileState("atr-regime", "NORMAL");
      const executionState = `Liquidity ${tileState("liquidity-density", "LOW")} / Spread ${tileState("spread-regime", "WIDE")}`;
      const flowLines = selectedPanel.keyReasons.slice(0, 4).map((line) => line.replace(/\.$/, ""));
      const intentLines = selectedPanel.summary.slice(0, 3).map((line) => line.replace(/\.$/, ""));

      const text = `BITRIUM AI TRADE PLAN
Symbol: ${symbol}
Direction: ${direction}
Horizon: ${normalizedHorizon}
Timeframe: ${timeframe}
Setup: ${selectedPanel.playbook}
Confidence: ${confidence.toFixed(2)}
Scoring Mode: ${scoringMode}

EXECUTION
Trade Validity: ${tradeValidity}
Entry Window: ${entryWindow}
Slippage Risk: ${slippageRisk}
Triggers: ${(selectedPanel.triggerConditions.slice(0, 2).join("; ") || "None")}
Invalidation: ${(selectedPanel.invalidationTriggers.slice(0, 2).join(" / ") || "N/A")}
Time: ${now.toISOString()} | Valid ~${validBars} bars (until ${until.toISOString()})

ENTRY ZONE
${entryLow.toLocaleString(undefined, { minimumFractionDigits: pricePrecision, maximumFractionDigits: pricePrecision })} – ${entryHigh.toLocaleString(undefined, { minimumFractionDigits: pricePrecision, maximumFractionDigits: pricePrecision })}

STOP LEVELS
SL1: ${sl1.toLocaleString(undefined, { minimumFractionDigits: pricePrecision, maximumFractionDigits: pricePrecision })}    Share %50
SL2: ${sl2.toLocaleString(undefined, { minimumFractionDigits: pricePrecision, maximumFractionDigits: pricePrecision })}    Share %50

TARGETS
TP1: ${tp1.toLocaleString(undefined, { minimumFractionDigits: pricePrecision, maximumFractionDigits: pricePrecision })}     Share %50
TP2: ${tp2.toLocaleString(undefined, { minimumFractionDigits: pricePrecision, maximumFractionDigits: pricePrecision })}     Share %50

MARKET STATE
Trend: ${trendLabel}
HTF Bias: ${htfBias}
Volatility: ${volatilityState}
Execution: ${executionState}

FLOW ANALYSIS
• ${flowLines[0] ?? "No additional flow reason"}
• ${flowLines[1] ?? "No additional flow reason"}
• ${flowLines[2] ?? "No additional flow reason"}
• ${flowLines[3] ?? "No additional flow reason"}

TRADE INTENT
${intentLines[0] ?? "Wait for aligned structure and execution."}
${intentLines[1] ?? "Avoid entries outside planned zone."}
${intentLines[2] ?? "Always manage your own risk."}

Always manage your own risk.`;

      const keyLevelsResponse = kl.map((l: { label?: string; price?: number; type?: string; strength?: string; touchCount?: number }) => ({
        label: l.label,
        price: l.price,
        type: l.type,
        strength: l.strength,
      }));
      res.json({
        ok: true,
        text,
        fetchedAt: now.toISOString(),
        engine_source: "BITRIUM_INTELLIGENCE",
        source_ts: sourceTs,
        ingest_ts: liveBundle.fetchedAt,
        compute_ts: now.toISOString(),
        price_type: "LAST",
        price_value: Number(close.toFixed(8)),
        feed_source: liveBundle.sourceUsed === "FALLBACK_API" ? "BITRIUM_FALLBACK" : "EXCHANGE",
        tf_pack: {
          primary: timeframe,
          context: normalizedHorizon,
        },
        exchange,
        sourceUsed: liveBundle.sourceUsed,
        exchangeUsed: liveBundle.exchangeUsed,
        sourceDetail: liveBundle.sourceDetail,
        scoring_mode: scoringMode,
        mode_scores: modeScores,
        mode_breakdown: modeBreakdown,
        decision_trace: {
          selected: decisionTraceByMode[scoringMode],
          by_mode: decisionTraceByMode,
        },
        approved_modes: approvedModes,
        oi_change_1h: liveBundle.derivatives?.oiChange1h ?? null,
        entry_low: entryLow,
        entry_high: entryHigh,
        sl_levels: [sl1, sl2],
        tp_levels: [tp1, tp2],
        price_precision: pricePrecision,
        direction,
        trade_validity: tradeValidity,
        entry_window: entryWindow,
        slippage_risk: slippageRisk,
        horizon: normalizedHorizon,
        timeframe,
        setup: selectedPanel.playbook,
        triggers_to_activate: selectedPanel.triggerConditions.slice(0, 4),
        invalidation_triggers: selectedPanel.invalidationTriggers.slice(0, 2),
        key_levels: keyLevelsResponse,
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : "trade idea fetch failed" });
    }
  });
};
