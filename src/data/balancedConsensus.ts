/**
 * BALANCED consensus — independent copy of Capital Guard scoring logic.
 * Same weights, gates, penalties, A+ floor, and uplift.
 * Changes to capitalGuardConsensus.ts will NOT affect this file.
 */

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

export interface BalancedConsensusInput {
  structureScore?: number;
  liquidityScore?: number;
  positioningScore?: number;
  executionScore?: number;

  regime?: Regime;
  trendStrength?: TrendStrength;
  emaAlignment?: EmaAlignment;
  vwapPosition?: VwapPosition;
  structureAge?: StructureAge;
  marketSpeed?: MarketSpeed;
  compression?: Compression;
  spoofRisk?: TernaryRisk;
  spreadRegime?: SpreadRegime;
  depthQuality?: DepthQuality;
  crowdingRisk?: TernaryRisk;
  cascadeRisk?: TernaryRisk;
  stressLevel?: TernaryRisk;
  entryWindow?: EntryWindow;

  pFill?: number;
  capacity?: number;
  slippageLevel?: SlippageLevel;

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

  alignedCount?: number;
  totalModels?: number;
  conflictLevel?: ConflictLevel;

  dataHealth: BalancedDataHealth;
}

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
  return values.reduce((sum, v) => sum + v, 0) / values.length;
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

const spreadMultiplier = (spreadRegime: SpreadRegime | undefined): number => {
  if (spreadRegime === "TIGHT") return 1.0;
  if (spreadRegime === "MID") return 0.95;
  if (spreadRegime === "WIDE") return 0.86;
  return 0.93;
};

const depthMultiplier = (depth: DepthQuality | undefined): number => {
  if (depth === "GOOD") return 1.0;
  if (depth === "MID") return 0.94;
  if (depth === "POOR") return 0.82;
  return 0.91;
};

const spoofMultiplier = (spoofRisk: TernaryRisk | undefined): number => {
  if (spoofRisk === "LOW") return 1.0;
  if (spoofRisk === "MID") return 0.95;
  if (spoofRisk === "HIGH") return 0.86;
  return 0.93;
};

const slippageMultiplier = (slippage: SlippageLevel | undefined): number => {
  if (slippage === "LOW") return 1.0;
  if (slippage === "MED") return 0.95;
  if (slippage === "HIGH") return 0.88;
  return 0.93;
};

const agreementConflictMultiplier = (conflict: ConflictLevel | undefined): number => {
  if (conflict === "LOW") return 1.0;
  if (conflict === "MID") return 0.95;
  if (conflict === "HIGH") return 0.86;
  return 0.93;
};

const remStressMultiplier = (stress: TernaryRisk | undefined): number => {
  if (stress === "LOW") return 1.0;
  if (stress === "MID") return 0.94;
  if (stress === "HIGH") return 0.84;
  return 0.94;
};

const remCrowdingMultiplier = (crowding: TernaryRisk | undefined): number => {
  if (crowding === "LOW") return 1.0;
  if (crowding === "MID") return 0.97;
  if (crowding === "HIGH") return 0.90;
  return 0.97;
};

const remCascadeMultiplier = (cascade: TernaryRisk | undefined): number => {
  if (cascade === "LOW") return 1.0;
  if (cascade === "MID") return 0.96;
  if (cascade === "HIGH") return 0.88;
  return 0.96;
};

const entryModifier = (entryWindow: EntryWindow | undefined): number => {
  if (entryWindow === "OPEN") return 1.0;
  if (entryWindow === "CLOSED") return 0.9;
  return 0.95;
};

const regimeModifier = (
  regime: Regime | undefined,
  compression: Compression | undefined,
  marketSpeed: MarketSpeed | undefined,
): number => {
  let modifier = 1.0;
  if (regime === "RANGE" && compression === "OFF") modifier = 0.95;
  if (regime === "TREND" && (marketSpeed === "NORMAL" || marketSpeed === "FAST")) modifier = 1.02;
  return clamp(modifier, 0.9, 1.05);
};

const computeStructureBoost01 = (
  regime: Regime | undefined,
  trendStrength: TrendStrength | undefined,
  emaAlignment: EmaAlignment | undefined,
  vwapPosition: VwapPosition | undefined,
): number => {
  let boost = 0;
  if (regime === "TREND" && trendStrength === "HIGH") boost += 0.05;
  const alignmentKnown = emaAlignment !== "UNKNOWN" && vwapPosition !== "UNKNOWN";
  const alignedBull = emaAlignment === "BULL" && vwapPosition === "ABOVE";
  const alignedBear = emaAlignment === "BEAR" && vwapPosition === "BELOW";
  if (alignmentKnown && (alignedBull || alignedBear)) boost += 0.03;
  return clamp(boost, 0, 0.1);
};

const latencyPenaltyRate = (latencyMs: number): number => {
  void latencyMs;
  return 0;
};

const executionWeaknessPenaltyRate = (
  pFill: number,
  slippage: SlippageLevel | undefined,
  spoofRisk: TernaryRisk | undefined,
): number => {
  let penalty = 0;
  if (pFill < 0.35) penalty += 0.1;
  else if (pFill < 0.5) penalty += 0.06;
  if (slippage === "HIGH") penalty += 0.08;
  if (spoofRisk === "HIGH") penalty += 0.06;
  return penalty;
};

const degradedFeedsPenaltyRate = (feeds: BalancedDataHealth["feeds"]): number => {
  const keys: Array<keyof BalancedDataHealth["feeds"]> = ["ohlcv", "orderbook", "oi", "funding", "netflow", "trades"];
  const degradedCount = keys.filter((key) => feeds[key] === "degraded").length;
  return Math.min(0.06, degradedCount * 0.02);
};

const scoreFactorFromFinalScore = (finalScore: number): number => {
  if (finalScore < 45) return 0;
  if (finalScore <= 65) return lerpRange(finalScore, 45, 65, 0.3, 0.6);
  if (finalScore <= 85) return lerpRange(finalScore, 65, 85, 0.6, 0.9);
  return lerpRange(clamp(finalScore, 85, 100), 85, 100, 0.9, 1.0);
};

const addReason = (reasons: ReasonEntry[], text: string, impact: number) => {
  reasons.push({ text, impact });
};

const finalizeReasons = (reasons: ReasonEntry[]): string[] =>
  reasons
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 6)
    .map((r) => r.text);

export const computeBalancedConsensus = (
  input: BalancedConsensusInput,
): BalancedConsensusOutput => {
  const reasons: ReasonEntry[] = [];

  const structureLayer01 = score01(safeNumber(input.structureScore, 50));
  const structureBoost01 = computeStructureBoost01(input.regime, input.trendStrength, input.emaAlignment, input.vwapPosition);
  const structure01 = clamp(structureLayer01 + structureBoost01, 0, 1);
  const liquidity01 = score01(safeNumber(input.liquidityScore, 50));
  const positioning01 = score01(safeNumber(input.positioningScore, 50));
  const executionLayer01 = score01(safeNumber(input.executionScore, 50));

  const pFill = clamp(safeNumber(input.pFill, 0.5), 0, 1);
  const capacity = clamp(safeNumber(input.capacity, 0.5), 0, 1);
  const executionCertainty01 = clamp(
    mean([pFill, capacity]) *
      spreadMultiplier(input.spreadRegime) *
      depthMultiplier(input.depthQuality) *
      spoofMultiplier(input.spoofRisk) *
      slippageMultiplier(input.slippageLevel),
    0,
    1,
  );
  const execution01 = ((Math.max(executionLayer01, executionCertainty01) * 0.5) + (executionCertainty01 * 0.5));

  const agreement01 = clamp(
    safeNumber(input.alignedCount, 0) / Math.max(1, Math.floor(safeNumber(input.totalModels, 1))),
    0,
    1,
  );
  const agreementScore01 = clamp(agreement01 * agreementConflictMultiplier(input.conflictLevel), 0, 1);
  const agreementQ = 0.85 + (0.15 * agreementScore01);

  let edgeCore = normalizeBalancedRiskAdjEdge(safeNumber(input.riskAdjEdgeR, 0));
  if (typeof input.pWin === "number") {
    const pWinGuard = (clamp((input.pWin - 0.5) / 0.3, 0, 1) * 0.6) + 0.4;
    edgeCore *= pWinGuard;
  }
  if (typeof input.costR === "number" && input.costR > 0.5) edgeCore *= 0.85;
  if (typeof input.pStop === "number" && input.pStop > 0.4) edgeCore *= 0.85;
  const edge01 = clamp(edgeCore, 0, 1);

  // Component weights — same as Capital Guard
  let base01 =
    (0.35 * structure01) +
    (0.25 * edge01) +
    (0.15 * liquidity01) +
    (0.15 * positioning01) +
    (0.10 * execution01);
  base01 = clamp(base01 * agreementQ, 0, 1);
  const baseScore = roundTo2(base01 * 100);

  const rem = clamp(
    remStressMultiplier(input.stressLevel) *
      remCrowdingMultiplier(input.crowdingRisk) *
      remCascadeMultiplier(input.cascadeRisk),
    0.78,
    1.0,
  );
  const em = entryModifier(input.entryWindow);
  const rm = regimeModifier(input.regime, input.compression, input.marketSpeed);

  const adjusted01 = clamp(base01 * rem * em * rm, 0, 1);
  const adjustedScore = roundTo2(adjusted01 * 100);

  if (input.stressLevel === "MID" || input.stressLevel === "HIGH") {
    addReason(reasons, `Modifier: stress ${input.stressLevel}`, input.stressLevel === "HIGH" ? 75 : 45);
  }
  if (input.entryWindow === "CLOSED") addReason(reasons, "Modifier: entry window closed", 35);

  const latencyPenalty = latencyPenaltyRate(Math.max(0, safeNumber(input.dataHealth?.latencyMs, 0)));
  const executionWeaknessPenalty = executionWeaknessPenaltyRate(pFill, input.slippageLevel, input.spoofRisk) * 0.35;
  const entryClosedPenalty = input.entryWindow === "CLOSED" ? 0.05 : 0;
  const dataDegradedPenalty = degradedFeedsPenaltyRate(input.dataHealth?.feeds ?? {});

  const rawPenalty = clamp(
    latencyPenalty + executionWeaknessPenalty + entryClosedPenalty + dataDegradedPenalty,
    0,
    0.4,
  );
  const isAPlus = structure01 >= 0.60 && edge01 >= 0.55;
  const penaltyRate = roundTo2(isAPlus ? rawPenalty * 0.5 : rawPenalty);

  if (latencyPenalty > 0) addReason(reasons, "Penalty: latency high", latencyPenalty * 1000);
  if (executionWeaknessPenalty > 0) {
    if (pFill < 0.5) addReason(reasons, "Penalty: low fill probability", 70);
    if (input.slippageLevel === "HIGH") addReason(reasons, "Penalty: slippage high", 80);
    if (input.spoofRisk === "HIGH") addReason(reasons, "Penalty: spoof risk high", 60);
  }
  if (dataDegradedPenalty > 0) addReason(reasons, "Penalty: degraded feeds", dataDegradedPenalty * 1000);

  const dataGateBlocked =
    input.dataHealth?.feeds?.ohlcv === "down" ||
    safeNumber(input.dataHealth?.missingFields, 0) >= 3 ||
    (Boolean(input.dataHealth?.staleFeed) && safeNumber(input.dataHealth?.latencyMs, 0) > 8000);
  const dataGate: "PASS" | "BLOCK" = dataGateBlocked ? "BLOCK" : "PASS";
  if (dataGateBlocked) addReason(reasons, "Data gate blocked", 10_000);

  const safetyGateBlocked =
    (input.stressLevel === "HIGH" && input.cascadeRisk === "HIGH") ||
    (input.depthQuality === "POOR" && input.spreadRegime === "WIDE" && input.slippageLevel === "HIGH");
  const safetyGate: "PASS" | "BLOCK" = safetyGateBlocked ? "BLOCK" : "PASS";
  if (safetyGateBlocked) addReason(reasons, "Safety block", 9_000);

  // Conservative uplift — only for genuinely safe conditions
  const safetyUplift =
    (input.stressLevel === "LOW" ? 3 : input.stressLevel === "MID" ? 1 : 0) +
    (input.cascadeRisk === "LOW" ? 2 : input.cascadeRisk === "MID" ? 1 : 0) +
    (input.crowdingRisk === "LOW" ? 2 : 0) +
    (input.entryWindow === "OPEN" ? 2 : 0) +
    (input.slippageLevel === "LOW" ? 2 : 0);

  const final01PreFloor = clamp(adjusted01 * (1 - clamp(penaltyRate, 0, 1)), 0, 1);
  const finalScorePreFloor = roundTo2(final01PreFloor * 100 + safetyUplift + 14);

  let floorsApplied = false;
  let finalScore = finalScorePreFloor;
  if (isAPlus && dataGate === "PASS" && safetyGate === "PASS") {
    const floored = Math.max(finalScorePreFloor, 52);
    floorsApplied = floored > finalScorePreFloor;
    finalScore = floored;
    if (floorsApplied) addReason(reasons, "A+ setup floor applied", 150);
  }

  if (safetyGate === "BLOCK") {
    finalScore = Math.min(adjustedScore, 44);
  }

  if (dataGate === "BLOCK") {
    finalScore = 0;
  }
  finalScore = roundTo2(clamp(finalScore, 0, 100));

  const scoreFactor = scoreFactorFromFinalScore(finalScore);
  let sizeHint = clamp(scoreFactor * rem, 0, 1);
  if (dataGate === "BLOCK" || safetyGate === "BLOCK") sizeHint = 0;
  sizeHint = roundTo2(sizeHint);

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
        structure01: roundTo2(structure01),
        liquidity01: roundTo2(liquidity01),
        positioning01: roundTo2(positioning01),
        execution01: roundTo2(execution01),
        executionCertainty01: roundTo2(executionCertainty01),
        edge01: roundTo2(edge01),
        agreement01: roundTo2(agreement01),
        agreementScore01: roundTo2(agreementScore01),
        base01: roundTo2(base01),
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
    },
  };
};
