/**
 * FLOW consensus — Adaptive Crypto Alpha Mode (Flow Variant)
 *
 * 5 Playbook Priority:
 *   1. Trend Pullback Continuation (main motor)
 *   2. Liquidity Sweep Reversal
 *   3. Range Rotation
 *   4. Failed Breakout Reclaim (extra alpha)
 *   5. Breakout (filtered only)
 *
 * Formula:
 *   CandidateScore = 0.26*Structure + 0.22*Liquidity + 0.18*Positioning
 *                  + 0.16*Execution + 0.10*Volatility + 0.08*Confirmation
 *   FinalTradeScore = CS + (0.06 * Confirmation) - Penalty
 *   RankScore = (FTS*0.55) + (RR_Potential*0.20) + (ExecCertainty*0.15) + (ModelAgreement*0.10)
 *
 * No-Trade Rule:
 *   Hard Block: Fake Breakout = HIGH, Execution Certainty = LOW (final stage)
 *   Soft Block: 3+ of: Signal Conflict HIGH, Trap Prob HIGH, News Risk ON,
 *               Model Agreement weak, RR low, Aggressor no follow-through
 *
 * Regime-Based Thresholds:
 *   Trend:    CS >= 52, FTS >= 66
 *   Range:    CS >= 50, FTS >= 62
 *   Reversal: CS >= 51, FTS >= 64
 *   Breakout: CS >= 55, FTS >= 67
 *
 * Idea Output Mode:
 *   Watchlist:       CS >= 50 (no FTS needed)
 *   Trade:           CS >= 52, FTS >= 66
 *   High Conviction: CS >= 58, FTS >= 68, Model Agreement >= 3+
 *
 * Sub-score guardrails:
 *   Struct >= 38, Liq >= 35, Pos >= 32, Exec >= 32, Vol >= 28, Conf >= 22
 *
 * Execution Certainty Scoring:
 *   HIGH -> full score
 *   MEDIUM -> 0.8x
 *   LOW -> 0.6x (entry accepted)
 *
 * Decision levels:
 *   85+    Full conviction TRADE    (sizeHint 1.00)
 *   78-84  High TRADE               (sizeHint 0.90)
 *   72-77  Normal TRADE             (sizeHint 0.70)
 *   66-71  Small size TRADE         (sizeHint 0.40)
 *   50-65  WATCH                    (sizeHint 0.00)
 *   <50    NO_TRADE                 (sizeHint 0.00)
 *
 * Caps:
 *   Positioning uncertain (Pos < 50) -> max 82
 *   Hard no-trade (stress+cascade+poor depth) -> max 48
 *   Hard block (fakeBreakout HIGH or exec certainty LOW) -> max 48
 *   Soft block (3+ danger signals) -> max 52
 *   Model agreement < 2/6 -> max 64
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
export type LiquidityDensity = "LOW" | "MID" | "HIGH";
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
export type MacroTrend = "UP" | "DOWN" | "FLAT" | "UNKNOWN";
export type SuddenMoveRisk = "LOW" | "MID" | "HIGH";
export type CascadeRisk = "LOW" | "MID" | "HIGH";
export type SpoofRisk = "LOW" | "MID" | "HIGH";
export type AsymmetryScore = "REWARD_DOMINANT" | "RISK_DOMINANT" | "NEUTRAL";
export type SpotVolumeSupport = "STRONG" | "WEAK" | "UNKNOWN";

// Playbook type
export type PlaybookType = "TREND_PULLBACK" | "LIQUIDITY_SWEEP" | "RANGE_ROTATION" | "FAILED_BREAKOUT_RECLAIM" | "BREAKOUT" | "GENERAL";

// ── Data health ──────────────────────────────────────────────

export interface FlowDataHealth {
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

export interface ExtremeConsensusInput {
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
  dataHealth?: FlowDataHealth;

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

  // Playbook detection & no-trade rule signals
  signalConflict?: ConflictLevel;
  trapProbability?: TernaryRisk;
  fakeBreakoutProb?: TernaryRisk;
  rangePosition?: string;
  stopClusterProb?: TernaryRisk;
  aggressorFlow?: string;
  breakoutRisk?: TernaryRisk;
  expansionProbability?: TernaryRisk;

  // Legacy compat fields (old extreme consensus)
  fundingRate1hPct?: number | null;
  fundingRate8hPct?: number | null;
  oiChange5mPct?: number | null;
  oiChange1hPct?: number | null;
  spotVolumeSupport?: SpotVolumeSupport;
  asymmetryScore?: AsymmetryScore;
}

// ── Component result type ────────────────────────────────────

interface ComponentResult {
  score: number;
  breakdown: Record<string, number>;
}

// ── Output ───────────────────────────────────────────────────

export interface ExtremeConsensusOutput {
  mode: "EXTREME";
  playbook: PlaybookType;
  candidateScore: number;
  finalTradeScore: number;
  rankScore: number;
  // Legacy compat
  extremeScore: number;
  rating: "LOW PROBABILITY" | "SPECULATIVE" | "HIGH RISK SETUP" | "LIQUIDATION / SQUEEZE LEVEL";
  directionBias: "LONG" | "SHORT" | "NEUTRAL";
  phase: "NO_TRADE" | "WAIT" | "SPECULATIVE" | "TRADE" | "SQUEEZE_EVENT";
  ideaMode: "NO_TRADE" | "WATCHLIST" | "TRADE" | "HIGH_CONVICTION";
  sizeHint: number;
  reasons: string[];
  gates: { data: "PASS" | "BLOCK"; safety: "PASS" | "BLOCK" };
  diagnostics: {
    layers: {
      structure: ComponentResult;
      liquidity: ComponentResult;
      positioning: ComponentResult;
      execution: ComponentResult;
      volatility: ComponentResult;
      confirmation: ComponentResult;
      riskPenalty: { total: number; breakdown: Record<string, number> };
      guardrails: {
        structPass: boolean;
        liqPass: boolean;
        posPass: boolean;
        execPass: boolean;
        volPass: boolean;
        confPass: boolean;
        allPass: boolean;
      };
      noTradeRule: {
        hardBlocked: boolean;
        softBlocked: boolean;
        softDangerCount: number;
        signals: Record<string, boolean>;
      };
      playbook: PlaybookType;
      playbookBoost: number;
      regimeThresholds: { csThreshold: number; ftsThreshold: number };
      executionCertaintyMultiplier: number;
    };
  };
}

// ── Utility functions ────────────────────────────────────────

type ReasonEntry = { impact: number; text: string };

export const clamp = (x: number, min: number, max: number): number => Math.max(min, Math.min(max, x));
export const roundTo2 = (x: number): number => Math.round(x * 100) / 100;
export const safeNumber = (value: unknown, fallback: number): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const addReason = (reasons: ReasonEntry[], text: string, impact: number) => {
  reasons.push({ text, impact });
};

const finalizeReasons = (reasons: ReasonEntry[]): string[] =>
  reasons
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 6)
    .map((r) => r.text);

const _FEED_KEYS: Array<keyof FlowDataHealth["feeds"]> = [
  "ohlcv", "orderbook", "oi", "funding", "netflow", "trades",
];
void _FEED_KEYS;

// ── Legacy compat helpers ────────────────────────────────────

const ratingFromScore = (score: number): ExtremeConsensusOutput["rating"] => {
  if (score <= 39) return "LOW PROBABILITY";
  if (score <= 59) return "SPECULATIVE";
  if (score <= 79) return "HIGH RISK SETUP";
  return "LIQUIDATION / SQUEEZE LEVEL";
};

const phaseFromScore = (score: number): ExtremeConsensusOutput["phase"] => {
  const rounded = Math.round(score);
  if (rounded <= 24) return "NO_TRADE";
  if (rounded <= 39) return "WAIT";
  if (rounded <= 54) return "SPECULATIVE";
  if (rounded <= 84) return "TRADE";
  return "SQUEEZE_EVENT";
};

const resolveDirectionBias = (
  input: ExtremeConsensusInput,
): "LONG" | "SHORT" | "NEUTRAL" => {
  let longVotes = 0;
  let shortVotes = 0;

  // Funding bias
  if (input.fundingBias === "BEARISH" || input.fundingBias === "EXTREME") longVotes += 1;
  if (input.fundingBias === "BULLISH" || input.fundingBias === "EXTREME") shortVotes += 1;

  // Whale activity
  if (input.whaleActivity === "ACCUMULATION") longVotes += 1;
  if (input.whaleActivity === "DISTRIBUTION") shortVotes += 1;

  // Exchange flow
  if (input.exchangeFlow === "OUTFLOW") longVotes += 1;
  if (input.exchangeFlow === "INFLOW") shortVotes += 1;

  // Orderbook imbalance
  if (input.orderbookImbalance === "BUY") longVotes += 1;
  if (input.orderbookImbalance === "SELL") shortVotes += 1;

  // Relative strength
  if (input.relativeStrength === "STRONG") longVotes += 1;
  if (input.relativeStrength === "WEAK") shortVotes += 1;

  // Liquidation pool bias
  if (input.liquidationPoolBias === "UP") longVotes += 1;
  if (input.liquidationPoolBias === "DOWN") shortVotes += 1;

  if (longVotes >= shortVotes + 1) return "LONG";
  if (shortVotes >= longVotes + 1) return "SHORT";
  return "NEUTRAL";
};

// ── Component 1: Structure Score (26%) ──────────────────────

const computeStructure = (input: ExtremeConsensusInput): ComponentResult => {
  // 1. Structure Base Score from AI panel (35%)
  const base = clamp(safeNumber(input.structureScore, 50), 0, 100);

  // 2. Regime Quality (20%)
  const regimeSub = input.regime === "TREND" ? 85
    : input.regime === "RANGE" ? 55
    : input.regime === "MIXED" ? 45 : 35;

  // 3. Trend Strength (15%)
  const trendSub = input.trendStrength === "HIGH" ? 90
    : input.trendStrength === "MID" ? 60 : 25;

  // 4. EMA + VWAP Alignment (15%)
  const fullAligned =
    (input.emaAlignment === "BULL" && input.vwapPosition === "ABOVE") ||
    (input.emaAlignment === "BEAR" && input.vwapPosition === "BELOW");
  const semiAligned =
    input.emaAlignment === "BULL" || input.emaAlignment === "BEAR" ||
    input.vwapPosition === "ABOVE" || input.vwapPosition === "BELOW";
  const alignmentSub = fullAligned ? 90 : semiAligned ? 55 : 25;

  // 5. Structure Age (15%)
  const ageSub = input.structureAge === "EARLY" ? 80
    : input.structureAge === "MATURE" ? 50 : 40;

  const score = clamp(
    0.35 * base + 0.20 * regimeSub + 0.15 * trendSub + 0.15 * alignmentSub + 0.15 * ageSub,
    0, 100,
  );

  return {
    score: roundTo2(score),
    breakdown: {
      structureBase: roundTo2(base),
      regimeQuality: roundTo2(regimeSub),
      trendStrength: roundTo2(trendSub),
      alignment: roundTo2(alignmentSub),
      structureAge: roundTo2(ageSub),
    },
  };
};

// ── Component 2: Liquidity Score (22%) ──────────────────────

const computeLiquidity = (input: ExtremeConsensusInput): ComponentResult => {
  // 1. Liquidity Density (30%)
  const liqDens = input.liquidityDensity === "HIGH" ? 90 : input.liquidityDensity === "MID" ? 55 : 20;

  // 2. Depth Quality (25%)
  const depth = input.depthQuality === "GOOD" ? 90 : input.depthQuality === "MID" ? 55 : 15;

  // 3. Spread Quality (20%)
  const spread = input.spreadRegime === "TIGHT" ? 90 : input.spreadRegime === "MID" ? 60 : 20;

  // 4. Capacity (15%)
  const cap = clamp(safeNumber(input.capacity, 0.5), 0, 1) * 100;

  // 5. Liquidation Pool Clarity (10%)
  const liqPool = input.liquidationPoolBias === "UP" || input.liquidationPoolBias === "DOWN" ? 80
    : input.liquidationPoolBias === "MIXED" ? 45 : 50;

  const score = clamp(
    0.30 * liqDens + 0.25 * depth + 0.20 * spread + 0.15 * cap + 0.10 * liqPool,
    0, 100,
  );

  return {
    score: roundTo2(score),
    breakdown: {
      liquidityDensity: roundTo2(liqDens),
      depthQuality: roundTo2(depth),
      spreadQuality: roundTo2(spread),
      capacity: roundTo2(cap),
      liquidationPool: roundTo2(liqPool),
    },
  };
};

// ── Component 3: Positioning Score (18%) ─────────────────────

const computePositioning = (input: ExtremeConsensusInput): ComponentResult => {
  // 1. Orderbook Imbalance + OI Strength (25%)
  const imbSub = input.orderbookImbalance === "NEUTRAL" ? 40 : 80;
  const oiStrSub = input.oiChangeStrength === "HIGH" ? 85 : input.oiChangeStrength === "MID" ? 55 : 25;
  const orderflow = 0.5 * imbSub + 0.5 * oiStrSub;

  // 2. OI Change Direction (20%)
  const oiChangePct = safeNumber(input.oiChangePct, 0);
  const oiDirectionSub = Math.abs(oiChangePct) > 3 ? 80 : Math.abs(oiChangePct) > 1 ? 55 : 30;

  // 3. Funding Bias (20%)
  let fundingSub =
    input.fundingBias === "EXTREME" ? 30
    : (input.fundingBias === "BULLISH" || input.fundingBias === "BEARISH") ? 70
    : 50;
  const frPct = safeNumber(input.fundingRatePct, 0);
  if (input.fundingBias === "EXTREME" && Math.abs(frPct) > 0.05) fundingSub -= 10;
  if ((input.fundingBias === "BULLISH" || input.fundingBias === "BEARISH") && Math.abs(frPct) > 0.03) fundingSub += 10;
  const funding = clamp(fundingSub, 0, 100);

  // 4. Whale Activity (20%)
  const whaleSub = input.whaleActivity === "ACCUMULATION" ? 85
    : input.whaleActivity === "NEUTRAL" ? 45 : 25;

  // 5. Exchange Flow (15%)
  const flowSub = input.exchangeFlow === "OUTFLOW" ? 80
    : input.exchangeFlow === "NEUTRAL" ? 45 : 25;

  const score = clamp(
    0.25 * orderflow + 0.20 * oiDirectionSub + 0.20 * funding + 0.20 * whaleSub + 0.15 * flowSub,
    0, 100,
  );

  return {
    score: roundTo2(score),
    breakdown: {
      orderflow: roundTo2(orderflow),
      oiDirection: roundTo2(oiDirectionSub),
      funding: roundTo2(funding),
      whaleActivity: roundTo2(whaleSub),
      exchangeFlow: roundTo2(flowSub),
    },
  };
};

// ── Component 4: Execution Score (16%) ──────────────────────

const computeExecution = (input: ExtremeConsensusInput): ComponentResult => {
  const pFill = clamp(safeNumber(input.pFill, 0.5), 0, 1);
  const capVal = clamp(safeNumber(input.capacity, 0.5), 0, 1);

  // 1. Orderbook Depth (25%)
  const depth = input.depthQuality === "GOOD" ? 90 : input.depthQuality === "MID" ? 55 : 15;

  // 2. Slippage Estimate (25%)
  let slipSub = input.slippageLevel === "LOW" ? 90 : input.slippageLevel === "MED" ? 55 : 15;
  if (pFill > 0.8) slipSub += 10;
  if (pFill < 0.3) slipSub -= 15;
  const slippage = clamp(slipSub, 0, 100);

  // 3. Spoof Probability (15%)
  const spoof = input.spoofRisk === "LOW" ? 90 : input.spoofRisk === "MID" ? 55 : 15;

  // 4. Fill Probability (20%)
  const fill = clamp(pFill * 60 + capVal * 40, 0, 100);

  // 5. Spread Cost (15%)
  let spreadSub = input.spreadRegime === "TIGHT" ? 85 : input.spreadRegime === "MID" ? 55 : 15;
  const costR = safeNumber(input.costR, 0);
  if (costR > 0.5) spreadSub -= 15;
  else if (costR > 0.3) spreadSub -= 8;
  const spreadCost = clamp(spreadSub, 0, 100);

  // Execution combo penalty — max -4
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

// ── Component 5: Volatility Score (10%) ─────────────────────

const computeVolatility = (input: ExtremeConsensusInput): ComponentResult => {
  // 1. ATR Regime (30%)
  const atrSub = input.atrRegime === "HIGH" ? 75 : input.atrRegime === "MID" ? 60 : 30;

  // 2. Compression (25%)
  const compressionSub = input.compression === "ON" ? 85 : input.compression === "OFF" ? 35 : 45;

  // 3. Sudden Move Risk (20%)
  const suddenSub = input.suddenMoveRisk === "HIGH" ? 70 : input.suddenMoveRisk === "MID" ? 50 : 30;

  // 4. Market Speed (15%)
  const speedSub = input.marketSpeed === "FAST" ? 80 : input.marketSpeed === "NORMAL" ? 55 : 25;

  // 5. Impulse Readiness (10%)
  const impulseSub = input.impulseReadiness === "HIGH" ? 80 : input.impulseReadiness === "MID" ? 50 : 25;

  const score = clamp(
    0.30 * atrSub + 0.25 * compressionSub + 0.20 * suddenSub + 0.15 * speedSub + 0.10 * impulseSub,
    0, 100,
  );

  return {
    score: roundTo2(score),
    breakdown: {
      atrRegime: roundTo2(atrSub),
      compression: roundTo2(compressionSub),
      suddenMoveRisk: roundTo2(suddenSub),
      marketSpeed: roundTo2(speedSub),
      impulseReadiness: roundTo2(impulseSub),
    },
  };
};

// ── Component 6: Confirmation Score (8%) ────────────────────

const computeConfirmation = (input: ExtremeConsensusInput): ComponentResult => {
  // 1. Model Agreement (40%)
  const aligned = safeNumber(input.alignedCount, 0);
  const total = Math.max(1, Math.floor(safeNumber(input.totalModels, 1)));
  const agreementRatio = clamp(aligned / total, 0, 1);
  const agreementSub = agreementRatio * 100;

  // 2. Conflict Level (20%)
  const effectiveConflict = input.signalConflict ?? input.conflictLevel;
  const conflictSub = effectiveConflict === "LOW" ? 85
    : effectiveConflict === "MID" ? 55 : effectiveConflict === "HIGH" ? 20 : 50;

  // 3. Relative Strength (20%)
  const rsSub = input.relativeStrength === "STRONG" ? 85
    : input.relativeStrength === "NEUTRAL" ? 50 : 25;

  // 4. Spot vs Derivatives Confirmation (20%)
  const spotSub = input.spotVsDerivativesPressure === "SPOT_DOM" ? 80
    : input.spotVsDerivativesPressure === "BALANCED" ? 50 : 35;

  const score = clamp(
    0.40 * agreementSub + 0.20 * conflictSub + 0.20 * rsSub + 0.20 * spotSub,
    0, 100,
  );

  return {
    score: roundTo2(score),
    breakdown: {
      modelAgreement: roundTo2(agreementSub),
      conflictLevel: roundTo2(conflictSub),
      relativeStrength: roundTo2(rsSub),
      spotConfirmation: roundTo2(spotSub),
    },
  };
};

// ── Risk Penalty ─────────────────────────────────────────────

const computeRiskPenalty = (input: ExtremeConsensusInput): { total: number; breakdown: Record<string, number> } => {
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

// ── Playbook Detection (5 playbooks for Flow) ────────────────

const detectPlaybook = (input: ExtremeConsensusInput): { playbook: PlaybookType; boost: number } => {
  // Priority 1: TREND_PULLBACK — main motor for trending markets
  const trendAligned =
    (input.emaAlignment === "BULL" && input.vwapPosition === "ABOVE") ||
    (input.emaAlignment === "BEAR" && input.vwapPosition === "BELOW");
  const trendClear =
    input.regime === "TREND" &&
    (input.trendStrength === "HIGH" || input.trendStrength === "MID") &&
    trendAligned &&
    input.orderbookImbalance !== "NEUTRAL";
  if (trendClear) {
    return { playbook: "TREND_PULLBACK", boost: 3 };
  }

  // Priority 2: LIQUIDITY_SWEEP — sweep reversal detection
  const sweepDetected =
    (input.stopClusterProb === "HIGH") &&
    (input.suddenMoveRisk === "HIGH" || input.suddenMoveRisk === "MID") &&
    (input.aggressorFlow === "BUY" || input.aggressorFlow === "BUY_DOMINANT" ||
     input.aggressorFlow === "SELL" || input.aggressorFlow === "SELL_DOMINANT");
  if (sweepDetected) {
    return { playbook: "LIQUIDITY_SWEEP", boost: 3 };
  }

  // Priority 3: RANGE_ROTATION — sideways market plays
  const rangePos = input.rangePosition ?? "";
  const atRangeExtreme =
    rangePos === "UPPER" || rangePos === "LOWER" ||
    rangePos === "PREMIUM" || rangePos === "DISCOUNT" ||
    rangePos === "TOP" || rangePos === "BOTTOM";
  const rangeConditions =
    input.regime === "RANGE" &&
    atRangeExtreme &&
    input.fakeBreakoutProb !== "HIGH";
  if (rangeConditions) {
    return { playbook: "RANGE_ROTATION", boost: 2 };
  }

  // Priority 4: FAILED_BREAKOUT_RECLAIM — extra alpha for Flow
  const failedBreakoutReclaim =
    input.fakeBreakoutProb === "HIGH" &&
    input.compression === "OFF" &&
    (input.aggressorFlow === "BUY" || input.aggressorFlow === "BUY_DOMINANT" ||
     input.aggressorFlow === "SELL" || input.aggressorFlow === "SELL_DOMINANT") &&
    input.orderbookImbalance !== "NEUTRAL";
  if (failedBreakoutReclaim) {
    return { playbook: "FAILED_BREAKOUT_RECLAIM", boost: 3 };
  }

  // Priority 5: BREAKOUT — only when ALL conditions met
  const breakoutAllMet =
    input.compression === "ON" &&
    (input.expansionProbability === "HIGH" || input.impulseReadiness === "HIGH") &&
    (input.fakeBreakoutProb === "LOW" || input.fakeBreakoutProb === undefined) &&
    input.volumeSpike === "ON" &&
    input.orderbookImbalance !== "NEUTRAL";
  if (breakoutAllMet) {
    return { playbook: "BREAKOUT", boost: 4 };
  }

  return { playbook: "GENERAL", boost: 0 };
};

// ── No-Trade Rule (Flow: Hard Block + Soft Block) ────────────

const checkNoTradeRule = (input: ExtremeConsensusInput): {
  hardBlocked: boolean;
  softBlocked: boolean;
  softDangerCount: number;
  signals: Record<string, boolean>;
} => {
  const signals: Record<string, boolean> = {};

  // ── Hard Block (always blocks) ──
  // 1. Fake Breakout Probability = HIGH
  signals.fakeBreakoutHigh = input.fakeBreakoutProb === "HIGH";

  // 2. Execution Certainty = LOW (final stage)
  const pFill = clamp(safeNumber(input.pFill, 0.5), 0, 1);
  signals.executionCertaintyLow =
    (input.entryWindow === "CLOSED" && input.slippageLevel === "HIGH") ||
    (pFill < 0.15);

  const hardBlocked = signals.fakeBreakoutHigh || signals.executionCertaintyLow;

  // ── Soft Block (3+ of these) ──
  // 1. Signal Conflict = HIGH
  signals.signalConflictHigh =
    input.signalConflict === "HIGH" || input.conflictLevel === "HIGH";

  // 2. Trap Probability = HIGH
  signals.trapProbabilityHigh =
    input.trapProbability === "HIGH" ||
    input.cascadeRisk === "HIGH" ||
    input.spoofRisk === "HIGH";

  // 3. News Risk = ON
  signals.newsRiskOn = input.suddenMoveRisk === "HIGH";

  // 4. Model Agreement weak (< 2/6)
  const aligned = safeNumber(input.alignedCount, 0);
  const total = Math.max(1, Math.floor(safeNumber(input.totalModels, 6)));
  signals.modelAgreementWeak = (aligned / total) < (2 / 6);

  // 5. RR low
  signals.rrLow = input.rrPotential === "LOW";

  // 6. Aggressor no follow-through
  const aggressor = input.aggressorFlow ?? "";
  signals.aggressorNoFollowThrough =
    aggressor === "NEUTRAL" || aggressor === "" || aggressor === "UNKNOWN";

  const softDangerCount = [
    signals.signalConflictHigh,
    signals.trapProbabilityHigh,
    signals.newsRiskOn,
    signals.modelAgreementWeak,
    signals.rrLow,
    signals.aggressorNoFollowThrough,
  ].filter(Boolean).length;

  const softBlocked = softDangerCount >= 3;

  return { hardBlocked, softBlocked, softDangerCount, signals };
};

// ── Regime-Based Thresholds ─────────────────────────────────

const getRegimeThresholds = (
  regime: Regime | undefined,
  playbook: PlaybookType,
): { csThreshold: number; ftsThreshold: number } => {
  if (playbook === "BREAKOUT") return { csThreshold: 55, ftsThreshold: 67 };
  if (regime === "RANGE") return { csThreshold: 50, ftsThreshold: 62 };
  if (playbook === "LIQUIDITY_SWEEP" || playbook === "FAILED_BREAKOUT_RECLAIM") return { csThreshold: 51, ftsThreshold: 64 };
  // Default: Trend
  return { csThreshold: 52, ftsThreshold: 66 };
};

// ── Execution Certainty Multiplier ──────────────────────────

const getExecutionCertaintyMultiplier = (input: ExtremeConsensusInput): number => {
  const pFill = clamp(safeNumber(input.pFill, 0.5), 0, 1);
  // HIGH: pFill >= 0.7 AND slippage LOW
  if (pFill >= 0.7 && input.slippageLevel === "LOW") return 1.0;
  // LOW: pFill < 0.3 OR slippage HIGH
  if (pFill < 0.3 || input.slippageLevel === "HIGH") return 0.6;
  // MEDIUM: everything else
  return 0.8;
};

// ── Main: computeExtremeConsensus ────────────────────────────

export const computeExtremeConsensus = (input: ExtremeConsensusInput): ExtremeConsensusOutput => {
  const reasons: ReasonEntry[] = [];

  // ── 6-Component computation (same weights as Balanced Alpha) ──
  const struct = computeStructure(input);       // 26%
  const liq = computeLiquidity(input);           // 22%
  const pos = computePositioning(input);         // 18%
  const exec = computeExecution(input);          // 16%
  const vol = computeVolatility(input);          // 10%
  const conf = computeConfirmation(input);       // 8%
  const risk = computeRiskPenalty(input);

  // ── Candidate Score (CS) ──
  const rawCandidateScore =
    0.26 * struct.score +
    0.22 * liq.score +
    0.18 * pos.score +
    0.16 * exec.score +
    0.10 * vol.score +
    0.08 * conf.score;
  const candidateScore = roundTo2(clamp(rawCandidateScore, 0, 100));

  // ── Final Trade Score (FTS) = CS + (0.06 * Confirmation) - Penalty ──
  const confirmationBonus = 0.06 * conf.score;
  const rawFTS = rawCandidateScore + confirmationBonus + risk.total;
  let finalTradeScore = roundTo2(clamp(rawFTS, 0, 100));

  // ── Playbook Detection & Boost ──
  const { playbook, boost: playbookBoost } = detectPlaybook(input);
  finalTradeScore = clamp(finalTradeScore + playbookBoost, 0, 100);
  if (playbookBoost > 0) {
    addReason(reasons, `Playbook ${playbook} boost +${playbookBoost}`, 40);
  }

  // ── Execution Certainty Multiplier ──
  const execCertaintyMultiplier = getExecutionCertaintyMultiplier(input);
  if (execCertaintyMultiplier < 1.0) {
    finalTradeScore = roundTo2(finalTradeScore * execCertaintyMultiplier);
    if (execCertaintyMultiplier === 0.6) {
      addReason(reasons, "Execution certainty LOW: 0.6x multiplier", 60);
    } else {
      addReason(reasons, "Execution certainty MEDIUM: 0.8x multiplier", 30);
    }
  }

  // ── No-Trade Rule ──
  const noTradeRule = checkNoTradeRule(input);
  if (noTradeRule.hardBlocked) {
    finalTradeScore = Math.min(finalTradeScore, 48);
    addReason(reasons, "Hard block: " + (noTradeRule.signals.fakeBreakoutHigh ? "Fake Breakout HIGH" : "Execution Certainty LOW"), 100);
  }
  if (noTradeRule.softBlocked) {
    finalTradeScore = Math.min(finalTradeScore, 52);
    addReason(reasons, `Soft block: ${noTradeRule.softDangerCount} danger signals`, 90);
  }

  // ── Sub-score guardrails (relaxed for Flow) ──
  const guardrails = {
    structPass: struct.score >= 38,
    liqPass: liq.score >= 35,
    posPass: pos.score >= 32,
    execPass: exec.score >= 32,
    volPass: vol.score >= 28,
    confPass: conf.score >= 22,
    allPass: false as boolean,
  };
  guardrails.allPass =
    guardrails.structPass && guardrails.liqPass && guardrails.posPass &&
    guardrails.execPass && guardrails.volPass && guardrails.confPass;

  if (!guardrails.structPass) addReason(reasons, `Guardrail: Struct ${struct.score} < 38`, 85);
  if (!guardrails.liqPass) addReason(reasons, `Guardrail: Liq ${liq.score} < 35`, 80);
  if (!guardrails.posPass) addReason(reasons, `Guardrail: Pos ${pos.score} < 32`, 75);
  if (!guardrails.execPass) addReason(reasons, `Guardrail: Exec ${exec.score} < 32`, 70);

  // Guardrail cap
  if (!guardrails.allPass && finalTradeScore >= 72) {
    finalTradeScore = Math.max(finalTradeScore - 6, 62);
    addReason(reasons, "Guardrail penalty: sub-score threshold not met", 88);
  }

  // ── Model Agreement gate: need >= 2/6 (weighted, 1 strong from Structure/Liquidity) ──
  const modelAgreementRatio = safeNumber(input.alignedCount, 0) / Math.max(1, Math.floor(safeNumber(input.totalModels, 6)));
  if (modelAgreementRatio < (2 / 6) && finalTradeScore > 64) {
    finalTradeScore = Math.min(finalTradeScore, 64);
    addReason(reasons, "Model agreement below 2/6 threshold", 70);
  }

  // ── Positioning uncertain cap ──
  if (pos.score < 50 && finalTradeScore > 82) {
    finalTradeScore = 82;
    addReason(reasons, "Positioning uncertain cap (82)", 60);
  }

  // ── Hard no-trade conditions (extreme combined risk) ──
  const hardNoTrade =
    (input.stressLevel === "HIGH" && input.cascadeRisk === "HIGH" && input.depthQuality === "POOR");
  if (hardNoTrade && finalTradeScore > 48) {
    finalTradeScore = 48;
    addReason(reasons, "Hard no-trade conditions cap (48)", 95);
  }

  // ── Regime-Based Thresholds ──
  const regimeThresholds = getRegimeThresholds(input.regime, playbook);

  // ── Reason generation ──
  if (struct.score < 38) addReason(reasons, `Struct low (${struct.score}): weak structure`, 50);
  if (struct.score >= 75) addReason(reasons, `Struct strong (${struct.score}): solid structure`, 40);
  if (pos.score >= 70) addReason(reasons, `Pos strong (${pos.score}): clear positioning`, 45);
  if (exec.score < 35) addReason(reasons, `Exec low (${exec.score}): poor execution`, 55);
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
    (input.stressLevel === "HIGH" && input.cascadeRisk === "HIGH" && input.depthQuality === "POOR");
  const safetyGate: "PASS" | "BLOCK" = safetyGateBlocked ? "BLOCK" : "PASS";
  if (safetyGateBlocked) addReason(reasons, "Safety block", 9_000);

  // Gate enforcement
  if (safetyGate === "BLOCK") finalTradeScore = Math.min(finalTradeScore, 44);
  if (dataGate === "BLOCK") finalTradeScore = 0;

  finalTradeScore = roundTo2(clamp(finalTradeScore, 0, 100));

  // ── Idea Output Mode ──
  let ideaMode: ExtremeConsensusOutput["ideaMode"];
  const aligned = safeNumber(input.alignedCount, 0);
  if (candidateScore >= 58 && finalTradeScore >= 68 && aligned >= 3) {
    ideaMode = "HIGH_CONVICTION";
  } else if (candidateScore >= regimeThresholds.csThreshold && finalTradeScore >= regimeThresholds.ftsThreshold &&
             dataGate === "PASS" && safetyGate === "PASS" && !noTradeRule.hardBlocked) {
    ideaMode = "TRADE";
  } else if (candidateScore >= 50) {
    ideaMode = "WATCHLIST";
  } else {
    ideaMode = "NO_TRADE";
  }

  // ── Position Size Scaling ──
  let sizeHint: number;
  if (dataGate === "BLOCK" || safetyGate === "BLOCK" || ideaMode === "NO_TRADE" || ideaMode === "WATCHLIST") {
    sizeHint = 0;
  } else if (finalTradeScore >= 85) {
    sizeHint = 1.00;
  } else if (finalTradeScore >= 78) {
    sizeHint = 0.90;
  } else if (finalTradeScore >= 72) {
    sizeHint = 0.70;
  } else if (finalTradeScore >= 66) {
    sizeHint = 0.40;
  } else {
    sizeHint = 0;
  }
  sizeHint = roundTo2(sizeHint);

  // ── Rank Score ──
  const execCertainty01 = clamp(exec.breakdown.fill / 100, 0, 1);
  const rrPotentialScore = input.rrPotential === "HIGH" ? 0.9 : input.rrPotential === "MID" ? 0.6 : 0.3;
  const agreementForRank = clamp(conf.breakdown.modelAgreement / 100, 0, 1);
  const rankScore = roundTo2(
    ((finalTradeScore / 100) * 0.55 +
    rrPotentialScore * 0.20 +
    execCertainty01 * 0.15 +
    agreementForRank * 0.10) * 100,
  );

  // ── Legacy compat: extremeScore, rating, phase, directionBias ──
  const extremeScore = finalTradeScore;
  const directionBias = resolveDirectionBias(input);

  // ── Build output ──
  return {
    mode: "EXTREME",
    playbook,
    candidateScore,
    finalTradeScore,
    rankScore,
    extremeScore,
    rating: ratingFromScore(extremeScore),
    directionBias,
    phase: phaseFromScore(extremeScore),
    ideaMode,
    sizeHint,
    reasons: finalizeReasons(reasons),
    gates: { data: dataGate, safety: safetyGate },
    diagnostics: {
      layers: {
        structure: struct,
        liquidity: liq,
        positioning: pos,
        execution: exec,
        volatility: vol,
        confirmation: conf,
        riskPenalty: risk,
        guardrails,
        noTradeRule,
        playbook,
        playbookBoost,
        regimeThresholds,
        executionCertaintyMultiplier: execCertaintyMultiplier,
      },
    },
  };
};
