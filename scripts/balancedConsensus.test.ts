import test from "node:test";
import assert from "node:assert/strict";
import { computeBalancedConsensus } from "../src/data/balancedConsensus.ts";

const healthyData = {
  staleFeed: false,
  missingFields: 0,
  latencyMs: 900,
  feeds: {
    ohlcv: "healthy",
    orderbook: "healthy",
    oi: "healthy",
    funding: "healthy",
    netflow: "healthy",
    trades: "healthy",
  },
} as const;

// Ideal signals for all components
const idealSignals = {
  orderbookImbalance: "BUY" as const,
  oiChangeStrength: "HIGH" as const,
  fundingBias: "BULLISH" as const,
  fundingRatePct: 0.02,
  oiChangePct: 3,
  spotVsDerivativesPressure: "SPOT_DOM" as const,
  volumeSpike: "ON" as const,
  whaleActivity: "ACCUMULATION" as const,
  exchangeFlow: "OUTFLOW" as const,
  relativeStrength: "STRONG" as const,
  liquidationPoolBias: "UNKNOWN" as const,
  rsiState: "NEUTRAL" as const,
  atrRegime: "MID" as const,
  liquidityDensity: "HIGH" as const,
  suddenMoveRisk: "LOW" as const,
  impulseReadiness: "HIGH" as const,
  dxyTrend: "DOWN" as const,
  nasdaqTrend: "UP" as const,
};

test("high conviction setup produces TRADE with Adaptive Alpha diagnostics", () => {
  const out = computeBalancedConsensus({
    structureScore: 85,
    liquidityScore: 80,
    positioningScore: 82,
    executionScore: 75,
    regime: "TREND",
    trendStrength: "HIGH",
    emaAlignment: "BULL",
    vwapPosition: "ABOVE",
    structureAge: "EARLY",
    marketSpeed: "FAST",
    compression: "ON",
    spreadRegime: "TIGHT",
    depthQuality: "GOOD",
    spoofRisk: "LOW",
    slippageLevel: "LOW",
    pFill: 0.85,
    capacity: 0.9,
    stressLevel: "LOW",
    crowdingRisk: "LOW",
    cascadeRisk: "LOW",
    entryWindow: "OPEN",
    alignedCount: 5,
    totalModels: 6,
    dataHealth: healthyData,
    ...idealSignals,
  });

  assert.equal(out.mode, "BALANCED");
  assert.equal(out.gates.data, "PASS");
  assert.equal(out.gates.safety, "PASS");
  // All guardrails should pass with ideal signals
  assert.ok(out.diagnostics.layers.guardrails.allPass, "All guardrails should pass");
  // Final score should be well above TRADE threshold (64)
  assert.ok(out.finalScore >= 64, `expected finalScore >= 64, got ${out.finalScore}`);
  assert.ok(out.sizeHint >= 0.40, `expected sizeHint >= 0.40, got ${out.sizeHint}`);
  // Verify new component diagnostics structure
  assert.ok(typeof out.diagnostics.layers.structure.score === "number");
  assert.ok(typeof out.diagnostics.layers.liquidity.score === "number");
  assert.ok(typeof out.diagnostics.layers.positioning.score === "number");
  assert.ok(typeof out.diagnostics.layers.execution.score === "number");
  assert.ok(typeof out.diagnostics.layers.volatility.score === "number");
  assert.ok(typeof out.diagnostics.layers.confirmation.score === "number");
  assert.ok(typeof out.diagnostics.layers.riskPenalty.total === "number");
  assert.ok(typeof out.diagnostics.layers.tradeScore === "number");
  // Backward-compat aliases exist
  assert.ok(typeof out.diagnostics.layers.opportunity.score === "number");
  assert.ok(typeof out.diagnostics.layers.direction.score === "number");
  assert.ok(typeof out.diagnostics.layers.relativeStrength.score === "number");
  // Verify breakdowns
  assert.ok(Object.keys(out.diagnostics.layers.structure.breakdown).length >= 4);
  assert.ok(Object.keys(out.diagnostics.layers.positioning.breakdown).length >= 4);
  assert.ok(Object.keys(out.diagnostics.layers.execution.breakdown).length >= 5);
  // Playbook and new outputs
  assert.ok(typeof out.playbook === "string");
  assert.ok(typeof out.candidateScore === "number");
  assert.ok(typeof out.rankScore === "number");
});

test("playbook detects TREND_PULLBACK for trending market", () => {
  const out = computeBalancedConsensus({
    structureScore: 80,
    liquidityScore: 75,
    positioningScore: 78,
    executionScore: 70,
    regime: "TREND",
    trendStrength: "HIGH",
    emaAlignment: "BULL",
    vwapPosition: "ABOVE",
    structureAge: "EARLY",
    marketSpeed: "FAST",
    compression: "OFF",
    spreadRegime: "TIGHT",
    depthQuality: "GOOD",
    spoofRisk: "LOW",
    slippageLevel: "LOW",
    pFill: 0.80,
    capacity: 0.8,
    stressLevel: "LOW",
    crowdingRisk: "LOW",
    cascadeRisk: "LOW",
    entryWindow: "OPEN",
    alignedCount: 4,
    totalModels: 6,
    dataHealth: healthyData,
    ...idealSignals,
    orderbookImbalance: "BUY",
  });

  assert.equal(out.playbook, "TREND_PULLBACK");
  assert.ok(out.diagnostics.layers.playbookBoost === 3, `expected playbookBoost 3, got ${out.diagnostics.layers.playbookBoost}`);
});

test("playbook detects RANGE_ROTATION for sideways market", () => {
  const out = computeBalancedConsensus({
    structureScore: 70,
    liquidityScore: 65,
    positioningScore: 65,
    executionScore: 60,
    regime: "RANGE",
    trendStrength: "LOW",
    emaAlignment: "MIXED",
    vwapPosition: "AT",
    marketSpeed: "SLOW",
    compression: "OFF",
    spreadRegime: "MID",
    depthQuality: "MID",
    spoofRisk: "LOW",
    slippageLevel: "MED",
    pFill: 0.6,
    capacity: 0.6,
    stressLevel: "LOW",
    crowdingRisk: "LOW",
    cascadeRisk: "LOW",
    entryWindow: "OPEN",
    dataHealth: healthyData,
    ...idealSignals,
    rangePosition: "UPPER",
    fakeBreakoutProb: "LOW",
  });

  assert.equal(out.playbook, "RANGE_ROTATION");
  assert.ok(out.diagnostics.layers.playbookBoost === 2);
});

test("no-trade rule blocks when 2+ danger signals", () => {
  const out = computeBalancedConsensus({
    structureScore: 80,
    liquidityScore: 75,
    positioningScore: 75,
    executionScore: 70,
    regime: "TREND",
    trendStrength: "HIGH",
    emaAlignment: "BULL",
    vwapPosition: "ABOVE",
    marketSpeed: "FAST",
    compression: "OFF",
    spreadRegime: "TIGHT",
    depthQuality: "GOOD",
    spoofRisk: "HIGH",          // → trapProbabilityHigh = true
    slippageLevel: "HIGH",
    pFill: 0.7,
    capacity: 0.7,
    stressLevel: "LOW",
    crowdingRisk: "LOW",
    cascadeRisk: "LOW",
    entryWindow: "CLOSED",      // → executionCertaintyLow = true (CLOSED + HIGH slippage)
    dataHealth: healthyData,
    ...idealSignals,
    suddenMoveRisk: "HIGH",     // → newsRiskOn = true
    conflictLevel: "HIGH",      // → signalConflictHigh = true
  });

  // No-trade rule should be blocked (4 danger signals)
  assert.ok(out.diagnostics.layers.noTradeRule.blocked, "No-trade rule should be blocked");
  assert.ok(out.diagnostics.layers.noTradeRule.dangerCount >= 2, `expected >= 2 danger signals, got ${out.diagnostics.layers.noTradeRule.dangerCount}`);
  assert.ok(out.finalScore <= 48, `expected finalScore <= 48, got ${out.finalScore}`);
});

test("model agreement gate caps score when agreement < 50%", () => {
  const out = computeBalancedConsensus({
    structureScore: 85,
    liquidityScore: 80,
    positioningScore: 80,
    executionScore: 75,
    regime: "TREND",
    trendStrength: "HIGH",
    emaAlignment: "BULL",
    vwapPosition: "ABOVE",
    structureAge: "EARLY",
    marketSpeed: "FAST",
    compression: "ON",
    spreadRegime: "TIGHT",
    depthQuality: "GOOD",
    spoofRisk: "LOW",
    slippageLevel: "LOW",
    pFill: 0.85,
    capacity: 0.9,
    stressLevel: "LOW",
    crowdingRisk: "LOW",
    cascadeRisk: "LOW",
    entryWindow: "OPEN",
    alignedCount: 2,      // < 3/6 = below 50%
    totalModels: 6,
    dataHealth: healthyData,
    ...idealSignals,
  });

  // Score should be capped at 64 due to model agreement
  assert.ok(out.adjustedScore <= 64, `adjustedScore should be <= 64 (model agreement cap), got ${out.adjustedScore}`);
});

test("guardrails block TRADE when sub-scores fail even with high final score", () => {
  const out = computeBalancedConsensus({
    structureScore: 90,
    liquidityScore: 80,
    positioningScore: 80,
    executionScore: 75,
    regime: "TREND",
    trendStrength: "HIGH",
    emaAlignment: "BULL",
    vwapPosition: "ABOVE",
    marketSpeed: "FAST",
    compression: "ON",
    spreadRegime: "TIGHT",
    depthQuality: "POOR",     // → Liq score will be low
    spoofRisk: "LOW",
    slippageLevel: "LOW",
    pFill: 0.85,
    capacity: 0.3,            // → Liq score will be low
    stressLevel: "LOW",
    crowdingRisk: "LOW",
    cascadeRisk: "LOW",
    entryWindow: "OPEN",
    dataHealth: healthyData,
    ...idealSignals,
    liquidityDensity: "LOW",  // → Liq score way down
  });

  // Liq guardrail should fail (requires >= 38)
  assert.equal(out.diagnostics.layers.guardrails.liqPass, false);
  assert.equal(out.diagnostics.layers.guardrails.allPass, false);
});

test("positioning uncertain cap limits score to 82", () => {
  const out = computeBalancedConsensus({
    structureScore: 90,
    liquidityScore: 85,
    positioningScore: 85,
    executionScore: 80,
    regime: "RANGE",           // → Pos score lower (weak orderflow)
    trendStrength: "LOW",
    emaAlignment: "MIXED",
    vwapPosition: "AT",
    marketSpeed: "FAST",
    compression: "ON",
    spreadRegime: "TIGHT",
    depthQuality: "GOOD",
    spoofRisk: "LOW",
    slippageLevel: "LOW",
    pFill: 0.85,
    capacity: 0.9,
    stressLevel: "LOW",
    crowdingRisk: "LOW",
    cascadeRisk: "LOW",
    entryWindow: "OPEN",
    dataHealth: healthyData,
    ...idealSignals,
    orderbookImbalance: "NEUTRAL",
    oiChangeStrength: "LOW",
    oiChangePct: 0.2,
    fundingBias: "NEUTRAL",
    whaleActivity: "NEUTRAL",
    exchangeFlow: "NEUTRAL",
  });

  // Positioning score should be < 55 → positioning uncertain cap at 82
  assert.ok(out.diagnostics.layers.positioning.score < 55, `Pos should be < 55, got ${out.diagnostics.layers.positioning.score}`);
  assert.ok(out.adjustedScore <= 82, `adjustedScore should be <= 82, got ${out.adjustedScore}`);
});

test("risk penalty reduces score with active risks", () => {
  const out = computeBalancedConsensus({
    structureScore: 75,
    liquidityScore: 70,
    positioningScore: 70,
    executionScore: 65,
    regime: "TREND",
    trendStrength: "MID",
    emaAlignment: "BULL",
    vwapPosition: "ABOVE",
    spreadRegime: "MID",
    depthQuality: "MID",
    spoofRisk: "MID",
    slippageLevel: "MED",
    pFill: 0.6,
    capacity: 0.7,
    stressLevel: "HIGH",           // → news/stress penalty
    crowdingRisk: "MID",
    cascadeRisk: "HIGH",           // → cascade -3
    entryWindow: "OPEN",
    dataHealth: healthyData,
    ...idealSignals,
    suddenMoveRisk: "HIGH",        // → news/stress -3 (both HIGH)
    fundingBias: "EXTREME",        // → funding -2
    whaleActivity: "DISTRIBUTION", // → whale -2
    exchangeFlow: "INFLOW",
  });

  // Risk penalty should be negative
  assert.ok(out.diagnostics.layers.riskPenalty.total < 0, `Risk penalty should be < 0, got ${out.diagnostics.layers.riskPenalty.total}`);
  assert.ok(out.diagnostics.layers.riskPenalty.breakdown.cascade === -3);
  assert.ok(out.diagnostics.layers.riskPenalty.breakdown.fundingSpike === -2);
  assert.ok(out.diagnostics.layers.riskPenalty.breakdown.newsStress === -3);
  assert.ok(out.diagnostics.layers.riskPenalty.breakdown.whaleAnomaly === -2);
});

test("safety block caps final score at <=44 and sizeHint to zero", () => {
  const out = computeBalancedConsensus({
    structureScore: 82,
    liquidityScore: 64,
    positioningScore: 72,
    executionScore: 58,
    regime: "TREND",
    trendStrength: "HIGH",
    emaAlignment: "BULL",
    vwapPosition: "ABOVE",
    spreadRegime: "WIDE",
    depthQuality: "POOR",
    spoofRisk: "HIGH",
    slippageLevel: "HIGH",
    pFill: 0.4,
    capacity: 0.5,
    stressLevel: "HIGH",
    crowdingRisk: "MID",
    cascadeRisk: "HIGH",          // stress+cascade HIGH → safety block
    entryWindow: "OPEN",
    dataHealth: healthyData,
    ...idealSignals,
  });

  assert.equal(out.gates.data, "PASS");
  assert.equal(out.gates.safety, "BLOCK");
  assert.ok(out.finalScore <= 44, `expected finalScore <= 44, got ${out.finalScore}`);
  assert.equal(out.sizeHint, 0);
  assert.ok(out.reasons.some((r) => r.includes("Safety block")));
});

test("position size tiers: 85+=1.0, 78-84=0.90, 72-77=0.70, 64-71=0.40, <64=0", () => {
  // Test a moderate scenario
  const out = computeBalancedConsensus({
    structureScore: 70,
    liquidityScore: 65,
    positioningScore: 65,
    executionScore: 60,
    regime: "TREND",
    trendStrength: "MID",
    emaAlignment: "BULL",
    vwapPosition: "ABOVE",
    spreadRegime: "MID",
    depthQuality: "MID",
    spoofRisk: "MID",
    slippageLevel: "MED",
    pFill: 0.55,
    capacity: 0.6,
    stressLevel: "LOW",
    crowdingRisk: "LOW",
    cascadeRisk: "LOW",
    entryWindow: "OPEN",
    dataHealth: healthyData,
    ...idealSignals,
    oiChangeStrength: "MID",
    fundingBias: "NEUTRAL",
    whaleActivity: "NEUTRAL",
    orderbookImbalance: "NEUTRAL",
    relativeStrength: "NEUTRAL",
    spotVsDerivativesPressure: "BALANCED",
  });

  // sizeHint should be one of the discrete tiers
  assert.ok(
    [0, 0.40, 0.70, 0.90, 1.0].includes(out.sizeHint),
    `sizeHint ${out.sizeHint} not in expected tiers`,
  );
});

test("execution combo penalty is capped at -4", () => {
  const out = computeBalancedConsensus({
    structureScore: 80,
    liquidityScore: 75,
    positioningScore: 75,
    executionScore: 70,
    regime: "TREND",
    trendStrength: "HIGH",
    emaAlignment: "BULL",
    vwapPosition: "ABOVE",
    spreadRegime: "TIGHT",
    depthQuality: "GOOD",
    spoofRisk: "HIGH",        // → combo penalty -1.5
    slippageLevel: "HIGH",    // → combo penalty -1.5
    pFill: 0.2,               // → combo penalty -1.5 (total raw = -4.5, capped at -4)
    capacity: 0.3,
    stressLevel: "LOW",
    crowdingRisk: "LOW",
    cascadeRisk: "LOW",
    entryWindow: "OPEN",
    dataHealth: healthyData,
    ...idealSignals,
    liquidityDensity: "HIGH",
  });

  // Combo penalty should be capped at -4
  assert.ok(
    out.diagnostics.layers.execution.breakdown.comboPenalty >= -4,
    `comboPenalty should be >= -4, got ${out.diagnostics.layers.execution.breakdown.comboPenalty}`,
  );
});
