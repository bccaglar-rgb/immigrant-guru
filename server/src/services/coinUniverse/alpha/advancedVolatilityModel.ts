import type { CoinUniverseData, OhlcvBar } from "../types.ts";
import type { AdvancedVolatilitySignals } from "./alphaTypes.ts";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const mean = (arr: number[]) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

/**
 * M3: Advanced Volatility — regime detection, compression, expansion forecast.
 * Uses: bars (15m klines), atrPct, rsi14.
 */
export function computeAdvancedVolatility(coin: CoinUniverseData): AdvancedVolatilitySignals {
  const bars = coin.bars;
  if (bars.length < 25) {
    return { volatilityRegime: "MEAN_REVERTING", compressionScore: 50, expansionForecast: 30, volatilityShockIndex: 0, bollingerWidth: 0 };
  }

  // 1. Bollinger Bandwidth (period=20, stddev=2)
  const closes20 = bars.slice(-20).map((b) => b.close);
  const sma20 = mean(closes20);
  const stddev = Math.sqrt(mean(closes20.map((c) => (c - sma20) ** 2)));
  const upper = sma20 + 2 * stddev;
  const lower = sma20 - 2 * stddev;
  const bollingerWidth = sma20 > 0 ? ((upper - lower) / sma20) * 100 : 0;

  // 2. Compression score (recent ATR vs historical ATR)
  let compressionScore = 50;
  if (bars.length >= 55) {
    const recentATR = computeATR(bars.slice(-14), 14);
    const historicalATR = computeATR(bars.slice(-55, -15), 14);
    if (historicalATR > 0) {
      const ratio = recentATR / historicalATR;
      compressionScore = clamp(Math.round((1.0 - ratio) * 100), 0, 100);
    }
  }
  if (bollingerWidth < 1.5) compressionScore = Math.max(compressionScore, 80);

  // 3. Expansion forecast
  const avgVolRecent = mean(bars.slice(-3).map((b) => b.volume));
  const avgVol20 = mean(bars.slice(-20).map((b) => b.volume));
  const volRatio = avgVol20 > 0 ? avgVolRecent / avgVol20 : 1;

  const base = compressionScore * 0.5;
  const volComp = clamp((volRatio - 0.8) * 100, 0, 30);
  const rsiComp = (coin.rsi14 != null && (coin.rsi14 > 65 || coin.rsi14 < 35)) ? 20 : 0;
  const expansionForecast = clamp(Math.round(base + volComp + rsiComp), 0, 100);

  // 4. Volatility shock index
  let volatilityShockIndex = 0;
  if (coin.atrPct != null && coin.atrPct > 0) {
    const lastBar = bars[bars.length - 1];
    const barRange = (lastBar.high - lastBar.low) / lastBar.close * 100;
    volatilityShockIndex = clamp(Math.round(((barRange / coin.atrPct) - 1) * 100), 0, 100);
  }

  // 5. Regime classification
  const volatilityRegime: AdvancedVolatilitySignals["volatilityRegime"] =
    volatilityShockIndex > 60 && (coin.atrPct ?? 0) > 3 ? "PANIC" :
    compressionScore > 65 && bollingerWidth < 2 ? "COMPRESSED" :
    (coin.atrPct ?? 0) > 1.5 && coin.regime === "TREND" ? "TRENDING" : "MEAN_REVERTING";

  return { volatilityRegime, compressionScore, expansionForecast, volatilityShockIndex, bollingerWidth: Math.round(bollingerWidth * 100) / 100 };
}

function computeATR(bars: OhlcvBar[], period: number): number {
  if (bars.length < 2) return 0;
  let atr = 0;
  for (let i = 1; i < Math.min(bars.length, period + 1); i++) {
    const tr = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low - bars[i - 1].close),
    );
    atr += tr;
  }
  const count = Math.min(bars.length - 1, period);
  return count > 0 ? atr / count : 0;
}
