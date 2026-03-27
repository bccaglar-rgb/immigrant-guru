import type { CoinUniverseData, OhlcvBar } from "../types.ts";
import type { StructureAdvancedSignals } from "./alphaTypes.ts";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * M11: Structure Advanced — price structure analysis.
 *
 * Signals:
 *   1. Trend Exhaustion Probability — how likely the current trend is ending
 *   2. Breakout Quality Score — quality/reliability of a recent breakout
 *   3. Orderflow Momentum — acceleration/deceleration of directional flow
 *   4. Trapped Ratio — long/short trapped traders estimate
 *
 * Uses: bars, regime, trendStrength, aggressorFlow, rsi14, atrPct
 */
export function computeStructureAdvanced(
  coin: CoinUniverseData,
): StructureAdvancedSignals {
  const defaults: StructureAdvancedSignals = {
    trendExhaustionProbability: 0,
    breakoutQualityScore: 0,
    orderflowMomentum: 0,
    trappedRatio: 0,
  };

  const bars = coin.bars;
  if (bars.length < 30) return defaults;

  const price = coin.price;
  const atr = coin.atrPct ?? 1;

  // ── 1. Trend Exhaustion Probability ──
  // High when: RSI extreme + declining volume + shrinking bars + divergence
  let exhaustion = 0;
  const last20 = bars.slice(-20);
  const last5 = bars.slice(-5);

  // RSI exhaustion (> 75 or < 25)
  const rsiExhaustion = coin.rsi14 != null
    ? (coin.rsi14 > 75 ? (coin.rsi14 - 75) * 3 : coin.rsi14 < 25 ? (25 - coin.rsi14) * 3 : 0)
    : 0;

  // Volume decline in trend direction
  const vol10 = bars.slice(-10).reduce((s, b) => s + b.volume, 0) / 10;
  const vol20 = last20.reduce((s, b) => s + b.volume, 0) / 20;
  const volDecline = vol20 > 0 ? clamp(1 - vol10 / vol20, 0, 1) * 30 : 0;

  // Shrinking bar bodies (loss of momentum)
  const bodySize5 = last5.reduce((s, b) => s + Math.abs(b.close - b.open), 0) / 5;
  const bodySize20 = last20.reduce((s, b) => s + Math.abs(b.close - b.open), 0) / 20;
  const bodyShrink = bodySize20 > 0 ? clamp(1 - bodySize5 / bodySize20, 0, 1) * 25 : 0;

  // Trend age factor (longer trend = more exhaustion risk)
  const trendAgeFactor = coin.trendStrength > 70 ? 15 : coin.trendStrength > 50 ? 8 : 0;

  exhaustion = clamp(Math.round(rsiExhaustion + volDecline + bodyShrink + trendAgeFactor), 0, 100);

  // ── 2. Breakout Quality Score ──
  // High when: regime = BREAKOUT + high volume + clean break above S/R
  let breakoutQuality = 0;
  if (coin.regime === "BREAKOUT") {
    // Volume confirmation
    const vol3 = bars.slice(-3).reduce((s, b) => s + b.volume, 0) / 3;
    const volAvg = bars.slice(-30).reduce((s, b) => s + b.volume, 0) / 30;
    const volConfirm = clamp((vol3 / volAvg - 1) * 2, 0, 1) * 35;

    // Clean body (minimal wicks = conviction)
    const cleanBody = last5.reduce((s, b) => {
      const range = b.high - b.low;
      if (range === 0) return s;
      return s + Math.abs(b.close - b.open) / range;
    }, 0) / last5.length;
    const bodyConviction = cleanBody * 30;

    // S/R distance (further from S/R after break = better)
    const srDistScore = coin.srDistPct != null
      ? clamp(coin.srDistPct / atr, 0, 1) * 20
      : 10;

    // Expansion (ATR expanding)
    const expansionScore = coin.expansionProbability * 15;

    breakoutQuality = clamp(Math.round(volConfirm + bodyConviction + srDistScore + expansionScore), 0, 100);
  }

  // ── 3. Orderflow Momentum ──
  // Acceleration/deceleration of directional flow
  // Positive = buying accelerating, Negative = selling accelerating
  const half1 = bars.slice(-20, -10);
  const half2 = bars.slice(-10);

  function flowScore(segment: OhlcvBar[]): number {
    let buyVol = 0, sellVol = 0;
    for (const b of segment) {
      const bodyRatio = b.high !== b.low ? (b.close - b.open) / (b.high - b.low) : 0;
      if (bodyRatio > 0) buyVol += b.volume * bodyRatio;
      else sellVol += b.volume * Math.abs(bodyRatio);
    }
    const total = buyVol + sellVol;
    return total > 0 ? (buyVol - sellVol) / total : 0;
  }

  const flow1 = flowScore(half1);
  const flow2 = flowScore(half2);
  const flowDelta = flow2 - flow1; // acceleration
  const orderflowMomentum = clamp(Math.round(flowDelta * 100), -100, 100);

  // ── 4. Trapped Ratio ──
  // Estimates percentage of recently opened positions now underwater
  // Positive = more longs trapped, Negative = more shorts trapped
  let trappedRatio = 0;
  const recent10 = bars.slice(-10);
  const highestRecent = Math.max(...recent10.map((b) => b.high));
  const lowestRecent = Math.min(...recent10.map((b) => b.low));
  const range = highestRecent - lowestRecent;

  if (range > 0) {
    // Price at lower end of recent range = longs trapped
    // Price at upper end = shorts trapped
    const positionInRange = (price - lowestRecent) / range;

    // Volume-weighted position analysis
    let aboveVol = 0, belowVol = 0;
    for (const b of recent10) {
      const vwap = (b.high + b.low + b.close) / 3;
      if (vwap > price) aboveVol += b.volume; // these positions are in profit for shorts
      else belowVol += b.volume; // these positions are in profit for longs
    }
    const totalVol = aboveVol + belowVol;
    const volBias = totalVol > 0 ? (belowVol - aboveVol) / totalVol : 0;

    // Combine position in range with volume bias
    // Positive = longs trapped (price dropped from high-volume area)
    // Negative = shorts trapped (price rose from high-volume area)
    trappedRatio = clamp(
      Math.round(((0.5 - positionInRange) * 60 + volBias * 40) * -1),
      -100,
      100,
    );
  }

  return {
    trendExhaustionProbability: exhaustion,
    breakoutQualityScore: breakoutQuality,
    orderflowMomentum,
    trappedRatio,
  };
}
