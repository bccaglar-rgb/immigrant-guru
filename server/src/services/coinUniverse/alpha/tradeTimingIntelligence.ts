import type { CoinUniverseData } from "../types.ts";
import type { TradeTimingSignals } from "./alphaTypes.ts";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const mean = (arr: number[]) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

/**
 * M7: Trade Timing Intelligence — momentum ignition, pullback quality, trigger candle.
 * Uses: bars (15m klines).
 */
export function computeTradeTiming(coin: CoinUniverseData): TradeTimingSignals {
  const bars = coin.bars;
  if (bars.length < 22) {
    return { momentumIgnitionScore: 0, volumeIgnition: false, microPullbackQuality: 0, triggerCandleScore: 0, timingGrade: "D" };
  }

  // 1. Momentum ignition — quiet base → sudden move + volume
  const prev10 = bars.slice(-15, -5);
  const last5 = bars.slice(-5);
  const avgVolPrev = mean(prev10.map((b) => b.volume));
  const avgVolRecent = mean(last5.map((b) => b.volume));
  const volAccel = avgVolPrev > 0 ? avgVolRecent / avgVolPrev : 1;

  const priceChangePrev = Math.abs(prev10[prev10.length - 1].close - prev10[0].close) / prev10[0].close * 100;
  const priceChangeRecent = Math.abs(last5[last5.length - 1].close - last5[0].close) / last5[0].close * 100;
  const priorQuiet = priceChangePrev < 1.0;
  const recentActive = priceChangeRecent > 0.5;

  let momentumIgnitionScore = 0;
  if (priorQuiet && recentActive) momentumIgnitionScore += 40;
  if (volAccel > 1.5) momentumIgnitionScore += 30;
  if (volAccel > 2.5) momentumIgnitionScore += 15;
  if (last5[last5.length - 1].volume > last5[0].volume) momentumIgnitionScore += 15;
  momentumIgnitionScore = clamp(momentumIgnitionScore, 0, 100);

  // 2. Volume ignition — last 2 bars > 2x 20-bar avg
  const avg20 = mean(bars.slice(-22, -2).map((b) => b.volume));
  const last2Max = Math.max(bars[bars.length - 1].volume, bars[bars.length - 2].volume);
  const volumeIgnition = last2Max > avg20 * 2;

  // 3. Micro pullback quality
  let microPullbackQuality = 0;
  if (bars.length >= 10) {
    const last6 = bars.slice(-6);
    const trendDir = last6[2].close > last6[0].close ? 1 : -1;
    const pullbackBars = last6.slice(3, 5);
    const resumeBar = last6[5];

    const isPullback = pullbackBars.some((b) => (b.close - b.open) * trendDir < 0);
    const isResume = (resumeBar.close - resumeBar.open) * trendDir > 0;

    if (isPullback && isResume) {
      microPullbackQuality = 50;
      const pullbackVol = mean(pullbackBars.map((b) => b.volume));
      const trendVol = mean(last6.slice(0, 3).map((b) => b.volume));
      if (trendVol > 0 && pullbackVol < trendVol * 0.7) microPullbackQuality += 25;

      const trendRange = Math.abs(last6[2].close - last6[0].close);
      const pullbackRange = Math.abs(Math.min(...pullbackBars.map((b) => b.low)) - last6[2].close);
      if (trendRange > 0 && pullbackRange / trendRange < 0.5) microPullbackQuality += 25;
    }
    microPullbackQuality = clamp(microPullbackQuality, 0, 100);
  }

  // 4. Trigger candle quality
  const lastBar = bars[bars.length - 1];
  const range = lastBar.high - lastBar.low;
  let triggerCandleScore = 0;
  if (range > 0) {
    const bodySize = Math.abs(lastBar.close - lastBar.open);
    const bodyRatio = bodySize / range;

    if (bodyRatio > 0.6) triggerCandleScore += 40;
    else if (bodyRatio > 0.4) triggerCandleScore += 20;

    const avgVol = mean(bars.slice(-15, -1).map((b) => b.volume));
    if (avgVol > 0 && lastBar.volume > avgVol * 1.5) triggerCandleScore += 30;
    else if (avgVol > 0 && lastBar.volume > avgVol * 1.2) triggerCandleScore += 15;

    if (bars.length >= 2) {
      const prevRange = bars[bars.length - 2].high - bars[bars.length - 2].low;
      if (prevRange > 0 && range > prevRange * 1.3) triggerCandleScore += 20;
    }

    if (bodyRatio < 0.2) triggerCandleScore = Math.max(0, triggerCandleScore - 30);
  }
  triggerCandleScore = clamp(triggerCandleScore, 0, 100);

  // 5. Timing grade
  const composite = momentumIgnitionScore * 0.3 + microPullbackQuality * 0.3 + triggerCandleScore * 0.4;
  const timingGrade: TradeTimingSignals["timingGrade"] =
    composite >= 75 ? "A" : composite >= 55 ? "B" : composite >= 35 ? "C" : "D";

  return { momentumIgnitionScore, volumeIgnition, microPullbackQuality, triggerCandleScore, timingGrade };
}
