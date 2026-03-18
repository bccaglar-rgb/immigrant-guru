import type { CoinUniverseData, OhlcvBar } from "../types.ts";
import type { MultiTimeframeSignals } from "./alphaTypes.ts";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const mean = (arr: number[]) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

/** Aggregate 15m bars into larger timeframe bars. */
function aggregate(bars: OhlcvBar[], factor: number): OhlcvBar[] {
  const result: OhlcvBar[] = [];
  for (let i = 0; i <= bars.length - factor; i += factor) {
    const chunk = bars.slice(i, i + factor);
    result.push({
      time: chunk[0].time,
      open: chunk[0].open,
      high: Math.max(...chunk.map((b) => b.high)),
      low: Math.min(...chunk.map((b) => b.low)),
      close: chunk[chunk.length - 1].close,
      volume: chunk.reduce((s, b) => s + b.volume, 0),
    });
  }
  return result;
}

/** Simple EMA. */
function ema(values: number[], period: number): number {
  if (!values.length) return 0;
  const k = 2 / (period + 1);
  let result = values[0];
  for (let i = 1; i < values.length; i++) result = values[i] * k + result * (1 - k);
  return result;
}

/**
 * M5: Multi-Timeframe Alignment — derive 1h/4h from 15m bars.
 * Uses: bars (15m, 100 bars → 25×1h, 6×4h).
 */
export function computeMultiTimeframe(coin: CoinUniverseData): MultiTimeframeSignals {
  const bars = coin.bars;
  if (bars.length < 32) {
    return { htfTrendBias: "NEUTRAL", ltfPullbackQuality: 0, multiTfAlignmentScore: 33, structureCompression: 0, htfTrendStrength: 0 };
  }

  const bars1h = aggregate(bars, 4);  // 25 bars
  const bars4h = aggregate(bars, 16); // 6 bars

  // 1. HTF Trend Bias (from 4h)
  let htfTrendBias: MultiTimeframeSignals["htfTrendBias"] = "NEUTRAL";
  if (bars4h.length >= 3) {
    const ema3 = ema(bars4h.map((b) => b.close), 3);
    const last = bars4h[bars4h.length - 1].close;
    const prev = bars4h[bars4h.length - 2].close;
    if (last > ema3 && last > prev) htfTrendBias = "BULLISH";
    else if (last < ema3 && last < prev) htfTrendBias = "BEARISH";
  }

  // 2. HTF Trend Strength
  let htfTrendStrength = 0;
  if (bars1h.length >= 10) {
    const direction = bars1h[bars1h.length - 1].close > bars1h[0].close ? 1 : -1;
    let consecutive = 0;
    for (let i = bars1h.length - 1; i >= 1; i--) {
      if ((bars1h[i].close - bars1h[i - 1].close) * direction > 0) consecutive++;
      else break;
    }
    htfTrendStrength = clamp(consecutive * 15, 0, 100);
    const slopePct = Math.abs(
      (bars1h[bars1h.length - 1].close - bars1h[Math.max(0, bars1h.length - 5)].close) /
      bars1h[Math.max(0, bars1h.length - 5)].close * 100,
    );
    htfTrendStrength = clamp(htfTrendStrength + Math.min(slopePct * 10, 30), 0, 100);
  }

  // 3. LTF Pullback Quality
  let ltfPullbackQuality = 10;
  if (bars.length >= 10 && htfTrendBias !== "NEUTRAL") {
    const last6 = bars.slice(-6);
    const pullbackBars = last6.slice(3, 5);
    const isPullback = htfTrendBias === "BULLISH"
      ? pullbackBars.some((b) => b.close < b.open)
      : pullbackBars.some((b) => b.close > b.open);

    const resumeBar = last6[5];
    const isResume = htfTrendBias === "BULLISH"
      ? resumeBar.close > resumeBar.open
      : resumeBar.close < resumeBar.open;

    if (isPullback && isResume) {
      ltfPullbackQuality = 50;
      const pullbackVol = mean(pullbackBars.map((b) => b.volume));
      const trendVol = mean(last6.slice(0, 3).map((b) => b.volume));
      if (trendVol > 0 && pullbackVol < trendVol * 0.7) ltfPullbackQuality += 25;

      const trendRange = Math.abs(last6[2].close - last6[0].close);
      const pullbackLow = Math.min(...pullbackBars.map((b) => b.low));
      const pullbackRange = Math.abs(pullbackLow - last6[2].close);
      if (trendRange > 0 && pullbackRange / trendRange < 0.5) ltfPullbackQuality += 25;
    }
    ltfPullbackQuality = clamp(ltfPullbackQuality, 0, 100);
  }

  // 4. Multi-TF Alignment Score
  const ltfDir = coin.change24hPct > 0.5 ? "BULLISH" : coin.change24hPct < -0.5 ? "BEARISH" : "NEUTRAL";
  let mtfDir: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
  if (bars1h.length >= 5) {
    const first = bars1h[bars1h.length - 5].close;
    const last = bars1h[bars1h.length - 1].close;
    mtfDir = last > first * 1.002 ? "BULLISH" : last < first * 0.998 ? "BEARISH" : "NEUTRAL";
  }
  let agreements = 0;
  if (ltfDir === htfTrendBias) agreements++;
  if (mtfDir === htfTrendBias) agreements++;
  if (ltfDir === mtfDir && ltfDir !== "NEUTRAL") agreements++;
  const multiTfAlignmentScore = Math.round((agreements / 3) * 100);

  // 5. Structure Compression
  const range15m = bars.length >= 10 ? rangePercent(bars.slice(-10), coin.price) : 999;
  const range1h = bars1h.length >= 5 ? rangePercent(bars1h.slice(-5), coin.price) : 999;
  const range4h = bars4h.length >= 3 ? rangePercent(bars4h.slice(-3), coin.price) : 999;
  let narrowCount = 0;
  if (range15m < 1.5) narrowCount++;
  if (range1h < 3.0) narrowCount++;
  if (range4h < 5.0) narrowCount++;
  const structureCompression = Math.round((narrowCount / 3) * 100);

  return {
    htfTrendBias,
    ltfPullbackQuality: Math.round(ltfPullbackQuality),
    multiTfAlignmentScore,
    structureCompression,
    htfTrendStrength: Math.round(htfTrendStrength),
  };
}

function rangePercent(bars: OhlcvBar[], price: number): number {
  if (!bars.length || price <= 0) return 999;
  const high = Math.max(...bars.map((b) => b.high));
  const low = Math.min(...bars.map((b) => b.low));
  return ((high - low) / price) * 100;
}
