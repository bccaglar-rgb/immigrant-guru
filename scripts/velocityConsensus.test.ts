import test from "node:test";
import assert from "node:assert/strict";
import { computeVelocityConsensus } from "../src/data/velocityConsensus.ts";

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

test("Velocity momentum strong + execution okay => TRADE", () => {
  const out = computeVelocityConsensus({
    structureScore: 74,
    liquidityScore: 78,
    positioningScore: 75,
    executionScore: 77,
    regime: "TREND",
    trendStrength: "HIGH",
    emaAlignment: "BULL",
    vwapPosition: "ABOVE",
    marketSpeed: "FAST",
    atrRegime: "HIGH",
    compression: "OFF",
    breakoutRisk: "MID",
    fakeBreakoutProb: "LOW",
    suddenMoveRisk: "LOW",
    volumeSpike: "ON",
    impulseReadiness: "HIGH",
    liquidityDensity: "HIGH",
    spoofRisk: "LOW",
    spreadRegime: "TIGHT",
    depthQuality: "GOOD",
    crowdingRisk: "MID",
    cascadeRisk: "LOW",
    stressLevel: "MID",
    entryWindow: "OPEN",
    breakoutOnly: false,
    pFill: 0.82,
    capacity: 0.78,
    slippageLevel: "LOW",
    eNetR: 0.21,
    riskAdjEdgeR: 0.21,
    pWin: 0.71,
    pStop: 0.23,
    expectedRR: 1.4,
    costR: 0.22,
    asymmetry: "REWARD_DOMINANT",
    rrPotential: "HIGH",
    entryQuality: "GOOD",
    alignedCount: 5,
    totalModels: 6,
    conflictLevel: "LOW",
    dataHealth: healthyData,
  });

  assert.equal(out.mode, "VELOCITY");
  assert.equal(out.gates.data, "PASS");
  assert.equal(out.gates.risk, "PASS");
  assert.equal(out.gates.entry, "PASS");
  assert.equal(out.gates.fill, "PASS");
  assert.equal(out.decision, "TRADE");
  assert.ok(out.finalScore >= 68);
});

test("Velocity entry CLOSED => entry gate BLOCK, final capped <= 40, decision NO_TRADE", () => {
  const out = computeVelocityConsensus({
    structureScore: 78,
    liquidityScore: 74,
    positioningScore: 72,
    executionScore: 71,
    regime: "TREND",
    trendStrength: "MID",
    emaAlignment: "BULL",
    vwapPosition: "ABOVE",
    marketSpeed: "NORMAL",
    atrRegime: "MID",
    compression: "OFF",
    breakoutRisk: "MID",
    fakeBreakoutProb: "MID",
    suddenMoveRisk: "MID",
    volumeSpike: "ON",
    impulseReadiness: "MID",
    liquidityDensity: "MID",
    spoofRisk: "MID",
    spreadRegime: "MID",
    depthQuality: "MID",
    crowdingRisk: "MID",
    cascadeRisk: "MID",
    stressLevel: "MID",
    entryWindow: "CLOSED",
    breakoutOnly: false,
    pFill: 0.66,
    capacity: 0.7,
    slippageLevel: "MED",
    riskAdjEdgeR: 0.16,
    pWin: 0.64,
    expectedRR: 1.15,
    costR: 0.28,
    asymmetry: "REWARD_DOMINANT",
    alignedCount: 4,
    totalModels: 6,
    conflictLevel: "MID",
    dataHealth: healthyData,
  });

  assert.equal(out.gates.entry, "BLOCK");
  assert.equal(out.decision, "NO_TRADE");
  assert.ok(out.finalScore <= 40);
});

test("Velocity stress HIGH + cascade HIGH => risk gate BLOCK => NO_TRADE", () => {
  const out = computeVelocityConsensus({
    structureScore: 81,
    liquidityScore: 76,
    positioningScore: 77,
    executionScore: 73,
    regime: "TREND",
    trendStrength: "HIGH",
    emaAlignment: "BULL",
    vwapPosition: "ABOVE",
    marketSpeed: "FAST",
    atrRegime: "HIGH",
    compression: "OFF",
    breakoutRisk: "HIGH",
    fakeBreakoutProb: "LOW",
    suddenMoveRisk: "MID",
    volumeSpike: "ON",
    impulseReadiness: "HIGH",
    liquidityDensity: "HIGH",
    spoofRisk: "LOW",
    spreadRegime: "TIGHT",
    depthQuality: "GOOD",
    crowdingRisk: "MID",
    cascadeRisk: "HIGH",
    stressLevel: "HIGH",
    entryWindow: "OPEN",
    breakoutOnly: false,
    pFill: 0.8,
    capacity: 0.75,
    slippageLevel: "LOW",
    riskAdjEdgeR: 0.2,
    pWin: 0.7,
    expectedRR: 1.35,
    costR: 0.2,
    asymmetry: "REWARD_DOMINANT",
    alignedCount: 5,
    totalModels: 6,
    conflictLevel: "LOW",
    dataHealth: healthyData,
  });

  assert.equal(out.gates.risk, "BLOCK");
  assert.equal(out.decision, "NO_TRADE");
  assert.ok(out.finalScore <= 40);
});
