import test from "node:test";
import assert from "node:assert/strict";
import { computeCapitalGuardConsensus } from "../src/data/capitalGuardConsensus.ts";

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

test("A+ setup with execution issues still gets floor protection", () => {
  const out = computeCapitalGuardConsensus({
    structureScore: 88,
    liquidityScore: 78,
    positioningScore: 81,
    executionScore: 64,
    regime: "TREND",
    trendStrength: "HIGH",
    emaAlignment: "BULL",
    vwapPosition: "ABOVE",
    marketSpeed: "FAST",
    compression: "OFF",
    spreadRegime: "MID",
    depthQuality: "MID",
    spoofRisk: "HIGH",
    slippageLevel: "HIGH",
    pFill: 0.34,
    capacity: 0.74,
    riskAdjEdgeR: 0.35,
    pWin: 0.8,
    pStop: 0.2,
    costR: 0.2,
    alignedCount: 5,
    totalModels: 6,
    conflictLevel: "LOW",
    stressLevel: "MID",
    crowdingRisk: "MID",
    cascadeRisk: "LOW",
    entryWindow: "OPEN",
    dataHealth: {
      ...healthyData,
      latencyMs: 6800,
      feeds: { ...healthyData.feeds, orderbook: "degraded", netflow: "degraded", funding: "degraded" },
    },
  });

  assert.equal(out.mode, "CAPITAL_GUARD");
  assert.equal(out.gates.data, "PASS");
  assert.equal(out.gates.safety, "PASS");
  assert.equal(out.diagnostics.componentScores.isAPlus, true);
  assert.equal(out.diagnostics.floorsApplied, true);
  assert.ok(out.finalScore >= 65);
  assert.ok(out.reasons.some((r) => r.includes("A+ setup floor applied")));
});

test("normal setup gets reduced by slippage and degraded-feed penalties", () => {
  const out = computeCapitalGuardConsensus({
    structureScore: 62,
    liquidityScore: 56,
    positioningScore: 59,
    executionScore: 51,
    regime: "RANGE",
    trendStrength: "MID",
    emaAlignment: "MIXED",
    vwapPosition: "AT",
    spreadRegime: "WIDE",
    depthQuality: "MID",
    spoofRisk: "HIGH",
    slippageLevel: "HIGH",
    pFill: 0.48,
    capacity: 0.63,
    riskAdjEdgeR: 0.11,
    pWin: 0.57,
    pStop: 0.39,
    costR: 0.34,
    alignedCount: 3,
    totalModels: 6,
    conflictLevel: "MID",
    stressLevel: "MID",
    crowdingRisk: "MID",
    cascadeRisk: "MID",
    entryWindow: "OPEN",
    dataHealth: {
      ...healthyData,
      latencyMs: 4700,
      feeds: { ...healthyData.feeds, funding: "degraded", trades: "degraded" },
    },
  });

  assert.equal(out.gates.data, "PASS");
  assert.equal(out.gates.safety, "PASS");
  assert.ok(out.penaltyRate > 0);
  assert.ok(out.finalScore < out.adjustedScore);
  assert.ok(out.reasons.some((r) => r.includes("Penalty: slippage high")));
});

test("safety block caps final score at <=25 and size hint to zero", () => {
  const out = computeCapitalGuardConsensus({
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
    riskAdjEdgeR: 0.24,
    pWin: 0.65,
    alignedCount: 4,
    totalModels: 6,
    conflictLevel: "LOW",
    stressLevel: "HIGH",
    crowdingRisk: "MID",
    cascadeRisk: "HIGH",
    entryWindow: "OPEN",
    dataHealth: healthyData,
  });

  assert.equal(out.gates.data, "PASS");
  assert.equal(out.gates.safety, "BLOCK");
  assert.ok(out.finalScore <= 25);
  assert.equal(out.sizeHint, 0);
  assert.ok(out.reasons.some((r) => r.includes("Safety block")));
});
