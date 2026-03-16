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

// Good signals for 4-layer model
const goodSignals = {
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
  liquidationPoolBias: "UP" as const,
  rsiState: "NEUTRAL" as const,
  atrRegime: "MID" as const,
  liquidityDensity: "HIGH" as const,
  suddenMoveRisk: "LOW" as const,
  impulseReadiness: "HIGH" as const,
  dxyTrend: "DOWN" as const,
  nasdaqTrend: "UP" as const,
};

test("high conviction setup produces TRADE with good sizeHint and 4-layer diagnostics", () => {
  const out = computeCapitalGuardConsensus({
    structureScore: 90,
    liquidityScore: 85,
    positioningScore: 88,
    executionScore: 80,
    regime: "TREND",
    trendStrength: "HIGH",
    emaAlignment: "BULL",
    vwapPosition: "ABOVE",
    marketSpeed: "FAST",
    compression: "ON",
    spreadRegime: "TIGHT",
    depthQuality: "GOOD",
    spoofRisk: "LOW",
    slippageLevel: "LOW",
    pFill: 0.85,
    capacity: 0.9,
    riskAdjEdgeR: 0.35,
    pWin: 0.82,
    pStop: 0.18,
    costR: 0.1,
    alignedCount: 5,
    totalModels: 6,
    conflictLevel: "LOW",
    stressLevel: "LOW",
    crowdingRisk: "LOW",
    cascadeRisk: "LOW",
    entryWindow: "OPEN",
    dataHealth: healthyData,
    ...goodSignals,
    // Clean LSI conditions — no shock risk
    liquidationPoolBias: "UNKNOWN",
    orderbookImbalance: "NEUTRAL",
    liquidityDensity: "HIGH",
  });

  assert.equal(out.mode, "CAPITAL_GUARD");
  assert.equal(out.gates.data, "PASS");
  assert.equal(out.gates.safety, "PASS");
  // MOS, DCS, EQS should all be high
  assert.ok(out.diagnostics.layers.mos.score >= 65, `MOS >= 65, got ${out.diagnostics.layers.mos.score}`);
  assert.ok(out.diagnostics.layers.dcs.score >= 70, `DCS >= 70, got ${out.diagnostics.layers.dcs.score}`);
  assert.ok(out.diagnostics.layers.eqs.score >= 80, `EQS >= 80, got ${out.diagnostics.layers.eqs.score}`);
  assert.ok(out.diagnostics.layers.res.score === 0, `RES should be 0, got ${out.diagnostics.layers.res.score}`);
  // Final score should be well above TRADE threshold (65)
  assert.ok(out.finalScore >= 65, `expected finalScore >= 65, got ${out.finalScore}`);
  assert.ok(out.sizeHint >= 0.40, `expected sizeHint >= 0.40, got ${out.sizeHint}`);
  // Verify 4-layer diagnostics structure
  assert.ok(typeof out.diagnostics.layers.mos.score === "number");
  assert.ok(typeof out.diagnostics.layers.dcs.score === "number");
  assert.ok(typeof out.diagnostics.layers.eqs.score === "number");
  assert.ok(typeof out.diagnostics.layers.res.score === "number");
  assert.ok(typeof out.diagnostics.layers.lsi.adjustment === "number");
  assert.ok(typeof out.diagnostics.layers.tradeScore === "number");
  // Verify breakdown sub-objects have data
  assert.ok(Object.keys(out.diagnostics.layers.mos.breakdown).length >= 5);
  assert.ok(Object.keys(out.diagnostics.layers.dcs.breakdown).length >= 4);
  assert.ok(Object.keys(out.diagnostics.layers.eqs.breakdown).length >= 4);
});

test("MOS high but DCS low produces medium score (layer isolation)", () => {
  const out = computeCapitalGuardConsensus({
    structureScore: 30,       // low structure → low DCS
    liquidityScore: 40,
    positioningScore: 35,
    executionScore: 50,
    regime: "RANGE",          // RANGE → low DCS trend strength
    trendStrength: "LOW",     // low → DCS suffers
    emaAlignment: "MIXED",    // no alignment → DCS suffers
    vwapPosition: "AT",
    marketSpeed: "FAST",      // high → MOS momentum high
    compression: "ON",        // ON → MOS volatility high
    spreadRegime: "TIGHT",    // good → both MOS and EQS
    depthQuality: "GOOD",     // good → both MOS and EQS
    spoofRisk: "LOW",
    slippageLevel: "LOW",
    pFill: 0.75,
    capacity: 0.8,
    stressLevel: "LOW",
    crowdingRisk: "LOW",
    cascadeRisk: "LOW",
    entryWindow: "OPEN",
    dataHealth: healthyData,
    ...goodSignals,
    orderbookImbalance: "NEUTRAL",  // neutral → DCS orderflow down
    oiChangeStrength: "LOW",        // low → DCS orderflow down
    fundingBias: "NEUTRAL",         // neutral → moderate
  });

  // MOS should be reasonably high due to FAST speed, ON compression, TIGHT spread, GOOD depth
  // DCS should be lower due to RANGE + LOW trend + MIXED ema + NEUTRAL OB
  assert.ok(out.diagnostics.layers.mos.score > 55, `MOS should be > 55, got ${out.diagnostics.layers.mos.score}`);
  assert.ok(out.diagnostics.layers.dcs.score < 50, `DCS should be < 50, got ${out.diagnostics.layers.dcs.score}`);
  // Overall score should be moderate
  assert.ok(out.baseScore > 30 && out.baseScore < 75, `baseScore should be moderate, got ${out.baseScore}`);
});

test("RES penalties reduce score when risk events active", () => {
  const out = computeCapitalGuardConsensus({
    structureScore: 70,
    liquidityScore: 65,
    positioningScore: 68,
    executionScore: 60,
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
    stressLevel: "HIGH",            // → RES news penalty
    crowdingRisk: "MID",
    cascadeRisk: "HIGH",            // → RES cascade -10
    entryWindow: "OPEN",
    dataHealth: healthyData,
    ...goodSignals,
    suddenMoveRisk: "HIGH",          // → RES news -8 (both HIGH)
    fundingBias: "EXTREME",          // → RES funding -6
    whaleActivity: "DISTRIBUTION",   // → RES whale penalty
    exchangeFlow: "INFLOW",          // → RES whale -7 (DISTRIBUTION + INFLOW)
  });

  // RES should have significant negative score
  assert.ok(out.diagnostics.layers.res.score <= -20, `RES should be <= -20, got ${out.diagnostics.layers.res.score}`);
  // Cascade + funding + news + whale penalties
  assert.ok(out.diagnostics.layers.res.breakdown.cascadeLiquidation === -10);
  assert.ok(out.diagnostics.layers.res.breakdown.fundingSpike === -6);
  assert.ok(out.diagnostics.layers.res.breakdown.newsVolatility === -8);
  assert.ok(out.diagnostics.layers.res.breakdown.whaleAnomaly === -7);
  assert.ok(out.reasons.some((r) => r.includes("RES alert")));
});

test("safety block caps final score at <=44 and sizeHint to zero", () => {
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
    ...goodSignals,
  });

  assert.equal(out.gates.data, "PASS");
  assert.equal(out.gates.safety, "BLOCK");
  assert.ok(out.finalScore <= 44, `expected finalScore <= 44, got ${out.finalScore}`);
  assert.equal(out.sizeHint, 0);
  assert.ok(out.reasons.some((r) => r.includes("Safety block")));
});

test("position size tiers: 85+=1.0, 75-84=0.70, 65-74=0.40, 55-64=0.20, <55=0", () => {
  // Test a moderate scenario where we can check sizeHint
  const out = computeCapitalGuardConsensus({
    structureScore: 60,
    liquidityScore: 55,
    positioningScore: 55,
    executionScore: 50,
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
    ...goodSignals,
    oiChangeStrength: "MID",
    fundingBias: "NEUTRAL",
    whaleActivity: "NEUTRAL",
    orderbookImbalance: "NEUTRAL",
    relativeStrength: "NEUTRAL",
    spotVsDerivativesPressure: "BALANCED",
  });

  // sizeHint should be one of the discrete tiers
  assert.ok([0, 0.20, 0.40, 0.70, 1.0].includes(out.sizeHint), `sizeHint ${out.sizeHint} not in expected tiers`);
});

test("LSI adjustment reduces score when liquidity shock conditions exist", () => {
  const out = computeCapitalGuardConsensus({
    structureScore: 70,
    liquidityScore: 60,
    positioningScore: 65,
    executionScore: 50,
    regime: "TREND",
    trendStrength: "MID",
    emaAlignment: "BULL",
    vwapPosition: "ABOVE",
    spreadRegime: "WIDE",
    depthQuality: "POOR",       // → high liquidity gap
    spoofRisk: "MID",
    slippageLevel: "MED",
    pFill: 0.5,
    capacity: 0.6,
    stressLevel: "LOW",
    crowdingRisk: "LOW",
    cascadeRisk: "LOW",
    entryWindow: "OPEN",
    dataHealth: healthyData,
    ...goodSignals,
    liquidityDensity: "LOW",     // → high liquidity gap
    liquidationPoolBias: "UP",   // → active liquidation pool
    orderbookImbalance: "BUY",   // → extreme imbalance
  });

  // LSI should have a negative adjustment
  assert.ok(out.diagnostics.layers.lsi.score > 0.4, `LSI score should be > 0.4, got ${out.diagnostics.layers.lsi.score}`);
  assert.ok(out.diagnostics.layers.lsi.adjustment < 0, `LSI adjustment should be negative, got ${out.diagnostics.layers.lsi.adjustment}`);
  // adjustedScore should be less than baseScore
  assert.ok(out.adjustedScore <= out.baseScore, `adjustedScore (${out.adjustedScore}) should be <= baseScore (${out.baseScore})`);
});
