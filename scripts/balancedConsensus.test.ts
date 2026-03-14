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

test("Balanced clean setup returns TRADE with all gates PASS", () => {
  const out = computeBalancedConsensus({
    structureScore: 84,
    liquidityScore: 79,
    positioningScore: 76,
    executionScore: 82,
    regime: "TREND",
    trendStrength: "HIGH",
    structureAge: "MATURE",
    compression: "OFF",
    spreadRegime: "TIGHT",
    depthQuality: "GOOD",
    liquidityDensity: "HIGH",
    spoofRisk: "LOW",
    slippageLevel: "LOW",
    pFill: 0.86,
    capacity: 0.82,
    riskAdjEdgeR: 0.24,
    pWin: 0.72,
    pStop: 0.2,
    expectedRR: 1.55,
    costR: 0.2,
    asymmetry: "REWARD_DOMINANT",
    alignedCount: 5,
    totalModels: 6,
    conflictLevel: "LOW",
    stressLevel: "LOW",
    crowdingRisk: "LOW",
    cascadeRisk: "LOW",
    entryWindow: "OPEN",
    breakoutOnly: false,
    dataHealth: healthyData,
  });

  assert.equal(out.mode, "BALANCED");
  assert.equal(out.gates.data, "PASS");
  assert.equal(out.gates.risk, "PASS");
  assert.equal(out.gates.entry, "PASS");
  assert.equal(out.gates.fill, "PASS");
  assert.equal(out.gates.capacity, "PASS");
  assert.equal(out.decision, "TRADE");
  assert.ok(out.finalScore >= 70);
  assert.ok(out.reasons.length >= 3);
});

test("Balanced entry CLOSED blocks trade and caps final score to <=35", () => {
  const out = computeBalancedConsensus({
    structureScore: 80,
    liquidityScore: 73,
    positioningScore: 70,
    executionScore: 74,
    regime: "TREND",
    trendStrength: "MID",
    spreadRegime: "MID",
    depthQuality: "MID",
    liquidityDensity: "MID",
    spoofRisk: "LOW",
    slippageLevel: "MED",
    pFill: 0.66,
    capacity: 0.7,
    riskAdjEdgeR: 0.18,
    pWin: 0.64,
    pStop: 0.26,
    expectedRR: 1.2,
    costR: 0.25,
    asymmetry: "REWARD_DOMINANT",
    alignedCount: 4,
    totalModels: 6,
    conflictLevel: "MID",
    stressLevel: "LOW",
    crowdingRisk: "MID",
    cascadeRisk: "LOW",
    entryWindow: "CLOSED",
    breakoutOnly: false,
    dataHealth: healthyData,
  });

  assert.equal(out.gates.data, "PASS");
  assert.equal(out.gates.entry, "BLOCK");
  assert.equal(out.decision, "NO_TRADE");
  assert.ok(out.finalScore <= 35);
  assert.ok(out.reasons.some((r) => r.includes("Entry gate BLOCK")));
});

test("Balanced stress HIGH triggers risk BLOCK and NO_TRADE", () => {
  const out = computeBalancedConsensus({
    structureScore: 88,
    liquidityScore: 82,
    positioningScore: 80,
    executionScore: 76,
    regime: "TREND",
    trendStrength: "HIGH",
    spreadRegime: "MID",
    depthQuality: "GOOD",
    liquidityDensity: "HIGH",
    spoofRisk: "MID",
    slippageLevel: "LOW",
    pFill: 0.81,
    capacity: 0.79,
    riskAdjEdgeR: 0.22,
    pWin: 0.7,
    pStop: 0.21,
    expectedRR: 1.35,
    costR: 0.23,
    asymmetry: "REWARD_DOMINANT",
    alignedCount: 5,
    totalModels: 6,
    conflictLevel: "LOW",
    stressLevel: "HIGH",
    crowdingRisk: "MID",
    cascadeRisk: "MID",
    entryWindow: "OPEN",
    breakoutOnly: false,
    dataHealth: healthyData,
  });

  assert.equal(out.gates.data, "PASS");
  assert.equal(out.gates.risk, "BLOCK");
  assert.equal(out.decision, "NO_TRADE");
  assert.ok(out.finalScore <= 35);
  assert.ok(out.reasons.some((r) => r.includes("Risk gate BLOCK")));
});
