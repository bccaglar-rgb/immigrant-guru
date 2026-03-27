export type Regime = "TREND" | "RANGE" | "MIXED" | "UNKNOWN";
export type TrendStrength = "LOW" | "MID" | "HIGH" | "UNKNOWN";
export type EmaAlignment = "BULL" | "BEAR" | "MIXED" | "UNKNOWN";
export type VwapPosition = "ABOVE" | "BELOW" | "AT" | "UNKNOWN";
export type MarketSpeed = "SLOW" | "NORMAL" | "FAST" | "UNKNOWN";
export type AtrRegime = "LOW" | "MID" | "HIGH" | "UNKNOWN";
export type Compression = "ON" | "OFF" | "UNKNOWN";
export type TernaryRisk = "LOW" | "MID" | "HIGH" | "UNKNOWN";
export type BinaryOnOff = "ON" | "OFF" | "UNKNOWN";
export type SpreadRegime = "TIGHT" | "MID" | "WIDE" | "UNKNOWN";
export type DepthQuality = "GOOD" | "MID" | "POOR" | "UNKNOWN";
export type LiquidityDensity = "LOW" | "MID" | "HIGH" | "UNKNOWN";
export type EntryWindow = "OPEN" | "CLOSED" | "UNKNOWN";
export type SlippageLevel = "LOW" | "MED" | "HIGH" | "UNKNOWN";
export type Asymmetry = "REWARD_DOMINANT" | "RISK_DOMINANT" | "UNKNOWN";
export type RrPotential = "LOW" | "MID" | "HIGH" | "UNKNOWN";
export type EntryQuality = "BAD" | "MID" | "GOOD" | "UNKNOWN";
export type ConflictLevel = "LOW" | "MID" | "HIGH" | "UNKNOWN";
export type FeedHealthStatus = "healthy" | "degraded" | "down";

export interface VelocityDataHealth {
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

export interface VelocityConsensusInput {
  structureScore?: number;
  liquidityScore?: number;
  positioningScore?: number;
  executionScore?: number;

  regime?: Regime;
  trendStrength?: TrendStrength;
  emaAlignment?: EmaAlignment;
  vwapPosition?: VwapPosition;
  marketSpeed?: MarketSpeed;
  atrRegime?: AtrRegime;
  compression?: Compression;
  breakoutRisk?: TernaryRisk;
  fakeBreakoutProb?: TernaryRisk;
  suddenMoveRisk?: TernaryRisk;
  volumeSpike?: BinaryOnOff;
  impulseReadiness?: TernaryRisk;
  liquidityDensity?: LiquidityDensity;
  spoofRisk?: TernaryRisk;
  spreadRegime?: SpreadRegime;
  depthQuality?: DepthQuality;
  crowdingRisk?: TernaryRisk;
  cascadeRisk?: TernaryRisk;
  stressLevel?: TernaryRisk;
  entryWindow?: EntryWindow;
  breakoutOnly?: boolean;

  pFill?: number;
  capacity?: number;
  slippageLevel?: SlippageLevel;

  eNetR?: number;
  riskAdjEdgeR?: number;
  pWin?: number;
  pStop?: number;
  expectedRR?: number;
  costR?: number;
  asymmetry?: Asymmetry;
  rrPotential?: RrPotential;
  entryQuality?: EntryQuality;

  alignedCount?: number;
  totalModels?: number;
  conflictLevel?: ConflictLevel;

  dataHealth: VelocityDataHealth;
}

export interface VelocityConsensusOutput {
  mode: "VELOCITY";
  baseScore: number;
  adjustedScore: number;
  penaltyRate: number;
  finalScore: number;
  gates: {
    data: "PASS" | "BLOCK";
    risk: "PASS" | "BLOCK";
    entry: "PASS" | "BLOCK";
    fill: "PASS" | "BLOCK";
  };
  decision: "TRADE" | "WATCH" | "NO_TRADE";
  reasons: string[];
  diagnostics: {
    componentScores: {
      momentum01: number;
      structure01: number;
      positioning01: number;
      liquidity01: number;
      executionCertainty01: number;
      edge01: number;
      agreement01: number;
      agreementScore01: number;
      base01: number;
    };
    modifiers: {
      agreementQ: number;
      riskEnvironmentModifier: number;
      breakoutModifier: number;
      volatilityModifier: number;
    };
    penalties: {
      latencyPenalty: number;
      slippagePenalty: number;
      spoofPenalty: number;
      suddenMovePenalty: number;
      fakeBreakoutPenalty: number;
      degradedFeedsPenalty: number;
      penaltyRate: number;
    };
  };
}

type ReasonEntry = { impact: number; text: string };

export const clamp = (x: number, min: number, max: number): number => Math.max(min, Math.min(max, x));

export const roundTo2 = (x: number): number => Math.round(x * 100) / 100;

export const score01 = (score: number): number => clamp(score / 100, 0, 1);

export const safeNumber = (value: unknown, fallback: number): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const mean = (values: number[]): number => {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const lerpRange = (x: number, x1: number, x2: number, y1: number, y2: number): number => {
  if (x2 <= x1) return y2;
  const t = clamp((x - x1) / (x2 - x1), 0, 1);
  return y1 + ((y2 - y1) * t);
};

const trendBase = (regime: Regime | undefined): number => {
  if (regime === "TREND") return 0.7;
  if (regime === "MIXED") return 0.55;
  if (regime === "RANGE") return 0.4;
  return 0.5;
};

const trendStrengthAdj = (trendStrength: TrendStrength | undefined): number => {
  if (trendStrength === "LOW") return 0.9;
  if (trendStrength === "MID") return 1.0;
  if (trendStrength === "HIGH") return 1.08;
  return 1.0;
};

const emaAdj = (emaAlignment: EmaAlignment | undefined): number => {
  if (emaAlignment === "BULL" || emaAlignment === "BEAR") return 1.05;
  if (emaAlignment === "MIXED") return 0.95;
  return 1.0;
};

const vwapAdj = (vwapPosition: VwapPosition | undefined): number => {
  if (vwapPosition === "ABOVE" || vwapPosition === "BELOW") return 1.03;
  if (vwapPosition === "AT") return 1.0;
  return 1.0;
};

const speedAdj = (marketSpeed: MarketSpeed | undefined): number => {
  if (marketSpeed === "FAST") return 1.08;
  if (marketSpeed === "NORMAL") return 1.02;
  if (marketSpeed === "SLOW") return 0.92;
  return 1.0;
};

const atrAdj = (atrRegime: AtrRegime | undefined): number => {
  if (atrRegime === "HIGH") return 1.06;
  if (atrRegime === "MID") return 1.02;
  if (atrRegime === "LOW") return 0.92;
  return 1.0;
};

const volumeSpikeAdj = (volumeSpike: BinaryOnOff | undefined): number => {
  if (volumeSpike === "ON") return 1.06;
  if (volumeSpike === "OFF") return 0.98;
  return 1.0;
};

const impulseAdj = (impulseReadiness: TernaryRisk | undefined): number => {
  if (impulseReadiness === "HIGH") return 1.06;
  if (impulseReadiness === "MID") return 1.0;
  if (impulseReadiness === "LOW") return 0.94;
  return 1.0;
};

const fakeBreakoutFilter = (fakeBreakoutProb: TernaryRisk | undefined): number => {
  if (fakeBreakoutProb === "HIGH") return 0.9;
  return 1.0;
};

const suddenMoveFilter = (suddenMoveRisk: TernaryRisk | undefined): number => {
  if (suddenMoveRisk === "HIGH") return 0.92;
  return 1.0;
};

const spreadMultiplier = (spreadRegime: SpreadRegime | undefined): number => {
  if (spreadRegime === "TIGHT") return 1.0;
  if (spreadRegime === "MID") return 0.92;
  if (spreadRegime === "WIDE") return 0.85;
  return 0.90;
};

const depthMultiplier = (depthQuality: DepthQuality | undefined): number => {
  if (depthQuality === "GOOD") return 1.0;
  if (depthQuality === "MID") return 0.92;
  if (depthQuality === "POOR") return 0.78;
  return 0.88;
};

const liquidityDensityMultiplier = (liquidityDensity: LiquidityDensity | undefined): number => {
  if (liquidityDensity === "HIGH") return 1.0;
  if (liquidityDensity === "MID") return 0.94;
  if (liquidityDensity === "LOW") return 0.86;
  return 0.90;
};

const spoofMultiplier = (spoofRisk: TernaryRisk | undefined): number => {
  if (spoofRisk === "LOW") return 1.0;
  if (spoofRisk === "MID") return 0.94;
  if (spoofRisk === "HIGH") return 0.85;
  return 0.90;
};

const slippageMultiplier = (slippageLevel: SlippageLevel | undefined): number => {
  if (slippageLevel === "LOW") return 1.0;
  if (slippageLevel === "MED") return 0.94;
  if (slippageLevel === "HIGH") return 0.85;
  return 0.90;
};

const conflictMultiplier = (conflictLevel: ConflictLevel | undefined): number => {
  if (conflictLevel === "LOW") return 1.0;
  if (conflictLevel === "MID") return 0.94;
  if (conflictLevel === "HIGH") return 0.85;
  return 0.90;
};

const remStressMultiplier = (stressLevel: TernaryRisk | undefined): number => {
  if (stressLevel === "LOW") return 1.0;
  if (stressLevel === "MID") return 0.95;
  if (stressLevel === "HIGH") return 0.86;
  return 0.94;
};

const remCrowdingMultiplier = (crowdingRisk: TernaryRisk | undefined): number => {
  if (crowdingRisk === "LOW") return 1.0;
  if (crowdingRisk === "MID") return 0.95;
  if (crowdingRisk === "HIGH") return 0.90;
  return 0.94;
};

const remCascadeMultiplier = (cascadeRisk: TernaryRisk | undefined): number => {
  if (cascadeRisk === "LOW") return 1.0;
  if (cascadeRisk === "MID") return 0.94;
  if (cascadeRisk === "HIGH") return 0.88;
  return 0.93;
};

const computeBreakoutModifier = (
  breakoutOnly: boolean,
  compression: Compression | undefined,
  regime: Regime | undefined,
  trendStrength: TrendStrength | undefined,
): number => {
  let value = 1.0;
  if (breakoutOnly) {
    value = compression === "ON" && (regime === "RANGE" || regime === "MIXED") ? 1.05 : 0.94;
  } else if (regime === "TREND" && trendStrength === "HIGH") {
    value = 1.03;
  }
  return clamp(value, 0.92, 1.06);
};

const computeVolatilityModifier = (
  atrRegime: AtrRegime | undefined,
  marketSpeed: MarketSpeed | undefined,
): number => {
  let value = 1.0;
  if (atrRegime === "HIGH" && marketSpeed === "FAST") value = 1.04;
  if (atrRegime === "LOW" && marketSpeed === "SLOW") value = 0.95;
  return clamp(value, 0.92, 1.05);
};

export const normalizeVelocityRiskAdjEdge = (riskAdjEdgeR: number): number => {
  if (riskAdjEdgeR <= 0) return 0;
  if (riskAdjEdgeR <= 0.06) return lerpRange(riskAdjEdgeR, 0, 0.06, 0, 0.35);
  if (riskAdjEdgeR <= 0.14) return lerpRange(riskAdjEdgeR, 0.06, 0.14, 0.35, 0.7);
  if (riskAdjEdgeR <= 0.26) return lerpRange(riskAdjEdgeR, 0.14, 0.26, 0.7, 1.0);
  return 1.0;
};

const addReason = (reasons: ReasonEntry[], text: string, impact: number) => {
  reasons.push({ text, impact });
};

const finalizeReasons = (reasons: ReasonEntry[], fallback: string[] = []): string[] => {
  const ranked = reasons
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 7)
    .map((entry) => entry.text);
  const unique = new Set(ranked);
  for (const text of fallback) {
    if (unique.size >= 7) break;
    if (!text) continue;
    unique.add(text);
  }
  const out = Array.from(unique).slice(0, 7);
  if (out.length >= 3) return out;
  const minFallback = [
    "Velocity mode active",
    "Consensus uses momentum, execution, and risk conditions",
    "Decision reflects gates and penalties",
  ];
  for (const text of minFallback) {
    if (out.length >= 3) break;
    if (!out.includes(text)) out.push(text);
  }
  return out.slice(0, 7);
};

/**
 * ══════════════════════════════════════════════════════════════════
 * FLOW MODE — GOLD SETUP (5-Signal Decision Engine)
 * ══════════════════════════════════════════════════════════════════
 *
 * 5 Core Signal Groups (100 points total):
 *   1. Market Regime  — 25 pts (most critical filter)
 *   2. Liquidity      — 25 pts (smart money edge)
 *   3. Edge (R)       — 20 pts (actual trade metric)
 *   4. Execution      — 20 pts (entry quality)
 *   5. Volatility     — 10 pts (trade character)
 *
 * Decision Thresholds:
 *   80+ = TRADE (strong)
 *   65-79 = TRADE (watchable)
 *   50-64 = WATCH
 *   <50 = NO_TRADE
 *
 * BLOCK Rules (hard kill):
 *   - fill < 0.65
 *   - normalized edge < 0.30
 *   - pWin < 0.55
 *   - stress HIGH
 *   - conflict HIGH
 *
 * IGNORED signals (not used in scoring):
 *   - Model agreement alone
 *   - Funding bias alone
 *   - EMA alignment alone
 *   - Orderbook imbalance alone
 */
export const computeFlowGoldSetup = (input: VelocityConsensusInput): VelocityConsensusOutput => {
  const reasons: ReasonEntry[] = [];

  const pFill = clamp(safeNumber(input.pFill, 0.5), 0, 1);
  const pWin = clamp(safeNumber(input.pWin, 0.5), 0, 1);
  const riskAdjEdgeR = safeNumber(input.riskAdjEdgeR, 0);
  const expectedRR = safeNumber(input.expectedRR, 1.0);
  const liquidityScore01 = score01(safeNumber(input.liquidityScore, 50));

  // ── DATA GATE ──────────────────────────────────────────────────
  const dataBlocked =
    input.dataHealth.feeds.ohlcv === "down" ||
    safeNumber(input.dataHealth.missingFields, 0) >= 3 ||
    (Boolean(input.dataHealth.staleFeed) && safeNumber(input.dataHealth.latencyMs, 0) > 8000);

  const gates = {
    data: (dataBlocked ? "BLOCK" : "PASS") as "PASS" | "BLOCK",
    risk: "PASS" as "PASS" | "BLOCK",
    entry: "PASS" as "PASS" | "BLOCK",
    fill: "PASS" as "PASS" | "BLOCK",
  };

  if (dataBlocked) {
    gates.risk = "BLOCK";
    gates.entry = "BLOCK";
    gates.fill = "BLOCK";
    addReason(reasons, "Data gate BLOCK", 10_000);
    return {
      mode: "VELOCITY",
      baseScore: 0,
      adjustedScore: 0,
      penaltyRate: 0,
      finalScore: 0,
      gates,
      decision: "NO_TRADE",
      reasons: finalizeReasons(reasons, [
        "Data gate blocked — feed health issue",
        `Missing fields: ${Math.max(0, Math.floor(safeNumber(input.dataHealth.missingFields, 0)))}`,
        `Latency: ${Math.max(0, Math.floor(safeNumber(input.dataHealth.latencyMs, 0)))}ms`,
      ]),
      diagnostics: {
        componentScores: { momentum01: 0, structure01: 0, positioning01: 0, liquidity01: 0, executionCertainty01: 0, edge01: 0, agreement01: 0, agreementScore01: 0, base01: 0 },
        modifiers: { agreementQ: 1, riskEnvironmentModifier: 1, breakoutModifier: 1, volatilityModifier: 1 },
        penalties: { latencyPenalty: 0, slippagePenalty: 0, spoofPenalty: 0, suddenMovePenalty: 0, fakeBreakoutPenalty: 0, degradedFeedsPenalty: 0, penaltyRate: 0 },
      },
    };
  }

  // ══════════════════════════════════════════════════════════════════
  // SIGNAL GROUP 1: MARKET REGIME (25 points)
  // Most critical filter — determines if market structure supports a trade
  // RANGE = mean reversion, TREND = trend following, MIXED = lower conviction
  // ══════════════════════════════════════════════════════════════════
  let regimeScore = 0;

  // Regime classification (0-15 pts)
  if (input.regime === "RANGE") {
    regimeScore += 15;  // Range = excellent for mean reversion
  } else if (input.regime === "TREND") {
    regimeScore += 13;  // Clear trend = trend following opportunity
  } else if (input.regime === "MIXED") {
    regimeScore += 7;   // Choppy = lower conviction
  } else {
    regimeScore += 4;   // Unknown regime
  }

  // Trend strength (0-6 pts)
  if (input.trendStrength === "HIGH") regimeScore += 6;
  else if (input.trendStrength === "MID") regimeScore += 4;
  else if (input.trendStrength === "LOW") regimeScore += 1;
  else regimeScore += 2;

  // Compression + breakout potential (0-4 pts)
  if (input.compression === "ON" && input.regime === "RANGE") {
    regimeScore += 4;  // Compression in range = imminent breakout
  } else if (input.compression === "ON" && input.regime === "MIXED") {
    regimeScore += 3;
  } else if (input.compression === "ON") {
    regimeScore += 2;
  }

  regimeScore = clamp(regimeScore, 0, 25);

  // ══════════════════════════════════════════════════════════════════
  // SIGNAL GROUP 2: LIQUIDITY (25 points)
  // Smart money edge — orderbook depth, density, manipulation risk
  // ══════════════════════════════════════════════════════════════════
  let liquidityPts = 0;

  // Liquidity density near price (0-8 pts)
  if (input.liquidityDensity === "HIGH") liquidityPts += 8;
  else if (input.liquidityDensity === "MID") liquidityPts += 5;
  else if (input.liquidityDensity === "LOW") liquidityPts += 2;
  else liquidityPts += 3;

  // Depth quality (0-7 pts)
  if (input.depthQuality === "GOOD") liquidityPts += 7;
  else if (input.depthQuality === "MID") liquidityPts += 4;
  else if (input.depthQuality === "POOR") liquidityPts += 1;
  else liquidityPts += 3;

  // Spoof risk — inverse scoring (0-5 pts)
  if (input.spoofRisk === "LOW") liquidityPts += 5;
  else if (input.spoofRisk === "MID") liquidityPts += 3;
  else if (input.spoofRisk === "HIGH") liquidityPts += 0;
  else liquidityPts += 2;

  // Overall liquidity from quant engine (0-5 pts)
  liquidityPts += Math.round(liquidityScore01 * 5);

  liquidityPts = clamp(liquidityPts, 0, 25);

  // ══════════════════════════════════════════════════════════════════
  // SIGNAL GROUP 3: EDGE (20 points)
  // Risk-adjusted trade metric — E_net, pWin, expected RR, asymmetry
  // ══════════════════════════════════════════════════════════════════
  let edgePts = 0;
  const normalizedEdge = normalizeVelocityRiskAdjEdge(riskAdjEdgeR);

  // Risk-adjusted edge (0-6 pts)
  edgePts += Math.round(normalizedEdge * 6);

  // Win probability (0-6 pts)
  if (pWin >= 0.70) edgePts += 6;
  else if (pWin >= 0.65) edgePts += 5;
  else if (pWin >= 0.60) edgePts += 4;
  else if (pWin >= 0.55) edgePts += 2;
  else edgePts += 0;

  // Expected RR (0-5 pts)
  if (expectedRR >= 3.0) edgePts += 5;
  else if (expectedRR >= 2.5) edgePts += 4;
  else if (expectedRR >= 2.0) edgePts += 3;
  else if (expectedRR >= 1.5) edgePts += 2;
  else if (expectedRR >= 1.0) edgePts += 1;

  // Asymmetry (0-3 pts)
  if (input.asymmetry === "REWARD_DOMINANT") edgePts += 3;
  else if (input.asymmetry !== "RISK_DOMINANT") edgePts += 1;
  // RISK_DOMINANT = 0 pts

  edgePts = clamp(edgePts, 0, 20);

  // ══════════════════════════════════════════════════════════════════
  // SIGNAL GROUP 4: EXECUTION (20 points)
  // Entry quality — fill probability, slippage, spread, depth
  // ══════════════════════════════════════════════════════════════════
  let execPts = 0;

  // Fill probability (0-7 pts)
  if (pFill >= 0.85) execPts += 7;
  else if (pFill >= 0.75) execPts += 5;
  else if (pFill >= 0.65) execPts += 3;
  else if (pFill >= 0.50) execPts += 1;

  // Slippage — inverse (0-5 pts)
  if (input.slippageLevel === "LOW") execPts += 5;
  else if (input.slippageLevel === "MED") execPts += 3;
  else if (input.slippageLevel === "HIGH") execPts += 0;
  else execPts += 2;

  // Entry quality (0-4 pts)
  if (input.entryQuality === "GOOD") execPts += 4;
  else if (input.entryQuality === "MID") execPts += 2;
  else if (input.entryQuality === "BAD") execPts += 0;
  else execPts += 1;

  // Spread regime (0-4 pts)
  if (input.spreadRegime === "TIGHT") execPts += 4;
  else if (input.spreadRegime === "MID") execPts += 2;
  else if (input.spreadRegime === "WIDE") execPts += 0;
  else execPts += 1;

  execPts = clamp(execPts, 0, 20);

  // ══════════════════════════════════════════════════════════════════
  // SIGNAL GROUP 5: VOLATILITY (10 points)
  // Trade character — ATR, speed, sudden move risk, breakout context
  // ══════════════════════════════════════════════════════════════════
  let volPts = 0;

  // ATR regime (0-3 pts)
  if (input.atrRegime === "HIGH") volPts += 3;
  else if (input.atrRegime === "MID") volPts += 2;
  else if (input.atrRegime === "LOW") volPts += 0;
  else volPts += 1;

  // Market speed (0-3 pts)
  if (input.marketSpeed === "FAST") volPts += 3;
  else if (input.marketSpeed === "NORMAL") volPts += 2;
  else if (input.marketSpeed === "SLOW") volPts += 0;
  else volPts += 1;

  // Sudden move risk — inverse (0-2 pts)
  if (input.suddenMoveRisk === "LOW") volPts += 2;
  else if (input.suddenMoveRisk === "MID") volPts += 1;
  // HIGH = 0 pts (risky environment)

  // Breakout context (0-2 pts)
  if (input.breakoutRisk === "HIGH" && input.compression === "ON") volPts += 2;
  else if (input.breakoutRisk === "MID") volPts += 1;
  else if (input.breakoutRisk === "LOW") volPts += 1;

  volPts = clamp(volPts, 0, 10);

  // ══════════════════════════════════════════════════════════════════
  // TOTAL SCORE (100 points max)
  // ══════════════════════════════════════════════════════════════════
  const totalScore = regimeScore + liquidityPts + edgePts + execPts + volPts;

  // ══════════════════════════════════════════════════════════════════
  // BLOCK RULES — Relaxed: single flag = penalty, 2+ flags = hard block
  // Old: ANY single flag → score=0 (too strict, blocked ~90% of coins)
  // New: 1 flag → score capped at 50, 2+ flags → score=0
  // ══════════════════════════════════════════════════════════════════
  const blockReasons: string[] = [];

  if (pFill < 0.35) {
    blockReasons.push(`BLOCK: fill ${roundTo2(pFill)} < 0.35`);
  }
  if (normalizedEdge < 0.15) {
    blockReasons.push(`BLOCK: edge ${roundTo2(normalizedEdge)} < 0.15`);
  }
  if (pWin < 0.45) {
    blockReasons.push(`BLOCK: pWin ${roundTo2(pWin)} < 0.45`);
  }
  if (input.stressLevel === "HIGH" && input.cascadeRisk === "HIGH") {
    blockReasons.push("BLOCK: stress HIGH + cascade HIGH");
  }
  if (input.conflictLevel === "HIGH") {
    blockReasons.push("BLOCK: signal conflict HIGH");
  }

  const isBlocked = blockReasons.length >= 2;

  // Soft penalty flags — reduce score but don't kill trade
  let softBlockPenalty = 0;
  if (pFill < 0.65) softBlockPenalty += 8;
  if (normalizedEdge < 0.30) softBlockPenalty += 5;
  if (pWin < 0.55) softBlockPenalty += 5;
  if (input.stressLevel === "HIGH") softBlockPenalty += 5;

  // Gate assignments (for display/compatibility)
  const riskBlocked = input.stressLevel === "HIGH" && input.cascadeRisk === "HIGH";
  const entryBlocked = input.entryWindow === "CLOSED";
  const fillBlocked = pFill < 0.12;

  gates.risk = riskBlocked ? "BLOCK" : "PASS";
  gates.entry = entryBlocked ? "BLOCK" : "PASS";
  gates.fill = fillBlocked ? "BLOCK" : "PASS";

  // Degraded feeds penalty — minor deduction for unreliable data
  const degradedFeedCount = (["ohlcv", "orderbook", "oi", "funding", "netflow", "trades"] as const)
    .filter((k) => input.dataHealth.feeds[k] === "degraded").length;
  const penaltyRate = clamp(degradedFeedCount * 0.02, 0, 0.08);

  const finalScore = isBlocked
    ? 0
    : roundTo2(clamp(Math.max(0, totalScore - softBlockPenalty) * (1 - penaltyRate), 0, 100));

  // ══════════════════════════════════════════════════════════════════
  // DECISION ENGINE
  // 65+ = TRADE (strong), 45-64 = TRADE (watchable)
  // 30-44 = WATCH, <30 = NO_TRADE
  // Lowered from 65→45 — old threshold blocked ~95% of coins
  // ══════════════════════════════════════════════════════════════════
  let decision: "TRADE" | "WATCH" | "NO_TRADE";

  if (isBlocked) {
    decision = "NO_TRADE";
    for (const reason of blockReasons) addReason(reasons, reason, 1000);
  } else if (Math.round(finalScore) >= 45) {
    decision = "TRADE";
    if (Math.round(finalScore) >= 65) {
      addReason(reasons, `GOLD: Strong trade setup (${Math.round(finalScore)}/100)`, 500);
    } else {
      addReason(reasons, `GOLD: Watchable trade (${Math.round(finalScore)}/100)`, 400);
    }
  } else if (Math.round(finalScore) >= 30) {
    decision = "WATCH";
    addReason(reasons, `GOLD: Weak setup (${Math.round(finalScore)}/100)`, 300);
  } else {
    decision = "NO_TRADE";
    addReason(reasons, `GOLD: No trade (${Math.round(finalScore)}/100)`, 200);
  }

  // Signal group breakdown reasons
  addReason(reasons, `Regime: ${regimeScore}/25`, regimeScore >= 18 ? 250 : 100);
  addReason(reasons, `Liquidity: ${liquidityPts}/25`, liquidityPts >= 18 ? 240 : 90);
  addReason(reasons, `Edge: ${edgePts}/20`, edgePts >= 14 ? 230 : 80);
  addReason(reasons, `Execution: ${execPts}/20`, execPts >= 14 ? 220 : 70);
  addReason(reasons, `Volatility: ${volPts}/10`, volPts >= 7 ? 210 : 60);

  return {
    mode: "VELOCITY",
    baseScore: roundTo2(totalScore),
    adjustedScore: roundTo2(totalScore),
    penaltyRate,
    finalScore,
    gates,
    decision,
    reasons: finalizeReasons(reasons),
    diagnostics: {
      componentScores: {
        momentum01: roundTo2(regimeScore / 25),          // GOLD: Regime (0-1)
        structure01: roundTo2(liquidityPts / 25),         // GOLD: Liquidity (0-1)
        positioning01: roundTo2(edgePts / 20),            // GOLD: Edge (0-1)
        liquidity01: roundTo2(execPts / 20),              // GOLD: Execution (0-1)
        executionCertainty01: roundTo2(volPts / 10),      // GOLD: Volatility (0-1)
        edge01: roundTo2(totalScore / 100),               // GOLD: Total score (0-1)
        agreement01: 0,                                    // Not used in GOLD SETUP
        agreementScore01: 0,                               // Not used in GOLD SETUP
        base01: roundTo2(totalScore / 100),
      },
      modifiers: {
        agreementQ: 1,
        riskEnvironmentModifier: 1,
        breakoutModifier: 1,
        volatilityModifier: 1,
      },
      penalties: {
        latencyPenalty: 0,
        slippagePenalty: 0,
        spoofPenalty: 0,
        suddenMovePenalty: 0,
        fakeBreakoutPenalty: 0,
        degradedFeedsPenalty: roundTo2(degradedFeedCount * 0.02),
        penaltyRate: roundTo2(penaltyRate),
      },
    },
  };
};

/**
 * ══════════════════════════════════════════════════════════════════
 * AGGRESSIVE MODE — Enhanced GOLD SETUP
 * 5-Signal Base (100pts) + 9 Tactical Enhancer Modifiers [-8, +12]
 * ══════════════════════════════════════════════════════════════════
 *
 * Architecture:
 *   Same 5-signal GOLD SETUP as FLOW for the base score (100pts):
 *     Regime(25) + Liquidity(25) + Edge(20) + Execution(20) + Volatility(10)
 *
 *   9 Tactical Enhancers applied as MODIFIERS (not replacements):
 *     A. Delta / Aggressor Flow    — taker pressure alignment
 *     B. Liquidation Heatmap       — cluster fuel/danger
 *     C. OI + Price Logic Matrix   — participant flow interpretation
 *     D. Funding Extreme Detector  — contrarian signal
 *     E. VWAP Deviation            — mean reversion / extension
 *     F. Trap Detector             — breakout failure / reversal
 *     G. Session Context           — Asia/London/NY profile
 *     H. Microstructure Shift      — BOS/CHOCH proxy
 *     I. Time-Based Edge           — regime sustainability
 *
 *   AGG enters EARLIER than FLOW — more flexible BLOCK thresholds:
 *     fill < 0.55 (vs FLOW 0.65)
 *     edge < 0.20 (vs FLOW 0.30)
 *     pWin < 0.50 (vs FLOW 0.55)
 *
 *   Decision Thresholds:
 *     75+ = APPROVED (strong tactical)
 *     60-74 = APPROVED WITH CAUTION
 *     42-59 = WATCHLIST
 *     <42 = NO TRADE
 *
 *   Trade Classification:
 *     RANGE_ACCUMULATION_LONG, RANGE_REJECTION_SHORT, TREND_CONTINUATION,
 *     BREAKOUT_ACCEPTANCE, TRAP_REVERSAL, SQUEEZE_CONTINUATION,
 *     WATCHLIST, NO_TRADE
 */
export interface AggressiveEnhancerInput extends VelocityConsensusInput {
  /** Pre-computed direction from EMA + VWAP + orderbook voting */
  hintDirection: "LONG" | "SHORT" | "NEUTRAL";
  /** Orderbook buy/sell imbalance (mapped) */
  orderbookImbalance: "BUY" | "SELL" | "NEUTRAL";
  /** Aggressor flow raw tile state */
  aggressorFlow: string;
  /** Liquidation cluster bias: UP=above price, DOWN=below price */
  liquidationPoolBias: "UP" | "DOWN" | "MIXED" | "UNKNOWN";
  /** OI change strength (mapped) */
  oiChangeStrength: "LOW" | "MID" | "HIGH";
  /** OI change percentage (raw number) */
  oiChangePct: number;
  /** Funding bias (mapped): BULLISH/BEARISH/NEUTRAL/EXTREME */
  fundingBias: "BULLISH" | "BEARISH" | "NEUTRAL" | "EXTREME";
  /** Raw funding state for CROWDED_LONG/SHORT detection */
  fundingStateRaw: string;
  /** Funding rate percentage (raw number) */
  fundingRatePct: number;
  /** Range position raw tile state */
  rangePosition: string;
  /** Trap probability (mapped TernaryRisk) */
  trapProbability: TernaryRisk;
  /** Stop cluster probability (mapped TernaryRisk) */
  stopClusterProb: TernaryRisk;
  /** Spot vs derivatives pressure */
  spotVsDerivativesPressure: "SPOT_DOM" | "DERIV_DOM" | "BALANCED";
  /** Exchange inflow/outflow */
  exchangeFlow: "INFLOW" | "OUTFLOW" | "NEUTRAL";
  /** Whale activity inference */
  whaleActivity: "ACCUMULATION" | "DISTRIBUTION" | "NEUTRAL";
  /** Relative strength vs market */
  relativeStrength: "STRONG" | "WEAK" | "NEUTRAL";
  /** RSI state */
  rsiState: "OVERSOLD" | "OVERBOUGHT" | "NEUTRAL" | "UNKNOWN";
}

export type AggTradeClassification =
  | "RANGE_ACCUMULATION_LONG"
  | "RANGE_REJECTION_SHORT"
  | "TREND_CONTINUATION"
  | "BREAKOUT_ACCEPTANCE"
  | "TRAP_REVERSAL"
  | "SQUEEZE_CONTINUATION"
  | "WATCHLIST"
  | "NO_TRADE";

export const computeAggressiveGoldSetup = (input: AggressiveEnhancerInput): VelocityConsensusOutput => {
  const reasons: ReasonEntry[] = [];
  const dir = input.hintDirection || "NEUTRAL";

  // ── Shared signal extraction ──
  const pFill = clamp(safeNumber(input.pFill, 0.5), 0, 1);
  const pWin = clamp(safeNumber(input.pWin, 0.5), 0, 1);
  const riskAdjEdgeR = safeNumber(input.riskAdjEdgeR, 0);
  const expectedRR = safeNumber(input.expectedRR, 1.0);
  const liquidityScore01Val = score01(safeNumber(input.liquidityScore, 50));
  const normalizedEdge = normalizeVelocityRiskAdjEdge(riskAdjEdgeR);

  // Enhancer signal extraction (at function scope for trade classification)
  const agFlow = String(input.aggressorFlow || "UNKNOWN").toUpperCase();
  const obImb = input.orderbookImbalance || "NEUTRAL";
  const liqBias = input.liquidationPoolBias || "UNKNOWN";
  const oiStr = input.oiChangeStrength || "LOW";
  const oiPct = safeNumber(input.oiChangePct, 0);
  const fBias = input.fundingBias || "NEUTRAL";
  const fRate = safeNumber(input.fundingRatePct, 0);
  const rangePos = String(input.rangePosition || "UNKNOWN").toUpperCase();
  const trapProb = input.trapProbability || "UNKNOWN";
  const fakeProb = input.fakeBreakoutProb || "UNKNOWN";
  const stopCluster = input.stopClusterProb || "UNKNOWN";
  const whale = input.whaleActivity || "NEUTRAL";

  // ── DATA GATE ──────────────────────────────────────────────────
  const dataBlocked =
    input.dataHealth.feeds.ohlcv === "down" ||
    safeNumber(input.dataHealth.missingFields, 0) >= 3 ||
    (Boolean(input.dataHealth.staleFeed) && safeNumber(input.dataHealth.latencyMs, 0) > 8000);

  const gates = {
    data: (dataBlocked ? "BLOCK" : "PASS") as "PASS" | "BLOCK",
    risk: "PASS" as "PASS" | "BLOCK",
    entry: "PASS" as "PASS" | "BLOCK",
    fill: "PASS" as "PASS" | "BLOCK",
  };

  if (dataBlocked) {
    gates.risk = "BLOCK"; gates.entry = "BLOCK"; gates.fill = "BLOCK";
    addReason(reasons, "Data gate BLOCK", 10_000);
    return {
      mode: "VELOCITY",
      baseScore: 0, adjustedScore: 0, penaltyRate: 0, finalScore: 0,
      gates, decision: "NO_TRADE",
      reasons: finalizeReasons(reasons, [
        "AGG: Data gate blocked — feed health issue",
        `Missing fields: ${Math.max(0, Math.floor(safeNumber(input.dataHealth.missingFields, 0)))}`,
      ]),
      diagnostics: {
        componentScores: { momentum01: 0, structure01: 0, positioning01: 0, liquidity01: 0, executionCertainty01: 0, edge01: 0, agreement01: 0, agreementScore01: 0, base01: 0 },
        modifiers: { agreementQ: 1, riskEnvironmentModifier: 1, breakoutModifier: 1, volatilityModifier: 1 },
        penalties: { latencyPenalty: 0, slippagePenalty: 0, spoofPenalty: 0, suddenMovePenalty: 0, fakeBreakoutPenalty: 0, degradedFeedsPenalty: 0, penaltyRate: 0 },
      },
    };
  }

  // ══════════════════════════════════════════════════════════════════
  // BASE SCORE: 5-Signal GOLD SETUP (same weights as FLOW)
  // Regime(25) + Liquidity(25) + Edge(20) + Execution(20) + Volatility(10) = 100
  // ══════════════════════════════════════════════════════════════════

  // ── SIGNAL GROUP 1: REGIME (25 pts) ──
  let regimeScore = 0;
  if (input.regime === "RANGE") regimeScore += 15;
  else if (input.regime === "TREND") regimeScore += 13;
  else if (input.regime === "MIXED") regimeScore += 7;
  else regimeScore += 4;

  if (input.trendStrength === "HIGH") regimeScore += 6;
  else if (input.trendStrength === "MID") regimeScore += 4;
  else if (input.trendStrength === "LOW") regimeScore += 1;
  else regimeScore += 2;

  if (input.compression === "ON" && input.regime === "RANGE") regimeScore += 4;
  else if (input.compression === "ON" && input.regime === "MIXED") regimeScore += 3;
  else if (input.compression === "ON") regimeScore += 2;

  regimeScore = clamp(regimeScore, 0, 25);

  // ── SIGNAL GROUP 2: LIQUIDITY (25 pts) ──
  let liquidityPts = 0;
  if (input.liquidityDensity === "HIGH") liquidityPts += 8;
  else if (input.liquidityDensity === "MID") liquidityPts += 5;
  else if (input.liquidityDensity === "LOW") liquidityPts += 2;
  else liquidityPts += 3;

  if (input.depthQuality === "GOOD") liquidityPts += 7;
  else if (input.depthQuality === "MID") liquidityPts += 4;
  else if (input.depthQuality === "POOR") liquidityPts += 1;
  else liquidityPts += 3;

  if (input.spoofRisk === "LOW") liquidityPts += 5;
  else if (input.spoofRisk === "MID") liquidityPts += 3;
  else if (input.spoofRisk === "HIGH") liquidityPts += 0;
  else liquidityPts += 2;

  liquidityPts += Math.round(liquidityScore01Val * 5);
  liquidityPts = clamp(liquidityPts, 0, 25);

  // ── SIGNAL GROUP 3: EDGE (20 pts) ──
  let edgePts = 0;
  edgePts += Math.round(normalizedEdge * 6);

  if (pWin >= 0.70) edgePts += 6;
  else if (pWin >= 0.65) edgePts += 5;
  else if (pWin >= 0.60) edgePts += 4;
  else if (pWin >= 0.55) edgePts += 2;

  if (expectedRR >= 3.0) edgePts += 5;
  else if (expectedRR >= 2.5) edgePts += 4;
  else if (expectedRR >= 2.0) edgePts += 3;
  else if (expectedRR >= 1.5) edgePts += 2;
  else if (expectedRR >= 1.0) edgePts += 1;

  if (input.asymmetry === "REWARD_DOMINANT") edgePts += 3;
  else if (input.asymmetry !== "RISK_DOMINANT") edgePts += 1;

  edgePts = clamp(edgePts, 0, 20);

  // ── SIGNAL GROUP 4: EXECUTION (20 pts) ──
  let execPts = 0;
  if (pFill >= 0.85) execPts += 7;
  else if (pFill >= 0.75) execPts += 5;
  else if (pFill >= 0.65) execPts += 3;
  else if (pFill >= 0.50) execPts += 1;

  if (input.slippageLevel === "LOW") execPts += 5;
  else if (input.slippageLevel === "MED") execPts += 3;
  else if (input.slippageLevel === "HIGH") execPts += 0;
  else execPts += 2;

  if (input.entryQuality === "GOOD") execPts += 4;
  else if (input.entryQuality === "MID") execPts += 2;
  else if (input.entryQuality === "BAD") execPts += 0;
  else execPts += 1;

  if (input.spreadRegime === "TIGHT") execPts += 4;
  else if (input.spreadRegime === "MID") execPts += 2;
  else if (input.spreadRegime === "WIDE") execPts += 0;
  else execPts += 1;

  execPts = clamp(execPts, 0, 20);

  // ── SIGNAL GROUP 5: VOLATILITY (10 pts) ──
  let volPts = 0;
  if (input.atrRegime === "HIGH") volPts += 3;
  else if (input.atrRegime === "MID") volPts += 2;
  else if (input.atrRegime === "LOW") volPts += 0;
  else volPts += 1;

  if (input.marketSpeed === "FAST") volPts += 3;
  else if (input.marketSpeed === "NORMAL") volPts += 2;
  else if (input.marketSpeed === "SLOW") volPts += 0;
  else volPts += 1;

  if (input.suddenMoveRisk === "LOW") volPts += 2;
  else if (input.suddenMoveRisk === "MID") volPts += 1;

  if (input.breakoutRisk === "HIGH" && input.compression === "ON") volPts += 2;
  else if (input.breakoutRisk === "MID") volPts += 1;
  else if (input.breakoutRisk === "LOW") volPts += 1;

  volPts = clamp(volPts, 0, 10);

  const totalBase = regimeScore + liquidityPts + edgePts + execPts + volPts;

  // ══════════════════════════════════════════════════════════════════
  // AGG BLOCK RULES — Relaxed: single flag = penalty, 2+ flags = hard block
  // Old: ANY single flag → score=0 (too strict)
  // New: 1 flag → soft penalty, 2+ flags → hard block
  // ══════════════════════════════════════════════════════════════════
  const blockReasons: string[] = [];

  if (pFill < 0.25) blockReasons.push(`BLOCK: fill ${roundTo2(pFill)} < 0.25`);
  if (normalizedEdge < 0.10) blockReasons.push(`BLOCK: edge ${roundTo2(normalizedEdge)} < 0.10`);
  if (pWin < 0.40) blockReasons.push(`BLOCK: pWin ${roundTo2(pWin)} < 0.40`);
  if (input.stressLevel === "HIGH" && input.cascadeRisk === "HIGH") blockReasons.push("BLOCK: stress HIGH + cascade HIGH");
  if (input.conflictLevel === "HIGH") blockReasons.push("BLOCK: signal conflict HIGH");

  const isBlocked = blockReasons.length >= 2;

  // Soft penalty flags — reduce score but don't kill trade
  let softBlockPenalty = 0;
  if (pFill < 0.55) softBlockPenalty += 6;
  if (normalizedEdge < 0.20) softBlockPenalty += 4;
  if (pWin < 0.50) softBlockPenalty += 4;
  if (input.stressLevel === "HIGH") softBlockPenalty += 4;

  // ══════════════════════════════════════════════════════════════════
  // 9 TACTICAL ENHANCERS — Modifiers on base score
  // Each enhancer contributes a bounded modifier
  // Total clamped to [-8, +12]
  // ══════════════════════════════════════════════════════════════════
  let enhancerTotal = 0;
  const enhancerDetails: string[] = [];

  // Direction alignment helpers
  const dirAligned = (signal: string, longVal: string, shortVal: string): boolean => {
    if (dir === "LONG") return signal === longVal;
    if (dir === "SHORT") return signal === shortVal;
    return false;
  };
  const dirOpposite = (signal: string, longVal: string, shortVal: string): boolean => {
    if (dir === "LONG") return signal === shortVal;
    if (dir === "SHORT") return signal === longVal;
    return false;
  };

  // ── A. Delta / Aggressor Flow (max +3 / -2) ──
  // Aggressor taker pressure aligned = strong confirmation
  // Orderbook imbalance aligned = additional support
  {
    let delta = 0;
    // Aggressor flow — tile may report BUY_DOMINANT, SELL_DOMINANT, STRONG_BUY, STRONG_SELL, BALANCED
    const isBuyFlow = agFlow.includes("BUY") || agFlow === "BULLISH";
    const isSellFlow = agFlow.includes("SELL") || agFlow === "BEARISH";
    if ((dir === "LONG" && isBuyFlow) || (dir === "SHORT" && isSellFlow)) {
      delta += 2;
      enhancerDetails.push(`Delta: aggressor aligned (${agFlow})`);
    } else if ((dir === "LONG" && isSellFlow) || (dir === "SHORT" && isBuyFlow)) {
      delta -= 1;
      enhancerDetails.push("Delta: aggressor against direction");
    }
    // Orderbook imbalance alignment
    if (dirAligned(obImb, "BUY", "SELL")) {
      delta += 1;
      enhancerDetails.push(`Delta: OB imbalance ${obImb} aligned`);
    } else if (dirOpposite(obImb, "BUY", "SELL")) {
      delta -= 1;
      enhancerDetails.push("Delta: OB imbalance against");
    }
    enhancerTotal += clamp(delta, -2, 3);
  }

  // ── B. Liquidation Heatmap (max +2 / -2) ──
  // UP = clusters above price (shorts' stops) → squeeze fuel for LONGS
  // DOWN = clusters below price (longs' stops) → cascade fuel for SHORTS
  {
    let liq = 0;
    if (dirAligned(liqBias, "UP", "DOWN")) {
      liq += 2;
      enhancerDetails.push(`Liq: clusters fuel ${dir} (${liqBias})`);
    } else if (dirOpposite(liqBias, "UP", "DOWN")) {
      liq -= 1;
      enhancerDetails.push("Liq: clusters on our side — danger");
    }
    // Cascade risk amplifies liquidation danger
    if (input.cascadeRisk === "HIGH" && liq < 0) {
      liq -= 1;
      enhancerDetails.push("Liq: cascade HIGH amplifies danger");
    }
    enhancerTotal += clamp(liq, -2, 2);
  }

  // ── C. OI + Price Logic Matrix (max +2 / -2) ──
  // TREND + rising OI + dir aligned = fresh participants → bullish for us
  // RANGE + high OI = trapped participants → reversal potential
  {
    let oi = 0;
    const strongOI = oiStr === "HIGH" || Math.abs(oiPct) > 3;
    if (strongOI) {
      if (input.regime === "TREND") {
        // In trend: OI rising aligned = fresh conviction
        if ((dir === "LONG" && oiPct > 0) || (dir === "SHORT" && oiPct < 0)) {
          oi += 2; enhancerDetails.push("OI: fresh participants aligned with trend");
        }
        // OI unwinding against us = conviction weakening
        else if ((dir === "LONG" && oiPct < -2) || (dir === "SHORT" && oiPct > 2)) {
          oi -= 1; enhancerDetails.push("OI: unwinding against our direction");
        }
        // OI rising but against direction = fresh opposition
        else if ((dir === "LONG" && oiPct < 0) || (dir === "SHORT" && oiPct > 0)) {
          oi -= 1; enhancerDetails.push("OI: fresh opposition entering");
        }
        // OI falling aligned = covering supports us
        else {
          oi += 1; enhancerDetails.push("OI: covering supports our direction");
        }
      } else {
        // Range: high OI = trapped participants = squeeze/reversal potential
        oi += 1; enhancerDetails.push("OI: high OI in range — squeeze potential");
      }
    } else if (oiStr === "MID") {
      if ((dir === "LONG" && oiPct > 0) || (dir === "SHORT" && oiPct < 0)) {
        oi += 1;
      }
    }
    enhancerTotal += clamp(oi, -2, 2);
  }

  // ── D. Funding Extreme Detector (max +2 / -1) ──
  // Extreme positive funding (longs pay) → contrarian SHORT edge
  // Extreme negative funding (shorts pay) → contrarian LONG edge
  // Same-direction extreme = crowded trade penalty
  {
    let fund = 0;
    const isExtreme = Math.abs(fRate) > 0.03 || fBias === "EXTREME";
    if (isExtreme) {
      if (fRate > 0.03 && dir === "SHORT") {
        fund += 2; enhancerDetails.push(`Funding: extreme positive (${roundTo2(fRate)}%) — contrarian SHORT`);
      } else if (fRate < -0.03 && dir === "LONG") {
        fund += 2; enhancerDetails.push(`Funding: extreme negative (${roundTo2(fRate)}%) — contrarian LONG`);
      } else if (fRate > 0.03 && dir === "LONG") {
        fund -= 1; enhancerDetails.push(`Funding: crowded LONG (${roundTo2(fRate)}%)`);
      } else if (fRate < -0.03 && dir === "SHORT") {
        fund -= 1; enhancerDetails.push(`Funding: crowded SHORT (${roundTo2(fRate)}%)`);
      }
    } else if (fBias === "BULLISH" && dir === "SHORT") {
      fund += 1; enhancerDetails.push("Funding: mildly bullish — slight contrarian SHORT edge");
    } else if (fBias === "BEARISH" && dir === "LONG") {
      fund += 1; enhancerDetails.push("Funding: mildly bearish — slight contrarian LONG edge");
    }
    enhancerTotal += clamp(fund, -1, 2);
  }

  // ── E. VWAP Deviation (max +2 / -1) ──
  // Range: price near VWAP / at range extreme aligned = mean reversion setup
  // Trend: VWAP aligned with direction = continuation
  {
    let vwap = 0;
    if (input.regime === "RANGE") {
      // Range extreme aligned with direction = good entry
      const atBottom = rangePos === "LOW" || rangePos === "BOTTOM" || rangePos === "LOWER";
      const atTop = rangePos === "HIGH" || rangePos === "TOP" || rangePos === "UPPER";
      const atMid = rangePos === "MID" || rangePos === "MIDDLE" || input.vwapPosition === "AT";
      if ((dir === "LONG" && atBottom) || (dir === "SHORT" && atTop)) {
        vwap += 2; enhancerDetails.push(`VWAP: range ${rangePos} supports ${dir}`);
      } else if (atMid) {
        vwap += 1; enhancerDetails.push("VWAP: price near VWAP — mean reversion zone");
      } else if ((dir === "LONG" && atTop) || (dir === "SHORT" && atBottom)) {
        vwap -= 1; enhancerDetails.push(`VWAP: range ${rangePos} against ${dir} — extended`);
      }
    } else if (input.regime === "TREND") {
      if (dirAligned(input.vwapPosition || "UNKNOWN", "ABOVE", "BELOW")) {
        vwap += 1; enhancerDetails.push(`VWAP: aligned with ${dir} trend`);
      } else if (dirOpposite(input.vwapPosition || "UNKNOWN", "ABOVE", "BELOW")) {
        vwap -= 1; enhancerDetails.push("VWAP: against trend direction");
      }
    }
    enhancerTotal += clamp(vwap, -1, 2);
  }

  // ── F. Trap Detector (max +3 / -2) ──
  // High trap probability = reversal opportunity (AGG speciality)
  // Fake breakout HIGH = danger
  // Stop clusters = squeeze fuel
  {
    let trap = 0;
    if (trapProb === "HIGH") {
      trap += 2; enhancerDetails.push("Trap: HIGH trap probability — reversal opportunity");
    } else if (trapProb === "MID") {
      trap += 1; enhancerDetails.push("Trap: MID trap probability — some reversal edge");
    }
    if (fakeProb === "HIGH") {
      trap -= 2; enhancerDetails.push("Trap: HIGH fake breakout risk — caution");
    } else if (fakeProb === "MID") {
      trap -= 1;
    }
    if (stopCluster === "HIGH") {
      trap += 1; enhancerDetails.push("Trap: stop clusters detected — squeeze fuel");
    }
    enhancerTotal += clamp(trap, -2, 3);
  }

  // ── G. Session Context (max +1 / -1) ──
  // NY (13-21 UTC): max volume, best for trends
  // London (07-13 UTC): trend initiation, breakout window
  // Asia (21-07 UTC): low volume, choppy
  {
    let session = 0;
    const hour = new Date().getUTCHours();
    if (hour >= 13 && hour < 21) {
      // NY session
      if (input.regime === "TREND") {
        session += 1; enhancerDetails.push("Session: NY + Trend = optimal");
      }
    } else if (hour >= 7 && hour < 13) {
      // London session
      if (input.regime === "TREND" || input.compression === "ON") {
        session += 1; enhancerDetails.push("Session: London — trend/breakout window");
      }
    } else {
      // Asia session
      if (input.marketSpeed === "SLOW" && input.regime !== "RANGE") {
        session -= 1; enhancerDetails.push("Session: Asia + slow + non-range — reduced edge");
      }
    }
    enhancerTotal += clamp(session, -1, 1);
  }

  // ── H. Microstructure Shift (max +2 / -1) ──
  // BOS/CHOCH proxy: impulse + speed + volume spike = structure shift
  {
    let micro = 0;
    const shiftSignals = [
      input.impulseReadiness === "HIGH",
      input.marketSpeed === "FAST",
      input.volumeSpike === "ON",
      input.trendStrength === "HIGH",
    ].filter(Boolean).length;

    if (shiftSignals >= 3) {
      micro += 2; enhancerDetails.push("Micro: structure shift (impulse+speed+volume)");
    } else if (shiftSignals >= 2) {
      micro += 1; enhancerDetails.push("Micro: partial structure shift");
    } else if (shiftSignals === 0 && input.marketSpeed === "SLOW") {
      micro -= 1; enhancerDetails.push("Micro: no shift, slow market");
    }
    enhancerTotal += clamp(micro, -1, 2);
  }

  // ── I. Time-Based Edge (max +1 / 0) ──
  // Sustainable regime = edge holds longer
  {
    let timeBased = 0;
    if (input.regime === "TREND" && input.trendStrength !== "LOW" && input.suddenMoveRisk !== "HIGH") {
      timeBased += 1; enhancerDetails.push("Time: sustainable trend — edge holds");
    } else if (input.compression === "ON" && input.breakoutRisk === "HIGH") {
      timeBased += 1; enhancerDetails.push("Time: compression + breakout imminent");
    }
    enhancerTotal += clamp(timeBased, 0, 1);
  }

  // ── Clamp total enhancer modifier [-8, +12] ──
  enhancerTotal = clamp(enhancerTotal, -8, 12);

  // ══════════════════════════════════════════════════════════════════
  // FINAL SCORE COMPUTATION
  // base (100pts) + enhancer modifier ([-8,+12]) × degraded feed penalty
  // ══════════════════════════════════════════════════════════════════
  const degradedFeedCount = (["ohlcv", "orderbook", "oi", "funding", "netflow", "trades"] as const)
    .filter((k) => input.dataHealth.feeds[k] === "degraded").length;
  const penaltyRate = clamp(degradedFeedCount * 0.02, 0, 0.08);

  const rawScore = totalBase + enhancerTotal;
  const finalScore = isBlocked
    ? 0
    : roundTo2(clamp(Math.max(0, rawScore - softBlockPenalty) * (1 - penaltyRate), 0, 100));

  // Gate assignments (for display compatibility)
  const riskBlocked = input.stressLevel === "HIGH" && input.cascadeRisk === "HIGH";
  const entryBlocked = input.entryWindow === "CLOSED";
  const fillBlocked = pFill < 0.12;
  gates.risk = riskBlocked ? "BLOCK" : "PASS";
  gates.entry = entryBlocked ? "BLOCK" : "PASS";
  gates.fill = fillBlocked ? "BLOCK" : "PASS";

  // ══════════════════════════════════════════════════════════════════
  // TRADE CLASSIFICATION
  // Classify setup type based on regime + direction + enhancer signals
  // ══════════════════════════════════════════════════════════════════
  let tradeClass: AggTradeClassification = "NO_TRADE";

  if (!isBlocked && Math.round(finalScore) >= 42) {
    // Squeeze Continuation: compression + volume spike + impulse
    if (input.compression === "ON" && input.volumeSpike === "ON" && input.impulseReadiness === "HIGH") {
      tradeClass = "SQUEEZE_CONTINUATION";
    }
    // Breakout Acceptance: compression + high breakout risk + fast speed
    else if (input.compression === "ON" && input.breakoutRisk === "HIGH" && input.marketSpeed === "FAST") {
      tradeClass = "BREAKOUT_ACCEPTANCE";
    }
    // Trap Reversal: high trap probability + fake breakout signals
    else if (trapProb === "HIGH" && (fakeProb === "MID" || fakeProb === "HIGH")) {
      tradeClass = "TRAP_REVERSAL";
    }
    // Range Accumulation Long
    else if (input.regime === "RANGE" && dir === "LONG" && (whale === "ACCUMULATION" || obImb === "BUY")) {
      tradeClass = "RANGE_ACCUMULATION_LONG";
    }
    // Range Rejection Short
    else if (input.regime === "RANGE" && dir === "SHORT" && (trapProb === "HIGH" || obImb === "SELL")) {
      tradeClass = "RANGE_REJECTION_SHORT";
    }
    // Trend Continuation
    else if (input.regime === "TREND" && (input.trendStrength === "HIGH" || input.trendStrength === "MID")) {
      tradeClass = "TREND_CONTINUATION";
    }
    // Watchlist for moderate setups
    else {
      tradeClass = "WATCHLIST";
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // DECISION ENGINE
  // 60+ = TRADE (APPROVED strong), 42-59 = TRADE (APPROVED WITH CAUTION)
  // 28-41 = WATCH, <28 = NO_TRADE
  // Lowered from 60→42 — old threshold blocked ~90% of coins
  // ══════════════════════════════════════════════════════════════════
  let decision: "TRADE" | "WATCH" | "NO_TRADE";

  if (isBlocked) {
    decision = "NO_TRADE";
    for (const r of blockReasons) addReason(reasons, r, 1000);
  } else if (Math.round(finalScore) >= 42) {
    decision = "TRADE";
    if (Math.round(finalScore) >= 60) {
      addReason(reasons, `AGG APPROVED: Strong tactical setup ${Math.round(finalScore)}/100 [${tradeClass}]`, 500);
    } else {
      addReason(reasons, `AGG APPROVED WITH CAUTION: ${Math.round(finalScore)}/100 [${tradeClass}]`, 450);
    }
  } else if (Math.round(finalScore) >= 28) {
    decision = "WATCH";
    addReason(reasons, `AGG WATCHLIST: ${Math.round(finalScore)}/100 [${tradeClass}]`, 300);
  } else {
    decision = "NO_TRADE";
    addReason(reasons, `AGG NO TRADE: ${Math.round(finalScore)}/100`, 200);
  }

  // Signal group breakdown reasons
  addReason(reasons, `Base: Regime ${regimeScore}/25 | Liq ${liquidityPts}/25 | Edge ${edgePts}/20 | Exec ${execPts}/20 | Vol ${volPts}/10 = ${totalBase}/100`, regimeScore >= 18 ? 280 : 100);
  if (enhancerTotal !== 0) {
    addReason(reasons, `Enhancers: ${enhancerTotal > 0 ? "+" : ""}${enhancerTotal} modifier (${enhancerDetails.length} active)`, Math.abs(enhancerTotal) >= 5 ? 270 : 120);
  }
  addReason(reasons, `Direction: ${dir} | Class: ${tradeClass}`, 110);

  // Add top 3 enhancer details as reasons
  for (let i = 0; i < Math.min(3, enhancerDetails.length); i++) {
    addReason(reasons, enhancerDetails[i], 250 - (i * 10));
  }

  return {
    mode: "VELOCITY",
    baseScore: roundTo2(totalBase),
    adjustedScore: roundTo2(rawScore),
    penaltyRate,
    finalScore,
    gates,
    decision,
    reasons: finalizeReasons(reasons),
    diagnostics: {
      componentScores: {
        momentum01: roundTo2(regimeScore / 25),          // AGG: Regime (0-1)
        structure01: roundTo2(liquidityPts / 25),         // AGG: Liquidity (0-1)
        positioning01: roundTo2(edgePts / 20),            // AGG: Edge (0-1)
        liquidity01: roundTo2(execPts / 20),              // AGG: Execution (0-1)
        executionCertainty01: roundTo2(volPts / 10),      // AGG: Volatility (0-1)
        edge01: roundTo2(totalBase / 100),                // AGG: Total base score (0-1)
        agreement01: roundTo2(enhancerTotal / 12),        // AGG: Enhancer contribution (0-1 when positive)
        agreementScore01: roundTo2(rawScore / 100),       // AGG: Raw score incl. enhancers
        base01: roundTo2(finalScore / 100),
      },
      modifiers: {
        agreementQ: 1,
        riskEnvironmentModifier: roundTo2(enhancerTotal),
        breakoutModifier: 1,
        volatilityModifier: 1,
      },
      penalties: {
        latencyPenalty: 0,
        slippagePenalty: 0,
        spoofPenalty: 0,
        suddenMovePenalty: 0,
        fakeBreakoutPenalty: 0,
        degradedFeedsPenalty: roundTo2(degradedFeedCount * 0.02),
        penaltyRate: roundTo2(penaltyRate),
      },
    },
  };
};

export const computeVelocityConsensus = (input: VelocityConsensusInput): VelocityConsensusOutput => {
  const reasons: ReasonEntry[] = [];
  const breakoutOnly = Boolean(input.breakoutOnly);

  const pFill = clamp(safeNumber(input.pFill, 0.5), 0, 1);
  const capacity = clamp(safeNumber(input.capacity, 0.5), 0, 1);

  const momentum01 = clamp(
    trendBase(input.regime) *
      trendStrengthAdj(input.trendStrength) *
      emaAdj(input.emaAlignment) *
      vwapAdj(input.vwapPosition) *
      speedAdj(input.marketSpeed) *
      atrAdj(input.atrRegime) *
      volumeSpikeAdj(input.volumeSpike) *
      impulseAdj(input.impulseReadiness) *
      fakeBreakoutFilter(input.fakeBreakoutProb) *
      suddenMoveFilter(input.suddenMoveRisk),
    0,
    1,
  );

  let edgeCore = normalizeVelocityRiskAdjEdge(safeNumber(input.riskAdjEdgeR, 0));
  if (typeof input.pWin === "number") {
    const pWinMultiplier = (clamp((input.pWin - 0.5) / 0.3, 0, 1) * 0.55) + 0.45;
    edgeCore *= pWinMultiplier;
  }
  if (typeof input.expectedRR === "number" && input.expectedRR < 0.9) edgeCore *= 0.92;
  if (typeof input.costR === "number" && input.costR > 0.5) edgeCore *= 0.88;
  if (input.asymmetry === "RISK_DOMINANT") edgeCore *= 0.9;
  const edge01 = clamp(edgeCore, 0, 1);

  const executionCertainty01 = clamp(
    mean([pFill, capacity]) *
      spreadMultiplier(input.spreadRegime) *
      depthMultiplier(input.depthQuality) *
      liquidityDensityMultiplier(input.liquidityDensity) *
      spoofMultiplier(input.spoofRisk) *
      slippageMultiplier(input.slippageLevel),
    0,
    1,
  );

  const agreement01 = clamp(
    safeNumber(input.alignedCount, 0) / Math.max(1, Math.floor(safeNumber(input.totalModels, 1))),
    0,
    1,
  );
  const agreementScore01 = clamp(agreement01 * conflictMultiplier(input.conflictLevel), 0, 1);
  const agreementQ = 0.88 + (0.12 * agreementScore01);

  const structure01 = score01(safeNumber(input.structureScore, 50));
  const positioning01 = score01(safeNumber(input.positioningScore, 50));
  const liquidity01 = score01(safeNumber(input.liquidityScore, 50));

  // Rebalanced: reduced momentum dominance (was 45%) to let other components contribute
  // Old weights produced max ~50% baseScore — not enough for TRADE threshold
  let base01 =
    (0.30 * momentum01) +
    (0.20 * structure01) +
    (0.18 * positioning01) +
    (0.12 * liquidity01) +
    (0.12 * executionCertainty01) +
    (0.08 * edge01);
  base01 = clamp(base01 * agreementQ, 0, 1);
  const baseScore = roundTo2(base01 * 100);

  const rem = clamp(
    remStressMultiplier(input.stressLevel) *
      remCrowdingMultiplier(input.crowdingRisk) *
      remCascadeMultiplier(input.cascadeRisk),
    0.76,
    1.0,
  );
  const bm = computeBreakoutModifier(breakoutOnly, input.compression, input.regime, input.trendStrength);
  const vm = computeVolatilityModifier(input.atrRegime, input.marketSpeed);
  // Optimized momentum lift — balanced between strict and inflated
  // Rewards good momentum without inflating marginal setups
  const momentumLift = momentum01 >= 0.75 ? 0.12 : momentum01 >= 0.60 ? 0.08 : momentum01 >= 0.45 ? 0.04 : 0;
  const adjusted01 = clamp((base01 * rem * bm * vm) + momentumLift, 0, 1);
  const adjustedScore = roundTo2(adjusted01 * 100);

  const dataBlocked =
    input.dataHealth.feeds.ohlcv === "down" ||
    safeNumber(input.dataHealth.missingFields, 0) >= 3 ||
    (Boolean(input.dataHealth.staleFeed) && safeNumber(input.dataHealth.latencyMs, 0) > 8000);

  const gates = {
    data: (dataBlocked ? "BLOCK" : "PASS") as "PASS" | "BLOCK",
    risk: "PASS" as "PASS" | "BLOCK",
    entry: "PASS" as "PASS" | "BLOCK",
    fill: "PASS" as "PASS" | "BLOCK",
  };

  if (dataBlocked) {
    gates.risk = "BLOCK";
    gates.entry = "BLOCK";
    gates.fill = "BLOCK";
    addReason(reasons, "Data gate BLOCK", 10_000);
    return {
      mode: "VELOCITY",
      baseScore,
      adjustedScore,
      penaltyRate: 0,
      finalScore: 0,
      gates,
      decision: "NO_TRADE",
      reasons: finalizeReasons(reasons, [
        "Data gate blocked due to feed health",
        `Missing fields: ${Math.max(0, Math.floor(safeNumber(input.dataHealth.missingFields, 0)))}`,
        `Latency: ${Math.max(0, Math.floor(safeNumber(input.dataHealth.latencyMs, 0)))}ms`,
      ]),
      diagnostics: {
        componentScores: {
          momentum01: roundTo2(momentum01),
          structure01: roundTo2(structure01),
          positioning01: roundTo2(positioning01),
          liquidity01: roundTo2(liquidity01),
          executionCertainty01: roundTo2(executionCertainty01),
          edge01: roundTo2(edge01),
          agreement01: roundTo2(agreement01),
          agreementScore01: roundTo2(agreementScore01),
          base01: roundTo2(base01),
        },
        modifiers: {
          agreementQ: roundTo2(agreementQ),
          riskEnvironmentModifier: roundTo2(rem),
          breakoutModifier: roundTo2(bm),
          volatilityModifier: roundTo2(vm),
        },
        penalties: {
          latencyPenalty: 0,
          slippagePenalty: 0,
          spoofPenalty: 0,
          suddenMovePenalty: 0,
          fakeBreakoutPenalty: 0,
          degradedFeedsPenalty: 0,
          penaltyRate: 0,
        },
      },
    };
  }

  const riskBlocked =
    (input.stressLevel === "HIGH" && input.cascadeRisk === "HIGH");
  const entryBlocked = input.entryWindow === "CLOSED";
  const fillBlocked = typeof input.pFill === "number" && input.pFill < 0.12;

  gates.risk = riskBlocked ? "BLOCK" : "PASS";
  gates.entry = entryBlocked ? "BLOCK" : "PASS";
  gates.fill = fillBlocked ? "BLOCK" : "PASS";

  if (riskBlocked) {
    if (input.stressLevel === "HIGH" && input.cascadeRisk === "HIGH") {
      addReason(reasons, "Risk gate BLOCK: stress HIGH + cascade HIGH", 950);
    } else {
      addReason(reasons, "Risk gate BLOCK: cascade HIGH + crowding HIGH", 940);
    }
  }
  if (entryBlocked) addReason(reasons, "Entry gate BLOCK: entry window CLOSED", 900);
  if (fillBlocked) addReason(reasons, `Fill gate BLOCK: pFill ${roundTo2(input.pFill ?? 0)}`, 880);

  // Velocity mode penalties — balanced to prevent marginal trades
  const latencyP = safeNumber(input.dataHealth.latencyMs, 0) > 3000 ? 0.03 : 0;
  const slippageP = input.slippageLevel === "HIGH" ? 0.06 : input.slippageLevel === "MED" ? 0.03 : 0;
  const spoofP = input.spoofRisk === "HIGH" ? 0.05 : input.spoofRisk === "MID" ? 0.02 : 0;
  const suddenMoveP = input.suddenMoveRisk === "HIGH" ? 0.04 : 0;
  const fakeBreakoutP = input.fakeBreakoutProb === "HIGH" ? 0.04 : 0;
  const degradedFeedCount = (["ohlcv", "orderbook", "oi", "funding", "netflow", "trades"] as const)
    .filter((k) => input.dataHealth.feeds[k] === "degraded").length;
  const degradedP = Math.min(0.06, degradedFeedCount * 0.02);
  const penaltyRate = clamp(latencyP + slippageP + spoofP + suddenMoveP + fakeBreakoutP + degradedP, 0, 0.22);

  // ── Signal Alignment Bonus (inspired by CG's +30 alignment system) ──
  // Count how many market signals agree → higher alignment = higher win probability
  const alignedSignals = [
    input.regime === "TREND",                                          // 1. Clear trend
    input.emaAlignment === "BULL" || input.emaAlignment === "BEAR",    // 2. EMA direction
    input.vwapPosition === "ABOVE" || input.vwapPosition === "BELOW",  // 3. VWAP confirmation
    input.trendStrength === "HIGH" || input.trendStrength === "MID",   // 4. Trend strength
    input.volumeSpike === "ON",                                        // 5. Volume confirmation
    input.impulseReadiness === "HIGH" || input.impulseReadiness === "MID", // 6. Ready to move
    input.marketSpeed === "FAST" || input.marketSpeed === "NORMAL",    // 7. Active market
    input.entryWindow === "OPEN",                                      // 8. Entry window open
  ].filter(Boolean).length;

  // Alignment bonus: optimized middle ground
  // Rewards multi-signal agreement without inflating weak setups
  const alignmentBonus =
    alignedSignals >= 7 ? 8 :
    alignedSignals >= 6 ? 5 :
    alignedSignals >= 5 ? 3 :
    alignedSignals >= 4 ? 1 :
    alignedSignals >= 3 ? -1 :
    -3;  // Punish low-alignment setups

  // Apply penalty rate to adjusted score, THEN add alignment bonus
  let finalScore = roundTo2(clamp((adjusted01 * 100 * (1 - penaltyRate)) + alignmentBonus, 0, 100));
  const anyHardBlock = riskBlocked || entryBlocked || fillBlocked;
  if (anyHardBlock) finalScore = roundTo2(Math.min(finalScore, 52));

  // ── Quant Engine Quality Gates (filter bad trades without lowering scores) ──
  // These prevent low-quality setups from becoming TRADE even with high momentum

  // QG1: Edge quality gate — reject TRADE if quant engine shows negative edge
  const qgEdgeFail = (safeNumber(input.riskAdjEdgeR, 0) < 0.0 && safeNumber(input.pWin, 0.5) < 0.45);

  // QG2: Asymmetry gate — reject TRADE if risk dominant AND momentum not strong enough
  const qgAsymmetryFail = (input.asymmetry === "RISK_DOMINANT" && momentum01 < 0.6 && edge01 < 0.35);

  // QG3: Execution certainty gate — reject TRADE if execution is too poor
  const qgExecFail = (executionCertainty01 < 0.22);

  // QG4: RR quality gate — reject TRADE if expectedRR < 0.7 and pWin is low
  const qgRRFail = (safeNumber(input.expectedRR, 1.0) < 0.7 && safeNumber(input.pWin, 0.5) < 0.50);

  // QG5: Conflict gate — model conflict HIGH with weak positioning degrades to WATCH
  const qgConflictFail = (input.conflictLevel === "HIGH" && positioning01 < 0.55);

  // QG6: Structure gate — weak structure in velocity mode should not trade
  const qgStructureFail = (structure01 < 0.25 && momentum01 < 0.5);

  const qualityGateFail = qgEdgeFail || qgAsymmetryFail || qgExecFail || qgRRFail || qgConflictFail || qgStructureFail;
  if (qualityGateFail) {
    if (qgEdgeFail) addReason(reasons, "Quality gate: negative edge + low pWin", 870);
    if (qgAsymmetryFail) addReason(reasons, "Quality gate: risk-dominant with weak momentum", 860);
    if (qgExecFail) addReason(reasons, "Quality gate: execution certainty too low", 850);
    if (qgRRFail) addReason(reasons, "Quality gate: poor RR + low win rate", 840);
    if (qgConflictFail) addReason(reasons, "Quality gate: model conflict HIGH + weak positioning", 830);
    if (qgStructureFail) addReason(reasons, "Quality gate: weak structure + low momentum", 820);
  }

  // TRADE threshold 54: strict multipliers + penalties filter bad trades
  // Only genuinely strong setups reach 54+ after all deductions
  // Quality gates provide additional protection against marginal trades
  let decision: "TRADE" | "WATCH" | "NO_TRADE" = "NO_TRADE";
  if (anyHardBlock || gates.data === "BLOCK") {
    decision = "NO_TRADE";
  } else if (qualityGateFail && Math.round(finalScore) >= 54) {
    // Quality gate downgrades TRADE → WATCH (score stays, decision changes)
    decision = "WATCH";
  } else if (Math.round(finalScore) >= 54) {
    decision = "TRADE";
  } else if (Math.round(finalScore) >= 38) {
    decision = "WATCH";
  } else {
    decision = "NO_TRADE";
  }

  if (decision === "TRADE") {
    if (momentum01 >= 0.7) addReason(reasons, "Momentum strong", 260);
    else if (momentum01 >= 0.5) addReason(reasons, "Momentum moderate", 200);
    if (input.marketSpeed === "FAST") addReason(reasons, "Speed FAST", 250);
    if (input.atrRegime === "HIGH") addReason(reasons, "ATR HIGH", 240);
    if (input.volumeSpike === "ON") addReason(reasons, "Volume spike ON", 230);
    if (input.regime === "TREND") addReason(reasons, "Trend regime active", 220);
  }

  return {
    mode: "VELOCITY",
    baseScore,
    adjustedScore,
    penaltyRate,
    finalScore,
    gates,
    decision,
    reasons: finalizeReasons(reasons, [
      decision === "TRADE" ? "Velocity setup passed trade threshold" : "Velocity setup not fully qualified",
      `Final score ${roundTo2(finalScore)} with penalty rate ${roundTo2(penaltyRate)}`,
      anyHardBlock ? "At least one hard gate is BLOCK" : "All hard gates are PASS",
    ]),
    diagnostics: {
      componentScores: {
        momentum01: roundTo2(momentum01),
        structure01: roundTo2(structure01),
        positioning01: roundTo2(positioning01),
        liquidity01: roundTo2(liquidity01),
        executionCertainty01: roundTo2(executionCertainty01),
        edge01: roundTo2(edge01),
        agreement01: roundTo2(agreement01),
        agreementScore01: roundTo2(agreementScore01),
        base01: roundTo2(base01),
      },
      modifiers: {
        agreementQ: roundTo2(agreementQ),
        riskEnvironmentModifier: roundTo2(rem),
        breakoutModifier: roundTo2(bm),
        volatilityModifier: roundTo2(vm),
      },
      penalties: {
        latencyPenalty: roundTo2(latencyP),
        slippagePenalty: roundTo2(slippageP),
        spoofPenalty: roundTo2(spoofP),
        suddenMovePenalty: roundTo2(suddenMoveP),
        fakeBreakoutPenalty: roundTo2(fakeBreakoutP),
        degradedFeedsPenalty: roundTo2(degradedP),
        penaltyRate: roundTo2(penaltyRate),
      },
    },
  };
};
