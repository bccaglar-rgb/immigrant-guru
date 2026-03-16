/**
 * BALANCED consensus — Crypto-optimized 6-component scoring model
 *
 * Formula:
 *   BalancedTradeScore = 0.32*Opp + 0.22*Dir + 0.18*Exec + 0.14*Liq + 0.08*Struct + 0.06*RS - RiskPenalty
 *
 * Sub-score guardrails (any failing blocks TRADE):
 *   Opp >= 70, Dir >= 56, Exec >= 58, Liq >= 60, Structure >= 55
 *
 * Decision levels:
 *   85+    Full conviction TRADE    (sizeHint 1.00)
 *   78-84  High TRADE               (sizeHint 0.90)
 *   72-77  Normal TRADE             (sizeHint 0.70)
 *   64-71  Small size TRADE         (sizeHint 0.40)
 *   48-63  WATCH                    (sizeHint 0.00)
 *   <48    NO_TRADE                 (sizeHint 0.00)
 *
 * Caps:
 *   Direction uncertain (Dir < 70) → max 82
 *   Hard no-trade (stress+cascade+poor depth) → max 48
 *   Execution combo penalty capped at -4
 */

// ── Type aliases ─────────────────────────────────────────────

export type Regime = "TREND" | "RANGE" | "MIXED" | "UNKNOWN";
export type TrendStrength = "LOW" | "MID" | "HIGH" | "UNKNOWN";
export type EmaAlignment = "BULL" | "BEAR" | "MIXED" | "UNKNOWN";
export type VwapPosition = "ABOVE" | "BELOW" | "AT" | "UNKNOWN";
export type StructureAge = "EARLY" | "MATURE" | "UNKNOWN";
export type MarketSpeed = "SLOW" | "NORMAL" | "FAST" | "UNKNOWN";
export type Compression = "ON" | "OFF" | "UNKNOWN";
export type TernaryRisk = "LOW" | "MID" | "HIGH" | "UNKNOWN";
export type SpreadRegime = "TIGHT" | "MID" | "WIDE" | "UNKNOWN";
export type DepthQuality = "GOOD" | "MID" | "POOR" | "UNKNOWN";
export type EntryWindow = "OPEN" | "CLOSED" | "UNKNOWN";
export type SlippageLevel = "LOW" | "MED" | "HIGH" | "UNKNOWN";
export type Asymmetry = "REWARD_DOMINANT" | "RISK_DOMINANT" | "UNKNOWN";
export type RrPotential = "LOW" | "MID" | "HIGH" | "UNKNOWN";
export type EntryQuality = "BAD" | "MID" | "GOOD" | "UNKNOWN";
export type ConflictLevel = "LOW" | "MID" | "HIGH" | "UNKNOWN";
export type FeedHealthStatus = "healthy" | "degraded" | "down";

// 6-component model signal types
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

export interface BalancedDataHealth {
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

export interface BalancedConsensusInput {
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
  spreadRegime?: SpreadRegime;
  depthQuality?: DepthQuality;

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
  dataHealth: BalancedDataHealth;

  // 6-component model signals
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

// ── Component result type ────────────────────────────────────

interface ComponentResult {
  score: number;
  breakdown: Record<string, number>;
}

// ── Output ───────────────────────────────────────────────────

export interface BalancedConsensusOutput {
  mode: "BALANCED";
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
      opportunity: ComponentResult;
      direction: ComponentResult;
      execution: ComponentResult;
      liquidity: ComponentResult;
      structure: ComponentResult;
      relativeStrength: ComponentResult;
      riskPenalty: { total: number; breakdown: Record<string, number> };
      guardrails: {
        oppPass: boolean;
        dirPass: boolean;
        execPass: boolean;
        liqPass: boolean;
        structPass: boolean;
        allPass: boolean;
      };
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

const lerpRange = (x: number, x1: number, x2: number, y1: number, y2: number): number => {
  if (x2 <= x1) return y2;
  const t = clamp((x - x1) / (x2 - x1), 0, 1);
  return y1 + (y2 - y1) * t;
};

export const normalizeBalancedRiskAdjEdge = (riskAdjEdgeR: number): number => {
  if (riskAdjEdgeR <= 0) return 0;
  if (riskAdjEdgeR <= 0.1) return lerpRange(riskAdjEdgeR, 0, 0.1, 0, 0.4);
  if (riskAdjEdgeR <= 0.2) return lerpRange(riskAdjEdgeR, 0.1, 0.2, 0.4, 0.7);
  if (riskAdjEdgeR <= 0.35) return lerpRange(riskAdjEdgeR, 0.2, 0.35, 0.7, 1);
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

const agreementConflictMultiplier = (conflict: ConflictLevel | undefined): number => {
  if (conflict === "LOW") return 1.0;
  if (conflict === "MID") return 0.95;
  if (conflict === "HIGH") return 0.86;
  return 0.93;
};

const FEED_KEYS: Array<keyof BalancedDataHealth["feeds"]> = [
  "ohlcv", "orderbook", "oi", "funding", "netflow", "trades",
];

// ── Component 1: Opportunity Score ──────────────────────────

const computeOpportunity = (input: BalancedConsensusInput): ComponentResult => {
  // 1. Volume Expansion (25%) — volumeSpike + oiChangeStrength
  const volumeSpikeSub = input.volumeSpike === "ON" ? 80 : input.volumeSpike === "OFF" ? 30 : 40;
  const oiSub = input.oiChangeStrength === "HIGH" ? 90 : input.oiChangeStrength === "MID" ? 55 : 25;
  const volumeExpansion = 0.5 * volumeSpikeSub + 0.5 * oiSub;

  // 2. Volatility Setup (20%) — compression + atrRegime + suddenMoveRisk
  const compressionSub = input.compression === "ON" ? 80 : input.compression === "OFF" ? 35 : 45;
  const atrSub = input.atrRegime === "HIGH" ? 75 : input.atrRegime === "MID" ? 55 : 30;
  const suddenSub = input.suddenMoveRisk === "HIGH" ? 70 : input.suddenMoveRisk === "MID" ? 50 : 30;
  const volatilitySetup = 0.4 * compressionSub + 0.3 * atrSub + 0.3 * suddenSub;

  // 3. Momentum (25%) — marketSpeed + impulseReadiness + trendStrength
  const speedSub = input.marketSpeed === "FAST" ? 85 : input.marketSpeed === "NORMAL" ? 55 : 25;
  const impulseSub = input.impulseReadiness === "HIGH" ? 85 : input.impulseReadiness === "MID" ? 50 : 20;
  const trendSub = input.trendStrength === "HIGH" ? 90 : input.trendStrength === "MID" ? 55 : 20;
  const momentum = 0.35 * speedSub + 0.30 * impulseSub + 0.35 * trendSub;

  // 4. Liquidity (15%) — liquidityDensity + depthQuality
  const liqDensSub = input.liquidityDensity === "HIGH" ? 90 : input.liquidityDensity === "MID" ? 55 : 20;
  const depthSub = input.depthQuality === "GOOD" ? 90 : input.depthQuality === "MID" ? 55 : 15;
  const liquidity = 0.5 * liqDensSub + 0.5 * depthSub;

  // 5. Spread Quality (15%) — spreadRegime
  const spreadQuality = input.spreadRegime === "TIGHT" ? 90 : input.spreadRegime === "MID" ? 60 : 20;

  const score = clamp(
    0.25 * volumeExpansion +
    0.20 * volatilitySetup +
    0.25 * momentum +
    0.15 * liquidity +
    0.15 * spreadQuality,
    0, 100,
  );

  return {
    score: roundTo2(score),
    breakdown: {
      volumeExpansion: roundTo2(volumeExpansion),
      volatilitySetup: roundTo2(volatilitySetup),
      momentum: roundTo2(momentum),
      liquidity: roundTo2(liquidity),
      spreadQuality: roundTo2(spreadQuality),
    },
  };
};

// ── Component 2: Direction Score ────────────────────────────

const computeDirection = (input: BalancedConsensusInput): ComponentResult => {
  // 1. Trend Strength (30%) — trendStrength + regime
  const trendBase = input.trendStrength === "HIGH" ? 95 : input.trendStrength === "MID" ? 70 : 45;
  const trendStr =
    input.regime === "TREND" ? trendBase
    : input.regime === "RANGE" ? 30
    : 40;

  // 2. Orderflow Imbalance (25%) — orderbookImbalance + oiChangeStrength
  const imbSub = input.orderbookImbalance === "NEUTRAL" ? 40 : 80;
  const oiStrSub = input.oiChangeStrength === "HIGH" ? 85 : input.oiChangeStrength === "MID" ? 55 : 25;
  const orderflow = 0.5 * imbSub + 0.5 * oiStrSub;

  // 3. Funding Bias (15%) — fundingBias + fundingRatePct
  let fundingSub =
    input.fundingBias === "EXTREME" ? 30
    : (input.fundingBias === "BULLISH" || input.fundingBias === "BEARISH") ? 70
    : 50;
  const frPct = safeNumber(input.fundingRatePct, 0);
  if (input.fundingBias === "EXTREME" && Math.abs(frPct) > 0.05) fundingSub -= 10;
  if ((input.fundingBias === "BULLISH" || input.fundingBias === "BEARISH") && Math.abs(frPct) > 0.03) fundingSub += 10;
  const funding = clamp(fundingSub, 0, 100);

  // 4. Market Structure (20%) — structureScore from AI panel
  const structure = clamp(safeNumber(input.structureScore, 50), 0, 100);

  // 5. HTF Alignment (10%) — ema+vwap concordance + dxyTrend + nasdaqTrend
  const innerAligned =
    (input.emaAlignment === "BULL" && input.vwapPosition === "ABOVE") ||
    (input.emaAlignment === "BEAR" && input.vwapPosition === "BELOW");
  let htfSub = innerAligned ? 40 : 15;
  if (input.dxyTrend === "DOWN") htfSub += 15;    // weak dollar = risk-on
  if (input.nasdaqTrend === "UP") htfSub += 15;   // tech rally = crypto follows
  if (input.dxyTrend === "UP") htfSub -= 10;      // strong dollar = headwind
  if (input.nasdaqTrend === "DOWN") htfSub -= 10;
  const htfAlignment = clamp(htfSub, 0, 100);

  const score = clamp(
    0.30 * trendStr +
    0.25 * orderflow +
    0.15 * funding +
    0.20 * structure +
    0.10 * htfAlignment,
    0, 100,
  );

  return {
    score: roundTo2(score),
    breakdown: {
      trendStrength: roundTo2(trendStr),
      orderflow: roundTo2(orderflow),
      funding: roundTo2(funding),
      structure: roundTo2(structure),
      htfAlignment: roundTo2(htfAlignment),
    },
  };
};

// ── Component 3: Execution Score ────────────────────────────

const computeExecution = (input: BalancedConsensusInput): ComponentResult => {
  const pFill = clamp(safeNumber(input.pFill, 0.5), 0, 1);
  const capVal = clamp(safeNumber(input.capacity, 0.5), 0, 1);

  // 1. Orderbook Depth (25%) — depthQuality
  const depth = input.depthQuality === "GOOD" ? 90 : input.depthQuality === "MID" ? 55 : 15;

  // 2. Slippage Estimate (25%) — slippageLevel + pFill bonus/penalty
  let slipSub = input.slippageLevel === "LOW" ? 90 : input.slippageLevel === "MED" ? 55 : 15;
  if (pFill > 0.8) slipSub += 10;
  if (pFill < 0.3) slipSub -= 15;
  const slippage = clamp(slipSub, 0, 100);

  // 3. Spoof Probability (15%) — spoofRisk
  const spoof = input.spoofRisk === "LOW" ? 90 : input.spoofRisk === "MID" ? 55 : 15;

  // 4. Fill Probability (20%) — pFill + capacity
  const fill = clamp(pFill * 60 + capVal * 40, 0, 100);

  // 5. Spread Cost (15%) — spreadRegime + costR
  let spreadSub = input.spreadRegime === "TIGHT" ? 85 : input.spreadRegime === "MID" ? 55 : 15;
  const costR = safeNumber(input.costR, 0);
  if (costR > 0.5) spreadSub -= 15;
  else if (costR > 0.3) spreadSub -= 8;
  const spreadCost = clamp(spreadSub, 0, 100);

  // Execution combo penalty — max -4 for spoof + slippage + fill triple punishment
  let comboPenalty = 0;
  if (input.spoofRisk === "HIGH") comboPenalty -= 1.5;
  if (input.slippageLevel === "HIGH") comboPenalty -= 1.5;
  if (pFill < 0.35) comboPenalty -= 1.5;
  comboPenalty = Math.max(comboPenalty, -4);

  const rawScore = 0.25 * depth + 0.25 * slippage + 0.15 * spoof + 0.20 * fill + 0.15 * spreadCost;
  const score = clamp(rawScore + comboPenalty, 0, 100);

  return {
    score: roundTo2(score),
    breakdown: {
      depth: roundTo2(depth),
      slippage: roundTo2(slippage),
      spoof: roundTo2(spoof),
      fill: roundTo2(fill),
      spreadCost: roundTo2(spreadCost),
      comboPenalty: roundTo2(comboPenalty),
    },
  };
};

// ── Component 4: Liquidity Score ────────────────────────────

const computeLiquidity = (input: BalancedConsensusInput): ComponentResult => {
  // 1. Liquidity Density (35%)
  const liqDens = input.liquidityDensity === "HIGH" ? 90 : input.liquidityDensity === "MID" ? 55 : 20;

  // 2. Depth Quality (30%)
  const depth = input.depthQuality === "GOOD" ? 90 : input.depthQuality === "MID" ? 55 : 15;

  // 3. Spread Quality (20%)
  const spread = input.spreadRegime === "TIGHT" ? 90 : input.spreadRegime === "MID" ? 60 : 20;

  // 4. Capacity (15%)
  const cap = clamp(safeNumber(input.capacity, 0.5), 0, 1) * 100;

  const score = clamp(
    0.35 * liqDens + 0.30 * depth + 0.20 * spread + 0.15 * cap,
    0, 100,
  );

  return {
    score: roundTo2(score),
    breakdown: {
      liquidityDensity: roundTo2(liqDens),
      depthQuality: roundTo2(depth),
      spreadQuality: roundTo2(spread),
      capacity: roundTo2(cap),
    },
  };
};

// ── Component 5: Structure Score ────────────────────────────

const computeStructure = (input: BalancedConsensusInput): ComponentResult => {
  const base = clamp(safeNumber(input.structureScore, 50), 0, 100);

  // Boost for strong trend + alignment
  let boost = 0;
  if (input.regime === "TREND" && input.trendStrength === "HIGH") boost += 5;
  const aligned =
    (input.emaAlignment === "BULL" && input.vwapPosition === "ABOVE") ||
    (input.emaAlignment === "BEAR" && input.vwapPosition === "BELOW");
  if (aligned) boost += 3;

  const score = clamp(base + boost, 0, 100);

  return {
    score: roundTo2(score),
    breakdown: {
      structureBase: roundTo2(base),
      trendBoost: roundTo2(boost),
    },
  };
};

// ── Component 6: Relative Strength Score ────────────────────

const computeRS = (input: BalancedConsensusInput): ComponentResult => {
  // 1. Relative Strength (40%)
  const rsSub = input.relativeStrength === "STRONG" ? 85 : input.relativeStrength === "NEUTRAL" ? 50 : 25;

  // 2. Spot vs Derivatives (30%)
  const spotSub = input.spotVsDerivativesPressure === "SPOT_DOM" ? 80
    : input.spotVsDerivativesPressure === "BALANCED" ? 50 : 35;

  // 3. Whale + Exchange Flow (30%)
  const whaleSub = input.whaleActivity === "ACCUMULATION" ? 85
    : input.whaleActivity === "NEUTRAL" ? 45 : 25;
  const flowSub = input.exchangeFlow === "OUTFLOW" ? 80
    : input.exchangeFlow === "NEUTRAL" ? 45 : 25;
  const whaleFlow = 0.5 * whaleSub + 0.5 * flowSub;

  const score = clamp(
    0.40 * rsSub + 0.30 * spotSub + 0.30 * whaleFlow,
    0, 100,
  );

  return {
    score: roundTo2(score),
    breakdown: {
      relativeStrength: roundTo2(rsSub),
      spotDerivatives: roundTo2(spotSub),
      whaleFlow: roundTo2(whaleFlow),
    },
  };
};

// ── Risk Penalty (lighter than Capital Guard) ───────────────

const computeRiskPenalty = (input: BalancedConsensusInput): { total: number; breakdown: Record<string, number> } => {
  const breakdown: Record<string, number> = {};
  let total = 0;

  // 1. Cascade: -3 HIGH, -1 MID
  const cascadePen = input.cascadeRisk === "HIGH" ? -3 : input.cascadeRisk === "MID" ? -1 : 0;
  total += cascadePen;
  breakdown.cascade = cascadePen;

  // 2. Funding spike: -2 EXTREME
  const fundingPen = input.fundingBias === "EXTREME" ? -2 : 0;
  total += fundingPen;
  breakdown.fundingSpike = fundingPen;

  // 3. News/stress: -3 both HIGH, -1.5 either HIGH
  let newsPen = 0;
  if (input.suddenMoveRisk === "HIGH" && input.stressLevel === "HIGH") newsPen = -3;
  else if (input.suddenMoveRisk === "HIGH" || input.stressLevel === "HIGH") newsPen = -1.5;
  total += newsPen;
  breakdown.newsStress = newsPen;

  // 4. Whale anomaly: -2 DISTRIBUTION+INFLOW, -1 DISTRIBUTION alone
  let whalePen = 0;
  if (input.whaleActivity === "DISTRIBUTION" && input.exchangeFlow === "INFLOW") whalePen = -2;
  else if (input.whaleActivity === "DISTRIBUTION") whalePen = -1;
  total += whalePen;
  breakdown.whaleAnomaly = whalePen;

  return { total: roundTo2(total), breakdown };
};

// ── Main: computeBalancedConsensus ──────────────────────────

export const computeBalancedConsensus = (
  input: BalancedConsensusInput,
): BalancedConsensusOutput => {
  const reasons: ReasonEntry[] = [];

  // ── 6-Component computation ──
  const opp = computeOpportunity(input);
  const dir = computeDirection(input);
  const exec = computeExecution(input);
  const liq = computeLiquidity(input);
  const struct = computeStructure(input);
  const rs = computeRS(input);
  const risk = computeRiskPenalty(input);

  // ── BalancedTradeScore = 0.32*Opp + 0.22*Dir + 0.18*Exec + 0.14*Liq + 0.08*Struct + 0.06*RS - RiskPenalty ──
  const rawTradeScore =
    0.32 * opp.score +
    0.22 * dir.score +
    0.18 * exec.score +
    0.14 * liq.score +
    0.08 * struct.score +
    0.06 * rs.score +
    risk.total;
  const baseScore = roundTo2(clamp(rawTradeScore, 0, 100));

  // ── Sub-score guardrails ──
  const guardrails = {
    oppPass: opp.score >= 70,
    dirPass: dir.score >= 56,
    execPass: exec.score >= 58,
    liqPass: liq.score >= 60,
    structPass: struct.score >= 55,
    allPass: false as boolean,
  };
  guardrails.allPass =
    guardrails.oppPass && guardrails.dirPass && guardrails.execPass &&
    guardrails.liqPass && guardrails.structPass;

  if (!guardrails.oppPass) addReason(reasons, `Guardrail: Opp ${opp.score} < 70`, 85);
  if (!guardrails.dirPass) addReason(reasons, `Guardrail: Dir ${dir.score} < 56`, 80);
  if (!guardrails.execPass) addReason(reasons, `Guardrail: Exec ${exec.score} < 58`, 75);
  if (!guardrails.liqPass) addReason(reasons, `Guardrail: Liq ${liq.score} < 60`, 70);
  if (!guardrails.structPass) addReason(reasons, `Guardrail: Struct ${struct.score} < 55`, 65);

  // ── Direction uncertain cap — moderate direction caps score at 82 ──
  let adjustedScore = baseScore;
  if (dir.score < 70 && adjustedScore > 82) {
    adjustedScore = 82;
    addReason(reasons, "Direction uncertain cap (82)", 60);
  }

  // ── Hard no-trade conditions ──
  const hardNoTrade =
    (input.stressLevel === "HIGH" && input.cascadeRisk === "HIGH" && input.depthQuality === "POOR");
  if (hardNoTrade && adjustedScore > 48) {
    adjustedScore = 48;
    addReason(reasons, "Hard no-trade conditions cap (48)", 95);
  }

  // ── Reason generation ──
  if (opp.score < 40) addReason(reasons, `Opp low (${opp.score}): weak opportunity`, 50);
  if (opp.score >= 75) addReason(reasons, `Opp strong (${opp.score}): opportunity present`, 40);
  if (dir.score >= 75) addReason(reasons, `Dir strong (${dir.score}): high conviction`, 45);
  if (exec.score < 40) addReason(reasons, `Exec low (${exec.score}): poor execution`, 55);
  if (risk.total < -3) addReason(reasons, `Risk penalty (${risk.total}): active risks`, 60);

  // ── Data Gate ──
  const dataGateBlocked =
    input.dataHealth?.feeds?.ohlcv === "down" ||
    safeNumber(input.dataHealth?.missingFields, 0) >= 3 ||
    (Boolean(input.dataHealth?.staleFeed) && safeNumber(input.dataHealth?.latencyMs, 0) > 8000);
  const dataGate: "PASS" | "BLOCK" = dataGateBlocked ? "BLOCK" : "PASS";
  if (dataGateBlocked) addReason(reasons, "Data gate blocked", 10_000);

  // ── Safety Gate ──
  const safetyGateBlocked =
    (input.stressLevel === "HIGH" && input.cascadeRisk === "HIGH") ||
    (input.depthQuality === "POOR" && input.spreadRegime === "WIDE" && input.slippageLevel === "HIGH");
  const safetyGate: "PASS" | "BLOCK" = safetyGateBlocked ? "BLOCK" : "PASS";
  if (safetyGateBlocked) addReason(reasons, "Safety block", 9_000);

  // ── Penalty rate (backward compat) ──
  const degradedCount = FEED_KEYS.filter((k) => input.dataHealth?.feeds?.[k] === "degraded").length;
  const dataDegradedPenalty = Math.min(0.06, degradedCount * 0.02);
  const executionWeaknessPenalty = exec.score < 40 ? roundTo2(((40 - exec.score) / 100) * 0.35) : 0;
  const entryClosedPenalty = input.entryWindow === "CLOSED" ? 0.05 : 0;
  const rawPenalty = clamp(executionWeaknessPenalty + entryClosedPenalty + dataDegradedPenalty, 0, 0.4);
  const isAPlus = adjustedScore >= 85;
  const penaltyRate = roundTo2(isAPlus ? rawPenalty * 0.5 : rawPenalty);

  // ── Final score ──
  let finalScore = roundTo2(clamp(adjustedScore * (1 - clamp(penaltyRate, 0, 1)), 0, 100));

  // A+ floor: high conviction setups keep minimum 78
  let floorsApplied = false;
  if (isAPlus && dataGate === "PASS" && safetyGate === "PASS") {
    const floored = Math.max(finalScore, 78);
    floorsApplied = floored > finalScore;
    finalScore = floored;
    if (floorsApplied) addReason(reasons, "A+ floor applied", 150);
  }

  // Gate enforcement
  if (safetyGate === "BLOCK") finalScore = Math.min(finalScore, 44);
  if (dataGate === "BLOCK") finalScore = 0;

  // Guardrail cap — sub-score threshold not met → cap below TRADE threshold
  if (!guardrails.allPass && finalScore >= 64) {
    finalScore = 63;
    addReason(reasons, "Guardrail block: sub-score threshold not met", 88);
  }

  finalScore = roundTo2(clamp(finalScore, 0, 100));

  // ── Position Size Scaling (Balanced 4-tier) ──
  let sizeHint: number;
  if (dataGate === "BLOCK" || safetyGate === "BLOCK") {
    sizeHint = 0;
  } else if (finalScore >= 85) {
    sizeHint = 1.00;
  } else if (finalScore >= 78) {
    sizeHint = 0.90;
  } else if (finalScore >= 72) {
    sizeHint = 0.70;
  } else if (finalScore >= 64) {
    sizeHint = 0.40;
  } else {
    sizeHint = 0;
  }
  sizeHint = roundTo2(sizeHint);

  // ── Backward-compat diagnostics ──
  const agreement01 = clamp(
    safeNumber(input.alignedCount, 0) / Math.max(1, Math.floor(safeNumber(input.totalModels, 1))),
    0, 1,
  );
  const agreementScore01 = clamp(agreement01 * agreementConflictMultiplier(input.conflictLevel), 0, 1);
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

  // ── Build output ──
  return {
    mode: "BALANCED",
    baseScore,
    adjustedScore,
    penaltyRate,
    finalScore,
    gates: { data: dataGate, safety: safetyGate },
    sizeHint,
    reasons: finalizeReasons(reasons),
    diagnostics: {
      componentScores: {
        structure01: roundTo2(struct.score / 100),
        liquidity01: roundTo2(liq.score / 100),
        positioning01: roundTo2(dir.score / 100),
        execution01: roundTo2(exec.score / 100),
        executionCertainty01: roundTo2(exec.breakdown.fill / 100),
        edge01: roundTo2((opp.score * 0.5 + dir.score * 0.5) / 100),
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
        opportunity: opp,
        direction: dir,
        execution: exec,
        liquidity: liq,
        structure: struct,
        relativeStrength: rs,
        riskPenalty: risk,
        guardrails,
        tradeScore: roundTo2(rawTradeScore),
      },
    },
  };
};
