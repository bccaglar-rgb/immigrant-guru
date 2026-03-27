import type { CoinUniverseData, OhlcvBar } from "../types.ts";
import type { LiquidityIntelligenceSignals } from "./alphaTypes.ts";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * M8: Liquidity Intelligence — orderbook & price-action based liquidity signals.
 *
 * Signals:
 *   1. Liquidity Heatmap Score — concentration of liquidity around key levels
 *   2. Stop Density Index — probability of stop clusters near S/R levels
 *   3. Liquidity Sweep Probability — chance of a stop hunt / liquidity grab
 *   4. Liquidity Magnet Score — how strongly price is being pulled to liquidity zones
 *   5. Liquidity Absorption Strength — how well the book absorbs aggressive orders
 *   6. Liquidity Refill Rate — how quickly removed liquidity replenishes
 *
 * Uses: depthUsd, imbalance, spreadBps, bars, srLevels, atrPct
 */
export function computeLiquidityIntelligence(
  coin: CoinUniverseData,
): LiquidityIntelligenceSignals {
  const defaults: LiquidityIntelligenceSignals = {
    liquidityHeatmapScore: 0,
    stopDensityIndex: 0,
    liquiditySweepProbability: 0,
    liquidityMagnetScore: 0,
    liquidityAbsorptionStrength: 0,
    liquidityRefillRate: 0,
  };

  const bars = coin.bars;
  if (bars.length < 20) return defaults;

  const price = coin.price;
  const atr = coin.atrPct ?? 1;

  // ── 1. Liquidity Heatmap Score ──
  // Measures how much liquidity sits near key S/R levels
  let heatmapScore = 0;
  if (coin.srLevels.length > 0 && coin.depthUsd != null) {
    const nearbyLevels = coin.srLevels.filter(
      (sr) => Math.abs((sr.price - price) / price) * 100 < atr * 2,
    );
    const levelDensity = Math.min(nearbyLevels.length / 4, 1); // 4+ levels = max
    const strengthSum = nearbyLevels.reduce(
      (s, sr) => s + (sr.strength === "STRONG" ? 3 : sr.strength === "MID" ? 2 : 1),
      0,
    );
    const strengthNorm = Math.min(strengthSum / 10, 1);

    // Depth contribution: higher depth = more liquidity around current price
    const depthScore = clamp(coin.depthUsd / 500_000, 0, 1); // $500k+ = max
    heatmapScore = Math.round((levelDensity * 30 + strengthNorm * 40 + depthScore * 30));
  }

  // ── 2. Stop Density Index ──
  // Estimates stop-loss cluster density based on recent swing extremes
  const recent30 = bars.slice(-30);
  let wickPenetrations = 0;
  let totalWickDepth = 0;
  for (let i = 1; i < recent30.length; i++) {
    const prev = recent30[i - 1];
    const curr = recent30[i];
    // Lower wick penetrating prior low = potential stop hunt
    if (curr.low < prev.low) {
      wickPenetrations++;
      totalWickDepth += (prev.low - curr.low) / price * 100;
    }
    // Upper wick penetrating prior high
    if (curr.high > prev.high) {
      wickPenetrations++;
      totalWickDepth += (curr.high - prev.high) / price * 100;
    }
  }
  const stopDensityIndex = clamp(
    Math.round((wickPenetrations / recent30.length) * 50 + Math.min(totalWickDepth * 10, 50)),
    0,
    100,
  );

  // ── 3. Liquidity Sweep Probability ──
  // High when: price near S/R + wicks expanding + volume rising
  let sweepProb = 0;
  const srDist = coin.srDistPct ?? 100;
  const nearSR = srDist < atr * 0.8; // within 80% of ATR to nearest S/R
  if (nearSR) {
    const last5 = bars.slice(-5);
    const avgWickRatio =
      last5.reduce((s, b) => {
        const range = b.high - b.low;
        if (range === 0) return s;
        const body = Math.abs(b.close - b.open);
        return s + (range - body) / range;
      }, 0) / last5.length;

    // Volume acceleration
    const vol5 = last5.reduce((s, b) => s + b.volume, 0) / 5;
    const vol20 = bars.slice(-20).reduce((s, b) => s + b.volume, 0) / 20;
    const volAccel = vol20 > 0 ? vol5 / vol20 : 1;

    sweepProb = clamp(
      Math.round(avgWickRatio * 40 + Math.min(volAccel - 1, 1) * 30 + (1 - srDist / atr) * 30),
      0,
      100,
    );
  }

  // ── 4. Liquidity Magnet Score ──
  // How strongly price is drifting toward the nearest liquidity zone
  let magnetScore = 0;
  if (coin.nearestSR) {
    const srPrice = coin.nearestSR.price;
    const direction = srPrice > price ? 1 : -1;
    // Check if last 5 bars are consistently moving toward the S/R
    const last5 = bars.slice(-5);
    let movingToward = 0;
    for (const b of last5) {
      const closeMove = direction > 0 ? b.close - b.open : b.open - b.close;
      if (closeMove > 0) movingToward++;
    }
    const proximityFactor = clamp(1 - srDist / (atr * 3), 0, 1);
    const strengthMult = coin.nearestSR.strength === "STRONG" ? 1.5 : coin.nearestSR.strength === "MID" ? 1.0 : 0.6;
    magnetScore = clamp(
      Math.round((movingToward / 5) * 50 * strengthMult + proximityFactor * 50),
      0,
      100,
    );
  }

  // ── 5. Liquidity Absorption Strength ──
  // Measures how well the book absorbs aggressive orders (from imbalance + spread behavior)
  let absorptionStrength = 0;
  if (coin.imbalance != null && coin.spreadBps != null) {
    // High imbalance + tight spread = strong absorption
    const absImbalance = Math.abs(coin.imbalance);
    const spreadTightness = clamp(1 - coin.spreadBps / 20, 0, 1); // <20bps = good
    // Volume stability (low CoV = steady absorption)
    const last10 = bars.slice(-10);
    const volumes = last10.map((b) => b.volume);
    const avgVol = volumes.reduce((s, v) => s + v, 0) / volumes.length;
    const volStdDev = Math.sqrt(volumes.reduce((s, v) => s + (v - avgVol) ** 2, 0) / volumes.length);
    const volStability = avgVol > 0 ? clamp(1 - volStdDev / avgVol, 0, 1) : 0;

    absorptionStrength = clamp(
      Math.round(absImbalance * 30 + spreadTightness * 40 + volStability * 30),
      0,
      100,
    );
  }

  // ── 6. Liquidity Refill Rate ──
  // How quickly the book replenishes after large moves (spread recovery)
  let refillRate = 0;
  if (coin.spreadBps != null) {
    // Measure how quickly spread-like conditions normalize after volume spikes
    const last15 = bars.slice(-15);
    let spikeCount = 0;
    let recoveryBars = 0;
    const avgVol15 = last15.reduce((s, b) => s + b.volume, 0) / last15.length;
    for (let i = 1; i < last15.length; i++) {
      if (last15[i - 1].volume > avgVol15 * 1.5) {
        spikeCount++;
        // Check if next bar returns to normal range
        const rangeRatio = (last15[i].high - last15[i].low) / price * 10000;
        if (rangeRatio < coin.spreadBps * 3) recoveryBars++;
      }
    }
    const recoveryRate = spikeCount > 0 ? recoveryBars / spikeCount : 0.5;
    const spreadQuality = clamp(1 - coin.spreadBps / 15, 0, 1);
    refillRate = clamp(Math.round(recoveryRate * 60 + spreadQuality * 40), 0, 100);
  }

  return {
    liquidityHeatmapScore: clamp(heatmapScore, 0, 100),
    stopDensityIndex,
    liquiditySweepProbability: sweepProb,
    liquidityMagnetScore: magnetScore,
    liquidityAbsorptionStrength: absorptionStrength,
    liquidityRefillRate: refillRate,
  };
}
