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
export type LiquidityDensity = "LOW" | "MID" | "HIGH" | "UNKNOWN";
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
  liquidityDensity?: LiquidityDensity;
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
  gates: {
    data: "PASS" | "BLOCK";
    risk: "PASS" | "BLOCK";
    entry: "PASS" | "BLOCK";
    fill: "PASS" | "BLOCK";
    capacity: "PASS" | "BLOCK";
  };
  decision: "TRADE" | "WATCH" | "NO_TRADE";
  reasons: string[];
  diagnostics: {
    componentScores: {
      structureQuality01: number;
      positioning01: number;
      liquidity01: number;
      executionLayer01: number;
      executionCertainty01: number;
      execution01: number;
      edge01: number;
      agreement01: number;
      agreementScore01: number;
      base01: number;
    };
    modifiers: {
      agreementQ: number;
      riskEnvironmentModifier: number;
      regimeModifier: number;
      microstructureModifier: number;
    };
    penalties: {
      latencyPenalty: number;
      slippagePenalty: number;
      spoofPenalty: number;
      stressPenalty: number;
      degradedFeedsPenalty: number;
      liquidityLowPenalty: number;
      entryClosedPenalty: number;
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
  return values.reduce((sum, v) => sum + v, 0) / values.length;
};

const lerpRange = (x: number, x1: number, x2: number, y1: number, y2: number): number => {
  if (x2 <= x1) return y2;
  const t = clamp((x - x1) / (x2 - x1), 0, 1);
  return y1 + (y2 - y1) * t;
};

export const normalizeBalancedRiskAdjEdge = (riskAdjEdgeR: number): number => {
  if (riskAdjEdgeR <= 0) return 0;
  if (riskAdjEdgeR <= 0.08) return lerpRange(riskAdjEdgeR, 0, 0.08, 0, 0.35);
  if (riskAdjEdgeR <= 0.16) return lerpRange(riskAdjEdgeR, 0.08, 0.16, 0.35, 0.7);
  if (riskAdjEdgeR <= 0.3) return lerpRange(riskAdjEdgeR, 0.16, 0.3, 0.7, 1);
  return 1;
};

const spreadMultiplier = (spreadRegime: SpreadRegime | undefined): number => {
  if (spreadRegime === "TIGHT") return 1.0;
  if (spreadRegime === "MID") return 0.94;
  if (spreadRegime === "WIDE") return 0.84;
  return 0.92;
};

const depthMultiplier = (depthQuality: DepthQuality | undefined): number => {
  if (depthQuality === "GOOD") return 1.0;
  if (depthQuality === "MID") return 0.93;
  if (depthQuality === "POOR") return 0.80;
  return 0.90;
};

const liquidityDensityMultiplier = (liquidityDensity: LiquidityDensity | undefined): number => {
  if (liquidityDensity === "HIGH") return 1.0;
  if (liquidityDensity === "MID") return 0.95;
  if (liquidityDensity === "LOW") return 0.88;
  return 0.93;
};

const spoofMultiplier = (spoofRisk: TernaryRisk | undefined): number => {
  if (spoofRisk === "LOW") return 1.0;
  if (spoofRisk === "MID") return 0.94;
  if (spoofRisk === "HIGH") return 0.86;
  return 0.92;
};

const slippageMultiplier = (slippageLevel: SlippageLevel | undefined): number => {
  if (slippageLevel === "LOW") return 1.0;
  if (slippageLevel === "MED") return 0.94;
  if (slippageLevel === "HIGH") return 0.86;
  return 0.92;
};

const conflictMultiplier = (conflictLevel: ConflictLevel | undefined): number => {
  if (conflictLevel === "LOW") return 1.0;
  if (conflictLevel === "MID") return 0.94;
  if (conflictLevel === "HIGH") return 0.86;
  return 0.92;
};

const riskStressMultiplier = (stressLevel: TernaryRisk | undefined): number => {
  if (stressLevel === "LOW") return 1.0;
  if (stressLevel === "MID") return 0.92;
  if (stressLevel === "HIGH") return 0.78;
  return 0.92;
};

const riskCrowdingMultiplier = (crowdingRisk: TernaryRisk | undefined): number => {
  if (crowdingRisk === "LOW") return 1.0;
  if (crowdingRisk === "MID") return 0.95;
  if (crowdingRisk === "HIGH") return 0.88;
  return 0.95;
};

const riskCascadeMultiplier = (cascadeRisk: TernaryRisk | undefined): number => {
  if (cascadeRisk === "LOW") return 1.0;
  if (cascadeRisk === "MID") return 0.93;
  if (cascadeRisk === "HIGH") return 0.82;
  return 0.93;
};

const computeRegimeModifier = (
  breakoutOnly: boolean,
  regime: Regime | undefined,
  compression: Compression | undefined,
  trendStrength: TrendStrength | undefined,
  structureAge: StructureAge | undefined,
): number => {
  let value = 1.0;
  if (breakoutOnly) {
    if (compression === "ON" && (regime === "RANGE" || regime === "MIXED")) value = 1.03;
    else value = 0.95;
  } else {
    if (regime === "TREND" && trendStrength === "HIGH") value = 1.03;
    else if (regime === "RANGE" && structureAge === "MATURE") value = 0.95;
  }
  return clamp(value, 0.88, 1.05);
};

const computeMicrostructureModifier = (
  depthQuality: DepthQuality | undefined,
  spreadRegime: SpreadRegime | undefined,
  spoofRisk: TernaryRisk | undefined,
  slippageLevel: SlippageLevel | undefined,
): number => {
  let mm = 1.0;
  if (depthQuality === "POOR" || spreadRegime === "WIDE") mm *= 0.9;
  if (spoofRisk === "HIGH") mm *= 0.92;
  if (slippageLevel === "HIGH") mm *= 0.9;
  return clamp(mm, 0.85, 1.0);
};

const computeStructureQuality01 = (
  structureScore: number,
  regime: Regime | undefined,
  trendStrength: TrendStrength | undefined,
  structureAge: StructureAge | undefined,
  compression: Compression | undefined,
): number => {
  let value = score01(structureScore);
  if (regime === "TREND" && (trendStrength === "MID" || trendStrength === "HIGH")) value += 0.04;
  if (structureAge === "MATURE") value += 0.02;
  if (regime === "RANGE" && compression === "OFF") value -= 0.03;
  return clamp(value, 0, 1);
};

const latencyPenalty = (latencyMs: number): number => {
  void latencyMs;
  return 0;
};

const degradedFeedsPenalty = (feeds: BalancedDataHealth["feeds"]): number => {
  const keys: Array<keyof BalancedDataHealth["feeds"]> = ["ohlcv", "orderbook", "oi", "funding", "netflow", "trades"];
  const degraded = keys.filter((k) => feeds[k] === "degraded").length;
  return Math.min(0.08, degraded * 0.02);
};

const addReason = (reasons: ReasonEntry[], text: string, impact: number) => {
  reasons.push({ text, impact });
};

const finalizeReasons = (reasons: ReasonEntry[], fallback: string[] = []): string[] => {
  const ranked = reasons
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 7)
    .map((r) => r.text);
  const unique = new Set(ranked);
  for (const text of fallback) {
    if (unique.size >= 7) break;
    if (!text) continue;
    unique.add(text);
  }
  const out = Array.from(unique).slice(0, 7);
  if (out.length >= 3) return out;
  const minFallback = [
    "Balanced mode active",
    "Consensus uses risk, execution, and structure quality",
    "Decision reflects current gates and penalties",
  ];
  for (const text of minFallback) {
    if (out.length >= 3) break;
    if (!out.includes(text)) out.push(text);
  }
  return out.slice(0, 7);
};

export const computeBalancedConsensus = (input: BalancedConsensusInput): BalancedConsensusOutput => {
  const reasons: ReasonEntry[] = [];
  const breakoutOnly = Boolean(input.breakoutOnly);

  const structureScore = safeNumber(input.structureScore, 50);
  const liquidityScore = safeNumber(input.liquidityScore, 50);
  const positioningScore = safeNumber(input.positioningScore, 50);
  const executionScore = safeNumber(input.executionScore, 50);

  const pFill = clamp(safeNumber(input.pFill, 0.5), 0, 1);
  const capacity = clamp(safeNumber(input.capacity, 0.5), 0, 1);

  let edgeCore = normalizeBalancedRiskAdjEdge(safeNumber(input.riskAdjEdgeR, 0));
  if (typeof input.pWin === "number") {
    const pWinMultiplier = (clamp((input.pWin - 0.52) / 0.28, 0, 1) * 0.65) + 0.35;
    edgeCore *= pWinMultiplier;
  }
  if (typeof input.expectedRR === "number" && input.expectedRR < 1) edgeCore *= 0.9;
  if (typeof input.costR === "number" && input.costR > 0.45) edgeCore *= 0.85;
  if (typeof input.pStop === "number" && input.pStop > 0.35) edgeCore *= 0.85;
  if (input.asymmetry === "RISK_DOMINANT") edgeCore *= 0.85;
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
  const agreementQ = 0.9 + (0.1 * agreementScore01);

  const structureQuality01 = computeStructureQuality01(
    structureScore,
    input.regime,
    input.trendStrength,
    input.structureAge,
    input.compression,
  );
  const positioning01 = score01(positioningScore);
  const liquidity01 = score01(liquidityScore);
  const executionLayer01 = score01(executionScore);
  const execution01 = (0.5 * executionLayer01) + (0.5 * executionCertainty01);

  let base01 =
    (0.33 * structureQuality01) +
    (0.22 * positioning01) +
    (0.14 * liquidity01) +
    (0.19 * execution01) +
    (0.12 * edge01);
  base01 = clamp(base01 * agreementQ, 0, 1);
  const baseScore = roundTo2(base01 * 100);

  const rem = clamp(
    riskStressMultiplier(input.stressLevel) *
      riskCrowdingMultiplier(input.crowdingRisk) *
      riskCascadeMultiplier(input.cascadeRisk),
    0.72,
    1.0,
  );
  const rm = computeRegimeModifier(breakoutOnly, input.regime, input.compression, input.trendStrength, input.structureAge);
  const mm = computeMicrostructureModifier(input.depthQuality, input.spreadRegime, input.spoofRisk, input.slippageLevel);
  const adjusted01 = clamp(base01 * rem * rm * mm, 0, 1);
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
    capacity: "PASS" as "PASS" | "BLOCK",
  };

  if (dataBlocked) {
    gates.risk = "BLOCK";
    gates.entry = "BLOCK";
    gates.fill = "BLOCK";
    gates.capacity = "BLOCK";
    addReason(reasons, "Data gate BLOCK", 10_000);
    const outputBlocked: BalancedConsensusOutput = {
      mode: "BALANCED",
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
          structureQuality01: roundTo2(structureQuality01),
          positioning01: roundTo2(positioning01),
          liquidity01: roundTo2(liquidity01),
          executionLayer01: roundTo2(executionLayer01),
          executionCertainty01: roundTo2(executionCertainty01),
          execution01: roundTo2(execution01),
          edge01: roundTo2(edge01),
          agreement01: roundTo2(agreement01),
          agreementScore01: roundTo2(agreementScore01),
          base01: roundTo2(base01),
        },
        modifiers: {
          agreementQ: roundTo2(agreementQ),
          riskEnvironmentModifier: roundTo2(rem),
          regimeModifier: roundTo2(rm),
          microstructureModifier: roundTo2(mm),
        },
        penalties: {
          latencyPenalty: 0,
          slippagePenalty: 0,
          spoofPenalty: 0,
          stressPenalty: 0,
          degradedFeedsPenalty: 0,
          liquidityLowPenalty: 0,
          entryClosedPenalty: 0,
          penaltyRate: 0,
        },
      },
    };
    return outputBlocked;
  }

  const riskBlocked = input.stressLevel === "HIGH" && input.cascadeRisk === "HIGH";
  const entryBlocked = false;
  const fillBlocked = typeof input.pFill === "number" && input.pFill < 0.15;
  const capacityBlocked = typeof input.capacity === "number" && input.capacity < 0.2;

  gates.risk = riskBlocked ? "BLOCK" : "PASS";
  gates.entry = entryBlocked ? "BLOCK" : "PASS";
  gates.fill = fillBlocked ? "BLOCK" : "PASS";
  gates.capacity = capacityBlocked ? "BLOCK" : "PASS";

  if (riskBlocked) addReason(reasons, `Risk gate BLOCK: stress ${input.stressLevel ?? "UNKNOWN"} / cascade ${input.cascadeRisk ?? "UNKNOWN"}`, 900);
  if (entryBlocked) addReason(reasons, "Entry gate BLOCK: entry window CLOSED", 850);
  if (fillBlocked) addReason(reasons, `Fill gate BLOCK: pFill ${roundTo2(input.pFill ?? 0)}`, 820);
  if (capacityBlocked) addReason(reasons, `Capacity gate BLOCK: capacity ${roundTo2(input.capacity ?? 0)}`, 780);

  const latencyP = latencyPenalty(Math.max(0, safeNumber(input.dataHealth.latencyMs, 0)));
  const slippageP = input.slippageLevel === "HIGH" ? 0.06 : input.slippageLevel === "MED" ? 0.03 : 0;
  const spoofP = input.spoofRisk === "HIGH" ? 0.05 : input.spoofRisk === "MID" ? 0.02 : 0;
  const stressP = input.stressLevel === "HIGH" ? 0.08 : input.stressLevel === "MID" ? 0.04 : 0;
  const degradedP = degradedFeedsPenalty(input.dataHealth.feeds ?? {});
  const liquidityLowP = input.liquidityDensity === "LOW" ? 0.05 : 0;
  const entryClosedP = input.entryWindow === "CLOSED" ? 0.06 : 0;

  const rawPenaltyRate = clamp(
    latencyP + slippageP + spoofP + stressP + degradedP + liquidityLowP + entryClosedP,
    0,
    0.45,
  );
  const penaltyRate = roundTo2(rawPenaltyRate * 0.3);

  if (latencyP > 0) addReason(reasons, `Penalty: latency ${Math.round(input.dataHealth.latencyMs)}ms`, latencyP * 1000);
  if (slippageP > 0) addReason(reasons, `Penalty: slippage ${input.slippageLevel}`, slippageP * 1000);
  if (spoofP > 0) addReason(reasons, `Penalty: spoof risk ${input.spoofRisk}`, spoofP * 900);
  if (stressP > 0) addReason(reasons, `Penalty: stress ${input.stressLevel}`, stressP * 900);
  if (degradedP > 0) addReason(reasons, "Penalty: degraded feeds", degradedP * 900);
  if (liquidityLowP > 0) addReason(reasons, "Penalty: liquidity density LOW", 650);

  let finalScore = roundTo2(clamp(adjusted01 * (1 - penaltyRate), 0, 1) * 100 + 8);
  const anyHardBlock = riskBlocked || entryBlocked || fillBlocked || capacityBlocked;
  if (anyHardBlock) finalScore = roundTo2(Math.min(finalScore, 45));

  let decision: "TRADE" | "WATCH" | "NO_TRADE" = "NO_TRADE";
  if (anyHardBlock || gates.data === "BLOCK") {
    decision = "NO_TRADE";
  } else if (finalScore >= 58) {
    decision = "TRADE";
  } else if (finalScore >= 42) {
    decision = "WATCH";
  } else {
    decision = "NO_TRADE";
  }

  if (decision === "TRADE") {
    addReason(reasons, "Strong structure alignment", 220);
    if (executionCertainty01 >= 0.7) addReason(reasons, "Clean execution conditions", 210);
    if (edge01 >= 0.6) addReason(reasons, "Edge quality acceptable", 200);
  }

  return {
    mode: "BALANCED",
    baseScore,
    adjustedScore,
    penaltyRate,
    finalScore,
    gates,
    decision,
    reasons: finalizeReasons(reasons, [
      decision === "TRADE" ? "Trade conditions passed Balanced thresholds" : "Trade conditions not fully confirmed",
      `Final score ${roundTo2(finalScore)} with penalty rate ${roundTo2(penaltyRate)}`,
      anyHardBlock ? "At least one hard gate is BLOCK" : "All hard gates are PASS",
    ]),
    diagnostics: {
      componentScores: {
        structureQuality01: roundTo2(structureQuality01),
        positioning01: roundTo2(positioning01),
        liquidity01: roundTo2(liquidity01),
        executionLayer01: roundTo2(executionLayer01),
        executionCertainty01: roundTo2(executionCertainty01),
        execution01: roundTo2(execution01),
        edge01: roundTo2(edge01),
        agreement01: roundTo2(agreement01),
        agreementScore01: roundTo2(agreementScore01),
        base01: roundTo2(base01),
      },
      modifiers: {
        agreementQ: roundTo2(agreementQ),
        riskEnvironmentModifier: roundTo2(rem),
        regimeModifier: roundTo2(rm),
        microstructureModifier: roundTo2(mm),
      },
      penalties: {
        latencyPenalty: roundTo2(latencyP),
        slippagePenalty: roundTo2(slippageP),
        spoofPenalty: roundTo2(spoofP),
        stressPenalty: roundTo2(stressP),
        degradedFeedsPenalty: roundTo2(degradedP),
        liquidityLowPenalty: roundTo2(liquidityLowP),
        entryClosedPenalty: roundTo2(entryClosedP),
        penaltyRate: roundTo2(penaltyRate),
      },
    },
  };
};
