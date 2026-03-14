import type { ScoringMode } from "../types";

export type ScoringConfig = {
  sigmoidK: number;
  edgeBaselineR: number;
  minFloor: number;
  riskModel: "EXP" | "LINEAR";
  penaltyModel: "SUBTRACT" | "MULTIPLY";
  linearRiskSlope?: number;
  linearRiskFloor?: number;
  flowWeights?: {
    momentum: number;
    volumeSpike: number;
    liquiditySweep: number;
    chopPenalty: number;
  };
  gates: {
    minFillProb: number;
    minEdgeR: number;
    minCapacity: number;
  };
};

export const SCORING_CONFIG: Record<ScoringMode, ScoringConfig> = {
  AGGRESSIVE: {
    sigmoidK: 4.0,
    edgeBaselineR: 0.16,
    minFloor: 12,
    riskModel: "LINEAR",
    penaltyModel: "MULTIPLY",
    linearRiskSlope: 0.3,
    linearRiskFloor: 0.5,
    flowWeights: {
      momentum: 0.14,
      volumeSpike: 0.12,
      liquiditySweep: 0.1,
      chopPenalty: 0.06,
    },
    gates: { minFillProb: 0.28, minEdgeR: -0.02, minCapacity: 0.16 },
  },
  BALANCED: {
    sigmoidK: 5.4,
    edgeBaselineR: 0.17,
    minFloor: 10,
    riskModel: "LINEAR",
    penaltyModel: "MULTIPLY",
    linearRiskSlope: 0.5,
    linearRiskFloor: 0.35,
    gates: { minFillProb: 0.42, minEdgeR: -0.005, minCapacity: 0.26 },
  },
  FLOW: {
    sigmoidK: 7.2,
    edgeBaselineR: 0.1,
    minFloor: 0,
    riskModel: "LINEAR",
    penaltyModel: "MULTIPLY",
    linearRiskSlope: 0.4,
    linearRiskFloor: 0.45,
    gates: { minFillProb: 0.2, minEdgeR: -0.02, minCapacity: 0.2 },
  },
  CAPITAL_GUARD: {
    sigmoidK: 12,
    edgeBaselineR: 0.12,
    minFloor: 10,
    riskModel: "EXP",
    penaltyModel: "MULTIPLY",
    gates: { minFillProb: 0.72, minEdgeR: 0.05, minCapacity: 0.70 },
  },
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const compressUpperTail = (score: number, knee: number, scale: number) => {
  if (score <= knee) return score;
  const span = 100 - knee;
  const compressed = knee + (span * (1 - Math.exp(-(score - knee) / Math.max(1, scale))));
  return compressed;
};

export type ScoreGateFlag = "LOW_FILL_PROB" | "LOW_EDGE" | "LOW_CAPACITY";

export type ComputeScoreInput = {
  mode: ScoringMode;
  profile?: "SCALP" | "INTRADAY" | "SWING";
  edgeNetR: number;
  pFill: number;
  capacity: number;
  inputModifier: number;
  stress: number;
  shock: number;
  chop: number;
  crowding: number;
  penaltyPoints: number;
  momentum?: number;
  volumeSpike?: number;
  liquiditySweep?: number;
  coreConsensus?: number;
  fillFailure?: number;
  slippageFailure?: number;
  microFailure?: number;
  stressFailure?: number;
  cascadeFailure?: number;
  crowdingFailure?: number;
  structureScore?: number;
  liquidityScore?: number;
  positioningScore?: number;
  executionScore?: number;
  volatilityScore?: number;
  entryQualityScore?: number;
  liquidityDensityState?: "LOW" | "MID" | "HIGH" | "UNKNOWN";
  slippageLevelState?: "LOW" | "MED" | "HIGH" | "UNKNOWN";
  depthQualityState?: "GOOD" | "MID" | "POOR" | "UNKNOWN";
  spreadRegimeState?: "TIGHT" | "MID" | "NORMAL" | "WIDE" | "UNKNOWN";
  spoofRiskState?: "LOW" | "MID" | "HIGH" | "STABLE" | "SHIFTING" | "SPOOF_RISK" | "UNKNOWN";
  feedLatencyMs?: number;
  latencyMs?: number;
  degradedFeedsCount?: number;
  hardBlockExecution?: boolean;
  dataHealthFail?: boolean;
  entryClosed?: boolean;
  flowPanels?: Array<{
    key: string;
    include: boolean;
    rawScore: number;
    weight?: number;
  }>;
};

export type ComputeScoreResult = {
  mode: ScoringMode;
  finalScore: number;
  rawScore: number;
  baseScore: number;
  penalizedScore: number;
  edgeAdj: number;
  riskAdj: number;
  executionMultiplier: number;
  riskMultiplier: number;
  coreConsensus: number;
  aPlusFloorApplied: boolean;
  hardBlocked: boolean;
  penaltyModel: "SUBTRACT" | "MULTIPLY";
  penaltyRate: number;
  penaltyApplied: number;
  gatingFlags: ScoreGateFlag[];
  scoreBreakdown: {
    edgeAdj: number;
    riskAdj: number;
    pFill: number;
    capacity: number;
    inputModifier: number;
    penaltyPoints: number;
    flowBonus?: number;
    executionMultiplier: number;
    riskMultiplier: number;
    aPlusFloorApplied: boolean;
  };
  formulaPreview: string;
};

export const SCORING_MODE_OPTIONS: Array<{ id: ScoringMode; label: string; description: string; userSelectable: boolean }> = [
  { id: "FLOW", label: "Flow", description: "User configurable ultra-aggressive profile", userSelectable: true },
  { id: "AGGRESSIVE", label: "Aggressive", description: "High-frequency shared profile", userSelectable: true },
  { id: "BALANCED", label: "Balanced", description: "Balanced shared profile", userSelectable: true },
  { id: "CAPITAL_GUARD", label: "Capital Guard", description: "Protection-first shared profile", userSelectable: true },
];

const SCORING_MODE_META = new Map(
  SCORING_MODE_OPTIONS.map((item) => [item.id, item] as const),
);

export const scoringModeDescription = (mode: ScoringMode): string =>
  SCORING_MODE_META.get(mode)?.description ?? SCORING_MODE_META.get("BALANCED")?.description ?? "Balanced scoring";

export const scoringModeLabel = (mode: ScoringMode): string =>
  SCORING_MODE_META.get(mode)?.label ?? SCORING_MODE_META.get("BALANCED")?.label ?? "Balanced";

export const isUserSelectableScoringMode = (mode: ScoringMode): boolean =>
  SCORING_MODE_META.get(mode)?.userSelectable ?? false;

export const computeScore = (input: ComputeScoreInput): ComputeScoreResult => {
  const cfg = SCORING_CONFIG[input.mode];
  const isFlowMode = input.mode === "FLOW";
  const isAggressiveMode = input.mode === "AGGRESSIVE";
  const isBalancedMode = input.mode === "BALANCED";
  const isCapitalGuardMode = input.mode === "CAPITAL_GUARD";
  const profile = input.profile ?? "INTRADAY";
  const chop = clamp(input.chop, 0, 1);
  const stressFailure = clamp(input.stressFailure ?? input.stress, 0, 1);
  const cascadeFailure = clamp(input.cascadeFailure ?? input.shock, 0, 1);
  const crowdingFailure = clamp(input.crowdingFailure ?? input.crowding, 0, 1);
  const momentum = clamp(input.momentum ?? 0, 0, 1);
  const volumeSpike = clamp(input.volumeSpike ?? 0, 0, 1);
  const liquiditySweep = clamp(input.liquiditySweep ?? 0, 0, 1);
  const slippageFailure = clamp(input.slippageFailure ?? 0, 0, 1);
  const microFailure = clamp(input.microFailure ?? 0, 0, 1);
  const structureScore = clamp(input.structureScore ?? 50, 0, 100);
  const liquidityScore = clamp(input.liquidityScore ?? 50, 0, 100);
  const positioningScore = clamp(input.positioningScore ?? 50, 0, 100);
  const executionScore = clamp(input.executionScore ?? 50, 0, 100);
  const volatilityScore = clamp(input.volatilityScore ?? 50, 0, 100);
  // Flatter curve prevents 70-80 layer scores from saturating too close to 100.
  const scoreCurve = (value: number) => 1 / (1 + Math.exp(-(value - 50) / 18));
  const structureCurve = scoreCurve(structureScore);
  const liquidityCurve = scoreCurve(liquidityScore);
  const positioningCurve = scoreCurve(positioningScore);
  const executionCurve = scoreCurve(executionScore);
  const volatilityCurve = scoreCurve(volatilityScore);
  const entryQualityCurve = scoreCurve(clamp(input.entryQualityScore ?? 50, 0, 100));
  const edgeQuality = clamp(scoreCurve(50 + input.edgeNetR * 120), 0, 1);
  const entryQualityWeight = isAggressiveMode
    ? 0.12
    : isBalancedMode
      ? 0.15
      : isCapitalGuardMode
        ? 0.2
        : 0.1;
  const baseAlphaNoEntry = isAggressiveMode
    ? (
      (0.20 * structureCurve) +
      (0.25 * liquidityCurve) +
      (0.30 * positioningCurve) +
      (0.15 * executionCurve) +
      (0.10 * volatilityCurve)
    )
    : isBalancedMode
      ? (
        (0.30 * structureCurve) +
        (0.20 * liquidityCurve) +
        (0.20 * positioningCurve) +
        (0.20 * executionCurve) +
        (0.10 * volatilityCurve)
      )
      : isCapitalGuardMode
        ? (
          (0.35 * structureCurve) +
          (0.10 * liquidityCurve) +
          (0.10 * positioningCurve) +
          (0.25 * executionCurve) +
          (0.20 * edgeQuality)
        )
        : (
          (0.26 * structureCurve) +
          (0.18 * liquidityCurve) +
          (0.26 * positioningCurve) +
          (0.18 * executionCurve) +
          (0.12 * volatilityCurve)
        );
  const coreAlpha01 = ((1 - entryQualityWeight) * baseAlphaNoEntry) + (entryQualityWeight * entryQualityCurve);
  const coreAlpha = clamp(100 * coreAlpha01, 0, 100);
  const liquidityBoost =
    input.liquidityDensityState === "HIGH" ? 0.04
      : input.liquidityDensityState === "MID" ? 0.02
        : input.liquidityDensityState === "LOW" ? -0.02
          : 0;
  const fillBoost = clamp(0.08 * (input.pFill - 0.5), -0.04, 0.04);
  const slipSeverity =
    input.slippageLevelState === "LOW" ? 0
      : input.slippageLevelState === "MED" ? 0.5
        : input.slippageLevelState === "HIGH" ? 1
          : slippageFailure;
  const depthSeverity =
    input.depthQualityState === "GOOD" ? 0
      : input.depthQualityState === "MID" ? 0.5
        : input.depthQualityState === "POOR" ? 1
          : 0.5;
  const spreadSeverity =
    input.spreadRegimeState === "TIGHT" ? 0
      : (input.spreadRegimeState === "MID" || input.spreadRegimeState === "NORMAL") ? 0.5
        : input.spreadRegimeState === "WIDE" ? 1
          : 0.5;
  const spoofSeverity =
    (input.spoofRiskState === "LOW" || input.spoofRiskState === "STABLE") ? 0
      : (input.spoofRiskState === "MID" || input.spoofRiskState === "SHIFTING") ? 0.5
        : (input.spoofRiskState === "HIGH" || input.spoofRiskState === "SPOOF_RISK") ? 1
          : 0.5;
  const microSeverity = clamp(
    input.microFailure != null ? microFailure : ((depthSeverity + spreadSeverity) / 2),
    0,
    1,
  );
  const frictionPenalty = isAggressiveMode
    ? (0.042 * slipSeverity) + (0.036 * microSeverity) + (0.026 * spoofSeverity)
    : isBalancedMode
      ? (0.060 * slipSeverity) + (0.050 * microSeverity) + (0.040 * spoofSeverity)
      : isCapitalGuardMode
        ? (0.080 * slipSeverity) + (0.060 * microSeverity) + (0.050 * spoofSeverity)
        : (0.050 * slipSeverity) + (0.040 * microSeverity) + (0.030 * spoofSeverity);
  const executionFloor = isAggressiveMode
    ? 0.78
    : isBalancedMode
      ? 0.70
      : isCapitalGuardMode
        ? 0.80
        : 0.72;
  const tradeabilityMultiplier = clamp(1 + liquidityBoost + fillBoost - frictionPenalty, executionFloor, 1.02);
  const latencyPenalty = 0;
  const degradedPenalty = clamp((input.degradedFeedsCount ?? 0) * 0.01, 0, 0.04);
  const riskFloor = isAggressiveMode
    ? 0.78
    : isBalancedMode
      ? 0.76
      : isCapitalGuardMode
        ? 0.84
        : 0.74;
  const baseReliability = clamp(1 - latencyPenalty - degradedPenalty, riskFloor, 1);

  if (isFlowMode) {
    // FLOW single-authority fill policy (two-band):
    // - Hard block only below 0.15
    // - Gate warning band below 0.25
    const FLOW_HARD_BLOCK_PFILL = 0.15;
    const FLOW_GATE_MIN_PFILL = 0.25;

    const flowPanels = (input.flowPanels ?? []).filter((panel) => panel.include);
    const totalWeight = flowPanels.reduce((sum, panel) => sum + Math.max(0, Number(panel.weight ?? 3)), 0);
    const coreActive = totalWeight > 0
      ? flowPanels.reduce(
        (sum, panel) => sum + (clamp(panel.rawScore, 0, 100) * (Math.max(0, Number(panel.weight ?? 3)) / totalWeight)),
        0,
      )
      : 0;
    const fillShort = clamp((0.45 - input.pFill) / 0.25, 0, 1);
    const micro = clamp((depthSeverity + spreadSeverity + spoofSeverity) / 3, 0, 1);
    const penX = (0.20 * fillShort) + (0.10 * slipSeverity) + (0.10 * micro);
    const executionMultiplier = clamp(1 - penX, 0.75, 1.0);
    const penR = (0.12 * stressFailure) + (0.10 * cascadeFailure) + (0.05 * crowdingFailure);
    const riskMultiplier = clamp(1 - penR, 0.75, 1.0);
    const latPen = 0;
    const degrPen = clamp((input.degradedFeedsCount ?? 0) * 0.01, 0, 0.04);
    const dataMultiplier = clamp(1 - latPen - degrPen, 0.85, 1.0);
    const hardTradeabilityBlock =
      Boolean(input.dataHealthFail) ||
      input.pFill < FLOW_HARD_BLOCK_PFILL ||
      (input.depthQualityState === "POOR" && input.spreadRegimeState === "WIDE" && input.slippageLevelState === "HIGH");
    const modeBias = 1.15;
    const finalRaw = Boolean(input.dataHealthFail) || totalWeight <= 0
      ? 0
      : clamp(coreActive * executionMultiplier * riskMultiplier * dataMultiplier * modeBias, 0, 100);
    const gatingFlags: ScoreGateFlag[] = [];
    if (input.pFill < FLOW_GATE_MIN_PFILL) gatingFlags.push("LOW_FILL_PROB");
    if (input.edgeNetR < cfg.gates.minEdgeR) gatingFlags.push("LOW_EDGE");
    if (input.capacity < cfg.gates.minCapacity) gatingFlags.push("LOW_CAPACITY");
    const penaltyRate = 0;
    const riskAdj = clamp(executionMultiplier * riskMultiplier * dataMultiplier, 0, 1.05);
    const flowDisplay = Number(compressUpperTail(finalRaw, 72, 16).toFixed(2));
    const finalScore = Boolean(input.dataHealthFail) || totalWeight <= 0
      ? 0
      : hardTradeabilityBlock
        ? Math.min(flowDisplay, 42)
        : flowDisplay;
    return {
      mode: input.mode,
      finalScore,
      rawScore: Number(coreActive.toFixed(2)),
      baseScore: Number((coreActive * executionMultiplier * riskMultiplier * dataMultiplier).toFixed(2)),
      penalizedScore: finalScore,
      edgeAdj: Math.max(0, input.edgeNetR + cfg.edgeBaselineR),
      riskAdj,
      executionMultiplier,
      riskMultiplier: Number((riskMultiplier * dataMultiplier).toFixed(4)),
      coreConsensus: Number(coreActive.toFixed(2)),
      aPlusFloorApplied: false,
      hardBlocked: hardTradeabilityBlock || totalWeight <= 0,
      penaltyModel: cfg.penaltyModel,
      penaltyRate,
      penaltyApplied: 0,
      gatingFlags,
      scoreBreakdown: {
        edgeAdj: Math.max(0, input.edgeNetR + cfg.edgeBaselineR),
        riskAdj,
        pFill: input.pFill,
        capacity: input.capacity,
        inputModifier: 1,
        penaltyPoints: input.penaltyPoints,
        executionMultiplier,
        riskMultiplier: Number((riskMultiplier * dataMultiplier).toFixed(4)),
        aPlusFloorApplied: false,
      },
      formulaPreview: `FLOW: Final = CoreActive(${coreActive.toFixed(2)}) * X(${executionMultiplier.toFixed(2)}) * R(${riskMultiplier.toFixed(2)}) * D(${dataMultiplier.toFixed(2)}) * Bias(1.15)`,
    };
  }

  const reliabilityModeMultiplier = isAggressiveMode
    ? clamp(1 - (0.03 * stressFailure) - (0.05 * cascadeFailure), 0.92, 1)
    : isBalancedMode
      ? clamp(1 - (0.08 * stressFailure) - (0.09 * cascadeFailure), 0.84, 1)
      : isCapitalGuardMode
        ? clamp(1 - (0.12 * stressFailure) - (0.14 * cascadeFailure), 0.82, 1)
        : clamp(1 - (0.06 * stressFailure) - (0.08 * cascadeFailure) - (0.04 * crowdingFailure), 0.84, 1);
  const reliabilityMultiplier = clamp(baseReliability * reliabilityModeMultiplier, riskFloor, 1);
  const baseBeforeClamp = coreAlpha * tradeabilityMultiplier * reliabilityMultiplier;
  const baseScoreCore = clamp(baseBeforeClamp, 0, 100);
  const flowBonus = cfg.flowWeights
    ? (cfg.flowWeights.momentum * momentum) +
      (cfg.flowWeights.volumeSpike * volumeSpike) +
      (cfg.flowWeights.liquiditySweep * liquiditySweep) -
      (cfg.flowWeights.chopPenalty * chop)
    : 0;
  const inputModifierFloor = isAggressiveMode
    ? 0.88
    : isBalancedMode
      ? 0.84
      : isCapitalGuardMode
        ? 0.72
        : 0.84;
  const effectiveInputModifier = clamp(input.inputModifier, inputModifierFloor, 1.05);
  const modeBiasBase = isAggressiveMode
    ? 1.16
    : isBalancedMode
      ? 0.95
      : isCapitalGuardMode
        ? 0.88
        : 1;
  const modeFlowMultiplier = isAggressiveMode
    ? clamp(1 + (0.32 * flowBonus), 0.99, 1.22)
    : 1;
  const modeBias = modeBiasBase * modeFlowMultiplier;
  const modeOffset = isAggressiveMode
    ? 8
    : isBalancedMode
      ? -3
      : isCapitalGuardMode
        ? -10
        : 0;
  const baseAfterMode = clamp((baseScoreCore * modeBias * effectiveInputModifier) + modeOffset, 0, 100);
  const riskAdj = clamp(tradeabilityMultiplier * reliabilityMultiplier, 0, 1.05);
  const riskAdjustedEdgeR = input.edgeNetR * riskAdj;
  const hardTradeabilityBlock = input.pFill < 0.2 ||
    (input.depthQualityState === "POOR" && input.spreadRegimeState === "WIDE" && input.slippageLevelState === "HIGH");
  const edgeAdj = Math.max(0, input.edgeNetR + cfg.edgeBaselineR + flowBonus);
  const executionMultiplier = tradeabilityMultiplier;
  const riskMultiplier = reliabilityMultiplier;
  const rawScore = coreAlpha;
  const coreConsensus = baseScoreCore;
  const hardBlocked = Boolean(input.hardBlockExecution) || hardTradeabilityBlock;

  const gatingFlags: ScoreGateFlag[] = [];
  if (input.pFill < cfg.gates.minFillProb) gatingFlags.push("LOW_FILL_PROB");
  if (input.edgeNetR < cfg.gates.minEdgeR) gatingFlags.push("LOW_EDGE");
  if (input.capacity < cfg.gates.minCapacity) gatingFlags.push("LOW_CAPACITY");
  const aPlusSetup = (
    (isCapitalGuardMode
      ? structureScore >= 78 && positioningScore >= 75 && riskAdjustedEdgeR >= 0.1
      : isBalancedMode
        ? structureScore >= 74 && positioningScore >= 72 && riskAdjustedEdgeR >= 0.09
        : structureScore >= 70 && positioningScore >= 68 && riskAdjustedEdgeR >= 0.08) &&
    executionMultiplier >= (isCapitalGuardMode ? 0.92 : isBalancedMode ? 0.88 : 0.85) &&
    riskMultiplier >= (isCapitalGuardMode ? 0.92 : isBalancedMode ? 0.88 : 0.85) &&
    gatingFlags.length === 0
  );

  const latencyMul = 1;
  const slippageMul = isAggressiveMode
    ? 1
    : (slipSeverity <= 0 ? 1 : slipSeverity < 1
      ? (profile === "SCALP" ? 0.90 : 0.95)
      : (profile === "SCALP" ? 0.82 : 0.90));
  const stressMul = isAggressiveMode
    ? 1
    : (stressFailure <= 0.5 ? 0.96 : stressFailure < 1 ? 0.93 : (profile === "SCALP" ? 0.88 : 0.92));
  const entryMul = isAggressiveMode ? 1 : (input.entryClosed ? (profile === "SCALP" ? 0.85 : 0.94) : 1);
  const spoofMul = isAggressiveMode
    ? 1
    : (spoofSeverity <= 0 ? 1 : spoofSeverity < 1 ? 0.94 : (profile === "SCALP" ? 0.88 : 0.93));
  const basePenaltyMultiplier = latencyMul * slippageMul * stressMul * entryMul * spoofMul;
  const minPenaltyMultiplier = isAggressiveMode ? 1 : (profile === "SCALP" ? 0.65 : 0.75);
  const penaltyMultiplier = clamp(basePenaltyMultiplier, minPenaltyMultiplier, 1);
  const penaltyRate = clamp(1 - penaltyMultiplier, 0, 0.45);
  const penaltyApplied = baseAfterMode * penaltyRate;

  const gateMultiplier = (() => {
    let mul = 1;
    if (hardBlocked || gatingFlags.includes("LOW_FILL_PROB")) {
      mul *= isCapitalGuardMode ? 0.64 : isBalancedMode ? 0.76 : 0.88;
    }
    if (gatingFlags.includes("LOW_EDGE")) {
      mul *= isCapitalGuardMode ? 0.76 : isBalancedMode ? 0.86 : 0.92;
    }
    if (gatingFlags.includes("LOW_CAPACITY")) {
      mul *= isCapitalGuardMode ? 0.84 : isBalancedMode ? 0.90 : 0.95;
    }
    if (stressFailure >= 1 || cascadeFailure >= 1) {
      mul *= isCapitalGuardMode ? 0.80 : isBalancedMode ? 0.88 : 0.93;
    }
    return clamp(mul, 0.52, 1);
  })();

  let finalPreFloor = baseAfterMode * penaltyMultiplier * gateMultiplier;

  const aPlusFloorLevel = isCapitalGuardMode ? 58 : isBalancedMode ? 55 : isAggressiveMode ? 52 : 58;
  const aPlusFloorApplied = aPlusSetup && !hardBlocked && finalPreFloor < aPlusFloorLevel;
  const withAPlusFloor = aPlusFloorApplied ? aPlusFloorLevel : finalPreFloor;
  const displayScore = Boolean(input.dataHealthFail)
    ? 0
    : compressUpperTail(withAPlusFloor, isCapitalGuardMode ? 66 : isBalancedMode ? 68 : 70, isCapitalGuardMode ? 20 : 18);
  const penalizedScore = clamp(Number.isFinite(displayScore) ? displayScore : cfg.minFloor, cfg.minFloor, 100);
  const finalScore = penalizedScore;

  return {
    mode: input.mode,
    finalScore,
    rawScore,
    baseScore: coreConsensus,
    penalizedScore,
    edgeAdj,
    riskAdj,
    executionMultiplier,
    riskMultiplier,
    coreConsensus,
    aPlusFloorApplied,
    hardBlocked,
    penaltyModel: cfg.penaltyModel,
    penaltyRate,
    penaltyApplied,
    gatingFlags,
    scoreBreakdown: {
      edgeAdj,
      riskAdj,
      pFill: input.pFill,
      capacity: input.capacity,
      inputModifier: effectiveInputModifier,
      penaltyPoints: input.penaltyPoints,
      flowBonus: cfg.flowWeights ? flowBonus : undefined,
      executionMultiplier,
      riskMultiplier,
      aPlusFloorApplied,
    },
    formulaPreview: `${input.mode}: Final follows adjusted score (${withAPlusFloor.toFixed(2)})${hardBlocked ? " · gate active (decision only)" : ""}${aPlusFloorApplied ? " +A+ floor" : ""}`,
  };
};
