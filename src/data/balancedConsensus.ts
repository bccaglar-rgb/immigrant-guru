/**
 * BALANCED consensus — Market Structure Strategy Mode
 *
 * Core principle: Trend + Son Dip/Tepe + Fake hareket + Teyit = Kazançlı trade
 *
 * RULES:
 *   1. TREND ZORUNLU: No trend (HH+HL or LH+LL) = No trade
 *   2. Entry confirmation: Min 2 signals (volume spike, orderbook, OI, aggressor, impulse)
 *   3. SL at swing level + 0.3% buffer (stop avlanmamak için)
 *   4. TP min 1:2 RR or next liquidity zone
 *
 * 4 Priority Playbooks:
 *   1. Trend Pullback Continuation (main motor — trend regime, +6/+8 boost)
 *   2. Liquidity Sweep Reversal (fake breakout recovery, +5 boost)
 *   3. Breakout (conditional — compression + volume + all criteria, +4 boost)
 *   4. Range Rotation (reduced — not ideal, +1 boost)
 *
 * Formula:
 *   CandidateScore = 0.26*Structure + 0.22*Liquidity + 0.18*Positioning
 *                  + 0.16*Execution + 0.10*Volatility + 0.08*Confirmation
 *   FinalTradeScore = CandidateScore + RiskPenalty + PlaybookBoost
 *   RankScore = (FTS×0.55) + (RR_Potential×0.20) + (ExecCertainty×0.15) + (ModelAgreement×0.10)
 *
 * No-Trade Rule — block if 2+ of:
 *   Signal Conflict HIGH, Trap Probability HIGH, News Risk ON,
 *   Fake Breakout HIGH, Execution Certainty LOW,
 *   No Trend Detected, No EMA Alignment
 *
 * Sub-score guardrails:
 *   Struct >= 42 (hard cap below TRADE), Liq >= 30, Pos >= 28, Exec >= 28, Vol >= 22, Conf >= 18
 *
 * Decision levels (Market Structure Strategy):
 *   82+    Full conviction TRADE    (sizeHint 1.00)
 *   74-81  High TRADE               (sizeHint 0.85)
 *   66-73  Normal TRADE             (sizeHint 0.60)
 *   60-65  Small size TRADE         (sizeHint 0.35)
 *   42-59  WATCH                    (sizeHint 0.00)
 *   <42    NO_TRADE                 (sizeHint 0.00)
 *
 * Caps:
 *   Entry confirmation < 2 signals → max 52 (below TRADE threshold)
 *   Structure guardrail fail (< 42) → max 52 (no trend = no trade)
 *   No-trade rule (2+ danger signals) → max 46
 *   Hard no-trade (stress+cascade+poor depth) → max 48
 *   Positioning uncertain (Pos < 50) → max 86
 *   Model agreement < 2/6 → max 66
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

// Playbook type
export type PlaybookType = "TREND_PULLBACK" | "LIQUIDITY_SWEEP" | "RANGE_ROTATION" | "BREAKOUT" | "GENERAL";

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

  // Playbook detection & no-trade rule signals
  signalConflict?: ConflictLevel;
  trapProbability?: TernaryRisk;
  fakeBreakoutProb?: TernaryRisk;
  rangePosition?: string;
  stopClusterProb?: TernaryRisk;
  aggressorFlow?: string;
  breakoutRisk?: TernaryRisk;
}

// ── Component result type ────────────────────────────────────

interface ComponentResult {
  score: number;
  breakdown: Record<string, number>;
}

// ── Output ───────────────────────────────────────────────────

export interface BalancedConsensusOutput {
  mode: "BALANCED";
  playbook: PlaybookType;
  candidateScore: number;
  rankScore: number;
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
      // New component names
      structure: ComponentResult;
      liquidity: ComponentResult;
      positioning: ComponentResult;
      execution: ComponentResult;
      volatility: ComponentResult;
      confirmation: ComponentResult;
      // Backward-compat aliases
      opportunity: ComponentResult;
      direction: ComponentResult;
      relativeStrength: ComponentResult;
      riskPenalty: { total: number; breakdown: Record<string, number> };
      guardrails: {
        structPass: boolean;
        liqPass: boolean;
        posPass: boolean;
        execPass: boolean;
        volPass: boolean;
        confPass: boolean;
        // Backward-compat aliases
        oppPass: boolean;
        dirPass: boolean;
        allPass: boolean;
      };
      noTradeRule: {
        blocked: boolean;
        dangerCount: number;
        signals: Record<string, boolean>;
      };
      tradeScore: number;
      playbook: PlaybookType;
      playbookBoost: number;
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

export const normalizeBalancedRiskAdjEdge = (riskAdjEdgeR: number): number => {
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

const agreementConflictMultiplier = (conflict: ConflictLevel | undefined): number => {
  if (conflict === "LOW") return 1.0;
  if (conflict === "MID") return 0.95;
  if (conflict === "HIGH") return 0.86;
  return 0.93;
};

const FEED_KEYS: Array<keyof BalancedDataHealth["feeds"]> = [
  "ohlcv", "orderbook", "oi", "funding", "netflow", "trades",
];

// ── Component 1: Structure Score (26%) ──────────────────────

const computeStructure = (input: BalancedConsensusInput): ComponentResult => {
  // 1. Structure Base Score from AI panel (35%)
  const base = clamp(safeNumber(input.structureScore, 50), 0, 100);

  // 2. Regime Quality (25%) — Trend preferred but MIXED/RANGE can qualify
  //    Relaxed from original: RANGE 28→42, MIXED 18→38 — allow non-trend setups
  const regimeSub = input.regime === "TREND" ? 92
    : input.regime === "RANGE" ? 42
    : input.regime === "MIXED" ? 38 : 15;

  // 3. Trend Strength (20%) — Strong trend required (HH+HL or LH+LL)
  const trendSub = input.trendStrength === "HIGH" ? 95
    : input.trendStrength === "MID" ? 62 : 10;

  // 4. EMA + VWAP Alignment (15%) — Trend direction confirmation
  //    Full aligned = EMA 200 + VWAP both confirming direction
  const fullAligned =
    (input.emaAlignment === "BULL" && input.vwapPosition === "ABOVE") ||
    (input.emaAlignment === "BEAR" && input.vwapPosition === "BELOW");
  const semiAligned =
    input.emaAlignment === "BULL" || input.emaAlignment === "BEAR" ||
    input.vwapPosition === "ABOVE" || input.vwapPosition === "BELOW";
  const alignmentSub = fullAligned ? 95 : semiAligned ? 38 : 8;

  // 5. Structure Age (5%) — EARLY structures have more potential
  const ageSub = input.structureAge === "EARLY" ? 80
    : input.structureAge === "MATURE" ? 50 : 40;

  const score = clamp(
    0.30 * base + 0.25 * regimeSub + 0.20 * trendSub + 0.15 * alignmentSub + 0.10 * ageSub,
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

const computeLiquidity = (input: BalancedConsensusInput): ComponentResult => {
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

const computePositioning = (input: BalancedConsensusInput): ComponentResult => {
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

// ── Component 5: Volatility Score (10%) ─────────────────────

const computeVolatility = (input: BalancedConsensusInput): ComponentResult => {
  // 1. ATR Regime (30%) — base volatility level
  const atrSub = input.atrRegime === "HIGH" ? 75 : input.atrRegime === "MID" ? 60 : 30;

  // 2. Compression (25%) — coiling = future vol
  const compressionSub = input.compression === "ON" ? 85 : input.compression === "OFF" ? 35 : 45;

  // 3. Sudden Move Risk (20%) — event risk
  const suddenSub = input.suddenMoveRisk === "HIGH" ? 70 : input.suddenMoveRisk === "MID" ? 50 : 30;

  // 4. Market Speed (15%) — pace of price action
  const speedSub = input.marketSpeed === "FAST" ? 80 : input.marketSpeed === "NORMAL" ? 55 : 25;

  // 5. Impulse Readiness (10%) — readiness for move
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

const computeConfirmation = (input: BalancedConsensusInput): ComponentResult => {
  // 1. Model Agreement (40%) — aligned models / total models
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

// ── Playbook Detection ──────────────────────────────────────

const detectPlaybook = (input: BalancedConsensusInput): { playbook: PlaybookType; boost: number } => {
  // Priority 1: TREND_PULLBACK — Ana motor (Market Structure Strategy)
  // "Trend yukarı (HH+HL), fiyat HL bölgesine geldi, dönüş sinyali"
  // Requires: clear trend + EMA alignment + orderbook confirmation
  const trendAligned =
    (input.emaAlignment === "BULL" && input.vwapPosition === "ABOVE") ||
    (input.emaAlignment === "BEAR" && input.vwapPosition === "BELOW");
  const trendClear =
    input.regime === "TREND" &&
    (input.trendStrength === "HIGH" || input.trendStrength === "MID") &&
    trendAligned &&
    input.orderbookImbalance !== "NEUTRAL";
  if (trendClear) {
    // Higher boost if also has volume spike or aggressor flow (strong confirmation)
    // Reduced from 8/6 → 5/3 — playbook shouldn't rescue borderline scores
    const hasStrongConfirmation =
      input.volumeSpike === "ON" ||
      input.aggressorFlow === "BUY_DOMINANT" || input.aggressorFlow === "SELL_DOMINANT";
    return { playbook: "TREND_PULLBACK", boost: hasStrongConfirmation ? 5 : 3 };
  }

  // Priority 2: LIQUIDITY_SWEEP — "Dip kırıldı → geri çıktı (fake breakdown)"
  // Smart money mantığı: stopları gördükten sonra dönüşe gir
  const sweepDetected =
    (input.stopClusterProb === "HIGH") &&
    (input.suddenMoveRisk === "HIGH" || input.suddenMoveRisk === "MID") &&
    (input.aggressorFlow === "BUY" || input.aggressorFlow === "BUY_DOMINANT" ||
     input.aggressorFlow === "SELL" || input.aggressorFlow === "SELL_DOMINANT");
  // Also detect fake breakout recovery: price broke structure but recovered
  const fakeBreakoutRecovery =
    input.fakeBreakoutProb === "HIGH" &&
    input.orderbookImbalance !== "NEUTRAL" &&
    (input.volumeSpike === "ON" || input.impulseReadiness === "HIGH");
  if (sweepDetected || fakeBreakoutRecovery) {
    return { playbook: "LIQUIDITY_SWEEP", boost: 3 };  // Reduced from 5
  }

  // Priority 3: RANGE_ROTATION — sideways market plays (reduced boost — not ideal)
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
    // Reduced boost for range (Market Structure Strategy discourages range trading)
    return { playbook: "RANGE_ROTATION", boost: 1 };
  }

  // Priority 4: BREAKOUT — only when ALL conditions met
  const breakoutAllMet =
    input.compression === "ON" &&
    (input.fakeBreakoutProb === "LOW" || input.fakeBreakoutProb === undefined) &&
    input.volumeSpike === "ON" &&
    input.orderbookImbalance !== "NEUTRAL";
  if (breakoutAllMet) {
    return { playbook: "BREAKOUT", boost: 2 };  // Reduced from 4
  }

  // GENERAL — no specific playbook detected, mild penalty (was -4, too harsh)
  return { playbook: "GENERAL", boost: -1 };
};

// ── No-Trade Rule ───────────────────────────────────────────

const checkNoTradeRule = (input: BalancedConsensusInput): { blocked: boolean; dangerCount: number; signals: Record<string, boolean> } => {
  const signals: Record<string, boolean> = {};

  // 1. Signal Conflict = HIGH
  signals.signalConflictHigh =
    input.signalConflict === "HIGH" || input.conflictLevel === "HIGH";

  // 2. Trap Probability = HIGH
  signals.trapProbabilityHigh =
    input.trapProbability === "HIGH" ||
    input.cascadeRisk === "HIGH" ||
    input.spoofRisk === "HIGH";

  // 3. News Risk = ON (sudden move risk HIGH)
  signals.newsRiskOn = input.suddenMoveRisk === "HIGH";

  // 4. Fake Breakout Probability = HIGH
  // Only fire on actual fake breakout — compression=OFF alone is NOT a danger signal
  signals.fakeBreakoutHigh = input.fakeBreakoutProb === "HIGH";

  // 5. Execution Certainty = LOW
  signals.executionCertaintyLow =
    input.entryWindow === "CLOSED" && input.slippageLevel === "HIGH";

  // 6. No clear trend detected — only fire when truly absent
  //    regime=MIXED is normal in crypto — not a danger signal on its own
  signals.noTrendDetected =
    input.trendStrength === "LOW" && (input.regime === "UNKNOWN" || input.regime === "MIXED");

  // 7. No EMA alignment — conflicting direction signals
  //    Market Structure Strategy: Must have Higher High + Higher Low OR Lower High + Lower Low
  signals.noAlignment =
    input.emaAlignment === "MIXED" || input.emaAlignment === "UNKNOWN";

  const dangerCount = Object.values(signals).filter(Boolean).length;

  return {
    // Raised from 2 to 3: was too strict — most coins had 2+ danger signals permanently
    // noTrendDetected + noAlignment both fire for MIXED/RANGE → instant block
    blocked: dangerCount >= 3,
    dangerCount,
    signals,
  };
};

// ── Main: computeBalancedConsensus ──────────────────────────

export const computeBalancedConsensus = (
  input: BalancedConsensusInput,
): BalancedConsensusOutput => {
  const reasons: ReasonEntry[] = [];

  // ── 6-Component computation (Adaptive Crypto Alpha weights) ──
  const struct = computeStructure(input);       // 26%
  const liq = computeLiquidity(input);           // 22%
  const pos = computePositioning(input);         // 18%
  const exec = computeExecution(input);          // 16%
  const vol = computeVolatility(input);          // 10%
  const conf = computeConfirmation(input);       // 8%
  const risk = computeRiskPenalty(input);

  // ── Entry Confirmation Counter (Market Structure Strategy) ──
  // Requires at least 2 confirmations before entry:
  //   - Volume spike (mum teyidi - hacim)
  //   - Orderbook imbalance aligned (alış/satış baskısı)
  //   - OI change strength (pozisyon açılışı)
  //   - Aggressor flow aligned (agresif alıcı/satıcı)
  //   - Impulse readiness (hareket hazırlığı)
  const entryConfirmationSignals = [
    input.volumeSpike === "ON",
    input.orderbookImbalance !== "NEUTRAL" && input.orderbookImbalance !== undefined,
    input.oiChangeStrength === "HIGH" || input.oiChangeStrength === "MID",
    input.aggressorFlow === "BUY" || input.aggressorFlow === "SELL" ||
      input.aggressorFlow === "BUY_DOMINANT" || input.aggressorFlow === "SELL_DOMINANT",
    input.impulseReadiness === "HIGH" || input.impulseReadiness === "MID",
  ];
  const entryConfirmationCount = entryConfirmationSignals.filter(Boolean).length;

  // ── Candidate Score (CS) ──
  const rawCandidateScore =
    0.26 * struct.score +
    0.22 * liq.score +
    0.18 * pos.score +
    0.16 * exec.score +
    0.10 * vol.score +
    0.08 * conf.score;
  const candidateScore = roundTo2(clamp(rawCandidateScore, 0, 100));

  // ── Final Trade Score (FTS) = CS + RiskPenalty ──
  const rawTradeScore = rawCandidateScore + risk.total;
  const baseScore = roundTo2(clamp(rawTradeScore, 0, 100));

  // ── Playbook Detection & Boost ──
  const { playbook, boost: playbookBoost } = detectPlaybook(input);
  let adjustedScore = baseScore + playbookBoost;
  if (playbookBoost > 0) {
    addReason(reasons, `Playbook ${playbook} boost +${playbookBoost}`, 40);
  }

  // ── Entry Confirmation Gate (relaxed) ──
  // Lowered from 2→1 minimum. With 0 confirmations, cap at 50.
  // This was the #1 blocker — most coins had 1-2 confirmations, capping at 52 (below TRADE 62)
  if (entryConfirmationCount < 1) {
    adjustedScore = Math.min(adjustedScore, 50);
    addReason(reasons, `Entry confirmation insufficient (${entryConfirmationCount}/1 min required)`, 92);
  } else if (entryConfirmationCount >= 3) {
    // Multi-signal confirmation → bonus
    adjustedScore += entryConfirmationCount >= 4 ? 4 : 2;
    addReason(reasons, `Strong entry confirmation (${entryConfirmationCount} signals)`, 45);
  }

  // ── No-Trade Rule: block if 3+ danger signals (relaxed from 2) ──
  // Was 2 — too aggressive, most coins had 2+ danger signals permanently
  const noTradeRule = checkNoTradeRule(input);
  if (noTradeRule.blocked) {
    adjustedScore = Math.min(adjustedScore, 44);
    addReason(reasons, `No-trade rule: ${noTradeRule.dangerCount} danger signals`, 95);
  }

  // ── Sub-score guardrails (relaxed — were too strict, blocking all TRADE decisions) ──
  const guardrails = {
    structPass: struct.score >= 36,  // Lowered from 48 — was too strict for non-TREND regimes
    liqPass: liq.score >= 28,       // Lowered from 35
    posPass: pos.score >= 25,       // Lowered from 32
    execPass: exec.score >= 25,     // Lowered from 32
    volPass: vol.score >= 20,       // Lowered from 25
    confPass: conf.score >= 15,     // Lowered from 22
    // Backward-compat aliases
    oppPass: vol.score >= 30,
    dirPass: pos.score >= 35,
    allPass: false as boolean,
  };
  guardrails.allPass =
    guardrails.structPass && guardrails.liqPass && guardrails.posPass &&
    guardrails.execPass && guardrails.volPass && guardrails.confPass;

  if (!guardrails.structPass) addReason(reasons, `Guardrail: Struct ${struct.score} < 36`, 85);
  if (!guardrails.liqPass) addReason(reasons, `Guardrail: Liq ${liq.score} < 28`, 80);
  if (!guardrails.posPass) addReason(reasons, `Guardrail: Pos ${pos.score} < 25`, 75);
  if (!guardrails.execPass) addReason(reasons, `Guardrail: Exec ${exec.score} < 25`, 70);
  if (!guardrails.volPass) addReason(reasons, `Guardrail: Vol ${vol.score} < 20`, 65);
  if (!guardrails.confPass) addReason(reasons, `Guardrail: Conf ${conf.score} < 15`, 60);

  // ── Model Agreement gate: need >= 2/6 (33% agreement) ──
  const modelAgreementRatio = safeNumber(input.alignedCount, 0) / Math.max(1, Math.floor(safeNumber(input.totalModels, 6)));
  if (modelAgreementRatio < 0.33 && adjustedScore > 66) {
    adjustedScore = Math.min(adjustedScore, 66);
    addReason(reasons, "Model agreement below 2/6 threshold", 70);
  }

  // ── Positioning uncertain cap — weak positioning caps score at 86 ──
  if (pos.score < 50 && adjustedScore > 86) {
    adjustedScore = 86;
    addReason(reasons, "Positioning uncertain cap (86)", 60);
  }

  // ── Hard no-trade conditions ──
  const hardNoTrade =
    (input.stressLevel === "HIGH" && input.cascadeRisk === "HIGH" && input.depthQuality === "POOR");
  if (hardNoTrade && adjustedScore > 48) {
    adjustedScore = 48;
    addReason(reasons, "Hard no-trade conditions cap (48)", 95);
  }

  // ── Reason generation ──
  if (struct.score < 40) addReason(reasons, `Struct low (${struct.score}): weak structure`, 50);
  if (struct.score >= 75) addReason(reasons, `Struct strong (${struct.score}): solid structure`, 40);
  if (pos.score >= 70) addReason(reasons, `Pos strong (${pos.score}): clear positioning`, 45);
  if (exec.score < 40) addReason(reasons, `Exec low (${exec.score}): poor execution`, 55);
  if (risk.total < -3) addReason(reasons, `Risk penalty (${risk.total}): active risks`, 60);

  // ── Data Gate ──
  const dataGateBlocked =
    input.dataHealth?.feeds?.ohlcv === "down" ||
    safeNumber(input.dataHealth?.missingFields, 0) >= 3 ||
    (Boolean(input.dataHealth?.staleFeed) && safeNumber(input.dataHealth?.latencyMs, 0) > 8000);
  const dataGate: "PASS" | "BLOCK" = dataGateBlocked ? "BLOCK" : "PASS";
  if (dataGateBlocked) addReason(reasons, "Data gate blocked", 10_000);

  // ── Safety Gate (relaxed — only blocks on extreme combined risk) ──
  const safetyGateBlocked =
    (input.stressLevel === "HIGH" && input.cascadeRisk === "HIGH" && input.depthQuality === "POOR");
  const safetyGate: "PASS" | "BLOCK" = safetyGateBlocked ? "BLOCK" : "PASS";
  if (safetyGateBlocked) addReason(reasons, "Safety block", 9_000);

  // ── Penalty rate (backward compat) ──
  const degradedCount = FEED_KEYS.filter((k) => input.dataHealth?.feeds?.[k] === "degraded").length;
  const dataDegradedPenalty = Math.min(0.06, degradedCount * 0.02);
  const executionWeaknessPenalty = exec.score < 40 ? roundTo2(((40 - exec.score) / 100) * 0.35) : 0;
  const entryClosedPenalty = input.entryWindow === "CLOSED" ? 0.05 : 0;
  const rawPenalty = clamp(executionWeaknessPenalty + entryClosedPenalty + dataDegradedPenalty, 0, 0.4);
  const isAPlus = adjustedScore >= 88;  // Raised from 85 — harder to qualify for A+
  const penaltyRate = roundTo2(isAPlus ? rawPenalty * 0.5 : rawPenalty);

  // ── Final score ──
  let finalScore = roundTo2(clamp(adjustedScore * (1 - clamp(penaltyRate, 0, 1)), 0, 100));

  // A+ floor: high conviction setups keep minimum 68 (reduced from 72)
  let floorsApplied = false;
  if (isAPlus && dataGate === "PASS" && safetyGate === "PASS") {
    const floored = Math.max(finalScore, 68);
    floorsApplied = floored > finalScore;
    finalScore = floored;
    if (floorsApplied) addReason(reasons, "A+ floor applied", 150);
  }

  // Gate enforcement
  if (safetyGate === "BLOCK") finalScore = Math.min(finalScore, 44);
  if (dataGate === "BLOCK") finalScore = 0;

  // Guardrail cap — sub-score threshold not met → softer penalty
  // Relaxed: structure cap raised from 48→54, general penalty reduced from -10→-5
  if (!guardrails.structPass && finalScore >= 56) {
    finalScore = Math.min(finalScore, 54);
    addReason(reasons, "Structure guardrail: trend structure weak", 92);
  } else if (!guardrails.allPass && finalScore >= 60) {
    finalScore = Math.max(finalScore - 5, 52);
    addReason(reasons, "Guardrail penalty: sub-score threshold not met", 88);
  }

  finalScore = roundTo2(clamp(finalScore, 0, 100));

  // ── Position Size Scaling (Market Structure Strategy — 4-tier) ──
  let sizeHint: number;
  if (dataGate === "BLOCK" || safetyGate === "BLOCK") {
    sizeHint = 0;
  } else if (finalScore >= 85) {
    sizeHint = 1.00;  // Full conviction — raised from 82
  } else if (finalScore >= 78) {
    sizeHint = 0.85;  // High — raised from 74
  } else if (finalScore >= 70) {
    sizeHint = 0.60;  // Normal — raised from 66
  } else if (finalScore >= 64) {
    sizeHint = 0.35;  // Small size — raised from 60
  } else {
    sizeHint = 0;     // Below TRADE threshold — no position
  }
  sizeHint = roundTo2(sizeHint);

  // ── Rank Score (for prioritization) ──
  const execCertainty01 = clamp(exec.breakdown.fill / 100, 0, 1);
  const rrPotentialScore = input.rrPotential === "HIGH" ? 0.9 : input.rrPotential === "MID" ? 0.6 : 0.3;
  const agreementForRank = clamp(conf.breakdown.modelAgreement / 100, 0, 1);
  const rankScore = roundTo2(
    ((finalScore / 100) * 0.55 +
    rrPotentialScore * 0.20 +
    execCertainty01 * 0.15 +
    agreementForRank * 0.10) * 100,
  );

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
    playbook,
    candidateScore,
    rankScore,
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
        positioning01: roundTo2(pos.score / 100),
        execution01: roundTo2(exec.score / 100),
        executionCertainty01: roundTo2(exec.breakdown.fill / 100),
        edge01: roundTo2((struct.score * 0.5 + pos.score * 0.5) / 100),
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
        // New component names
        structure: struct,
        liquidity: liq,
        positioning: pos,
        execution: exec,
        volatility: vol,
        confirmation: conf,
        // Backward-compat aliases
        opportunity: vol,
        direction: pos,
        relativeStrength: conf,
        riskPenalty: risk,
        guardrails,
        noTradeRule,
        tradeScore: roundTo2(rawTradeScore),
        playbook,
        playbookBoost,
      },
    },
  };
};
