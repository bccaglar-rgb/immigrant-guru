import type { CoinUniverseData, OhlcvBar } from "../types.ts";
import type { MarketMakerDetectionSignals } from "./alphaTypes.ts";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * M9: Market Maker Detection — identifies manipulative patterns.
 *
 * Signals:
 *   1. Spoofing Probability — large orders that appear/disappear
 *   2. Iceberg Order Score — hidden large orders behind small visible ones
 *   3. Quote Stuffing Score — rapid price oscillation without direction
 *   4. Market Maker Control Score — degree of MM influence on price
 *   5. Fake Liquidity Score — phantom liquidity that vanishes on approach
 *   6. Spread Manipulation Index — abnormal spread behavior patterns
 *
 * Uses: bars, spreadBps, imbalance, depthUsd, volume24hUsd
 */
export function computeMarketMakerDetection(
  coin: CoinUniverseData,
): MarketMakerDetectionSignals {
  const defaults: MarketMakerDetectionSignals = {
    spoofingProbability: 0,
    icebergOrderScore: 0,
    quoteStuffingScore: 0,
    marketMakerControlScore: 0,
    fakeLiquidityScore: 0,
    spreadManipulationIndex: 0,
  };

  const bars = coin.bars;
  if (bars.length < 20) return defaults;

  const price = coin.price;
  const atr = coin.atrPct ?? 1;

  // ── 1. Spoofing Probability ──
  // Detected via: large wicks with no follow-through + volume anomalies
  const last15 = bars.slice(-15);
  let spoofSignals = 0;
  for (let i = 1; i < last15.length; i++) {
    const prev = last15[i - 1];
    const curr = last15[i];
    const prevRange = prev.high - prev.low;
    const prevBody = Math.abs(prev.close - prev.open);
    const prevWickRatio = prevRange > 0 ? (prevRange - prevBody) / prevRange : 0;

    // High wick ratio + next bar reverses = possible spoof
    if (prevWickRatio > 0.6 && prev.volume > 0) {
      const reversed =
        (prev.close > prev.open && curr.close < curr.open) ||
        (prev.close < prev.open && curr.close > curr.open);
      if (reversed) spoofSignals++;
    }
  }
  const spoofingProbability = clamp(Math.round((spoofSignals / last15.length) * 100 * 2.5), 0, 100);

  // ── 2. Iceberg Order Score ──
  // Detected via: volume much higher than expected from visible range
  let icebergScore = 0;
  const last10 = bars.slice(-10);
  let hiddenVolumeSignals = 0;
  for (const b of last10) {
    const range = b.high - b.low;
    const rangePct = price > 0 ? (range / price) * 100 : 0;
    const expectedVol = (rangePct / atr) * (coin.volume24hUsd / 96); // expected vol per 15m bar
    if (b.volume > expectedVol * 2.5 && rangePct < atr * 0.3) {
      hiddenVolumeSignals++;
    }
  }
  icebergScore = clamp(Math.round((hiddenVolumeSignals / last10.length) * 100), 0, 100);

  // ── 3. Quote Stuffing Score ──
  // Rapid oscillation without directional progress
  let oscillationCount = 0;
  for (let i = 2; i < last15.length; i++) {
    const dir1 = last15[i - 1].close > last15[i - 2].close ? 1 : -1;
    const dir2 = last15[i].close > last15[i - 1].close ? 1 : -1;
    if (dir1 !== dir2) oscillationCount++;
  }
  const oscillationRate = last15.length > 2 ? oscillationCount / (last15.length - 2) : 0;
  // Low net movement despite high oscillation
  const netMove = Math.abs(last15[last15.length - 1].close - last15[0].close) / price * 100;
  const quoteStuffingScore = clamp(
    Math.round(oscillationRate * 60 + clamp(1 - netMove / (atr * 0.5), 0, 1) * 40),
    0,
    100,
  );

  // ── 4. Market Maker Control Score ──
  // Tight range + consistent depth + spread control
  let mmControlScore = 0;
  if (coin.spreadBps != null && coin.depthUsd != null) {
    // Tight spread = MM present
    const spreadControl = clamp(1 - coin.spreadBps / 10, 0, 1);

    // High depth/volume ratio = MM providing liquidity
    const depthVolumeRatio = coin.volume24hUsd > 0
      ? clamp(coin.depthUsd / (coin.volume24hUsd / 96) * 2, 0, 1)
      : 0;

    // Price pinning: how flat has the recent range been?
    const rangeOfLast10 = last10.reduce((s, b) => Math.max(s, b.high), 0) -
      last10.reduce((s, b) => Math.min(s, b.low), Infinity);
    const rangePct = price > 0 ? (rangeOfLast10 / price) * 100 : 0;
    const rangePinning = clamp(1 - rangePct / atr, 0, 1);

    mmControlScore = clamp(
      Math.round(spreadControl * 35 + depthVolumeRatio * 30 + rangePinning * 35),
      0,
      100,
    );
  }

  // ── 5. Fake Liquidity Score ──
  // High depth but wicks easily penetrate levels
  let fakeLiqScore = 0;
  if (coin.depthUsd != null) {
    // Count bars where wicks exceeded expected depth support
    let depthBreaches = 0;
    for (const b of last10) {
      const wickLower = Math.min(b.open, b.close) - b.low;
      const wickUpper = b.high - Math.max(b.open, b.close);
      const maxWick = Math.max(wickLower, wickUpper);
      const wickPct = price > 0 ? (maxWick / price) * 100 : 0;
      // Large wick relative to ATR despite "deep" book
      if (wickPct > atr * 0.5 && coin.depthUsd > 100_000) {
        depthBreaches++;
      }
    }
    fakeLiqScore = clamp(Math.round((depthBreaches / last10.length) * 100), 0, 100);
  }

  // ── 6. Spread Manipulation Index ──
  // Abnormal spread widening patterns
  let spreadManip = 0;
  if (coin.spreadBps != null) {
    // Proxy: bars with very wide range but low volume = spread manipulation
    let wideRangeLowVol = 0;
    const avgVol = last15.reduce((s, b) => s + b.volume, 0) / last15.length;
    for (const b of last15) {
      const rangePct = price > 0 ? ((b.high - b.low) / price) * 100 : 0;
      if (rangePct > atr * 0.8 && b.volume < avgVol * 0.5) {
        wideRangeLowVol++;
      }
    }
    const anomalyRate = wideRangeLowVol / last15.length;
    // High spread itself is a signal
    const spreadAnomaly = clamp(coin.spreadBps / 15, 0, 1);
    spreadManip = clamp(Math.round(anomalyRate * 60 + spreadAnomaly * 40), 0, 100);
  }

  return {
    spoofingProbability,
    icebergOrderScore: icebergScore,
    quoteStuffingScore,
    marketMakerControlScore: mmControlScore,
    fakeLiquidityScore: fakeLiqScore,
    spreadManipulationIndex: spreadManip,
  };
}
