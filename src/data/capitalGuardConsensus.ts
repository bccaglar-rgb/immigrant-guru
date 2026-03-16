/**
 * Capital Guard Consensus — Institutional 4-Layer Scoring Model
 *
 * Pipeline:
 *   Layer 1: MOS (Market Opportunity Score)   × 0.40
 *   Layer 2: DCS (Direction Confidence Score) × 0.30
 *   Layer 3: EQS (Execution Quality Score)    × 0.20
 *   Layer 4: RES (Risk Event Score)           additive penalty
 *            LSI (Liquidity Shock Index)      additional penalty
 *
 * TradeScore = 0.40*MOS + 0.30*DCS + 0.20*EQS + RES - LSI
 *
 * Decision levels:
 *   85+   High conviction TRADE  (sizeHint 1.00)
 *   75-84 Normal TRADE           (sizeHint 0.70)
 *   65-74 Small size TRADE       (sizeHint 0.40)
 *   55-64 WATCH / speculative    (sizeHint 0.20)
 *   <55   NO_TRADE               (sizeHint 0.00)
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

// New types for 4-layer model
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

  // 4-layer model signals
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

const lerpRange = (x: number, x1: number, x2: number, y1: number, y2: number): number => {
  if (x2 <= x1) return y2;
  const t = clamp((x - x1) / (x2 - x1), 0, 1);
  return y1 + (y2 - y1) * t;
};

export const normalizeRiskAdjEdge = (riskAdjEdgeR: number): number => {
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

const FEED_KEYS: Array<keyof CapitalGuardDataHealth["feeds"]> = [
  "ohlcv", "orderbook", "oi", "funding", "netflow", "trades",
];

// ── Layer 1: Market Opportunity Score (MOS) ──────────────────

const computeMOS = (input: CapitalGuardConsensusInput): LayerResult => {
  // 1. Volume Expansion (20%) — volumeSpike + oiChangeStrength
  const volumeSpikeSub = input.volumeSpike === "ON" ? 80 : input.volumeSpike === "OFF" ? 30 : 40;
  const oiSub = input.oiChangeStrength === "HIGH" ? 90 : input.oiChangeStrength === "MID" ? 55 : 25;
  const volumeExpansion = 0.5 * volumeSpikeSub + 0.5 * oiSub;

  // 2. Volatility Expansion (15%) — compression + atrRegime + suddenMoveRisk
  const compressionSub = input.compression === "ON" ? 85 : input.compression === "OFF" ? 35 : 45;
  const atrSub = input.atrRegime === "HIGH" ? 80 : input.atrRegime === "MID" ? 55 : 30;
  const suddenSub = input.suddenMoveRisk === "HIGH" ? 75 : input.suddenMoveRisk === "MID" ? 50 : 30;
  const volatilityExpansion = 0.4 * compressionSub + 0.3 * atrSub + 0.3 * suddenSub;

  // 3. Momentum (20%) — marketSpeed + impulseReadiness + trendStrength
  const speedSub = input.marketSpeed === "FAST" ? 85 : input.marketSpeed === "NORMAL" ? 55 : 25;
  const impulseSub = input.impulseReadiness === "HIGH" ? 85 : input.impulseReadiness === "MID" ? 50 : 20;
  const trendSub = input.trendStrength === "HIGH" ? 90 : input.trendStrength === "MID" ? 55 : 20;
  const momentum = 0.35 * speedSub + 0.30 * impulseSub + 0.35 * trendSub;

  // 4. Liquidity (15%) — liquidityDensity + depthQuality
  const liqDensSub = input.liquidityDensity === "HIGH" ? 90 : input.liquidityDensity === "MID" ? 55 : 20;
  const depthSub = input.depthQuality === "GOOD" ? 90 : input.depthQuality === "MID" ? 55 : 15;
  const liquidity = 0.5 * liqDensSub + 0.5 * depthSub;

  // 5. Spread Quality (10%) — spreadRegime
  const spreadQuality = input.spreadRegime === "TIGHT" ? 90 : input.spreadRegime === "MID" ? 60 : 20;

  // 6. Trend Alignment (10%) — emaAlignment + vwapPosition + regime
  const aligned =
    (input.emaAlignment === "BULL" && input.vwapPosition === "ABOVE") ||
    (input.emaAlignment === "BEAR" && input.vwapPosition === "BELOW");
  const trendAlignment =
    input.regime === "TREND"
      ? (aligned ? 90 : 50)
      : input.regime === "RANGE"
        ? 35
        : (aligned ? 65 : 40);

  // 7. Market Sentiment (10%) — relativeStrength + spotVsDerivatives + whaleActivity
  const relSub = input.relativeStrength === "STRONG" ? 80 : input.relativeStrength === "NEUTRAL" ? 50 : 25;
  const spotSub = input.spotVsDerivativesPressure === "SPOT_DOM" ? 75 : input.spotVsDerivativesPressure === "BALANCED" ? 50 : 40;
  const whaleSub = input.whaleActivity === "ACCUMULATION" ? 80 : input.whaleActivity === "NEUTRAL" ? 45 : 30;
  const sentiment = 0.4 * relSub + 0.3 * spotSub + 0.3 * whaleSub;

  const score = clamp(
    0.20 * volumeExpansion +
    0.15 * volatilityExpansion +
    0.20 * momentum +
    0.15 * liquidity +
    0.10 * spreadQuality +
    0.10 * trendAlignment +
    0.10 * sentiment,
    0, 100,
  );

  return {
    score: roundTo2(score),
    breakdown: {
      volumeExpansion: roundTo2(volumeExpansion),
      volatilityExpansion: roundTo2(volatilityExpansion),
      momentum: roundTo2(momentum),
      liquidity: roundTo2(liquidity),
      spreadQuality: roundTo2(spreadQuality),
      trendAlignment: roundTo2(trendAlignment),
      sentiment: roundTo2(sentiment),
    },
  };
};

// ── Layer 2: Direction Confidence Score (DCS) ────────────────

const computeDCS = (input: CapitalGuardConsensusInput): LayerResult => {
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

// ── Layer 3: Execution Quality Score (EQS) ───────────────────

const computeEQS = (input: CapitalGuardConsensusInput): LayerResult => {
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

  const score = clamp(
    0.25 * depth +
    0.25 * slippage +
    0.15 * spoof +
    0.20 * fill +
    0.15 * spreadCost,
    0, 100,
  );

  return {
    score: roundTo2(score),
    breakdown: {
      depth: roundTo2(depth),
      slippage: roundTo2(slippage),
      spoof: roundTo2(spoof),
      fill: roundTo2(fill),
      spreadCost: roundTo2(spreadCost),
    },
  };
};

// ── Layer 4: Risk Event Score (RES) ──────────────────────────

const computeRES = (input: CapitalGuardConsensusInput): LayerResult => {
  let total = 0;
  const breakdown: Record<string, number> = {};

  // 1. Cascade Liquidation Risk: -10 HIGH, -4 MID
  const cascadePenalty = input.cascadeRisk === "HIGH" ? -10 : input.cascadeRisk === "MID" ? -4 : 0;
  total += cascadePenalty;
  breakdown.cascadeLiquidation = cascadePenalty;

  // 2. Funding Spike: -6 EXTREME, -2 directional with |pct| > 0.04
  const frPct = safeNumber(input.fundingRatePct, 0);
  let fundingPenalty = 0;
  if (input.fundingBias === "EXTREME") fundingPenalty = -6;
  else if ((input.fundingBias === "BULLISH" || input.fundingBias === "BEARISH") && Math.abs(frPct) > 0.04) fundingPenalty = -2;
  total += fundingPenalty;
  breakdown.fundingSpike = fundingPenalty;

  // 3. News / Volatility Shock: -8 both HIGH, -4 either HIGH
  let newsPenalty = 0;
  if (input.suddenMoveRisk === "HIGH" && input.stressLevel === "HIGH") newsPenalty = -8;
  else if (input.suddenMoveRisk === "HIGH" || input.stressLevel === "HIGH") newsPenalty = -4;
  total += newsPenalty;
  breakdown.newsVolatility = newsPenalty;

  // 4. Whale Anomaly: -7 DISTRIBUTION + INFLOW, -3 DISTRIBUTION alone
  let whalePenalty = 0;
  if (input.whaleActivity === "DISTRIBUTION" && input.exchangeFlow === "INFLOW") whalePenalty = -7;
  else if (input.whaleActivity === "DISTRIBUTION") whalePenalty = -3;
  total += whalePenalty;
  breakdown.whaleAnomaly = whalePenalty;

  // 5. Exchange Instability: -10 stress HIGH + degraded feeds, -5 stress HIGH alone
  const degradedOrDown = FEED_KEYS.filter((k) => {
    const status = input.dataHealth?.feeds?.[k];
    return status === "degraded" || status === "down";
  }).length;
  let exchangePenalty = 0;
  if (input.stressLevel === "HIGH" && degradedOrDown >= 2) exchangePenalty = -10;
  else if (input.stressLevel === "HIGH") exchangePenalty = -5;
  else if (degradedOrDown >= 3) exchangePenalty = -4;
  total += exchangePenalty;
  breakdown.exchangeInstability = exchangePenalty;

  return { score: roundTo2(total), breakdown };
};

// ── Liquidity Shock Index (LSI) ──────────────────────────────

const computeLSI = (input: CapitalGuardConsensusInput): LsiResult => {
  // LiquidationDensity: active pool = high risk
  const liqDens =
    input.liquidationPoolBias === "UP" || input.liquidationPoolBias === "DOWN"
      ? 0.8
      : input.liquidationPoolBias === "MIXED" ? 0.4 : 0.2;

  // BookImbalance: extreme imbalance = higher shock risk
  const bookImb = input.orderbookImbalance === "NEUTRAL" ? 0.2 : 0.8;

  // LiquidityGap: LOW density + POOR depth = gapped
  const liqGapRaw =
    (input.liquidityDensity === "LOW" ? 0.6 : input.liquidityDensity === "MID" ? 0.3 : 0.1) +
    (input.depthQuality === "POOR" ? 0.4 : input.depthQuality === "MID" ? 0.2 : 0.0);
  const liqGap = clamp(liqGapRaw, 0, 1);

  const lsi = 0.4 * liqDens + 0.3 * bookImb + 0.3 * liqGap;

  // Adjustment: high LSI → penalty 5-12, moderate LSI → penalty 2-5
  let adjustment = 0;
  if (lsi > 0.6) {
    adjustment = -1 * lerpRange(lsi, 0.6, 1.0, 5, 12);
  } else if (lsi > 0.4) {
    adjustment = -1 * lerpRange(lsi, 0.4, 0.6, 2, 5);
  }

  return { score: roundTo2(lsi), adjustment: roundTo2(adjustment) };
};

// ── Main: computeCapitalGuardConsensus ───────────────────────

export const computeCapitalGuardConsensus = (
  input: CapitalGuardConsensusInput,
): CapitalGuardConsensusOutput => {
  const reasons: ReasonEntry[] = [];

  // ── 4-Layer computation ──
  const mos = computeMOS(input);
  const dcs = computeDCS(input);
  const eqs = computeEQS(input);
  const res = computeRES(input);
  const lsi = computeLSI(input);

  // ── TradeScore = 0.40*MOS + 0.30*DCS + 0.20*EQS + RES ──
  const rawTradeScore = 0.40 * mos.score + 0.30 * dcs.score + 0.20 * eqs.score + res.score;
  const baseScore = roundTo2(clamp(rawTradeScore, 0, 100));

  // ── LSI adjustment ──
  const adjustedScore = roundTo2(clamp(baseScore + lsi.adjustment, 0, 100));

  // ── Reason generation ──
  if (mos.score < 40) addReason(reasons, `MOS low (${mos.score}): weak opportunity`, 70);
  if (mos.score >= 75) addReason(reasons, `MOS strong (${mos.score}): opportunity present`, 60);
  if (dcs.score < 40) addReason(reasons, `DCS low (${dcs.score}): unclear direction`, 75);
  if (dcs.score >= 75) addReason(reasons, `DCS strong (${dcs.score}): high conviction`, 65);
  if (eqs.score < 40) addReason(reasons, `EQS low (${eqs.score}): poor execution`, 60);
  if (eqs.score >= 75) addReason(reasons, `EQS strong (${eqs.score}): clean execution`, 50);
  if (res.score < -10) addReason(reasons, `RES alert (${res.score}): active risk events`, 80);
  if (lsi.adjustment < -5) addReason(reasons, `LSI shock risk (adj: ${lsi.adjustment})`, 55);

  // ── Data Gate (unchanged from original) ──
  const dataGateBlocked =
    input.dataHealth?.feeds?.ohlcv === "down" ||
    safeNumber(input.dataHealth?.missingFields, 0) >= 3 ||
    (Boolean(input.dataHealth?.staleFeed) && safeNumber(input.dataHealth?.latencyMs, 0) > 8000);
  const dataGate: "PASS" | "BLOCK" = dataGateBlocked ? "BLOCK" : "PASS";
  if (dataGateBlocked) addReason(reasons, "Data gate blocked", 10_000);

  // ── Safety Gate (enhanced with RES threshold) ──
  const safetyGateBlocked =
    (input.stressLevel === "HIGH" && input.cascadeRisk === "HIGH") ||
    (input.depthQuality === "POOR" && input.spreadRegime === "WIDE" && input.slippageLevel === "HIGH") ||
    (res.score <= -25);
  const safetyGate: "PASS" | "BLOCK" = safetyGateBlocked ? "BLOCK" : "PASS";
  if (safetyGateBlocked) addReason(reasons, "Safety block", 9_000);

  // ── Penalty rate (backward compat) ──
  const latencyPenalty = 0;
  const executionWeaknessPenalty = eqs.score < 40 ? roundTo2(((40 - eqs.score) / 100) * 0.35) : 0;
  const entryClosedPenalty = input.entryWindow === "CLOSED" ? 0.05 : 0;
  const degradedCount = FEED_KEYS.filter((k) => input.dataHealth?.feeds?.[k] === "degraded").length;
  const dataDegradedPenalty = Math.min(0.06, degradedCount * 0.02);
  const rawPenalty = clamp(
    latencyPenalty + executionWeaknessPenalty + entryClosedPenalty + dataDegradedPenalty,
    0, 0.4,
  );

  // isAPlus = high conviction (score >= 85)
  const isAPlus = adjustedScore >= 85;
  const penaltyRate = roundTo2(isAPlus ? rawPenalty * 0.5 : rawPenalty);

  // ── Final score ──
  let finalScore = roundTo2(clamp(adjustedScore * (1 - clamp(penaltyRate, 0, 1)), 0, 100));

  // A+ floor: high conviction setups keep minimum 75
  let floorsApplied = false;
  if (isAPlus && dataGate === "PASS" && safetyGate === "PASS") {
    const floored = Math.max(finalScore, 75);
    floorsApplied = floored > finalScore;
    finalScore = floored;
    if (floorsApplied) addReason(reasons, "High conviction floor applied", 150);
  }

  // Gate enforcement
  if (safetyGate === "BLOCK") finalScore = Math.min(finalScore, 44);
  if (dataGate === "BLOCK") finalScore = 0;
  finalScore = roundTo2(clamp(finalScore, 0, 100));

  // ── Position Size Scaling (4-tier institutional) ──
  let sizeHint: number;
  if (dataGate === "BLOCK" || safetyGate === "BLOCK") {
    sizeHint = 0;
  } else if (finalScore >= 85) {
    sizeHint = 1.0;
  } else if (finalScore >= 75) {
    sizeHint = 0.70;
  } else if (finalScore >= 65) {
    sizeHint = 0.40;
  } else if (finalScore >= 55) {
    sizeHint = 0.20;
  } else {
    sizeHint = 0;
  }
  sizeHint = roundTo2(sizeHint);

  // ── Agreement quality (backward compat diagnostics) ──
  const agreement01 = clamp(
    safeNumber(input.alignedCount, 0) / Math.max(1, Math.floor(safeNumber(input.totalModels, 1))),
    0, 1,
  );
  const agreementScore01 = clamp(agreement01 * agreementConflictMultiplier(input.conflictLevel), 0, 1);
  const agreementQ = 0.85 + (0.15 * agreementScore01);

  // ── Risk/regime modifiers (backward compat diagnostics) ──
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
        structure01: roundTo2(dcs.breakdown.structure / 100),
        liquidity01: roundTo2(mos.breakdown.liquidity / 100),
        positioning01: roundTo2(dcs.score / 100),
        execution01: roundTo2(eqs.score / 100),
        executionCertainty01: roundTo2(eqs.breakdown.fill / 100),
        edge01: roundTo2((mos.score * 0.5 + dcs.score * 0.5) / 100),
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
        latencyPenalty: roundTo2(latencyPenalty),
        executionWeaknessPenalty: roundTo2(executionWeaknessPenalty),
        entryClosedPenalty: roundTo2(entryClosedPenalty),
        dataDegradedPenalty: roundTo2(dataDegradedPenalty),
        rawPenalty: roundTo2(rawPenalty),
        penaltyRate: roundTo2(penaltyRate),
      },
      floorsApplied,
      layers: {
        mos,
        dcs,
        eqs,
        res,
        lsi,
        tradeScore: roundTo2(rawTradeScore),
      },
    },
  };
};
