import test from "node:test";
import assert from "node:assert/strict";
import { computeExtremeConsensus } from "../src/data/extremeConsensus.ts";

test("Extreme high momentum/liquidity setup reaches squeeze tier", () => {
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
    asymmetryScore: "REWARD_DOMINANT",
    fundingRate1hPct: -0.07,
    fundingRate8hPct: -0.04,
    oiChange5mPct: 7.2,
    oiChange1hPct: 9.5,
    liquidationPoolBias: "UP",
    spotVolumeSupport: "STRONG",
    dxyTrend: "DOWN",
    nasdaqTrend: "UP",
    atrRegime: "LOW",
    rsiState: "OVERSOLD",
  });

  assert.equal(out.mode, "EXTREME");
  assert.equal(out.extremeScore, 100);
  assert.equal(out.rating, "LIQUIDATION / SQUEEZE LEVEL");
});

test("Extreme stacked execution/microstructure penalties stay low with hard no-trade", () => {
  const out = computeExtremeConsensus({
    liquidityDensity: "LOW",
    orderbookImbalance: "NEUTRAL",
    depthQuality: "POOR",
    spreadRegime: "WIDE",
    spoofRisk: "HIGH",
    oiChangeStrength: "LOW",
    fundingBias: "NEUTRAL",
    spotVsDerivativesPressure: "BALANCED",
    compression: "OFF",
    volumeSpike: "OFF",
    marketSpeed: "SLOW",
    suddenMoveRisk: "HIGH",
    cascadeRisk: "HIGH",
    pFill: 0.18,
    slippageLevel: "HIGH",
  });

  assert.ok(out.extremeScore >= 0 && out.extremeScore <= 19);
  assert.equal(out.phase, "NO_TRADE");
  assert.equal(out.rating, "LOW PROBABILITY");
});

test("Extreme mid setup maps to speculative/high-risk range", () => {
  const out = computeExtremeConsensus({
    liquidityDensity: "MID",
    orderbookImbalance: "BUY",
    depthQuality: "MID",
    spreadRegime: "MID",
    spoofRisk: "MID",
    oiChangeStrength: "MID",
    fundingBias: "BULLISH",
    spotVsDerivativesPressure: "BALANCED",
    compression: "ON",
    volumeSpike: "OFF",
    marketSpeed: "NORMAL",
    suddenMoveRisk: "MID",
    cascadeRisk: "MID",
    pFill: 0.52,
    slippageLevel: "MED",
    whaleActivity: "NEUTRAL",
    exchangeFlow: "NEUTRAL",
    relativeStrength: "NEUTRAL",
    fundingRate1hPct: 0.02,
    oiChange1hPct: 3.1,
    liquidationPoolBias: "MIXED",
    spotVolumeSupport: "UNKNOWN",
    dxyTrend: "UP",
    nasdaqTrend: "DOWN",
  });

  assert.ok(out.extremeScore >= 30 && out.extremeScore <= 44);
  assert.equal(out.phase, "WAIT");
  assert.equal(out.rating, "SPECULATIVE");
});
