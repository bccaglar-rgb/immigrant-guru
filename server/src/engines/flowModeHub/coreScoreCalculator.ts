/**
 * Flow Mode Hub V2 — Market Quality Score
 *
 * 4 sub-components: Structure (0.30) + Liquidity (0.25) + Volatility (0.20) + RegimeFit (0.25)
 * Each sub-score: starts at 50, adds/subtracts from HubInput fields
 */

import type { HubInput } from "./types.ts";
import type { MarketQualityResult } from "./types.ts";
import { MQ_WEIGHTS } from "./config.ts";

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

function calcStructure(d: HubInput): number {
  let s = 50;
  // Trend alignment
  s += d.htfTrend > 0.6 ? 15 : d.htfTrend > 0.3 ? 8 : -3;
  // EMA stack
  s += d.emaAlignment > 0.6 ? 10 : d.emaAlignment > 0.3 ? 5 : -3;
  // VWAP position
  s += d.vwapPosition !== "AT" ? 10 : -2;
  // Trend strength
  s += d.trendStrength > 0.7 ? 10 : d.trendStrength > 0.4 ? 5 : -5;
  // Compression (breakout potential)
  s += d.compression > 0.6 ? 8 : 0;
  // Level reaction
  s += d.levelReaction > 0.6 ? 10 : d.levelReaction > 0.3 ? 5 : 0;
  // Penalties
  s -= d.midRangeTrap > 0.5 ? 8 : 0;
  s -= d.weakAcceptance > 0.5 ? 6 : 0;
  s -= d.chasedEntry > 0.5 ? 10 : 0;
  return clamp(s, 0, 100);
}

function calcLiquidity(d: HubInput): number {
  let s = 50;
  // Pool proximity
  s += d.poolProximity > 0.6 ? 12 : d.poolProximity > 0.3 ? 6 : 0;
  // Sweep reclaim
  s += d.sweepReclaim > 0.6 ? 15 : d.sweepReclaim > 0.3 ? 7 : 0;
  // Liquidity density
  s += d.liquidityDensity > 0.6 ? 10 : d.liquidityDensity > 0.3 ? 5 : -3;
  // OB stability
  s += d.obStability > 0.6 ? 8 : d.obStability > 0.3 ? 4 : 0;
  // Depth quality
  s += d.depthQuality > 0.6 ? 8 : d.depthQuality > 0.3 ? 4 : -5;
  // Penalties
  s -= d.spoofRisk > 0.5 ? 10 : 0;
  s -= d.failedSweep > 0.5 ? 8 : 0;
  s -= d.spreadTightness < 0.4 ? 6 : 0;
  return clamp(s, 0, 100);
}

function calcVolatility(d: HubInput): number {
  let s = 50;
  // Compression = breakout setup
  s += d.compressionActive ? 12 : 0;
  // Expansion probability
  s += d.expansionProbability > 0.5 ? 12 : d.expansionProbability > 0.3 ? 6 : -3;
  // ATR fit
  s += d.atrFit > 0.5 ? 10 : d.atrFit > 0.3 ? 5 : -3;
  // Speed healthy
  s += d.speedHealthy > 0.5 ? 8 : d.speedHealthy > 0.3 ? 4 : 0;
  // Penalties
  s -= d.suddenMoveRisk > 0.5 ? 10 : 0;
  s -= d.fakeBreakRisk > 0.5 ? 12 : 0;
  s -= d.deadVolatility > 0.5 ? 15 : 0;
  return clamp(s, 0, 100);
}

function calcRegimeFit(d: HubInput, regime: string): number {
  let s = 50;
  // How well signals match detected regime
  if (regime === "TREND") {
    s += d.trendStrength > 0.6 ? 20 : d.trendStrength > 0.4 ? 10 : -5;
    s += d.emaAlignment > 0.5 ? 10 : 0;
    s += d.htfTrend > 0.5 ? 10 : -5;
    s -= d.deadVolatility > 0.5 ? 10 : 0;
  } else if (regime === "RANGE") {
    s += d.levelReaction > 0.5 ? 15 : 0;
    s += d.compression > 0.5 ? 10 : 0;
    s += d.poolProximity > 0.5 ? 10 : 0;
    s -= d.trendStrength > 0.7 ? 10 : 0; // strong trend = bad for range
  } else if (regime === "BREAKOUT_SETUP") {
    s += d.compressionActive ? 15 : -5;
    s += d.expansionProbability > 0.5 ? 15 : 0;
    s += d.volumeConfirm > 0.5 ? 10 : 0;
    s -= d.fakeBreakRisk > 0.5 ? 15 : 0;
  } else if (regime === "HIGH_STRESS") {
    s += d.depthQuality > 0.5 ? 10 : -5;
    s += d.obStability > 0.5 ? 10 : -5;
    s -= d.suddenMoveRisk > 0.5 ? 15 : 0;
  } else if (regime === "FAKE_BREAK_RISK") {
    s += d.sweepReclaim > 0.5 ? 15 : 0;
    s -= d.fakeBreakRisk > 0.5 ? 20 : 0;
  }
  return clamp(s, 0, 100);
}

export function calculateMarketQuality(input: HubInput, regime: string): MarketQualityResult {
  const structure = calcStructure(input);
  const liquidity = calcLiquidity(input);
  const volatility = calcVolatility(input);
  const regimeFit = calcRegimeFit(input, regime);

  const total = Math.round((
    MQ_WEIGHTS.structure * structure +
    MQ_WEIGHTS.liquidity * liquidity +
    MQ_WEIGHTS.volatility * volatility +
    MQ_WEIGHTS.regimeFit * regimeFit
  ) * 10) / 10;

  return { structure, liquidity, volatility, regimeFit, total };
}
