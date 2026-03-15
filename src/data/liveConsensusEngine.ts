import type {
  AiPanelData,
  ConsensusInputConfig,
  DataHealthState,
  FeedConfig,
  FlowDataFiltersConfig,
  FlowScoringTuningConfig,
  FlowSignalInputsConfig,
  FlowSignalWeightsConfig,
  KeyLevel,
  OhlcvPoint,
  RiskChecksInputsConfig,
  ScenarioConfig,
  ScoringMode,
  TileState,
} from "../types";
import { computeScore, SCORING_CONFIG, scoringModeDescription } from "./scoringEngine.ts";
import { FLOW_SIGNAL_DEFAULT_WEIGHTS, getFlowInputEnabled } from "./quantLayers.ts";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const tileState = (tiles: TileState[], key: string, fallback = "N/A") => {
  const tile = tiles.find((t) => t.key === key);
  return tile?.state ?? (typeof tile?.value === "number" ? `${tile.value}${tile.unit ? ` ${tile.unit}` : ""}` : fallback);
};

const tileValue = (tiles: TileState[], key: string, fallback = 0) => {
  const tile = tiles.find((t) => t.key === key);
  return typeof tile?.value === "number" ? tile.value : fallback;
};

const DEFAULT_CONSENSUS_INPUTS: ConsensusInputConfig = {
  tradeValidity: true,
  bias: true,
  intent: true,
  urgency: true,
  slippage: true,
  entryTiming: true,
  riskGate: true,
  marketStress: true,
  modelAgreement: true,
};

const DEFAULT_FLOW_SIGNAL_INPUTS: FlowSignalInputsConfig = {
  "spread-regime": true,
  "depth-quality": true,
  "liquidity-density": true,
  "slippage-risk": true,
  "entry-timing-window": true,
  "orderbook-stability": true,
  "trend-direction": true,
  "trend-strength": true,
  "ema-alignment": true,
  "vwap-position": true,
  "market-regime": true,
  "structure-age": true,
  "time-in-range": true,
  "htf-level-reaction": true,
  "orderbook-imbalance": true,
  "liquidity-distance": true,
  "aggressor-flow": true,
  "liquidity-refill-behaviour": true,
  "stop-cluster-probability": true,
  "reaction-sensitivity": true,
  "impulse-readiness": true,
  "funding-bias": true,
  "oi-change": true,
  "buy-sell-imbalance": true,
  "spot-vs-derivatives-pressure": true,
  "move-participation-score": true,
  "volume-spike": true,
  "liquidations-bias": true,
  "funding-slope": true,
  "atr-regime": true,
  compression: true,
  "breakout-risk": true,
  "fake-breakout-prob": true,
  "sudden-move-risk": true,
  "expansion-prob": true,
  "volatility-expansion-prob": true,
  "market-stress-level": true,
  "cascade-risk": true,
  "trap-probability": true,
  "signal-conflict": true,
  "exchange-inflow-outflow": true,
  "whale-activity": true,
  "wallet-distribution": true,
  "active-addresses": true,
  "nvt-ratio": true,
  "mvrv-ratio": true,
  dormancy: true,
  marketRegime: true,
  distanceToKeyLevel: true,
  rangePosition: true,
  liquidityClusterNearby: true,
  lastSwingDistance: true,
  htfLevelReaction: true,
  structureAge: true,
  timeInRange: true,
  trendDirection: true,
  trendStrength: true,
  trendPhase: true,
  emaAlignment: true,
  vwapPosition: true,
  timeSinceRegimeChange: true,
  atrRegime: true,
  marketSpeed: true,
  breakoutRisk: true,
  fakeBreakoutProbability: true,
  expansionProbability: true,
};

const DEFAULT_RISK_CHECK_INPUTS: RiskChecksInputsConfig = {
  riskGate: true,
  executionCertainty: true,
  stressFilter: true,
  sizeHint: true,
};

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const scoreToFactor = (score: number, min: number, max: number) => clamp(min + score / 200, min, max);

const biasScore = (value: AiPanelData["bias"]): number => {
  if (value === "LONG" || value === "SHORT") return 72;
  if (value === "WATCH") return 52;
  return 25;
};

const intentScore = (value: AiPanelData["marketIntent"]): number => {
  if (value === "TREND_CONTINUATION") return 82;
  if (value === "ACCUMULATION") return 62;
  if (value === "DISTRIBUTION") return 54;
  return 34;
};

const urgencyScore = (value: AiPanelData["executionUrgency"]): number => {
  if (value === "ACT") return 88;
  if (value === "PREPARE") return 68;
  if (value === "WATCH") return 50;
  return 30;
};

const modelAgreementScore = (agreement: AiPanelData["modelAgreement"]): number => {
  const total = Math.max(1, agreement.totalModels);
  const alignedRatio = agreement.aligned / total;
  const oppositeRatio = agreement.opposite / total;
  const unknownRatio = agreement.unknown / total;
  return clamp(Math.round(40 + alignedRatio * 60 - oppositeRatio * 28 - unknownRatio * 12), 0, 100);
};

export const generateAiPanel = (
  tiles: TileState[],
  scenario: ScenarioConfig,
  feeds: FeedConfig,
  consensusInputs: ConsensusInputConfig = DEFAULT_CONSENSUS_INPUTS,
  dataHealth?: DataHealthState,
  scoringMode: ScoringMode = "BALANCED",
  flowSignalInputs?: FlowSignalInputsConfig,
  flowSignalWeights?: FlowSignalWeightsConfig,
  riskChecksInputs?: RiskChecksInputsConfig,
  flowScoringTuning?: FlowScoringTuningConfig,
  dataFilters?: FlowDataFiltersConfig,
): AiPanelData => {
  const modeConfig = SCORING_CONFIG[scoringMode];
  const trendDirection = tileState(tiles, "trend-direction", "N/A");
  const trendStrength = tileState(tiles, "trend-strength", "N/A");
  const regime = tileState(tiles, "market-regime", "N/A");
  const distanceToKeyLevel = tileState(tiles, "distance-key-level", "N/A");
  const rangePosition = tileState(tiles, "range-position", "N/A");
  const liquidityClusterNearby = tileState(tiles, "liquidity-cluster", "N/A");
  const lastSwingDistanceState = tileState(tiles, "last-swing-distance", "N/A");
  const htfLevelReaction = tileState(tiles, "htf-level-reaction", "N/A");
  const structureAge = tileState(tiles, "structure-age", "N/A");
  const timeInRange = tileValue(tiles, "time-in-range");
  const htfAlignment = tileState(tiles, "relative-strength-vs-market", "N/A");
  const trendPhase = tileState(tiles, "trend-phase", "N/A");
  const emaAlignment = tileState(tiles, "ema-alignment", "N/A");
  const timeSinceRegimeChange = tileValue(tiles, "time-since-regime-change");

  const orderbookImbalance = tileState(tiles, "orderbook-imbalance", "N/A");
  const tapeImbalance = tileState(tiles, "buy-sell-imbalance", "N/A");
  const slippage = tileState(tiles, "slippage-risk", "N/A");
  const liquidityDensity = tileState(tiles, "liquidity-density", "N/A");
  const orderbookStability = tileState(tiles, "orderbook-stability", "N/A");
  const entryTiming = tileState(tiles, "entry-timing-window", "N/A");
  const tradeValidityState = tileState(tiles, "trade-validity", "N/A");
  const spreadRegime = tileState(tiles, "spread-regime", "N/A");
  const depthQuality = tileState(tiles, "depth-quality", "N/A");
  const vwapPosition = tileState(tiles, "vwap-position", "N/A");
  const aggressorFlow = tileState(tiles, "aggressor-flow", "N/A");
  const liquidityRefillBehaviour = tileState(tiles, "liquidity-refill-behaviour", "N/A");
  const stopClusterProbability = tileState(tiles, "stop-cluster-probability", "N/A");
  const reactionSensitivity = tileState(tiles, "reaction-sensitivity", "N/A");
  const impulseReadiness = tileState(tiles, "impulse-readiness", "N/A");
  const fundingSlope = tileState(tiles, "funding-slope", "N/A");
  const liquidationsBias = tileState(tiles, "liquidations-bias", "N/A");
  const trapProbability = tileState(tiles, "trap-probability", "N/A");
  const signalConflict = tileState(tiles, "signal-conflict", "N/A");
  const volExpansionProbability = tileState(tiles, "volatility-expansion-prob", "N/A");
  const exchangeInflowOutflow = tileState(tiles, "exchange-inflow-outflow", "N/A");
  const whaleActivity = tileState(tiles, "whale-activity", "N/A");
  const walletDistribution = tileState(tiles, "wallet-distribution", "N/A");
  const activeAddresses = tileValue(tiles, "active-addresses", 0);
  const nvtRatio = tileValue(tiles, "nvt-ratio", 0);
  const mvrvRatio = tileValue(tiles, "mvrv-ratio", 0);
  const dormancyDays = tileValue(tiles, "dormancy", 0);
  const rrPotential = tileState(tiles, "rr-potential", "N/A");
  const invalidationDistance = tileState(tiles, "invalidation-distance", "N/A");
  const rewardDistance = tileState(tiles, "reward-distance", "N/A");
  const rewardAccessibility = tileState(tiles, "reward-accessibility", "N/A");
  const riskArrivalSpeed = tileState(tiles, "risk-arrival-speed", "N/A");
  const opportunityRank = tileState(tiles, "opportunity-rank", "N/A");
  const btcLeadershipState = tileState(tiles, "btc-leadership-state", "N/A");

  const compression = tileState(tiles, "compression", "N/A");
  const breakoutRisk = tileState(tiles, "breakout-risk", "N/A");
  const marketStressRaw = tileState(tiles, "market-stress-level", "N/A");
  const atrRegime = tileState(tiles, "atr-regime", "N/A");
  const marketSpeed = tileState(tiles, "market-speed", "N/A");
  const volumeSpikeState = tileState(tiles, "volume-spike", "N/A");
  const suddenMoveRiskState = tileState(tiles, "sudden-move-risk", "N/A");
  const fakeBreakoutProbability = tileState(tiles, "fake-breakout-prob", "N/A");
  const expansionProbability = tileState(tiles, "expansion-prob", "N/A");
  const cascadeRisk = tileState(tiles, "cascade-risk", "N/A");
  const asymmetry = tileState(tiles, "asymmetry-score", "N/A");

  const flowInputs: FlowSignalInputsConfig = { ...DEFAULT_FLOW_SIGNAL_INPUTS, ...(flowSignalInputs ?? {}) };
  const panelWeights: FlowSignalWeightsConfig = { ...FLOW_SIGNAL_DEFAULT_WEIGHTS, ...(flowSignalWeights ?? {}) };
  const riskChecks: RiskChecksInputsConfig = scoringMode === "FLOW"
    ? { ...DEFAULT_RISK_CHECK_INPUTS, ...(riskChecksInputs ?? {}) }
    : { ...DEFAULT_RISK_CHECK_INPUTS };
  const isFlowUserMode = scoringMode === "FLOW";
  const isAggressiveMode = scoringMode === "AGGRESSIVE";
  const isBalancedMode = scoringMode === "BALANCED";
  const isCapitalGuardMode = scoringMode === "CAPITAL_GUARD";
  const aggressiveExcluded = new Set<string>([
    "structure-age",
    "time-in-range",
    "market-regime",
    "trend-direction",
    "trend-strength",
    "ema-alignment",
    "vwap-position",
    "distance-key-level",
    "htf-level-reaction",
    "range-position",
    "risk-adjusted-edge",
    "model-agreement",
  ]);
  const conflictFilterExcluded = new Map<string, boolean>([
    ["trend-direction", dataFilters?.conflictTrend === false],
    ["buy-sell-imbalance", dataFilters?.conflictBuySell === false],
    ["orderbook-imbalance", dataFilters?.conflictOrderbook === false],
  ]);
  const flowEnabled = (key: string) => {
    if (conflictFilterExcluded.get(key)) return false;
    return isFlowUserMode ? getFlowInputEnabled(flowInputs, key) : true;
  };
  const modeEnabled = (key: string) => {
    if (isAggressiveMode && aggressiveExcluded.has(key)) return false;
    return flowEnabled(key);
  };
  const flowSignalTotal = Object.keys(flowInputs).length;
  const flowSignalActive = Object.values(flowInputs).filter(Boolean).length;

  const participation = tileState(tiles, "move-participation-score", "N/A");
  const derivativesPressure = tileState(tiles, "spot-vs-derivatives-pressure", "N/A");
  const fundingBias = tileState(tiles, "funding-bias", "N/A");
  const oiChange = tileState(tiles, "oi-change", "N/A");
  const liquidityDistance = tileState(tiles, "liquidity-distance", "N/A");
  const liquidityDistanceValue = tileValue(tiles, "liquidity-distance", 0);

  const coreReadiness = [
    { label: "OHLCV", enabled: feeds.priceOhlcv, ready: trendDirection !== "N/A" },
    { label: "Orderbook", enabled: feeds.orderbook, ready: orderbookImbalance !== "N/A" && slippage !== "N/A" },
    { label: "Trades", enabled: feeds.trades, ready: tapeImbalance !== "N/A" },
  ] as const;
  const coreFeedsEnabled = coreReadiness.every((item) => item.enabled);
  const coreStatesReady = coreReadiness.every((item) => item.ready);
  if (!coreFeedsEnabled || !coreStatesReady) {
    const missingCore = coreReadiness.filter((item) => !item.enabled || !item.ready).map((item) => item.label);
    const readyCoreCount = coreReadiness.filter((item) => item.enabled && item.ready).length;
    const coverage = readyCoreCount / coreReadiness.length;
    const freshnessFactor = clamp(1 - (dataHealth?.lastUpdateAgeSec ?? 12) / 90, 0.2, 1);
    const staleFactor = dataHealth?.staleFeed ? 0.65 : 1;
    const incompleteConsensus = clamp(
      Math.round(100 * coverage * freshnessFactor * staleFactor),
      0,
      100,
    );
    const incompleteBandLow = clamp(incompleteConsensus - 10, 0, 100);
    const incompleteBandHigh = clamp(incompleteConsensus + 10, 0, 100);
    const incompleteGatingFlags = [
      ...(missingCore.includes("OHLCV") ? (["LOW_EDGE"] as const) : []),
      ...(missingCore.includes("Orderbook") || missingCore.includes("Trades") ? (["LOW_FILL_PROB", "LOW_CAPACITY"] as const) : []),
    ];
    return {
      summary: ["Live market data is incomplete.", "Signals are withheld until all required feeds are online."],
      keyReasons: [
        `Missing core feeds: ${missingCore.length ? missingCore.join(" / ") : "OHLCV / Orderbook / Trades"}.`,
        "Static fallback is disabled by policy.",
        `Real-time degraded score from feed coverage ${Math.round(coverage * 100)}%, freshness ${Math.round(freshnessFactor * 100)}%, stale factor ${Math.round(staleFactor * 100)}%.`,
      ],
      riskChecks: [
        { label: "Risk Gate", status: "BLOCK", detail: "Blocked: incomplete live data." },
        { label: "Execution Certainty", status: "BLOCK", detail: "Cannot evaluate without full live feed set." },
        { label: "Stress Filter", status: "BLOCK", detail: "Stress model unavailable due to missing inputs." },
      ],
      tradeValidity: "NO-TRADE",
      bias: "NONE",
      signalConsensus: incompleteConsensus,
      conflictLevel: "HIGH",
      marketIntent: "ACCUMULATION",
      playbook: "Wait for full data",
      confidenceBand: [incompleteBandLow, incompleteBandHigh],
      confidenceDrivers: { structure: 0, liquidity: 0, positioning: 0, execution: 0 },
      scenarioOutlook: { trendContinuation: 0, rangeContinuation: 0, breakoutMove: 0 },
      crowdingRisk: "LOW",
      priceLocation: "Unavailable",
      freshness: { updatedSecAgo: dataHealth?.lastUpdateAgeSec ?? 0, validForBars: 0 },
      triggerConditions: ["OHLCV feed live", "Orderbook + Trades live", "Funding + OI live"],
      invalidationTriggers: ["N/A"],
      executionUrgency: "WAIT",
      expectedMove: "N/A",
      recentRegimePath: ["N/A"],
      modelAgreement: { totalModels: 6, aligned: 0, neutral: 0, opposite: 0, unknown: 6, direction: "NONE" },
      explainability: ["No inference generated. Live data missing."],
      sizeHint: "0",
      sizeHintReason: "Position sizing disabled until live data is complete.",
      sessionContext: { session: "Weekend", liquidityExpectation: "Lower" },
      timeContextSummary: "Unavailable",
      riskEnvironmentSummary: "Unavailable",
      executionCertaintySummary: "Unavailable",
      portfolioContextSummary: "Unavailable",
      scoringMode,
      scoreBreakdown: {
        edgeAdj: 0,
        riskAdj: Number((freshnessFactor * staleFactor).toFixed(4)),
        pFill: 0,
        capacity: 0,
        inputModifier: Number(coverage.toFixed(4)),
        penaltyPoints: 0,
      },
      gatingFlags: incompleteGatingFlags,
      scoring_mode: scoringMode,
      score_breakdown: {
        edgeAdj: 0,
        riskAdj: Number((freshnessFactor * staleFactor).toFixed(4)),
        pFill: 0,
        capacity: 0,
        inputModifier: Number(coverage.toFixed(4)),
        penaltyPoints: 0,
      },
      gating_flags: incompleteGatingFlags,
      layerScores: {
        execution: 0,
        structure: 0,
        microstructure: 0,
        positioning: 0,
        volatility: 0,
        risk: 0,
        onchain: 0,
      },
      consensusEngine: {
        dataComplete: false,
        edgeNetR: 0,
        pWin: 0,
        pStop: 0,
        avgWinR: 0,
        expectedRR: 0,
        costR: 0,
        pFill: 0,
        capacityFactor: 0,
        riskAdjustment: 0,
        riskAdjustedEdgeR: 0,
        expectedHoldingBars: 0,
        inputModifier: Number(coverage.toFixed(4)),
        rawConsensus: incompleteConsensus,
        adjustedConsensus: incompleteConsensus,
        penalizedConsensus: incompleteConsensus,
        penaltyTotal: 0,
        penaltyModel: modeConfig.penaltyModel,
        penaltyRate: 0,
        penaltyApplied: 0,
        hardGates: {
          tradeValidity: false,
          dataHealth: false,
          riskGate: false,
          entryWindow: false,
          fillProb: false,
          edge: false,
          capacity: false,
        },
        formulaLine: `Incomplete score = 100 * coverage(${coverage.toFixed(2)}) * freshness(${freshnessFactor.toFixed(2)}) * stale(${staleFactor.toFixed(2)}) = ${incompleteConsensus}`,
      },
    };
  }

  const isUnavailableState = (state: string) => !state || state === "N/A" || state === "UNKNOWN";
  const stateScore = (
    state: string,
    table: Record<string, number>,
    fallback = 42,
    unavailableFallback = 34,
  ) => (isUnavailableState(state) ? unavailableFallback : (table[state] ?? fallback));
  const weightedScore = (
    parts: Array<{ score: number; weight: number; enabled?: boolean }>,
    fallback = 45,
  ): number => {
    const activeParts = parts.filter((part) => part.enabled ?? true);
    const totalWeight = activeParts.reduce((sum, part) => sum + part.weight, 0);
    if (!totalWeight) return fallback;
    const total = activeParts.reduce((sum, part) => sum + part.score * part.weight, 0);
    return Math.round(total / totalWeight);
  };
  const weightedNullableScore = (
    parts: Array<{ score: number | null; weight: number; enabled?: boolean }>,
    fallback = 42,
  ): number => {
    const activeParts = parts.filter((part) => (part.enabled ?? true) && part.score != null);
    const totalWeight = activeParts.reduce((sum, part) => sum + part.weight, 0);
    if (!totalWeight) return fallback;
    const total = activeParts.reduce((sum, part) => sum + Number(part.score ?? 0) * part.weight, 0);
    return Math.round(total / totalWeight);
  };
  const enumScore = (state: string, map: Record<string, number>): number | null => {
    if (isUnavailableState(state)) return null;
    return map[state] ?? null;
  };

  const intent: AiPanelData["marketIntent"] =
    trendStrength === "STRONG" || regime === "TREND"
      ? "TREND_CONTINUATION"
      : regime === "RANGE" && ["HIGH", "MID"].includes(liquidityDensity)
        ? "ACCUMULATION"
        : compression === "ON" && breakoutRisk !== "LOW"
          ? "LIQUIDITY_HUNT"
          : trendDirection === "DOWN"
            ? "DISTRIBUTION"
            : "ACCUMULATION";

  let longVotes = 0;
  let shortVotes = 0;
  const addVote = (state: string, longStates: string[], shortStates: string[], weight = 1) => {
    if (longStates.includes(state)) longVotes += weight;
    if (shortStates.includes(state)) shortVotes += weight;
  };

  addVote(trendDirection, ["UP"], ["DOWN"], 2);
  addVote(orderbookImbalance, ["BUY"], ["SELL"], 1);
  addVote(tapeImbalance, ["BUY"], ["SELL"], 1);
  addVote(vwapPosition, ["ABOVE"], ["BELOW"], 1);
  addVote(htfAlignment, ["STRONG"], ["WEAK"], 1);
  if (derivativesPressure === "DERIV_LED" && fundingBias === "CROWDED_LONG") longVotes += 1;
  if (derivativesPressure === "DERIV_LED" && fundingBias === "CROWDED_SHORT") shortVotes += 1;
  if (intent === "TREND_CONTINUATION" && trendDirection === "UP") longVotes += 1;
  if (intent === "TREND_CONTINUATION" && trendDirection === "DOWN") shortVotes += 1;

  let bias: AiPanelData["bias"] = "NONE";
  if (longVotes >= shortVotes + 2) bias = "LONG";
  else if (shortVotes >= longVotes + 2) bias = "SHORT";
  else if (Math.max(longVotes, shortVotes) >= 3) bias = "WATCH";

  const voteTotal = longVotes + shortVotes;
  const voteDominance = voteTotal ? Math.abs(longVotes - shortVotes) / voteTotal : 0;
  const conflictLevel: AiPanelData["conflictLevel"] =
    voteDominance >= 0.45 ? "LOW" : voteDominance >= 0.2 ? "MED" : "HIGH";

  const crowdingRisk: AiPanelData["crowdingRisk"] =
    (fundingBias !== "NEUTRAL" && oiChange === "UP" && participation === "STRONG")
      ? "HIGH"
      : (fundingBias !== "NEUTRAL" || oiChange === "UP")
        ? "MODERATE"
        : "LOW";

  const marketStress = marketStressRaw !== "N/A"
    ? marketStressRaw
    : (marketSpeed === "VIOLENT" || slippage === "HIGH" || atrRegime === "HIGH")
      ? "HIGH"
      : (marketSpeed === "FAST" || slippage === "MED")
        ? "BUILDING"
        : "LOW";
  const suddenMove = marketStress === "HIGH" ? "HIGH" : marketStress === "BUILDING" ? "MED" : "LOW";

  const structureScore = weightedScore([
    {
      score: stateScore(trendDirection, { UP: 85, DOWN: 85, NEUTRAL: 45 }),
      weight: 22,
      enabled: modeEnabled("trend-direction"),
    },
    {
      score: stateScore(htfLevelReaction, { HOLD: 80, ACCEPTED: 78, REJECTED: 44, BREAK: 52, "N/A": 58 }, 58),
      weight: 12,
      enabled: modeEnabled("htf-level-reaction"),
    },
    {
      score: stateScore(regime, { TREND: 78, RANGE: 60, CHOP: 42 }),
      weight: 14,
      enabled: modeEnabled("market-regime"),
    },
    {
      score: stateScore(structureAge, { NEW: 72, DEVELOPING: 84, MATURE: 74, OLD: 58 }),
      weight: 10,
      enabled: modeEnabled("structure-age"),
    },
    {
      score: regime === "RANGE" ? (timeInRange <= 40 ? 75 : timeInRange > 160 ? 55 : 65) : 72,
      weight: 10,
      enabled: modeEnabled("time-in-range"),
    },
    {
      score: stateScore(distanceToKeyLevel, { NEAR: 84, MID: 66, FAR: 48, NARROW: 72 }, 58),
      weight: 9,
      enabled: modeEnabled("distance-key-level"),
    },
    {
      score: stateScore(rangePosition, { LOWER: 72, UPPER: 72, MID: 64, DISCOUNT: 76, PREMIUM: 76 }, 58),
      weight: 8,
      enabled: modeEnabled("range-position"),
    },
    {
      score: stateScore(liquidityClusterNearby, { HIGH: 78, MID: 66, LOW: 52, NEAR: 78, FAR: 46 }, 56),
      weight: 8,
      enabled: modeEnabled("liquidity-cluster"),
    },
    {
      score: stateScore(lastSwingDistanceState, { NEAR: 76, MID: 62, FAR: 46 }, 56),
      weight: 7,
      enabled: modeEnabled("last-swing-distance"),
    },
  ]);

  const liquidityScore = weightedScore([
    {
      score: stateScore(liquidityDensity, { HIGH: 90, MID: 70, LOW: 35 }),
      weight: 30,
      enabled: modeEnabled("liquidity-density"),
    },
    {
      score: stateScore(slippage, { LOW: 92, MED: 62, HIGH: 28 }),
      weight: 30,
      enabled: modeEnabled("slippage-risk"),
    },
    {
      score: stateScore(orderbookStability, { STABLE: 86, SHIFTING: 60, SPOOF_RISK: 25 }),
      weight: 20,
      enabled: modeEnabled("orderbook-stability"),
    },
    {
      score: stateScore(entryTiming, { OPEN: 90, NARROW: 60, CLOSED: 25 }),
      weight: 20,
      enabled: modeEnabled("entry-timing-window"),
    },
  ]);

  const positioningScore = weightedScore([
    {
      score: stateScore(participation, { STRONG: 85, NORMAL: 65, WEAK: 40 }),
      weight: 20,
      enabled: modeEnabled("move-participation-score"),
    },
    {
      score: stateScore(derivativesPressure, { DERIV_LED: 75, SPOT_LED: 70, BALANCED: 60 }),
      weight: 20,
      enabled: modeEnabled("spot-vs-derivatives-pressure"),
    },
    {
      score: stateScore(fundingSlope, { STEEP_UP: 82, UP: 74, FLAT: 60, DOWN: 66, STEEP_DOWN: 78 }, 58),
      weight: 10,
      enabled: modeEnabled("funding-slope"),
    },
    {
      score: stateScore(liquidationsBias, { LONGS_FLUSHED: 82, SHORTS_FLUSHED: 82, LONG_PRESSURE: 68, SHORT_PRESSURE: 68, BALANCED: 58 }, 58),
      weight: 10,
      enabled: modeEnabled("liquidations-bias"),
    },
    {
      score: stateScore(crowdingRisk, { LOW: 85, MODERATE: 60, HIGH: 35 }),
      weight: 20,
      enabled: modeEnabled("funding-bias") || modeEnabled("oi-change"),
    },
    {
      score: stateScore(fundingBias, { NEUTRAL: 70, CROWDED_LONG: 55, CROWDED_SHORT: 55 }),
      weight: 20,
      enabled: modeEnabled("funding-bias"),
    },
    {
      score: stateScore(trendStrength, { STRONG: 84, MID: 68, WEAK: 44 }, 56),
      weight: 10,
      enabled: modeEnabled("trend-strength"),
    },
    {
      score: stateScore(trendPhase, { EXPANSION: 80, CONTINUATION: 76, PULLBACK: 62, REVERSAL: 50 }, 58),
      weight: 10,
      enabled: modeEnabled("trend-phase"),
    },
    {
      score: stateScore(emaAlignment, { BULL: 78, BEAR: 78, MIXED: 54 }, 56),
      weight: 10,
      enabled: modeEnabled("ema-alignment"),
    },
    {
      score: stateScore(vwapPosition, { ABOVE: 74, BELOW: 74, AROUND: 60, AT: 60 }, 58),
      weight: 10,
      enabled: modeEnabled("vwap-position"),
    },
    {
      score: timeSinceRegimeChange <= 0 ? 56 : timeSinceRegimeChange <= 12 ? 76 : timeSinceRegimeChange <= 32 ? 66 : 54,
      weight: 10,
      enabled: modeEnabled("time-since-regime-change"),
    },
  ]);

  const volatilityContextScore =
    marketStress === "LOW" && ["LOW", "NORMAL"].includes(atrRegime) ? 82
      : marketStress === "BUILDING" ? 58
        : 30;
  const executionScore = weightedScore([
    {
      score: stateScore(entryTiming, { OPEN: 90, NARROW: 60, CLOSED: 25 }),
      weight: 22,
      enabled: modeEnabled("entry-timing-window"),
    },
    {
      score: stateScore(asymmetry, { REWARD_DOMINANT: 90, BALANCED: 65, RISK_DOMINANT: 30 }),
      weight: 22,
      enabled: modeEnabled("asymmetry-score"),
    },
    {
      score: volatilityContextScore,
      weight: 16,
      enabled: modeEnabled("market-stress-level") || modeEnabled("atr-regime"),
    },
    {
      score: stateScore(spreadRegime, { TIGHT: 88, NORMAL: 65, WIDE: 35 }),
      weight: 14,
      enabled: modeEnabled("spread-regime"),
    },
    {
      score: stateScore(atrRegime, { HIGH: 74, NORMAL: 70, LOW: 58 }, 60),
      weight: 8,
      enabled: modeEnabled("atr-regime"),
    },
    {
      score: stateScore(compression, { ON: 78, OFF: 58 }, 60),
      weight: 7,
      enabled: modeEnabled("compression"),
    },
    {
      score: stateScore(marketSpeed, { FAST: 80, VIOLENT: 72, NORMAL: 66, SLOW: 46 }, 58),
      weight: 8,
      enabled: modeEnabled("market-speed"),
    },
    {
      score: stateScore(breakoutRisk, { LOW: 78, MED: 58, HIGH: 36 }, 56),
      weight: 6,
      enabled: modeEnabled("breakout-risk"),
    },
    {
      score: stateScore(fakeBreakoutProbability, { LOW: 76, MED: 58, HIGH: 34 }, 56),
      weight: 6,
      enabled: modeEnabled("fake-breakout-prob"),
    },
    {
      score: stateScore(expansionProbability, { HIGH: 82, MID: 66, LOW: 48 }, 58),
      weight: 6,
      enabled: modeEnabled("expansion-prob"),
    },
  ]);
  const volatilityScore = weightedScore([
    {
      score: stateScore(atrRegime, { HIGH: 76, NORMAL: 68, LOW: 56 }, 60),
      weight: 24,
      enabled: modeEnabled("atr-regime"),
    },
    {
      score: stateScore(compression, { ON: 78, OFF: 58 }, 60),
      weight: 18,
      enabled: modeEnabled("compression"),
    },
    {
      score: stateScore(volumeSpikeState, { ON: 84, OFF: 56 }, 60),
      weight: 18,
      enabled: modeEnabled("volume-spike"),
    },
    {
      score: stateScore(fakeBreakoutProbability, { LOW: 80, MED: 58, HIGH: 34 }, 56),
      weight: 20,
      enabled: modeEnabled("fake-breakout-prob"),
    },
    {
      score: stateScore(suddenMoveRiskState, { LOW: 78, MED: 56, HIGH: 36 }, 56),
      weight: 20,
      enabled: modeEnabled("sudden-move-risk"),
    },
    {
      score: stateScore(volExpansionProbability, { HIGH: 82, MID: 64, MED: 64, LOW: 44 }, 56),
      weight: 12,
      enabled: modeEnabled("volatility-expansion-prob"),
    },
  ]);

  const microstructureScore = weightedScore([
    {
      score: stateScore(orderbookImbalance, { BUY: 82, SELL: 82, NEUTRAL: 55 }, 56),
      weight: 20,
      enabled: modeEnabled("orderbook-imbalance"),
    },
    {
      score: clamp(88 - (Math.abs(liquidityDistanceValue) * 8), 30, 88),
      weight: 10,
      enabled: modeEnabled("liquidity-distance"),
    },
    {
      score: stateScore(aggressorFlow, { BUYERS_DOMINANT: 84, SELLERS_DOMINANT: 84, MIXED: 56 }, 56),
      weight: 18,
      enabled: modeEnabled("aggressor-flow"),
    },
    {
      score: stateScore(liquidityRefillBehaviour, { STRONG: 84, NORMAL: 66, WEAK: 40 }, 56),
      weight: 12,
      enabled: modeEnabled("liquidity-refill-behaviour"),
    },
    {
      score: stateScore(stopClusterProbability, { HIGH: 80, MID: 62, MED: 62, LOW: 46 }, 56),
      weight: 12,
      enabled: modeEnabled("stop-cluster-probability"),
    },
    {
      score: stateScore(reactionSensitivity, { HIGH: 76, MID: 62, MED: 62, LOW: 48 }, 56),
      weight: 12,
      enabled: modeEnabled("reaction-sensitivity"),
    },
    {
      score: stateScore(impulseReadiness, { HIGH: 86, MID: 64, MED: 64, LOW: 40 }, 56),
      weight: 16,
      enabled: modeEnabled("impulse-readiness"),
    },
  ], liquidityScore);

  const flowEntryWeights = { rr: 0.25, rewardDistance: 0.1, invalidation: 0.1, rewardAccessibility: 0.3, riskArrival: 0.25 } as const;
  const aggressiveEntryWeights = { rr: 0.35, rewardDistance: 0.2, invalidation: 0.15, rewardAccessibility: 0.15, riskArrival: 0.15 } as const;
  const balancedEntryWeights = { rr: 0.3, rewardDistance: 0.2, invalidation: 0.2, rewardAccessibility: 0.15, riskArrival: 0.15 } as const;
  const capitalGuardEntryWeights = { rr: 0.34, rewardDistance: 0.22, invalidation: 0.22, rewardAccessibility: 0.12, riskArrival: 0.1 } as const;
  const entryWeights = isFlowUserMode
    ? flowEntryWeights
    : isAggressiveMode
      ? aggressiveEntryWeights
      : isBalancedMode
        ? balancedEntryWeights
        : capitalGuardEntryWeights;

  const entryQualityScore = weightedNullableScore([
    {
      score: enumScore(rrPotential, { HIGH: 90, NORMAL: 62, MID: 62, LOW: 28 }),
      weight: entryWeights.rr,
      enabled: modeEnabled("rr-potential"),
    },
    {
      score: enumScore(rewardDistance, { NORMAL: 86, MID: 80, SHORT: 52, EXTENDED: 46 }),
      weight: entryWeights.rewardDistance,
      enabled: modeEnabled("reward-distance"),
    },
    {
      score: enumScore(invalidationDistance, { NORMAL: 84, MID: 84, TIGHT: 42, WIDE: 56 }),
      weight: entryWeights.invalidation,
      enabled: modeEnabled("invalidation-distance"),
    },
    {
      score: enumScore(rewardAccessibility, { EASY: 88, NORMAL: 64, HARD: 34 }),
      weight: entryWeights.rewardAccessibility,
      enabled: modeEnabled("reward-accessibility"),
    },
    {
      score: enumScore(riskArrivalSpeed, { SLOW: 84, NORMAL: 62, MID: 62, FAST: 34, HIGH: 34, LOW: 84 }),
      weight: entryWeights.riskArrival,
      enabled: modeEnabled("risk-arrival-speed"),
    },
  ], 42);

  const riskScoreBase = weightedScore([
    {
      score: stateScore(marketStress, { LOW: 84, BUILDING: 58, HIGH: 28 }, 56),
      weight: 30,
      enabled: modeEnabled("market-stress-level"),
    },
    {
      score: stateScore(cascadeRisk, { LOW: 82, MED: 56, HIGH: 30 }, 56),
      weight: 25,
      enabled: modeEnabled("cascade-risk"),
    },
    {
      score: stateScore(trapProbability, { LOW: 80, MID: 58, MED: 58, HIGH: 32 }, 56),
      weight: 15,
      enabled: modeEnabled("trap-probability"),
    },
    {
      score: stateScore(signalConflict, { LOW: 82, MID: 58, MED: 58, HIGH: 32 }, 56),
      weight: 30,
      enabled: modeEnabled("signal-conflict"),
    },
  ], 44);

  const onchainScore = weightedScore([
    {
      score: stateScore(exchangeInflowOutflow, { OUTFLOW_DOMINANT: 80, BALANCED: 62, INFLOW_DOMINANT: 46 }, 56),
      weight: 20,
      enabled: modeEnabled("exchange-inflow-outflow"),
    },
    {
      score: stateScore(whaleActivity, { VERY_HIGH: 76, HIGH: 72, NORMAL: 62, LOW: 48 }, 56),
      weight: 15,
      enabled: modeEnabled("whale-activity"),
    },
    {
      score: stateScore(walletDistribution, { DISTRIBUTED: 74, BALANCED: 64, HIGH_CONCENTRATION: 46 }, 56),
      weight: 15,
      enabled: modeEnabled("wallet-distribution"),
    },
    {
      score: activeAddresses > 0 ? clamp(50 + Math.log10(Math.max(activeAddresses, 1)) * 8, 45, 88) : 56,
      weight: 15,
      enabled: modeEnabled("active-addresses"),
    },
    {
      score: nvtRatio > 0 ? clamp(88 - (nvtRatio * 0.9), 36, 88) : 56,
      weight: 12,
      enabled: modeEnabled("nvt-ratio"),
    },
    {
      score: mvrvRatio > 0 ? clamp(80 - Math.abs(mvrvRatio - 1.2) * 25, 34, 88) : 56,
      weight: 13,
      enabled: modeEnabled("mvrv-ratio"),
    },
    {
      score: dormancyDays > 0 ? clamp(84 - dormancyDays * 2.1, 32, 84) : 56,
      weight: 10,
      enabled: modeEnabled("dormancy"),
    },
    {
      score: stateScore(opportunityRank, { TOP: 82, MID: 62, LOW: 42 }, 56),
      weight: 10,
      enabled: modeEnabled("opportunity-rank"),
    },
    {
      score: stateScore(btcLeadershipState, { LEADING: 78, BALANCED: 62, LAGGING: 44 }, 56),
      weight: 10,
      enabled: modeEnabled("btc-leadership-state"),
    },
  ], 44);

  const directionalEdge = Math.round(
    (0.30 * microstructureScore) +
    (0.30 * positioningScore) +
    (0.25 * volatilityScore) +
    (0.15 * structureScore),
  );
  const confidenceComposite = Math.round(
    (0.40 * executionScore) +
    (0.30 * riskScoreBase) +
    (0.30 * directionalEdge),
  );

  let baseLayerConsensus = confidenceComposite;
  let provisionalRiskGate =
    executionScore >= 55 && riskScoreBase >= 45 && slippage !== "HIGH"
      ? "PASS"
      : "BLOCK";
  let provisionalUrgency: AiPanelData["executionUrgency"] =
    executionScore >= 82 && directionalEdge >= 70 && entryTiming === "OPEN" ? "ACT"
      : executionScore >= 68 && directionalEdge >= 60 && entryTiming !== "CLOSED" ? "PREPARE"
        : executionScore >= 55 ? "WATCH"
          : "WAIT";

  const toModelVote = (state: string): "LONG" | "SHORT" | "NEUTRAL" | "UNKNOWN" => {
    if (["UP", "BUY", "ABOVE", "STRONG", "LONG"].includes(state)) return "LONG";
    if (["DOWN", "SELL", "BELOW", "WEAK", "SHORT"].includes(state)) return "SHORT";
    if (["NEUTRAL", "AROUND", "BALANCED", "FLAT", "NONE"].includes(state)) return "NEUTRAL";
    return "UNKNOWN";
  };
  const derivativesVote =
    derivativesPressure === "DERIV_LED" && fundingBias === "CROWDED_LONG"
      ? "LONG"
      : derivativesPressure === "DERIV_LED" && fundingBias === "CROWDED_SHORT"
        ? "SHORT"
        : derivativesPressure === "BALANCED"
          ? "NEUTRAL"
          : "UNKNOWN";
  const modelVotes = [
    toModelVote(trendDirection),
    toModelVote(orderbookImbalance),
    toModelVote(tapeImbalance),
    toModelVote(vwapPosition),
    toModelVote(htfAlignment),
    derivativesVote as "LONG" | "SHORT" | "NEUTRAL" | "UNKNOWN",
  ];
  const modelDirection: AiPanelData["modelAgreement"]["direction"] =
    bias === "LONG" || bias === "SHORT" ? bias : bias === "WATCH" ? "WATCH" : "NONE";
  let aligned = 0;
  let neutral = 0;
  let opposite = 0;
  let unknown = 0;
  for (const vote of modelVotes) {
    if (vote === "UNKNOWN") {
      unknown += 1;
      continue;
    }
    if (modelDirection === "LONG" || modelDirection === "SHORT") {
      if (vote === "NEUTRAL") neutral += 1;
      else if (vote === modelDirection) aligned += 1;
      else opposite += 1;
      continue;
    }
    if (modelDirection === "WATCH") {
      neutral += 1;
      continue;
    }
    if (vote === "NEUTRAL") neutral += 1;
    else unknown += 1;
  }
  const modelAgreement = {
    totalModels: modelVotes.length,
    aligned,
    neutral,
    opposite,
    unknown,
    direction: modelDirection,
  };

  const modelAgreementValue = modelAgreementScore(modelAgreement);
  const riskScore = Math.round((riskScoreBase * 0.82) + (modelAgreementValue * 0.18));
  baseLayerConsensus = Math.round(
    (0.40 * executionScore) +
    (0.30 * riskScore) +
    (0.30 * directionalEdge),
  );
  provisionalRiskGate =
    executionScore >= 55 && riskScore >= 45 && slippage !== "HIGH"
      ? "PASS"
      : "BLOCK";
  provisionalUrgency =
    executionScore >= 82 && directionalEdge >= 70 && entryTiming === "OPEN" ? "ACT"
      : executionScore >= 68 && directionalEdge >= 60 && entryTiming !== "CLOSED" ? "PREPARE"
        : executionScore >= 55 ? "WATCH"
          : "WAIT";
  // Decision controls (tradeValidity/riskGate/entryTiming/data health) are handled as hard gates.
  // Keep only soft behavioral modulation here to avoid score/decision contradictions.
  const consensusInputFactors: Array<{ enabled: boolean; factor: number }> = [
    { enabled: consensusInputs.bias, factor: scoreToFactor(biasScore(bias), 0.90, 1.03) },
    { enabled: consensusInputs.intent, factor: scoreToFactor(intentScore(intent), 0.92, 1.04) },
    { enabled: consensusInputs.urgency, factor: scoreToFactor(urgencyScore(provisionalUrgency), 0.92, 1.05) },
    { enabled: consensusInputs.modelAgreement && !isAggressiveMode, factor: scoreToFactor(modelAgreementValue, 0.90, 1.04) },
  ];
  const enabledInputFactors = consensusInputFactors.filter((item) => item.enabled).map((item) => item.factor);
  const softConsensusControlCount = enabledInputFactors.length;
  const inputModifier = enabledInputFactors.length
    ? Math.exp(enabledInputFactors.reduce((sum, factor) => sum + Math.log(Math.max(0.01, factor)), 0) / enabledInputFactors.length)
    : 1;

  const structureNorm = structureScore / 100;
  const liquidityNorm = liquidityScore / 100;
  const positioningNorm = positioningScore / 100;
  const momentumNorm = executionScore / 100;
  const conflictNorm = conflictLevel === "LOW" ? 0.2 : conflictLevel === "MED" ? 0.55 : 0.9;
  const pWin = clamp(
    sigmoid(-0.42 + 1.15 * structureNorm + 0.95 * liquidityNorm + 0.9 * positioningNorm + 1.05 * momentumNorm - 1.1 * conflictNorm),
    0.05,
    0.95,
  );
  const avgWinR = asymmetry === "REWARD_DOMINANT" ? 1.8 : asymmetry === "BALANCED" ? 1.25 : 0.75;
  const feesPct = scenario.horizon === "SCALP" ? 0.001 : scenario.horizon === "INTRADAY" ? 0.0008 : 0.0006;
  const slippagePct = slippage === "LOW" ? 0.0004 : slippage === "MED" ? 0.001 : 0.0018;
  const stopDistancePct = atrRegime === "HIGH" ? 0.018 : atrRegime === "NORMAL" ? 0.012 : 0.008;
  const costR = (feesPct + slippagePct) / Math.max(stopDistancePct, 0.004);
  const pStop = 1 - pWin;
  const edgeNetR = pWin * avgWinR - pStop - costR;
  const expectedRR = avgWinR;

  const spreadBad = spreadRegime === "WIDE" ? 1 : spreadRegime === "NORMAL" ? 0.55 : 0.2;
  const slippageBad = slippage === "HIGH" ? 1 : slippage === "MED" ? 0.55 : 0.2;
  const depthGood = liquidityDensity === "HIGH" ? 1 : liquidityDensity === "MID" ? 0.65 : 0.35;
  const obStable = orderbookStability === "STABLE" ? 1 : orderbookStability === "SHIFTING" ? 0.6 : 0.25;
  const volShock = marketStress === "HIGH" || marketSpeed === "VIOLENT" ? 1 : marketStress === "BUILDING" ? 0.6 : 0.25;
  const pFill = clamp(sigmoid(-0.25 - 1.1 * spreadBad - 1.2 * slippageBad + 1.35 * depthGood + 1.1 * obStable - 0.95 * volShock), 0.05, 0.99);

  const liquidityCapacityShare = liquidityDensity === "HIGH" ? 0.03 : liquidityDensity === "MID" ? 0.018 : 0.009;
  const desiredShareBase = scenario.riskMode === "AGGRESSIVE" ? 0.018 : scenario.riskMode === "NORMAL" ? 0.012 : 0.008;
  const desiredShareAdj = scenario.horizon === "SCALP" ? 0.004 : scenario.horizon === "SWING" ? -0.002 : 0;
  const desiredShare = clamp(desiredShareBase + desiredShareAdj, 0.005, 0.03);
  const capacityFactor = clamp(liquidityCapacityShare / desiredShare, 0, 1);

  const stressNorm = marketStress === "HIGH" ? 0.95 : marketStress === "BUILDING" ? 0.55 : 0.15;
  const shockNorm = marketSpeed === "VIOLENT" ? 1 : marketSpeed === "FAST" ? 0.65 : marketSpeed === "NORMAL" ? 0.35 : 0.15;
  const chopNorm = regime === "CHOP" ? 0.9 : regime === "RANGE" ? 0.55 : 0.2;
  const crowdNorm = crowdingRisk === "HIGH" ? 0.9 : crowdingRisk === "MODERATE" ? 0.55 : 0.2;
  const flowMomentum = clamp(momentumNorm * 0.75 + structureNorm * 0.25, 0, 1);
  const flowVolumeSpike = clamp(shockNorm * 0.8 + (participation === "STRONG" ? 0.2 : participation === "NORMAL" ? 0.1 : 0), 0, 1);
  const flowLiquiditySweep = clamp(
    (shockNorm * 0.45) +
      ((marketSpeed === "VIOLENT" || marketSpeed === "FAST") ? 0.28 : marketSpeed === "NORMAL" ? 0.14 : 0.04) +
      (orderbookImbalance !== "NEUTRAL" ? 0.12 : 0.05),
    0,
    1,
  );
  const holdBaseBars = scenario.horizon === "SCALP" ? 8 : scenario.horizon === "INTRADAY" ? 24 : 72;
  const holdStressFactor = marketStress === "HIGH" ? 0.6 : marketStress === "BUILDING" ? 0.8 : 1;
  const holdEntryFactor = entryTiming === "OPEN" ? 1 : entryTiming === "NARROW" ? 0.85 : 0.65;
  const expectedHoldingBars = Math.max(1, Math.round(holdBaseBars * holdStressFactor * holdEntryFactor));

  const penalties: Array<{ label: string; value: number; reason: string }> = [];
  if (riskChecks.executionCertainty && consensusInputs.slippage && slippage === "HIGH") {
    penalties.push({ label: "Slippage High", value: 12, reason: "Execution impact risk is high." });
  }
  if (riskChecks.stressFilter && consensusInputs.marketStress && marketStress === "HIGH") {
    penalties.push({ label: "Stress High", value: 10, reason: "Stress regime suppresses risk-adjusted edge." });
  }
  if (riskChecks.executionCertainty && consensusInputs.entryTiming && entryTiming === "CLOSED") {
    penalties.push({ label: "Entry Closed", value: 8, reason: "No executable timing window." });
  }
  if (riskChecks.executionCertainty && consensusInputs.slippage && orderbookStability === "SPOOF_RISK") {
    penalties.push({ label: "Spoof Risk", value: 6, reason: "Book stability degrades fill confidence." });
  }
  if (regime === "CHOP") {
    penalties.push({ label: "Chop Regime", value: 5, reason: "Directional edge decays in choppy regimes." });
  }
  if (riskChecks.stressFilter && consensusInputs.marketStress && crowdingRisk === "HIGH") {
    penalties.push({ label: "Crowding High", value: 8, reason: "Crowded positioning increases trap probability." });
  }
  const totalPenalty = Math.min(40, penalties.reduce((sum, penalty) => sum + penalty.value, 0));
  const fillFailure = clamp((0.45 - pFill) / 0.25, 0, 1);
  const slippageFailure = slippage === "LOW" ? 0 : slippage === "MED" ? 0.5 : 1;
  const depthFailure = depthQuality === "GOOD" ? 0 : depthQuality === "OK" ? 0.4 : depthQuality === "MID" ? 0.4 : 1;
  const spreadFailure = spreadRegime === "TIGHT" ? 0 : spreadRegime === "NORMAL" ? 0.4 : 1;
  const spoofFailure = orderbookStability === "STABLE" ? 0 : orderbookStability === "SHIFTING" ? 0.5 : 1;
  const microFailure = clamp((depthFailure + spreadFailure + spoofFailure) / 3, 0, 1);
  const stressFailure = marketStress === "HIGH" ? 1 : marketStress === "BUILDING" ? 0.5 : 0;
  const cascadeFailure = cascadeRisk === "HIGH" ? 1 : cascadeRisk === "MED" ? 0.6 : suddenMove === "HIGH" ? 1 : suddenMove === "MED" ? 0.6 : 0;
  const crowdingFailure = crowdingRisk === "HIGH" ? 1 : crowdingRisk === "MODERATE" ? 0.5 : 0;
  const edgeRiskMultiplierForCore = clamp(
    1 - ((0.15 * stressFailure) + (0.1 * cascadeFailure) + (0.05 * crowdingFailure)),
    isCapitalGuardMode ? 0.85 : 0.75,
    1,
  );
  const edgeSourceForCore = isCapitalGuardMode ? edgeNetR * edgeRiskMultiplierForCore : edgeNetR;
  const edgeCoreScore = clamp(((edgeSourceForCore + 0.05) / 0.35) * 100, 0, 100);
  const coreConsensus = isCapitalGuardMode
    ? (0.35 * structureScore) + (0.25 * executionScore) + (0.2 * edgeCoreScore) + (0.1 * liquidityScore) + (0.1 * positioningScore)
    : isBalancedMode
      ? (0.30 * structureScore) + (0.20 * liquidityScore) + (0.20 * positioningScore) + (0.20 * executionScore) + (0.10 * volatilityScore)
      : (0.33 * structureScore) + (0.14 * liquidityScore) + (0.34 * positioningScore) + (0.19 * executionScore);
  const stressCascadeBlock = !isAggressiveMode && marketStress === "HIGH" && cascadeRisk === "HIGH";
  const hardExecutionBlock = pFill < 0.2 || (depthQuality === "POOR" && spreadRegime === "WIDE" && slippage === "HIGH");
  const degradedFeedsCount = Object.values(dataHealth?.feedSources ?? {}).filter((source) => !source.healthy).length;
  const normalizedDepthQuality =
    depthQuality === "OK" ? "MID" : depthQuality;
  const flowPanels = tiles.map((tile) => ({
    key: tile.key,
    include: flowEnabled(tile.key),
    rawScore: clamp(tile.confidence ?? 50, 0, 100),
    weight: clamp(Number(panelWeights[tile.key] ?? FLOW_SIGNAL_DEFAULT_WEIGHTS[tile.key] ?? 3), 1, 10),
  }));
  const scoreResult = computeScore({
    mode: scoringMode,
    profile: scenario.horizon,
    edgeNetR,
    pFill,
    capacity: capacityFactor,
    inputModifier,
    stress: stressNorm,
    shock: shockNorm,
    chop: chopNorm,
    crowding: crowdNorm,
    penaltyPoints: totalPenalty,
    momentum: flowMomentum,
    volumeSpike: flowVolumeSpike,
    liquiditySweep: flowLiquiditySweep,
    coreConsensus,
    fillFailure,
    slippageFailure,
    microFailure,
    stressFailure,
    cascadeFailure,
    crowdingFailure,
    structureScore,
    liquidityScore,
    positioningScore,
    executionScore,
    volatilityScore,
    entryQualityScore,
    liquidityDensityState: liquidityDensity as "LOW" | "MID" | "HIGH" | "UNKNOWN",
    slippageLevelState: slippage as "LOW" | "MED" | "HIGH" | "UNKNOWN",
    depthQualityState: normalizedDepthQuality as "GOOD" | "MID" | "POOR" | "UNKNOWN",
    spreadRegimeState: spreadRegime as "TIGHT" | "MID" | "NORMAL" | "WIDE" | "UNKNOWN",
    spoofRiskState: orderbookStability as "LOW" | "MID" | "HIGH" | "STABLE" | "SHIFTING" | "SPOOF_RISK" | "UNKNOWN",
    feedLatencyMs: dataHealth?.feedLatencyMs ?? dataHealth?.latencyMs ?? 0,
    latencyMs: dataHealth?.uiLatencyMs ?? 0,
    degradedFeedsCount,
    hardBlockExecution: hardExecutionBlock,
    entryClosed: consensusInputs.entryTiming && entryTiming === "CLOSED",
    flowPanels,
    flowScoringTuning,
  });
  const riskAdjustment = scoreResult.riskAdj;
  const riskAdjustedEdgeR = edgeNetR * riskAdjustment;
  const rawConsensus = scoreResult.rawScore;
  const adjustedConsensus = scoreResult.baseScore;
  const prePenaltyScore = Math.round(adjustedConsensus);
  let finalScore = scoreResult.finalScore;

  const tradeValidityGateEnabled = consensusInputs.tradeValidity;
  const riskGateEnabled = consensusInputs.riskGate && riskChecks.riskGate;
  const entryTimingGateEnabled = consensusInputs.entryTiming;
  const fillGateEnabled = consensusInputs.slippage && riskChecks.executionCertainty;

  const hardGates = {
    tradeValidity: !tradeValidityGateEnabled || tradeValidityState !== "NO-TRADE",
    dataHealth: !Boolean(dataHealth?.staleFeed) && (dataHealth?.lastUpdateAgeSec ?? 0) <= 20,
    riskGate: !riskGateEnabled
      ? true
      : isCapitalGuardMode
      ? marketStress === "LOW" && cascadeRisk === "LOW"
      : isBalancedMode
        ? marketStress !== "HIGH"
        : !stressCascadeBlock && (!riskChecks.riskGate || provisionalRiskGate === "PASS"),
    entryWindow: !entryTimingGateEnabled || entryTiming === "OPEN",
    fillProb: !fillGateEnabled || (isCapitalGuardMode ? pFill >= 0.5 : isBalancedMode ? pFill >= 0.35 : pFill >= 0.2),
    edge: isCapitalGuardMode ? riskAdjustedEdgeR >= 0.1 : isBalancedMode ? riskAdjustedEdgeR >= 0.08 : isAggressiveMode ? true : edgeNetR >= modeConfig.gates.minEdgeR,
    capacity: isCapitalGuardMode ? capacityFactor >= 0.5 : capacityFactor >= 0.2,
  };
  const effectiveGatingFlags = scoreResult.gatingFlags.filter((flag) => {
    if (!consensusInputs.slippage && (flag === "LOW_FILL_PROB" || flag === "LOW_CAPACITY")) return false;
    if (!riskChecks.executionCertainty && (flag === "LOW_FILL_PROB" || flag === "LOW_CAPACITY")) return false;
    if (isAggressiveMode && flag === "LOW_EDGE") return false;
    if (!consensusInputs.riskGate && flag === "LOW_EDGE") return false;
    if (!riskChecks.riskGate && flag === "LOW_EDGE") return false;
    return true;
  });
  const capitalGuardStrictBlock = isCapitalGuardMode && (
    pFill < 0.5 ||
    slippage !== "LOW" ||
    depthQuality !== "GOOD" ||
    marketStress !== "LOW" ||
    cascadeRisk !== "LOW" ||
    riskAdjustedEdgeR < 0.1 ||
    asymmetry === "RISK_DOMINANT"
  );
  const balancedStrictBlock = isBalancedMode && (
    pFill < 0.35 ||
    (slippage === "HIGH" && depthQuality === "POOR") ||
    marketStress === "HIGH" ||
    riskAdjustedEdgeR < 0.08
  );
  const hardBlocked =
    !hardGates.tradeValidity ||
    !hardGates.dataHealth ||
    !hardGates.riskGate ||
    !hardGates.fillProb ||
    hardExecutionBlock ||
    stressCascadeBlock ||
    capitalGuardStrictBlock ||
    balancedStrictBlock;

  const aggressiveWaitCondition =
    isAggressiveMode &&
    ((entryTimingGateEnabled && entryTiming === "CLOSED") || pFill < 0.3 || (consensusInputs.slippage && slippage === "HIGH") || liquidityDensity === "LOW");

  if (hardBlocked) {
    const hardBlockConsensusCap = isCapitalGuardMode ? 35 : isBalancedMode ? 40 : 48;
    finalScore = Math.min(finalScore, hardBlockConsensusCap);
  } else if (entryTimingGateEnabled && entryTiming === "CLOSED") {
    const waitConsensusCap = isCapitalGuardMode ? 62 : isBalancedMode ? 66 : 78;
    finalScore = Math.min(finalScore, waitConsensusCap);
  }

  const decision =
    hardBlocked
      ? "NO_TRADE"
      : aggressiveWaitCondition
        ? "WATCHLIST"
        : (entryTimingGateEnabled && entryTiming === "CLOSED")
          ? "WATCHLIST"
          : isCapitalGuardMode
            ? finalScore < 60
              ? "NO_TRADE"
              : finalScore < 70
                ? "WATCHLIST"
                : finalScore < 80
                  ? "TRADE_ELIGIBLE"
                  : "HIGH_CONFIDENCE"
          : isAggressiveMode
            ? finalScore < 50
              ? "WATCHLIST"
              : finalScore < 65
                ? "TRADE_ELIGIBLE"
                : "HIGH_CONFIDENCE"
            : isBalancedMode
              ? finalScore < 55
                ? "NO_TRADE"
                : finalScore < 65
                  ? "WATCHLIST"
                  : finalScore < 70
                    ? "WATCHLIST"
                    : finalScore < 85
                      ? "TRADE_ELIGIBLE"
                      : "HIGH_CONFIDENCE"
            : finalScore < 60
              ? "NO_TRADE"
              : finalScore < 75
                ? "WATCHLIST"
                : finalScore < 85
                  ? "TRADE_ELIGIBLE"
                  : "HIGH_CONFIDENCE";

  const tradeValidity: AiPanelData["tradeValidity"] =
    decision === "NO_TRADE" ? "NO-TRADE" : decision === "WATCHLIST" ? "WEAK" : "VALID";
  const executionUrgency: AiPanelData["executionUrgency"] =
    entryTiming === "CLOSED"
      ? "WAIT"
      : decision === "HIGH_CONFIDENCE" && entryTiming === "OPEN" && slippage === "LOW"
      ? "ACT"
      : decision === "TRADE_ELIGIBLE"
        ? "PREPARE"
        : decision === "WATCHLIST"
          ? "WATCH"
          : "WAIT";

  const playbook =
    decision === "NO_TRADE"
      ? "Wait for reclaim"
      : bias === "LONG"
        ? "Buy pullbacks"
        : bias === "SHORT"
          ? "Sell rallies"
          : "Watchlist only";

  const normalizeContributions = (
    raw: Record<"structure" | "liquidity" | "positioning" | "execution", number>,
  ): Record<"structure" | "liquidity" | "positioning" | "execution", number> => {
    const keys = Object.keys(raw) as Array<"structure" | "liquidity" | "positioning" | "execution">;
    const total = keys.reduce((sum, key) => sum + raw[key], 0);
    if (total <= 0) return { structure: 0, liquidity: 0, positioning: 0, execution: 0 };
    let assigned = 0;
    const out = { structure: 0, liquidity: 0, positioning: 0, execution: 0 };
    keys.forEach((key, index) => {
      if (index === keys.length - 1) out[key] = 100 - assigned;
      else {
        out[key] = Math.round((raw[key] / total) * 100);
        assigned += out[key];
      }
    });
    return out;
  };

  const confidenceDrivers = normalizeContributions({
    structure: structureScore,
    liquidity: liquidityScore,
    positioning: positioningScore,
    execution: executionScore,
  });

  const rawTrendContinuation = Math.round((structureScore * 0.4) + (positioningScore * 0.35) + (executionScore * 0.25));
  const rawRangeContinuation = regime === "RANGE"
    ? Math.round((liquidityScore * 0.45) + (executionScore * 0.2) + ((100 - structureScore) * 0.35))
    : Math.round((100 - rawTrendContinuation) * 0.55);
  const trendContinuation = clamp(rawTrendContinuation, 0, 100);
  const rangeContinuation = clamp(rawRangeContinuation, 0, 100);
  const scenarioOutlook = {
    trendContinuation,
    rangeContinuation,
    breakoutMove: clamp(100 - trendContinuation - rangeContinuation, 0, 100),
  };

  const bandSpread = clamp(
    8 + Math.round((1 - pFill) * 12) + Math.round((1 - riskAdjustment) * 10) + Math.round(scoreResult.penaltyApplied / 8),
    8,
    24,
  );
  const confidenceBandLow = clamp(finalScore - bandSpread, 0, 100);
  const confidenceBandHigh = clamp(finalScore + bandSpread, 0, 100);

  const triggerConditions: string[] = [];
  if (tradeValidityGateEnabled && tradeValidityState === "NO-TRADE") triggerConditions.push("Trade validity PASS");
  if (entryTimingGateEnabled && riskChecks.executionCertainty && entryTiming !== "OPEN") triggerConditions.push("Entry window OPEN");
  if (isCapitalGuardMode && slippage !== "LOW") triggerConditions.push("Slippage = LOW");
  else if (consensusInputs.slippage && riskChecks.executionCertainty && slippage === "HIGH") triggerConditions.push("Slippage <= MED");
  if (!["MID", "HIGH"].includes(liquidityDensity)) triggerConditions.push("Liquidity density >= MID");
  if (consensusInputs.marketStress && riskChecks.stressFilter && crowdingRisk === "HIGH") triggerConditions.push("Crowding <= MODERATE");
  if (riskGateEnabled && provisionalRiskGate !== "PASS") triggerConditions.push("Risk gate PASS");
  const minFillRequired = isCapitalGuardMode ? 0.5 : isBalancedMode ? 0.35 : isAggressiveMode ? 0.3 : modeConfig.gates.minFillProb;
  if (fillGateEnabled && pFill < minFillRequired) triggerConditions.push(`Fill probability >= ${minFillRequired.toFixed(2)}`);
  const minEdgeRequired = isCapitalGuardMode ? 0.1 : modeConfig.gates.minEdgeR;
  if (!isAggressiveMode && (isCapitalGuardMode ? riskAdjustedEdgeR < minEdgeRequired : edgeNetR < minEdgeRequired)) {
    triggerConditions.push(`Expected edge >= ${minEdgeRequired.toFixed(2)}R`);
  }
  const minCapacityRequired = isCapitalGuardMode ? 0.5 : modeConfig.gates.minCapacity;
  if (riskChecks.executionCertainty && capacityFactor < minCapacityRequired) triggerConditions.push(`Capacity >= ${minCapacityRequired.toFixed(2)}`);
  if (!hardGates.dataHealth) triggerConditions.push("Data health gate PASS");

  const invalidationTriggers =
    bias === "LONG"
      ? ["Break below VWAP", "Liquidity sweep below support", "Risk gate BLOCK"]
      : bias === "SHORT"
        ? ["Break above VWAP", "Liquidity sweep above resistance", "Risk gate BLOCK"]
        : ["N/A"];

  const penaltySummary = penalties.length
    ? penalties.map((penalty) => `${penalty.label} (-${penalty.value})`).join(", ")
    : "No active penalties";
  const formulaLine = `${scoreResult.formulaPreview} = ${finalScore.toFixed(2)}`;
  const hardGateSummary = `Gates trade=${hardGates.tradeValidity ? "PASS" : "BLOCK"} data=${hardGates.dataHealth ? "PASS" : "BLOCK"} risk=${hardGates.riskGate ? "PASS" : "BLOCK"} entry=${hardGates.entryWindow ? "PASS" : "BLOCK"} fill=${hardGates.fillProb ? "PASS" : "BLOCK"} edge=${hardGates.edge ? "PASS" : "BLOCK"} capacity=${hardGates.capacity ? "PASS" : "BLOCK"}`;
  const modeSummary = `${scoringMode}: ${scoringModeDescription(scoringMode)}`;
  const explainability = [
    modeSummary,
    `Layer scores => Structure ${structureScore}, Liquidity ${liquidityScore}, Positioning ${positioningScore}, Execution ${executionScore}.`,
    `Edge ${edgeNetR.toFixed(3)}R, Fill ${pFill.toFixed(2)}, Capacity ${capacityFactor.toFixed(2)}, RiskAdj ${riskAdjustment.toFixed(2)}, InputMod ${inputModifier.toFixed(2)}.`,
    `Active soft consensus controls ${softConsensusControlCount}.`,
    `Flow signal inputs active ${flowSignalActive}/${flowSignalTotal}.`,
    `Raw ${rawConsensus.toFixed(1)}, adjusted ${prePenaltyScore}, penaltyRate ${(scoreResult.penaltyRate * 100).toFixed(1)}%, final ${finalScore}.`,
    `Penalty set: ${penaltySummary}.`,
    effectiveGatingFlags.length ? `Gating flags: ${effectiveGatingFlags.join(", ")}.` : "Gating flags: none.",
    hardGateSummary,
    formulaLine,
  ];

  const moveBase = clamp(edgeNetR * 3.5 + finalScore / 140, 0.2, 4.2);
  const lowerMove = Number(moveBase.toFixed(2));
  const upperMove = Number((moveBase * 1.8).toFixed(2));
  const expectedMove = decision === "NO_TRADE" ? "N/A" : `${lowerMove.toFixed(1)}% - ${upperMove.toFixed(1)}% next session`;

  const sizeHint: AiPanelData["sizeHint"] =
    decision === "NO_TRADE" ? "0"
      : decision === "WATCHLIST" ? "0.25x"
        : decision === "TRADE_ELIGIBLE" ? "0.5x"
          : "1x";
  const sizeHintReason =
    decision === "NO_TRADE"
      ? "Rule-based gate blocks execution under current conditions."
      : decision === "WATCHLIST"
        ? "Signals are mixed; keep exploratory risk only."
        : decision === "TRADE_ELIGIBLE"
          ? "Conditions are acceptable but not elite."
          : "Structure, liquidity, positioning and execution are aligned.";

  const sessionContext: AiPanelData["sessionContext"] = (() => {
    const hour = new Date().getUTCHours();
    if (hour < 6) return { session: "Asia", liquidityExpectation: "Normal" };
    if (hour < 12) return { session: "EU", liquidityExpectation: "High" };
    if (hour < 21) return { session: "US", liquidityExpectation: "High" };
    return { session: "Weekend", liquidityExpectation: "Lower" };
  })();

  const priceLocation = `${regime === "RANGE" ? "Inside range" : "Directional move"} / ${vwapPosition === "ABOVE" ? "Above VWAP" : vwapPosition === "BELOW" ? "Below VWAP" : "Near VWAP"} / Liquidity ${liquidityDistance}`;
  const recentRegimePath =
    regime === "RANGE"
      ? ["RANGE", "FAKE BREAK", "RANGE"]
      : regime === "TREND"
        ? ["RANGE", "BREAKOUT", "TREND"]
        : ["TREND", "CHOP", "CHOP"];
  const layerScores = {
    execution: executionScore,
    structure: structureScore,
    microstructure: microstructureScore,
    positioning: positioningScore,
    volatility: volatilityScore,
    risk: riskScore,
    onchain: onchainScore,
  };

  return {
    summary: [
      `Deterministic decision: ${decision} with final score ${finalScore}.`,
      `Scoring mode ${scoringMode}: ${scoringModeDescription(scoringMode)}.`,
      `Layer consensus ${baseLayerConsensus} with edge ${edgeNetR.toFixed(2)}R and fill ${pFill.toFixed(2)}.`,
      `Bias ${bias}, intent ${intent}, conflict ${conflictLevel}. ${hardGateSummary}.`,
      `${scenario.horizon} horizon in ${scenario.riskMode} mode; breakout-only ${scenario.breakoutOnly ? "ON" : "OFF"}.`,
    ],
    keyReasons: [
      `Structure ${structureScore} | Liquidity ${liquidityScore} | Positioning ${positioningScore} | Execution ${executionScore}.`,
      `Edge ${edgeNetR.toFixed(2)}R (pWin ${pWin.toFixed(2)}, avgWin ${avgWinR.toFixed(2)}R, cost ${costR.toFixed(2)}R).`,
      `Pstop ${pStop.toFixed(2)}, expRR ${expectedRR.toFixed(2)}, risk-adjusted edge ${riskAdjustedEdgeR.toFixed(2)}R, hold ~${expectedHoldingBars} bars.`,
      `Entry ${entryTiming}, slippage ${slippage}, fill ${pFill.toFixed(2)}, capacity ${capacityFactor.toFixed(2)}.`,
      `Penalty engine: ${penaltySummary}.`,
      `Model agreement ${modelAgreement.aligned}/${modelAgreement.totalModels} aligned ${modelAgreement.direction}.`,
      `Regime ${regime}, structure age ${structureAge}, time in range ${timeInRange} bars.`,
      `Relative strength ${htfAlignment}, participation ${participation}.`,
    ],
    riskChecks: [
      {
        label: "Risk Gate",
        status: hardGates.riskGate ? "PASS" : "BLOCK",
        detail: !riskGateEnabled
          ? "Excluded from consensus by user setting."
          : hardGates.riskGate
            ? "Conditions inside configured risk limits."
            : "Risk gate blocked by state scoring.",
      },
      {
        label: "Execution Certainty",
        status: hardGates.entryWindow && hardGates.fillProb ? "PASS" : "BLOCK",
        detail: !fillGateEnabled && !entryTimingGateEnabled
          ? "Excluded from consensus by user setting."
          : !riskChecks.executionCertainty
          ? "Excluded from consensus by user setting."
          : `Entry ${entryTiming}, fill ${pFill.toFixed(2)}, capacity ${capacityFactor.toFixed(2)}, execution score ${executionScore}.`,
      },
      {
        label: "Stress Filter",
        status: riskAdjustment >= 0.55 && marketStress !== "HIGH" ? "PASS" : "BLOCK",
        detail: !consensusInputs.marketStress || !riskChecks.stressFilter
          ? "Excluded from consensus by user setting."
          : `Stress ${marketStress}, market speed ${marketSpeed}, sudden move ${suddenMove}, riskAdj ${riskAdjustment.toFixed(2)}.`,
      },
    ],
    tradeValidity,
    bias,
    signalConsensus: finalScore,
    conflictLevel,
    marketIntent: intent,
    playbook,
    confidenceBand: [confidenceBandLow, confidenceBandHigh],
    confidenceDrivers,
    scenarioOutlook,
    crowdingRisk,
    priceLocation,
    freshness: {
      updatedSecAgo: dataHealth?.lastUpdateAgeSec ?? 12,
      validForBars: decision === "NO_TRADE" ? 0 : scenario.horizon === "SCALP" ? 2 : scenario.horizon === "INTRADAY" ? 4 : 6,
    },
    triggerConditions: tradeValidity === "VALID" ? [] : triggerConditions,
    invalidationTriggers,
    executionUrgency,
    expectedMove,
    recentRegimePath,
    modelAgreement,
    explainability,
    sizeHint,
    sizeHintReason,
    sessionContext,
    timeContextSummary: `Structure ${structureAge} | Time in range ${timeInRange} bars`,
    riskEnvironmentSummary: `Stress ${marketStress} | Crowding ${crowdingRisk} | Regime ${regime}`,
    executionCertaintySummary: `Entry ${entryTiming} | Fill ${pFill.toFixed(2)} | Capacity ${capacityFactor.toFixed(2)}`,
    portfolioContextSummary: `Bias ${bias} | Intent ${intent} | Edge ${edgeNetR.toFixed(2)}R | Decision ${decision}`,
    scoringMode,
    scoreBreakdown: scoreResult.scoreBreakdown,
    gatingFlags: effectiveGatingFlags,
    scoring_mode: scoringMode,
    score_breakdown: scoreResult.scoreBreakdown,
    gating_flags: effectiveGatingFlags,
    layerScores,
    consensusEngine: {
      dataComplete: true,
      edgeNetR: Number(edgeNetR.toFixed(4)),
      pWin: Number(pWin.toFixed(4)),
      pStop: Number(pStop.toFixed(4)),
      avgWinR: Number(avgWinR.toFixed(4)),
      expectedRR: Number(expectedRR.toFixed(4)),
      costR: Number(costR.toFixed(4)),
      pFill: Number(pFill.toFixed(4)),
      capacityFactor: Number(capacityFactor.toFixed(4)),
      riskAdjustment: Number(riskAdjustment.toFixed(4)),
      riskAdjustedEdgeR: Number(riskAdjustedEdgeR.toFixed(4)),
      expectedHoldingBars,
      inputModifier: Number(inputModifier.toFixed(4)),
      rawConsensus: Number(rawConsensus.toFixed(4)),
      adjustedConsensus: Number(adjustedConsensus.toFixed(4)),
      penalizedConsensus: Number(scoreResult.penalizedScore.toFixed(4)),
      penaltyTotal: Number(scoreResult.penaltyApplied.toFixed(4)),
      penaltyModel: scoreResult.penaltyModel,
      penaltyRate: Number(scoreResult.penaltyRate.toFixed(4)),
      penaltyApplied: Number(scoreResult.penaltyApplied.toFixed(4)),
      hardGates,
      formulaLine,
    },
  };
};


export const calculateEma = (series: OhlcvPoint[], period: number): Array<{ time: number; value: number }> => {
  if (!series.length) return [];
  const k = 2 / (period + 1);
  let ema = series[0].close;

  return series.map((point) => {
    ema = point.close * k + ema * (1 - k);
    return { time: point.time, value: Number(ema.toFixed(2)) };
  });
};

export const calculateVwap = (series: OhlcvPoint[]): Array<{ time: number; value: number }> => {
  let cumulativePv = 0;
  let cumulativeVolume = 0;

  return series.map((point) => {
    const typical = (point.high + point.low + point.close) / 3;
    cumulativePv += typical * point.volume;
    cumulativeVolume += point.volume;

    return {
      time: point.time,
      value: Number((cumulativePv / cumulativeVolume).toFixed(2)),
    };
  });
};

export const deriveKeyLevels = (series: OhlcvPoint[]): KeyLevel[] => {
  if (!series.length) return [];
  const last = series[series.length - 1].close;
  return [
    { label: "Weekly Resistance", price: Number((last * 1.018).toFixed(2)) },
    { label: "Current Pivot", price: Number((last * 1.004).toFixed(2)) },
    { label: "VWAP Magnet", price: Number((last * 0.997).toFixed(2)) },
    { label: "Weekly Support", price: Number((last * 0.982).toFixed(2)) },
  ];
};
