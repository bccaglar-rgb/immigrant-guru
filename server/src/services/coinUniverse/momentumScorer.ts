/**
 * Momentum Scorer — 0-20 points
 *
 * Sub-components:
 *   - Price Change    (0-8): absolute 24h change magnitude
 *   - RSI Score       (0-7): RSI extremity (oversold/overbought opportunities)
 *   - Volume Spike    (0-5): volume spike detection bonus
 */

import type { CoinUniverseData, MomentumScore } from "./types.ts";

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export function scoreMomentum(coin: CoinUniverseData): MomentumScore {
  // Price Change (0-8): |change24h| — 2%=0.25, 5%=0.6, 10%+=1.0
  const absChange = Math.abs(coin.change24hPct);
  const changeNorm = clamp(absChange / 10, 0, 1);
  const priceChange = Math.round(changeNorm * 8 * 100) / 100;

  // RSI Score (0-7): distance from 50 — extremes (< 25 or > 75) = max
  let rsiNorm = 0.2;
  if (coin.rsi14 !== null) {
    const distFrom50 = Math.abs(coin.rsi14 - 50);
    if (distFrom50 > 30) rsiNorm = 1.0;       // < 20 or > 80
    else if (distFrom50 > 20) rsiNorm = 0.75;  // < 30 or > 70
    else if (distFrom50 > 10) rsiNorm = 0.40;  // 30-40 or 60-70
    else rsiNorm = 0.10;                        // 40-60 (neutral)
  }
  const rsiScore = Math.round(rsiNorm * 7 * 100) / 100;

  // Volume Spike (0-5): boolean volumeSpike detected from klines
  const volumeSpikeScore = coin.volumeSpike ? 5 : 0;

  const total = Math.round((priceChange + rsiScore + volumeSpikeScore) * 100) / 100;

  return {
    total: clamp(total, 0, 20),
    priceChange,
    rsiScore,
    volumeSpikeScore,
  };
}
