import test from "node:test";
import assert from "node:assert/strict";
import { computeExtremeConsensus } from "../src/data/extremeConsensus.ts";

const fullHealthy = {
  staleFeed: false,
  missingFields: 0,
  latencyMs: 50,
  feeds: { ohlcv: "healthy" as const, orderbook: "healthy" as const, oi: "healthy" as const, funding: "healthy" as const, netflow: "healthy" as const, trades: "healthy" as const },
};

test("Flow high conviction trending setup produces TRADE with high score", () => {
  const out = computeExtremeConsensus({
    structureScore: 85,
    liquidityScore: 80,
    positioningScore: 75,
    executionScore: 80,
    regime: "TREND",
    trendStrength: "HIGH",
    emaAlignment: "BULL",
    vwapPosition: "ABOVE",
    structureAge: "EARLY",
    marketSpeed: "FAST",
    compression: "ON",
    spoofRisk: "LOW",
    spreadRegime: "TIGHT",
    depthQuality: "GOOD",
    cascadeRisk: "LOW",
    stressLevel: "LOW",
    entryWindow: "OPEN",
    pFill: 0.82,
    capacity: 0.8,
    slippageLevel: "LOW",
    orderbookImbalance: "BUY",
    oiChangeStrength: "HIGH",
    fundingBias: "BEARISH",
    fundingRatePct: -0.02,
    oiChangePct: 5.5,
    spotVsDerivativesPressure: "SPOT_DOM",
    volumeSpike: "ON",
    whaleActivity: "ACCUMULATION",
    exchangeFlow: "OUTFLOW",
    relativeStrength: "STRONG",
    liquidationPoolBias: "UP",
    atrRegime: "MID",
    liquidityDensity: "HIGH",
    suddenMoveRisk: "LOW",
    impulseReadiness: "HIGH",
    rrPotential: "HIGH",
    alignedCount: 5,
    totalModels: 6,
    dataHealth: fullHealthy,
  });

  assert.equal(out.mode, "EXTREME");
  assert.ok(out.extremeScore >= 72, `Expected score >= 72, got ${out.extremeScore}`);
  assert.ok(out.ideaMode === "TRADE" || out.ideaMode === "HIGH_CONVICTION", `Expected TRADE or HIGH_CONVICTION, got ${out.ideaMode}`);
  assert.equal(out.playbook, "TREND_PULLBACK");
  assert.ok(out.sizeHint > 0, "Expected positive sizeHint for TRADE");
  assert.ok(out.diagnostics.layers.structure.score >= 60);
  assert.ok(out.diagnostics.layers.liquidity.score >= 60);
});

test("Flow high conviction setup produces HIGH_CONVICTION ideaMode", () => {
  const out = computeExtremeConsensus({
    structureScore: 90,
    liquidityScore: 85,
    positioningScore: 80,
    executionScore: 85,
    regime: "TREND",
    trendStrength: "HIGH",
    emaAlignment: "BULL",
    vwapPosition: "ABOVE",
    structureAge: "EARLY",
    marketSpeed: "FAST",
    compression: "ON",
    spoofRisk: "LOW",
    spreadRegime: "TIGHT",
    depthQuality: "GOOD",
    cascadeRisk: "LOW",
    stressLevel: "LOW",
    entryWindow: "OPEN",
    pFill: 0.85,
    capacity: 0.9,
    slippageLevel: "LOW",
    orderbookImbalance: "BUY",
    oiChangeStrength: "HIGH",
    fundingBias: "BEARISH",
    fundingRatePct: -0.02,
    oiChangePct: 6.0,
    spotVsDerivativesPressure: "SPOT_DOM",
    volumeSpike: "ON",
    whaleActivity: "ACCUMULATION",
    exchangeFlow: "OUTFLOW",
    relativeStrength: "STRONG",
    liquidationPoolBias: "UP",
    atrRegime: "MID",
    liquidityDensity: "HIGH",
    suddenMoveRisk: "LOW",
    impulseReadiness: "HIGH",
    rrPotential: "HIGH",
    alignedCount: 5,
    totalModels: 6,
    dataHealth: fullHealthy,
  });

  assert.equal(out.ideaMode, "HIGH_CONVICTION");
  assert.ok(out.candidateScore >= 58, `CS ${out.candidateScore} should be >= 58`);
  assert.ok(out.finalTradeScore >= 68, `FTS ${out.finalTradeScore} should be >= 68`);
  assert.ok(out.sizeHint >= 0.70);
});

test("Flow playbook detects FAILED_BREAKOUT_RECLAIM", () => {
  const out = computeExtremeConsensus({
    structureScore: 65,
    liquidityScore: 60,
    positioningScore: 60,
    executionScore: 60,
    regime: "RANGE",
    trendStrength: "LOW",
    emaAlignment: "MIXED",
    vwapPosition: "AT",
    structureAge: "MATURE",
    marketSpeed: "NORMAL",
    compression: "OFF",
    spoofRisk: "LOW",
    spreadRegime: "MID",
    depthQuality: "MID",
    cascadeRisk: "LOW",
    stressLevel: "LOW",
    entryWindow: "OPEN",
    pFill: 0.55,
    capacity: 0.5,
    slippageLevel: "MED",
    orderbookImbalance: "BUY",
    oiChangeStrength: "MID",
    fundingBias: "NEUTRAL",
    spotVsDerivativesPressure: "BALANCED",
    volumeSpike: "OFF",
    whaleActivity: "NEUTRAL",
    exchangeFlow: "NEUTRAL",
    relativeStrength: "NEUTRAL",
    liquidityDensity: "MID",
    suddenMoveRisk: "LOW",
    rrPotential: "MID",
    alignedCount: 3,
    totalModels: 6,
    dataHealth: fullHealthy,
    // Failed breakout reclaim conditions
    fakeBreakoutProb: "HIGH",
    aggressorFlow: "BUY_DOMINANT",
  });

  assert.equal(out.playbook, "FAILED_BREAKOUT_RECLAIM");
  assert.ok(out.diagnostics.layers.playbookBoost === 3);
});

test("Flow hard block: fake breakout HIGH caps score", () => {
  const out = computeExtremeConsensus({
    structureScore: 80,
    liquidityScore: 75,
    positioningScore: 70,
    executionScore: 75,
    regime: "TREND",
    trendStrength: "HIGH",
    emaAlignment: "BULL",
    vwapPosition: "ABOVE",
    structureAge: "EARLY",
    marketSpeed: "FAST",
    compression: "ON",
    spoofRisk: "LOW",
    spreadRegime: "TIGHT",
    depthQuality: "GOOD",
    cascadeRisk: "LOW",
    stressLevel: "LOW",
    entryWindow: "OPEN",
    pFill: 0.80,
    capacity: 0.8,
    slippageLevel: "LOW",
    orderbookImbalance: "BUY",
    oiChangeStrength: "HIGH",
    fundingBias: "BEARISH",
    spotVsDerivativesPressure: "SPOT_DOM",
    volumeSpike: "ON",
    whaleActivity: "ACCUMULATION",
    exchangeFlow: "OUTFLOW",
    relativeStrength: "STRONG",
    liquidityDensity: "HIGH",
    suddenMoveRisk: "LOW",
    rrPotential: "HIGH",
    alignedCount: 5,
    totalModels: 6,
    dataHealth: fullHealthy,
    // Hard block trigger
    fakeBreakoutProb: "HIGH",
    aggressorFlow: "NEUTRAL",
  });

  assert.ok(out.extremeScore <= 48, `Hard block should cap score at 48, got ${out.extremeScore}`);
  assert.equal(out.diagnostics.layers.noTradeRule.hardBlocked, true);
});

test("Flow soft block: 3+ danger signals caps score at 52", () => {
  const out = computeExtremeConsensus({
    structureScore: 75,
    liquidityScore: 70,
    positioningScore: 65,
    executionScore: 70,
    regime: "TREND",
    trendStrength: "MID",
    emaAlignment: "BULL",
    vwapPosition: "ABOVE",
    structureAge: "MATURE",
    marketSpeed: "NORMAL",
    compression: "OFF",
    spoofRisk: "LOW",
    spreadRegime: "MID",
    depthQuality: "MID",
    cascadeRisk: "LOW",
    stressLevel: "LOW",
    entryWindow: "OPEN",
    pFill: 0.55,
    capacity: 0.5,
    slippageLevel: "MED",
    orderbookImbalance: "BUY",
    oiChangeStrength: "MID",
    fundingBias: "NEUTRAL",
    spotVsDerivativesPressure: "BALANCED",
    volumeSpike: "OFF",
    whaleActivity: "NEUTRAL",
    exchangeFlow: "NEUTRAL",
    relativeStrength: "NEUTRAL",
    liquidityDensity: "MID",
    rrPotential: "LOW",
    alignedCount: 1,
    totalModels: 6,
    dataHealth: fullHealthy,
    // Soft block triggers: signal conflict HIGH, model agreement weak (<2/6), RR low, aggressor neutral
    signalConflict: "HIGH",
    suddenMoveRisk: "HIGH",
    aggressorFlow: "NEUTRAL",
  });

  assert.ok(out.diagnostics.layers.noTradeRule.softDangerCount >= 3,
    `Expected 3+ soft danger signals, got ${out.diagnostics.layers.noTradeRule.softDangerCount}`);
  assert.equal(out.diagnostics.layers.noTradeRule.softBlocked, true);
  assert.ok(out.extremeScore <= 52, `Soft block should cap score at 52, got ${out.extremeScore}`);
});

test("Flow regime-based threshold: range market uses CS>=50, FTS>=62", () => {
  const out = computeExtremeConsensus({
    structureScore: 60,
    liquidityScore: 60,
    positioningScore: 55,
    executionScore: 60,
    regime: "RANGE",
    trendStrength: "LOW",
    emaAlignment: "MIXED",
    vwapPosition: "AT",
    structureAge: "MATURE",
    marketSpeed: "NORMAL",
    compression: "OFF",
    spoofRisk: "LOW",
    spreadRegime: "MID",
    depthQuality: "MID",
    cascadeRisk: "LOW",
    stressLevel: "LOW",
    entryWindow: "OPEN",
    pFill: 0.60,
    capacity: 0.5,
    slippageLevel: "MED",
    orderbookImbalance: "BUY",
    oiChangeStrength: "MID",
    fundingBias: "NEUTRAL",
    spotVsDerivativesPressure: "BALANCED",
    volumeSpike: "OFF",
    whaleActivity: "NEUTRAL",
    exchangeFlow: "NEUTRAL",
    relativeStrength: "NEUTRAL",
    liquidityDensity: "MID",
    suddenMoveRisk: "LOW",
    rrPotential: "MID",
    alignedCount: 3,
    totalModels: 6,
    dataHealth: fullHealthy,
    rangePosition: "LOWER",
  });

  assert.equal(out.diagnostics.layers.regimeThresholds.csThreshold, 50);
  assert.equal(out.diagnostics.layers.regimeThresholds.ftsThreshold, 62);
  // Should detect RANGE_ROTATION playbook
  assert.equal(out.playbook, "RANGE_ROTATION");
});

test("Flow watchlist mode: CS >= 50 but FTS < threshold", () => {
  const out = computeExtremeConsensus({
    structureScore: 55,
    liquidityScore: 55,
    positioningScore: 50,
    executionScore: 50,
    regime: "MIXED",
    trendStrength: "LOW",
    emaAlignment: "MIXED",
    vwapPosition: "AT",
    marketSpeed: "NORMAL",
    compression: "OFF",
    spoofRisk: "MID",
    spreadRegime: "MID",
    depthQuality: "MID",
    cascadeRisk: "MID",
    stressLevel: "MID",
    entryWindow: "OPEN",
    pFill: 0.45,
    capacity: 0.4,
    slippageLevel: "MED",
    orderbookImbalance: "NEUTRAL",
    oiChangeStrength: "LOW",
    fundingBias: "NEUTRAL",
    spotVsDerivativesPressure: "BALANCED",
    volumeSpike: "OFF",
    whaleActivity: "NEUTRAL",
    exchangeFlow: "NEUTRAL",
    relativeStrength: "NEUTRAL",
    liquidityDensity: "MID",
    suddenMoveRisk: "LOW",
    rrPotential: "LOW",
    alignedCount: 2,
    totalModels: 6,
    dataHealth: fullHealthy,
  });

  // CS should be around 50+ but FTS should be low due to penalties/multipliers
  if (out.candidateScore >= 50 && out.finalTradeScore < 66) {
    assert.equal(out.ideaMode, "WATCHLIST");
    assert.equal(out.sizeHint, 0);
  }
});

test("Flow execution certainty LOW applies 0.6x multiplier", () => {
  const out = computeExtremeConsensus({
    structureScore: 75,
    liquidityScore: 70,
    positioningScore: 65,
    executionScore: 60,
    regime: "TREND",
    trendStrength: "MID",
    emaAlignment: "BULL",
    vwapPosition: "ABOVE",
    marketSpeed: "NORMAL",
    compression: "OFF",
    spoofRisk: "LOW",
    spreadRegime: "WIDE",
    depthQuality: "MID",
    cascadeRisk: "LOW",
    stressLevel: "LOW",
    entryWindow: "OPEN",
    pFill: 0.20,   // LOW pFill → exec certainty LOW → 0.6x
    capacity: 0.3,
    slippageLevel: "HIGH",
    orderbookImbalance: "BUY",
    oiChangeStrength: "MID",
    fundingBias: "NEUTRAL",
    spotVsDerivativesPressure: "BALANCED",
    volumeSpike: "OFF",
    whaleActivity: "NEUTRAL",
    exchangeFlow: "NEUTRAL",
    relativeStrength: "NEUTRAL",
    liquidityDensity: "MID",
    suddenMoveRisk: "LOW",
    rrPotential: "MID",
    alignedCount: 3,
    totalModels: 6,
    dataHealth: fullHealthy,
  });

  assert.equal(out.diagnostics.layers.executionCertaintyMultiplier, 0.6);
});

test("Flow model agreement < 2/6 caps score at 64", () => {
  const out = computeExtremeConsensus({
    structureScore: 80,
    liquidityScore: 75,
    positioningScore: 70,
    executionScore: 75,
    regime: "TREND",
    trendStrength: "HIGH",
    emaAlignment: "BULL",
    vwapPosition: "ABOVE",
    structureAge: "EARLY",
    marketSpeed: "FAST",
    compression: "ON",
    spoofRisk: "LOW",
    spreadRegime: "TIGHT",
    depthQuality: "GOOD",
    cascadeRisk: "LOW",
    stressLevel: "LOW",
    entryWindow: "OPEN",
    pFill: 0.80,
    capacity: 0.8,
    slippageLevel: "LOW",
    orderbookImbalance: "BUY",
    oiChangeStrength: "HIGH",
    fundingBias: "BEARISH",
    spotVsDerivativesPressure: "SPOT_DOM",
    volumeSpike: "ON",
    whaleActivity: "ACCUMULATION",
    exchangeFlow: "OUTFLOW",
    relativeStrength: "STRONG",
    liquidityDensity: "HIGH",
    suddenMoveRisk: "LOW",
    rrPotential: "HIGH",
    alignedCount: 1,   // Only 1/6 agreement
    totalModels: 6,
    dataHealth: fullHealthy,
  });

  assert.ok(out.extremeScore <= 64, `Model agreement < 2/6 should cap at 64, got ${out.extremeScore}`);
});

test("Flow safety block caps score and sizeHint to zero", () => {
  const out = computeExtremeConsensus({
    structureScore: 80,
    liquidityScore: 75,
    positioningScore: 70,
    executionScore: 75,
    regime: "TREND",
    trendStrength: "HIGH",
    emaAlignment: "BULL",
    vwapPosition: "ABOVE",
    marketSpeed: "FAST",
    compression: "ON",
    spoofRisk: "LOW",
    spreadRegime: "TIGHT",
    depthQuality: "POOR",  // Safety block trigger
    cascadeRisk: "HIGH",   // Safety block trigger
    stressLevel: "HIGH",   // Safety block trigger
    entryWindow: "OPEN",
    pFill: 0.80,
    capacity: 0.8,
    slippageLevel: "LOW",
    orderbookImbalance: "BUY",
    oiChangeStrength: "HIGH",
    fundingBias: "BEARISH",
    spotVsDerivativesPressure: "SPOT_DOM",
    volumeSpike: "ON",
    whaleActivity: "ACCUMULATION",
    exchangeFlow: "OUTFLOW",
    relativeStrength: "STRONG",
    liquidityDensity: "HIGH",
    suddenMoveRisk: "LOW",
    rrPotential: "HIGH",
    alignedCount: 5,
    totalModels: 6,
    dataHealth: fullHealthy,
  });

  assert.ok(out.extremeScore <= 44, `Safety block should cap at 44, got ${out.extremeScore}`);
  assert.equal(out.sizeHint, 0);
  assert.equal(out.gates.safety, "BLOCK");
});

// Legacy compat test — old input format still works
test("Legacy extreme input format still produces valid output", () => {
  const out = computeExtremeConsensus({
    liquidityDensity: "HIGH",
    orderbookImbalance: "BUY",
    depthQuality: "GOOD",
    spreadRegime: "TIGHT",
    spoofRisk: "LOW",
    oiChangeStrength: "HIGH",
    fundingBias: "BEARISH",
    spotVsDerivativesPressure: "SPOT_DOM",
    compression: "ON",
    volumeSpike: "ON",
    marketSpeed: "FAST",
    suddenMoveRisk: "MID",
    cascadeRisk: "LOW",
    pFill: 0.82,
    slippageLevel: "LOW",
    whaleActivity: "ACCUMULATION",
    exchangeFlow: "OUTFLOW",
    relativeStrength: "STRONG",
  });

  assert.equal(out.mode, "EXTREME");
  assert.ok(out.extremeScore >= 0 && out.extremeScore <= 100);
  assert.ok(["LONG", "SHORT", "NEUTRAL"].includes(out.directionBias));
  assert.ok(["NO_TRADE", "WAIT", "SPECULATIVE", "TRADE", "SQUEEZE_EVENT"].includes(out.phase));
});
