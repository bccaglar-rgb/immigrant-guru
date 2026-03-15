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
  if (spreadRegime === "MID") return 0.96;
  if (spreadRegime === "WIDE") return 0.88;
  return 0.94;
};

const depthMultiplier = (depthQuality: DepthQuality | undefined): number => {
  if (depthQuality === "GOOD") return 1.0;
  if (depthQuality === "MID") return 0.95;
  if (depthQuality === "POOR") return 0.84;
  return 0.92;
};

const liquidityDensityMultiplier = (liquidityDensity: LiquidityDensity | undefined): number => {
  if (liquidityDensity === "HIGH") return 1.0;
  if (liquidityDensity === "MID") return 0.96;
  if (liquidityDensity === "LOW") return 0.90;
  return 0.94;
};

const spoofMultiplier = (spoofRisk: TernaryRisk | undefined): number => {
  if (spoofRisk === "LOW") return 1.0;
  if (spoofRisk === "MID") return 0.96;
  if (spoofRisk === "HIGH") return 0.90;
  return 0.94;
};

const slippageMultiplier = (slippageLevel: SlippageLevel | undefined): number => {
  if (slippageLevel === "LOW") return 1.0;
  if (slippageLevel === "MED") return 0.96;
  if (slippageLevel === "HIGH") return 0.90;
  return 0.94;
};

const conflictMultiplier = (conflictLevel: ConflictLevel | undefined): number => {
  if (conflictLevel === "LOW") return 1.0;
  if (conflictLevel === "MID") return 0.96;
  if (conflictLevel === "HIGH") return 0.90;
  return 0.94;
};

const remStressMultiplier = (stressLevel: TernaryRisk | undefined): number => {
  if (stressLevel === "LOW") return 1.0;
  if (stressLevel === "MID") return 0.96;
  if (stressLevel === "HIGH") return 0.90;
  return 0.96;
};

const remCrowdingMultiplier = (crowdingRisk: TernaryRisk | undefined): number => {
  if (crowdingRisk === "LOW") return 1.0;
  if (crowdingRisk === "MID") return 0.98;
  if (crowdingRisk === "HIGH") return 0.94;
  return 0.97;
};

const remCascadeMultiplier = (cascadeRisk: TernaryRisk | undefined): number => {
  if (cascadeRisk === "LOW") return 1.0;
  if (cascadeRisk === "MID") return 0.97;
  if (cascadeRisk === "HIGH") return 0.92;
  return 0.96;
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

  let base01 =
    (0.45 * momentum01) +
    (0.15 * structure01) +
    (0.15 * positioning01) +
    (0.1 * liquidity01) +
    (0.1 * executionCertainty01) +
    (0.05 * edge01);
  base01 = clamp(base01 * agreementQ, 0, 1);
  const baseScore = roundTo2(base01 * 100);

  const rem = clamp(
    remStressMultiplier(input.stressLevel) *
      remCrowdingMultiplier(input.crowdingRisk) *
      remCascadeMultiplier(input.cascadeRisk),
    0.84,
    1.0,
  );
  const bm = computeBreakoutModifier(breakoutOnly, input.compression, input.regime, input.trendStrength);
  const vm = computeVolatilityModifier(input.atrRegime, input.marketSpeed);
  const momentumLift = momentum01 >= 0.7 ? 0.14 : momentum01 >= 0.55 ? 0.10 : momentum01 >= 0.4 ? 0.06 : 0.02;
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
  const entryBlocked = false;
  const fillBlocked = typeof input.pFill === "number" && input.pFill < 0.08;

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

  // User requested: no penalty deduction in Velocity mode.
  const latencyP = 0;
  const slippageP = 0;
  const spoofP = 0;
  const suddenMoveP = 0;
  const fakeBreakoutP = 0;
  const degradedP = 0;
  const penaltyRate = 0;

  const opportunityUplift =
    (input.volumeSpike === "ON" ? 5 : 0) +
    (input.impulseReadiness === "HIGH" ? 4 : input.impulseReadiness === "MID" ? 2 : 0) +
    (input.marketSpeed === "FAST" ? 3 : input.marketSpeed === "NORMAL" ? 1 : 0) +
    (input.regime === "TREND" ? 3 : input.regime === "MIXED" ? 1 : 0) +
    (input.atrRegime === "HIGH" ? 2 : input.atrRegime === "MID" ? 1 : 0);
  let finalScore = roundTo2(clamp((adjusted01 * 100) + opportunityUplift + 4, 0, 100));
  const anyHardBlock = riskBlocked || entryBlocked || fillBlocked;
  if (anyHardBlock) finalScore = roundTo2(Math.min(finalScore, 52));

  let decision: "TRADE" | "WATCH" | "NO_TRADE" = "NO_TRADE";
  if (anyHardBlock || gates.data === "BLOCK") {
    decision = "NO_TRADE";
  } else if (finalScore >= 70) {
    decision = "TRADE";
  } else if (finalScore >= 55) {
    decision = "WATCH";
  } else {
    decision = "NO_TRADE";
  }

  if (decision === "TRADE") {
    if (momentum01 >= 0.7) addReason(reasons, "Momentum strong", 260);
    if (input.marketSpeed === "FAST") addReason(reasons, "Speed FAST", 250);
    if (input.atrRegime === "HIGH") addReason(reasons, "ATR HIGH", 240);
    if (input.volumeSpike === "ON") addReason(reasons, "Volume spike ON", 230);
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
