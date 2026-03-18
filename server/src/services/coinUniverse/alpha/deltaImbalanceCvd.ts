import type { CoinUniverseData, OhlcvBar } from "../types.ts";
import type { DeltaImbalanceSignals } from "./alphaTypes.ts";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Estimate buying/selling pressure from candle body ratio. */
function candleDelta(bar: OhlcvBar): number {
  const range = bar.high - bar.low;
  if (range === 0) return 0;
  const bodyRatio = (bar.close - bar.open) / range; // +1 = bullish, -1 = bearish
  return bar.volume * bodyRatio;
}

/**
 * M4: Delta Imbalance & CVD — order flow analysis from klines.
 * Uses: bars body analysis (no raw trade data needed).
 */
export function computeDeltaImbalance(coin: CoinUniverseData): DeltaImbalanceSignals {
  const bars = coin.bars;
  if (bars.length < 20) {
    return { cvdTrend: "FLAT", deltaImbalanceScore: 0, buySellPressureRatio: 1, volumeWeightedDelta: 0 };
  }

  // 1. CVD over last 20 bars
  const recent20 = bars.slice(-20);
  const deltas = recent20.map(candleDelta);
  const totalVol = recent20.reduce((s, b) => s + b.volume, 0);
  const cvdChange = deltas.reduce((s, d) => s + d, 0);
  const cvdNorm = totalVol > 0 ? cvdChange / totalVol : 0;

  const cvdTrend: DeltaImbalanceSignals["cvdTrend"] =
    cvdNorm > 0.15 ? "RISING" :
    cvdNorm < -0.15 ? "FALLING" : "FLAT";

  // 2. Delta imbalance (last 5 bars)
  const last5 = bars.slice(-5);
  let buyDelta = 0, sellDelta = 0;
  for (const b of last5) {
    const d = candleDelta(b);
    if (d > 0) buyDelta += d;
    else sellDelta += Math.abs(d);
  }
  const total = buyDelta + sellDelta;
  const deltaImbalanceScore = total > 0 ? Math.round(((buyDelta - sellDelta) / total) * 100) : 0;

  // 3. Buy/sell pressure ratio
  const buySellPressureRatio =
    sellDelta === 0 && buyDelta > 0 ? 5.0 :
    buyDelta === 0 && sellDelta > 0 ? 0.2 :
    total > 0 ? clamp(buyDelta / sellDelta, 0.1, 10.0) : 1.0;

  // 4. Volume-weighted delta (recent bars weighted more)
  const weights = [1, 1.5, 2, 2.5, 3];
  let wDeltaSum = 0, wVolSum = 0;
  for (let i = 0; i < last5.length; i++) {
    const w = weights[i] ?? 1;
    wDeltaSum += candleDelta(last5[i]) * w;
    wVolSum += last5[i].volume * w;
  }
  const volumeWeightedDelta = wVolSum > 0 ? Math.round((wDeltaSum / wVolSum) * 100) : 0;

  return {
    cvdTrend,
    deltaImbalanceScore: clamp(deltaImbalanceScore, -100, 100),
    buySellPressureRatio: Math.round(buySellPressureRatio * 100) / 100,
    volumeWeightedDelta: clamp(volumeWeightedDelta, -100, 100),
  };
}
