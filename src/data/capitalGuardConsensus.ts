/**
 * Capital Guard Consensus — 8-Signal Alignment Strategy
 *
 * Designed for high win rate + high trade frequency in crypto markets.
 *
 * Core philosophy:
 *   ALL 4 layers must align: Structure + Liquidity + Positioning + Execution
 *   When they do → open trade. When they don't → skip.
 *
 * 8 Key Signals (crypto-optimized):
 *   1. Trend Direction     2. Trend Strength
 *   3. Liquidity Cluster   4. Orderbook Imbalance
 *   5. Funding Bias        6. OI Change
 *   7. Aggressor Flow      8. Volume Spike
 *
 * Strategy bias: Pullback Continuation > Breakout
 *   - Pullback setups get +5 bonus (trend + pullback + liquidity + volume ignition)
 *   - Breakout setups get -3 penalty (fake breakout risk in crypto)
 *
 * Win rate filters:
 *   - Signal alignment ≥ 2/8 required for TRADE
 *   - Execution certainty ≥ MEDIUM
 *   - Risk gate = OPEN
 *   - Signal conflict ≤ LOW
 *
 * Decision levels:
 *   82+   High conviction TRADE  (sizeHint 1.00)
 *   66-81 Normal TRADE           (sizeHint 0.70)
 *   48-65 Small size TRADE       (sizeHint 0.40)
 *   36-47 WATCH                  (sizeHint 0.15)
 *   <36   NO_TRADE               (sizeHint 0.00)
 */

// ── Type aliases ─────────────────────────────────────────────

export type Regime = "TREND" | "RANGE" | "MIXED" | "UNKNOWN";
export type TernaryRisk = "LOW" | "MID" | "HIGH" | "UNKNOWN";
export type TrendStrength = "LOW" | "MID" | "HIGH" | "UNKNOWN";
export type EmaAlignment = "BULL" | "BEAR" | "MIXED" | "UNKNOWN";
export type VwapPosition = "ABOVE" | "BELOW" | "AT" | "UNKNOWN";
export type StructureAge = "EARLY" | "MATURE" | "UNKNOWN";
export type MarketSpeed = "SLOW" | "NORMAL" | "FAST" | "UNKNOWN";
export type Compression = "ON" | "OFF" | "UNKNOWN";
export type EntryWindow = "OPEN" | "CLOSED" | "UNKNOWN";
export type SlippageLevel = "LOW" | "MED" | "HIGH" | "UNKNOWN";
export type Asymmetry = "REWARD_DOMINANT" | "RISK_DOMINANT" | "UNKNOWN";
export type RrPotential = "LOW" | "MID" | "HIGH" | "UNKNOWN";
export type EntryQuality = "BAD" | "MID" | "GOOD" | "UNKNOWN";
export type ConflictLevel = "LOW" | "MID" | "HIGH" | "UNKNOWN";
export type FeedHealthStatus = "healthy" | "degraded" | "down";

export type OrderbookImbalance = "BUY" | "SELL" | "NEUTRAL";
export type OiChangeStrength = "LOW" | "MID" | "HIGH";
export type FundingBias = "BULLISH" | "BEARISH" | "NEUTRAL" | "EXTREME";
export type SpotVsDerivativesPressure = "SPOT_DOM" | "DERIV_DOM" | "BALANCED";
export type BinaryToggle = "ON" | "OFF" | "UNKNOWN";
export type WhaleActivity = "ACCUMULATION" | "DISTRIBUTION" | "NEUTRAL";
export type ExchangeFlow = "INFLOW" | "OUTFLOW" | "NEUTRAL";
export type RelativeStrength = "STRONG" | "WEAK" | "NEUTRAL";
export type LiquidationPoolBias = "UP" | "DOWN" | "MIXED" | "UNKNOWN";
export type RsiState = "OVERSOLD" | "OVERBOUGHT" | "NEUTRAL" | "UNKNOWN";
export type AtrRegime = "LOW" | "MID" | "HIGH" | "UNKNOWN";
export type LiquidityDensity = "LOW" | "MID" | "HIGH" | "UNKNOWN";
export type MacroTrend = "UP" | "DOWN" | "FLAT" | "UNKNOWN";

// ── Data health ──────────────────────────────────────────────

export interface CapitalGuardDataHealth {
  staleFeed: boolean;
  missingFields: number;
  latencyMs: number;
  feeds: {
    ohlcv?: FeedHealthStatus;
    orderbook?: FeedHealthStatus;
    oi?: FeedHealthStatus;
    funding?: FeedHealthStatus;
    netflow?: FeedHealthStatus;
    trades?: FeedHealthStatus;
  };
}

// ── Input ────────────────────────────────────────────────────

export interface CapitalGuardConsensusInput {
  // Component scores from AI panel (0-100)
  structureScore?: number;
  liquidityScore?: number;
  positioningScore?: number;
  executionScore?: number;

  // Market structure & trends
  regime?: Regime;
  trendStrength?: TrendStrength;
  emaAlignment?: EmaAlignment;
  vwapPosition?: VwapPosition;
  structureAge?: StructureAge;
  marketSpeed?: MarketSpeed;
  compression?: Compression;

  // Orderbook & liquidity risk
  spoofRisk?: TernaryRisk;
  spreadRegime?: "TIGHT" | "MID" | "WIDE" | "UNKNOWN";
  depthQuality?: "GOOD" | "MID" | "POOR" | "UNKNOWN";

  // Risk factors
  crowdingRisk?: TernaryRisk;
  cascadeRisk?: TernaryRisk;
  stressLevel?: TernaryRisk;
  entryWindow?: EntryWindow;

  // Execution parameters
  pFill?: number;
  capacity?: number;
  slippageLevel?: SlippageLevel;

  // Edge & win rate
  eNetR?: number;
  riskAdjEdgeR?: number;
  pWin?: number;
  pStop?: number;
  avgWinR?: number;
  expectedRR?: number;
  costR?: number;
  asymmetry?: Asymmetry;
  rrPotential?: RrPotential;
  entryQuality?: EntryQuality;

  // Model agreement
  alignedCount?: number;
  totalModels?: number;
  conflictLevel?: ConflictLevel;

  // Data health
  dataHealth: CapitalGuardDataHealth;

  // 8-signal model inputs
  orderbookImbalance?: OrderbookImbalance;
  oiChangeStrength?: OiChangeStrength;
  fundingBias?: FundingBias;
  fundingRatePct?: number | null;
  oiChangePct?: number | null;
  spotVsDerivativesPressure?: SpotVsDerivativesPressure;
  volumeSpike?: BinaryToggle;
  whaleActivity?: WhaleActivity;
  exchangeFlow?: ExchangeFlow;
  relativeStrength?: RelativeStrength;
  liquidationPoolBias?: LiquidationPoolBias;
  rsiState?: RsiState;
  atrRegime?: AtrRegime;
  liquidityDensity?: LiquidityDensity;
  suddenMoveRisk?: TernaryRisk;
  impulseReadiness?: TernaryRisk;
  dxyTrend?: MacroTrend;
  nasdaqTrend?: MacroTrend;
}

// ── Layer result types ───────────────────────────────────────

interface LayerResult {
  score: number;
  breakdown: Record<string, number>;
}

interface LsiResult {
  score: number;
  adjustment: number;
}

// ── Output ───────────────────────────────────────────────────

export interface CapitalGuardConsensusOutput {
  mode: "CAPITAL_GUARD";
  baseScore: number;
  adjustedScore: number;
  penaltyRate: number;
  finalScore: number;
  gates: { data: "PASS" | "BLOCK"; safety: "PASS" | "BLOCK" };
  sizeHint: number;
  reasons: string[];
  diagnostics: {
    componentScores: {
      structure01: number;
      liquidity01: number;
      positioning01: number;
      execution01: number;
      executionCertainty01: number;
      edge01: number;
      agreement01: number;
      agreementScore01: number;
      base01: number;
      isAPlus: boolean;
    };
    modifiers: {
      agreementQ: number;
      riskEnvironmentModifier: number;
      entryModifier: number;
      regimeModifier: number;
    };
    penalties: {
      latencyPenalty: number;
      executionWeaknessPenalty: number;
      entryClosedPenalty: number;
      dataDegradedPenalty: number;
      rawPenalty: number;
      penaltyRate: number;
    };
    floorsApplied: boolean;
    layers: {
      mos: LayerResult;
      dcs: LayerResult;
      eqs: LayerResult;
      res: LayerResult;
      lsi: LsiResult;
      tradeScore: number;
    };
  };
}

// ── Utility functions ────────────────────────────────────────

type ReasonEntry = { impact: number; text: string };

export const clamp = (x: number, min: number, max: number): number => Math.max(min, Math.min(max, x));
export const roundTo2 = (x: number): number => Math.round(x * 100) / 100;
export const score01 = (score: number): number => clamp(score / 100, 0, 1);
export const safeNumber = (value: unknown, fallback: number): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export const normalizeRiskAdjEdge = (riskAdjEdgeR: number): number => {
  if (riskAdjEdgeR <= 0) return 0;
  if (riskAdjEdgeR <= 0.1) return riskAdjEdgeR / 0.1 * 0.4;
  if (riskAdjEdgeR <= 0.2) return 0.4 + (riskAdjEdgeR - 0.1) / 0.1 * 0.3;
  if (riskAdjEdgeR <= 0.35) return 0.7 + (riskAdjEdgeR - 0.2) / 0.15 * 0.3;
  return 1;
};

const addReason = (reasons: ReasonEntry[], text: string, impact: number) => {
  reasons.push({ text, impact });
};

const finalizeReasons = (reasons: ReasonEntry[]): string[] =>
  reasons
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 6)
    .map((r) => r.text);

const FEED_KEYS: Array<keyof CapitalGuardDataHealth["feeds"]> = [
  "ohlcv", "orderbook", "oi", "funding", "netflow", "trades",
];

// ── Direction inference from directional signals ─────────────

type TradeDirection = "LONG" | "SHORT" | "NEUTRAL";

const inferDirection = (input: CapitalGuardConsensusInput): TradeDirection => {
  let longVotes = 0;
  let shortVotes = 0;

  if (input.emaAlignment === "BULL") longVotes++;
  else if (input.emaAlignment === "BEAR") shortVotes++;

  if (input.vwapPosition === "ABOVE") longVotes++;
  else if (input.vwapPosition === "BELOW") shortVotes++;

  if (input.orderbookImbalance === "BUY") longVotes++;
  else if (input.orderbookImbalance === "SELL") shortVotes++;

  if (input.fundingBias === "BULLISH") longVotes++;
  else if (input.fundingBias === "BEARISH") shortVotes++;

  if (input.whaleActivity === "ACCUMULATION") longVotes++;
  else if (input.whaleActivity === "DISTRIBUTION") shortVotes++;

  if (longVotes > shortVotes) return "LONG";
  if (shortVotes > longVotes) return "SHORT";
  return "NEUTRAL";
};

// ── 8-Signal Alignment System ────────────────────────────────
//
// Each signal scored 0-100. Signal is "aligned" if score >= 55.
// Alignment count determines bonus/penalty and TRADE eligibility.

const score8Signals = (input: CapitalGuardConsensusInput, dir: TradeDirection): {
  scores: number[];
  aligned: number;
  labels: string[];
} => {
  const scores: number[] = [];
  const labels: string[] = [];

  // 1. Trend Direction — emaAlignment + regime alignment
  let s1 = 40;
  if (dir === "LONG") {
    if (input.emaAlignment === "BULL") s1 += 35;
    else if (input.emaAlignment === "BEAR") s1 -= 30;
    if (input.vwapPosition === "ABOVE") s1 += 15;
    else if (input.vwapPosition === "BELOW") s1 -= 10;
  } else if (dir === "SHORT") {
    if (input.emaAlignment === "BEAR") s1 += 35;
    else if (input.emaAlignment === "BULL") s1 -= 30;
    if (input.vwapPosition === "BELOW") s1 += 15;
    else if (input.vwapPosition === "ABOVE") s1 -= 10;
  }
  if (input.regime === "TREND") s1 += 10;
  else if (input.regime === "RANGE") s1 -= 5;
  scores.push(clamp(s1, 0, 100));
  labels.push("TrendDir");

  // 2. Trend Strength
  const s2 = input.trendStrength === "HIGH" ? 90 : input.trendStrength === "MID" ? 65 : 25;
  scores.push(s2);
  labels.push("TrendStr");

  // 3. Liquidity Cluster Nearby — liquidityDensity + liquidationPoolBias
  let s3 = input.liquidityDensity === "HIGH" ? 80 : input.liquidityDensity === "MID" ? 55 : 25;
  // Liquidation pool in trade direction = supportive liquidity
  if (dir === "LONG" && input.liquidationPoolBias === "DOWN") s3 += 15; // shorts below = fuel
  else if (dir === "SHORT" && input.liquidationPoolBias === "UP") s3 += 15; // longs above = fuel
  else if (input.liquidationPoolBias === "MIXED") s3 += 5;
  scores.push(clamp(s3, 0, 100));
  labels.push("LiqCluster");

  // 4. Orderbook Imbalance — aligned with direction
  let s4 = 40;
  if (dir === "LONG" && input.orderbookImbalance === "BUY") s4 = 90;
  else if (dir === "SHORT" && input.orderbookImbalance === "SELL") s4 = 90;
  else if (input.orderbookImbalance === "NEUTRAL") s4 = 45;
  else s4 = 15; // against direction
  scores.push(s4);
  labels.push("OBImbalance");

  // 5. Funding Bias — aligned with direction
  let s5 = 45;
  if (dir === "LONG" && input.fundingBias === "BULLISH") s5 = 80;
  else if (dir === "SHORT" && input.fundingBias === "BEARISH") s5 = 80;
  else if (input.fundingBias === "NEUTRAL") s5 = 50;
  else if (input.fundingBias === "EXTREME") s5 = 15; // extreme = crowded = risky
  else s5 = 25; // against direction
  // Moderate funding rate in trade direction is best
  const frPct = safeNumber(input.fundingRatePct, 0);
  if (Math.abs(frPct) < 0.01) s5 += 5; // very low funding = healthy
  scores.push(clamp(s5, 0, 100));
  labels.push("FundingBias");

  // 6. OI Change — positive OI = conviction building
  const s6 = input.oiChangeStrength === "HIGH" ? 90 : input.oiChangeStrength === "MID" ? 62 : 28;
  scores.push(s6);
  labels.push("OIChange");

  // 7. Aggressor Flow — whale activity + exchange flow aligned
  let s7 = 35;
  if (dir === "LONG") {
    if (input.whaleActivity === "ACCUMULATION") s7 += 30;
    else if (input.whaleActivity === "DISTRIBUTION") s7 -= 20;
    if (input.exchangeFlow === "OUTFLOW") s7 += 20; // coins leaving exchange = accumulation
    else if (input.exchangeFlow === "INFLOW") s7 -= 10;
  } else if (dir === "SHORT") {
    if (input.whaleActivity === "DISTRIBUTION") s7 += 30;
    else if (input.whaleActivity === "ACCUMULATION") s7 -= 20;
    if (input.exchangeFlow === "INFLOW") s7 += 20; // coins entering exchange = selling pressure
    else if (input.exchangeFlow === "OUTFLOW") s7 -= 10;
  }
  if (input.relativeStrength === "STRONG") s7 += 10;
  else if (input.relativeStrength === "WEAK") s7 -= 5;
  scores.push(clamp(s7, 0, 100));
  labels.push("AggFlow");

  // 8. Volume Spike
  const s8 = input.volumeSpike === "ON" ? 88 : 30;
  scores.push(s8);
  labels.push("VolSpike");

  const aligned = scores.filter((s) => s >= 45).length;
  return { scores, aligned, labels };
};

// ── Layer 1: Structure Score (replaces MOS) ──────────────────
// Trend Direction + Trend Strength + Market Regime

const computeStructure = (input: CapitalGuardConsensusInput, signalScores: number[]): LayerResult => {
  const trendDir = signalScores[0]; // signal 1
  const trendStr = signalScores[1]; // signal 2

  // Regime quality
  const regimeQ = input.regime === "TREND" ? 85
    : input.regime === "MIXED" ? 50
    : input.regime === "RANGE" ? 35 : 40;

  // Market speed supports momentum
  const speedQ = input.marketSpeed === "FAST" ? 80
    : input.marketSpeed === "NORMAL" ? 60 : 35;

  const score = clamp(0.35 * trendDir + 0.30 * trendStr + 0.20 * regimeQ + 0.15 * speedQ, 0, 100);

  return {
    score: roundTo2(score),
    breakdown: {
      trendDirection: roundTo2(trendDir),
      trendStrength: roundTo2(trendStr),
      regime: roundTo2(regimeQ),
      speed: roundTo2(speedQ),
    },
  };
};

// ── Layer 2: Positioning Score (replaces DCS) ────────────────
// Orderbook Imbalance + Funding Bias + OI Change

const computePositioning = (input: CapitalGuardConsensusInput, signalScores: number[]): LayerResult => {
  const imbalance = signalScores[3]; // signal 4
  const funding = signalScores[4];   // signal 5
  const oiChange = signalScores[5];  // signal 6

  // AI panel structure score as additional validation
  const aiStructure = clamp(safeNumber(input.structureScore, 50), 0, 100);

  const score = clamp(0.30 * imbalance + 0.25 * funding + 0.25 * oiChange + 0.20 * aiStructure, 0, 100);

  return {
    score: roundTo2(score),
    breakdown: {
      orderbookImbalance: roundTo2(imbalance),
      fundingBias: roundTo2(funding),
      oiChange: roundTo2(oiChange),
      aiStructure: roundTo2(aiStructure),
    },
  };
};

// ── Layer 3: Execution Score (replaces EQS) ──────────────────
// Fill quality + Depth + Spread + Slippage

const computeExecution = (input: CapitalGuardConsensusInput): LayerResult => {
  const pFill = clamp(safeNumber(input.pFill, 0.5), 0, 1);
  const capVal = clamp(safeNumber(input.capacity, 0.5), 0, 1);

  // Depth quality
  const depth = input.depthQuality === "GOOD" ? 90 : input.depthQuality === "MID" ? 55 : 20;

  // Slippage
  let slip = input.slippageLevel === "LOW" ? 88 : input.slippageLevel === "MED" ? 55 : 18;
  if (pFill > 0.8) slip += 8;
  if (pFill < 0.3) slip -= 12;

  // Fill probability
  const fill = clamp(pFill * 60 + capVal * 40, 0, 100);

  // Spread
  const spread = input.spreadRegime === "TIGHT" ? 85 : input.spreadRegime === "MID" ? 55 : 18;

  // Spoof risk
  const spoof = input.spoofRisk === "LOW" ? 85 : input.spoofRisk === "MID" ? 55 : 20;

  const score = clamp(0.25 * depth + 0.25 * clamp(slip, 0, 100) + 0.20 * fill + 0.15 * spread + 0.15 * spoof, 0, 100);

  return {
    score: roundTo2(score),
    breakdown: {
      depth: roundTo2(depth),
      slippage: roundTo2(clamp(slip, 0, 100)),
      fill: roundTo2(fill),
      spread: roundTo2(spread),
      spoof: roundTo2(spoof),
    },
  };
};

// ── Layer 4: Flow Score (new — Volume + Aggressor) ───────────
// Volume Spike + Aggressor Flow + Liquidity Cluster

const computeFlow = (input: CapitalGuardConsensusInput, signalScores: number[]): LayerResult => {
  const liqCluster = signalScores[2]; // signal 3
  const aggFlow = signalScores[6];    // signal 7
  const volSpike = signalScores[7];   // signal 8

  // Impulse readiness — is the market coiled and ready?
  const impulse = input.impulseReadiness === "HIGH" ? 85
    : input.impulseReadiness === "MID" ? 55 : 25;

  const score = clamp(0.30 * aggFlow + 0.25 * volSpike + 0.25 * liqCluster + 0.20 * impulse, 0, 100);

  return {
    score: roundTo2(score),
    breakdown: {
      aggressorFlow: roundTo2(aggFlow),
      volumeSpike: roundTo2(volSpike),
      liquidityCluster: roundTo2(liqCluster),
      impulseReadiness: roundTo2(impulse),
    },
  };
};

// ── Risk Event Penalties (lighter for trade frequency) ───────

const computeRiskEvents = (input: CapitalGuardConsensusInput): LayerResult => {
  let total = 0;
  const breakdown: Record<string, number> = {};

  // 1. Cascade Liquidation: -3 HIGH, -1 MID (lightened)
  const cascadePenalty = input.cascadeRisk === "HIGH" ? -3 : input.cascadeRisk === "MID" ? -1 : 0;
  total += cascadePenalty;
  breakdown.cascadeLiquidation = cascadePenalty;

  // 2. Funding Spike: -2 EXTREME (lightened)
  let fundingPenalty = 0;
  if (input.fundingBias === "EXTREME") fundingPenalty = -2;
  total += fundingPenalty;
  breakdown.fundingSpike = fundingPenalty;

  // 3. Stress + Sudden Move: -2.5 both HIGH, -1 either HIGH (lightened)
  let stressPenalty = 0;
  if (input.suddenMoveRisk === "HIGH" && input.stressLevel === "HIGH") stressPenalty = -2.5;
  else if (input.suddenMoveRisk === "HIGH" || input.stressLevel === "HIGH") stressPenalty = -1;
  total += stressPenalty;
  breakdown.stressEvent = stressPenalty;

  // 4. Whale against direction: -2 DISTRIBUTION+INFLOW, -1 DISTRIBUTION (lightened)
  let whalePenalty = 0;
  if (input.whaleActivity === "DISTRIBUTION" && input.exchangeFlow === "INFLOW") whalePenalty = -2;
  else if (input.whaleActivity === "DISTRIBUTION") whalePenalty = -1;
  total += whalePenalty;
  breakdown.whaleAnomaly = whalePenalty;

  // 5. Exchange instability: -2 stress HIGH + degraded feeds, -1 degraded alone (lightened)
  const degradedOrDown = FEED_KEYS.filter((k) => {
    const status = input.dataHealth?.feeds?.[k];
    return status === "degraded" || status === "down";
  }).length;
  let exchangePenalty = 0;
  if (input.stressLevel === "HIGH" && degradedOrDown >= 2) exchangePenalty = -2;
  else if (degradedOrDown >= 3) exchangePenalty = -1;
  total += exchangePenalty;
  breakdown.exchangeInstability = exchangePenalty;

  return { score: roundTo2(total), breakdown };
};

// ── Strategy Bias Detection ──────────────────────────────────

const detectStrategyBias = (input: CapitalGuardConsensusInput): { bonus: number; type: string } => {
  // Pullback Continuation: trend market + compression/coiling + ready for impulse
  // This is the highest win rate strategy in crypto
  const isPullback = input.regime === "TREND" &&
    (input.compression === "ON" || input.impulseReadiness === "MID" || input.impulseReadiness === "HIGH") &&
    input.trendStrength !== "LOW";

  // Range Continuation: range market + mean reversion setup
  const isRange = input.regime === "RANGE" &&
    (input.rsiState === "OVERSOLD" || input.rsiState === "OVERBOUGHT");

  // Breakout: sudden move + volume spike (higher fake breakout risk)
  const isBreakout = input.suddenMoveRisk === "HIGH" &&
    input.volumeSpike === "ON" &&
    input.atrRegime === "HIGH";

  if (isPullback) return { bonus: 7, type: "PULLBACK" };
  if (isRange) return { bonus: 4, type: "RANGE_CONT" };
  if (isBreakout) return { bonus: -2, type: "BREAKOUT" };
  return { bonus: 0, type: "NEUTRAL" };
};

// ── Main: computeCapitalGuardConsensus ───────────────────────

export const computeCapitalGuardConsensus = (
  input: CapitalGuardConsensusInput,
): CapitalGuardConsensusOutput => {
  const reasons: ReasonEntry[] = [];

  // ── 1. Determine trade direction from signal majority ──
  const direction = inferDirection(input);

  // ── 2. Score all 8 key signals ──
  const signals = score8Signals(input, direction);

  // ── 3. Compute 4 layers ──
  const structure = computeStructure(input, signals.scores);
  const positioning = computePositioning(input, signals.scores);
  const execution = computeExecution(input);
  const flow = computeFlow(input, signals.scores);
  const riskEvents = computeRiskEvents(input);

  // ── 4. Layer alignment check (relaxed for trade generation) ──
  const structureAligned = structure.score >= 38;
  const positioningAligned = positioning.score >= 36;
  const executionAligned = execution.score >= 32;
  const flowAligned = flow.score >= 36;
  const alignedLayers = [structureAligned, positioningAligned, executionAligned, flowAligned].filter(Boolean).length;

  // ── 5. Base score = equal-weight 4 layers ──
  const rawBase = 0.25 * structure.score + 0.25 * positioning.score + 0.25 * execution.score + 0.25 * flow.score;

  // ── 6. Signal alignment bonus (more generous for trade generation) ──
  let alignmentBonus = 0;
  if (signals.aligned >= 8) alignmentBonus = 18;
  else if (signals.aligned >= 7) alignmentBonus = 14;
  else if (signals.aligned >= 6) alignmentBonus = 10;
  else if (signals.aligned >= 5) alignmentBonus = 7;
  else if (signals.aligned >= 4) alignmentBonus = 4;
  else if (signals.aligned >= 3) alignmentBonus = 2;
  else if (signals.aligned >= 2) alignmentBonus = 0;
  else alignmentBonus = -4;

  // ── 7. Layer alignment bonus (more generous) ──
  let layerBonus = 0;
  if (alignedLayers >= 4) layerBonus = 12;
  else if (alignedLayers >= 3) layerBonus = 8;
  else if (alignedLayers >= 2) layerBonus = 4;
  else if (alignedLayers >= 1) layerBonus = 1;
  else layerBonus = -2;

  // ── 8. Strategy bias (pullback = good, breakout = risky) ──
  const strategy = detectStrategyBias(input);

  // ── 9. Risk event penalties ──
  const baseScore = roundTo2(clamp(rawBase + alignmentBonus + layerBonus + strategy.bonus + riskEvents.score, 0, 100));

  // ── 10. Reason generation ──
  if (direction === "NEUTRAL") addReason(reasons, "Direction unclear — signals mixed", 80);
  if (signals.aligned >= 6) addReason(reasons, `Strong alignment: ${signals.aligned}/8 signals`, 70);
  else if (signals.aligned < 4) addReason(reasons, `Weak alignment: only ${signals.aligned}/8 signals`, 75);
  if (alignedLayers >= 4) addReason(reasons, "All 4 layers aligned", 65);
  else if (alignedLayers < 2) addReason(reasons, `Only ${alignedLayers}/4 layers aligned`, 70);
  if (strategy.type === "PULLBACK") addReason(reasons, "Pullback continuation setup (+5)", 50);
  if (strategy.type === "BREAKOUT") addReason(reasons, "Breakout risk detected (-3)", 55);
  if (structure.score < 40) addReason(reasons, `Structure weak (${structure.score.toFixed(0)})`, 60);
  if (flow.score >= 70) addReason(reasons, `Strong flow signals (${flow.score.toFixed(0)})`, 50);
  if (riskEvents.score < -6) addReason(reasons, `Risk events active (${riskEvents.score})`, 80);

  // ── 11. Data gate ──
  const dataGateBlocked =
    input.dataHealth?.feeds?.ohlcv === "down" ||
    safeNumber(input.dataHealth?.missingFields, 0) >= 3 ||
    (Boolean(input.dataHealth?.staleFeed) && safeNumber(input.dataHealth?.latencyMs, 0) > 8000);
  const dataGate: "PASS" | "BLOCK" = dataGateBlocked ? "BLOCK" : "PASS";
  if (dataGateBlocked) addReason(reasons, "Data gate blocked", 10_000);

  // ── 12. Safety gate (only extreme combined risk) ──
  const safetyGateBlocked =
    (input.stressLevel === "HIGH" && input.cascadeRisk === "HIGH" && input.depthQuality === "POOR");
  const safetyGate: "PASS" | "BLOCK" = safetyGateBlocked ? "BLOCK" : "PASS";
  if (safetyGateBlocked) addReason(reasons, "Safety block: extreme combined risk", 9_000);

  // ── 13. Penalty rate ──
  const executionWeaknessPenalty = execution.score < 40 ? roundTo2(((40 - execution.score) / 100) * 0.25) : 0;
  const entryClosedPenalty = input.entryWindow === "CLOSED" ? 0.04 : 0;
  const degradedCount = FEED_KEYS.filter((k) => input.dataHealth?.feeds?.[k] === "degraded").length;
  const dataDegradedPenalty = Math.min(0.05, degradedCount * 0.015);
  const rawPenalty = clamp(executionWeaknessPenalty + entryClosedPenalty + dataDegradedPenalty, 0, 0.30);

  const isAPlus = baseScore >= 85;
  const penaltyRate = roundTo2(isAPlus ? rawPenalty * 0.5 : rawPenalty);

  // ── 14. Adjusted + final score ──
  const adjustedScore = roundTo2(clamp(baseScore * (1 - clamp(penaltyRate, 0, 1)), 0, 100));

  let finalScore = adjustedScore;

  // Win rate filter: need ≥ 2/8 aligned signals for TRADE (relaxed for more ideas)
  // If < 2 aligned, cap at WATCH zone (max 47)
  const winRatePass = signals.aligned >= 2 && input.conflictLevel !== "HIGH";
  if (!winRatePass && finalScore >= 48) {
    finalScore = 47;
    addReason(reasons, `Win rate filter: ${signals.aligned}/8 aligned (need 2+)`, 90);
  }

  // Quant engine confidence boost: if edge + pWin are strong, add small uplift
  const edgeR = safeNumber(input.riskAdjEdgeR, 0);
  const pWin = safeNumber(input.pWin, 0.5);
  if (edgeR > 0.05 && pWin > 0.52 && winRatePass) {
    const confidenceBoost = Math.min(4, roundTo2((edgeR * 10 + (pWin - 0.5) * 10)));
    finalScore = roundTo2(clamp(finalScore + confidenceBoost, 0, 100));
    if (confidenceBoost > 1) addReason(reasons, `Quant confidence boost +${confidenceBoost.toFixed(1)}`, 40);
  }

  // A+ floor: high conviction setups keep minimum 62 (lowered for more trades)
  let floorsApplied = false;
  if (isAPlus && dataGate === "PASS" && safetyGate === "PASS") {
    const floored = Math.max(finalScore, 62);
    floorsApplied = floored > finalScore;
    finalScore = floored;
    if (floorsApplied) addReason(reasons, "High conviction floor applied", 150);
  }

  // Gate enforcement
  if (safetyGate === "BLOCK") finalScore = Math.min(finalScore, 36);
  if (dataGate === "BLOCK") finalScore = 0;
  finalScore = roundTo2(clamp(finalScore, 0, 100));

  // ── 15. Position sizing ──
  let sizeHint: number;
  if (dataGate === "BLOCK" || safetyGate === "BLOCK") {
    sizeHint = 0;
  } else if (finalScore >= 82) {
    sizeHint = 1.0;
  } else if (finalScore >= 66) {
    sizeHint = 0.70;
  } else if (finalScore >= 48) {
    sizeHint = 0.40;
  } else if (finalScore >= 36) {
    sizeHint = 0.15;
  } else {
    sizeHint = 0;
  }
  sizeHint = roundTo2(sizeHint);

  // ── Backward compat diagnostics ──
  const agreement01 = clamp(
    safeNumber(input.alignedCount, 0) / Math.max(1, Math.floor(safeNumber(input.totalModels, 1))),
    0, 1,
  );
  const conflictMult = input.conflictLevel === "LOW" ? 1.0 : input.conflictLevel === "MID" ? 0.95 : input.conflictLevel === "HIGH" ? 0.86 : 0.93;
  const agreementScore01 = clamp(agreement01 * conflictMult, 0, 1);
  const agreementQ = 0.85 + (0.15 * agreementScore01);

  const remStress = input.stressLevel === "LOW" ? 1.0 : input.stressLevel === "MID" ? 0.94 : input.stressLevel === "HIGH" ? 0.84 : 0.94;
  const remCrowding = input.crowdingRisk === "LOW" ? 1.0 : input.crowdingRisk === "MID" ? 0.97 : input.crowdingRisk === "HIGH" ? 0.90 : 0.97;
  const remCascade = input.cascadeRisk === "LOW" ? 1.0 : input.cascadeRisk === "MID" ? 0.96 : input.cascadeRisk === "HIGH" ? 0.88 : 0.96;
  const rem = clamp(remStress * remCrowding * remCascade, 0.78, 1.0);

  const em = input.entryWindow === "OPEN" ? 1.0 : input.entryWindow === "CLOSED" ? 0.9 : 0.95;

  let rm = 1.0;
  if (input.regime === "RANGE" && input.compression === "OFF") rm = 0.95;
  if (input.regime === "TREND" && (input.marketSpeed === "NORMAL" || input.marketSpeed === "FAST")) rm = 1.02;
  rm = clamp(rm, 0.9, 1.05);

  // Map layers to backward-compatible fields:
  //   mos → Structure + Flow combined (market opportunity)
  //   dcs → Positioning (direction confidence)
  //   eqs → Execution (execution quality)
  const mosResult: LayerResult = {
    score: roundTo2((structure.score + flow.score) / 2),
    breakdown: { ...structure.breakdown, ...flow.breakdown },
  };

  return {
    mode: "CAPITAL_GUARD",
    baseScore,
    adjustedScore,
    penaltyRate,
    finalScore,
    gates: { data: dataGate, safety: safetyGate },
    sizeHint,
    reasons: finalizeReasons(reasons),
    diagnostics: {
      componentScores: {
        structure01: roundTo2(structure.score / 100),
        liquidity01: roundTo2(flow.score / 100),
        positioning01: roundTo2(positioning.score / 100),
        execution01: roundTo2(execution.score / 100),
        executionCertainty01: roundTo2(execution.breakdown.fill / 100),
        edge01: roundTo2((structure.score * 0.5 + positioning.score * 0.5) / 100),
        agreement01: roundTo2(agreement01),
        agreementScore01: roundTo2(agreementScore01),
        base01: roundTo2(baseScore / 100),
        isAPlus,
      },
      modifiers: {
        agreementQ: roundTo2(agreementQ),
        riskEnvironmentModifier: roundTo2(rem),
        entryModifier: roundTo2(em),
        regimeModifier: roundTo2(rm),
      },
      penalties: {
        latencyPenalty: 0,
        executionWeaknessPenalty: roundTo2(executionWeaknessPenalty),
        entryClosedPenalty: roundTo2(entryClosedPenalty),
        dataDegradedPenalty: roundTo2(dataDegradedPenalty),
        rawPenalty: roundTo2(rawPenalty),
        penaltyRate: roundTo2(penaltyRate),
      },
      floorsApplied,
      layers: {
        mos: mosResult,
        dcs: positioning,
        eqs: execution,
        res: riskEvents,
        lsi: { score: roundTo2(signals.aligned / 8), adjustment: roundTo2(alignmentBonus) },
        tradeScore: roundTo2(rawBase),
      },
    },
  };
};
