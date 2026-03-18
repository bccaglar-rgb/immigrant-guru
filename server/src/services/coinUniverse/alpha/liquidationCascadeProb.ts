import type { CoinUniverseData } from "../types.ts";
import type { FundingIntelligenceSignals, OiShockSignals, AdvancedVolatilitySignals, LiquidationCascadeSignals } from "./alphaTypes.ts";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * M6: Liquidation Cascade Probability — composite of M1 + M2 + M3.
 * Estimates squeeze risk for long and short positions.
 */
export function computeLiquidationCascade(
  coin: CoinUniverseData,
  funding: FundingIntelligenceSignals | null,
  oiShock: OiShockSignals | null,
  volatility: AdvancedVolatilitySignals | null,
): LiquidationCascadeSignals {
  const bars = coin.bars;

  // Distance to liquidation zone (proxy: distance to recent high/low)
  let distToLow = 5, distToHigh = 5;
  if (bars.length >= 20 && coin.price > 0) {
    const recentHigh = Math.max(...bars.slice(-20).map((b) => b.high));
    const recentLow = Math.min(...bars.slice(-20).map((b) => b.low));
    distToLow = ((coin.price - recentLow) / coin.price) * 100;
    distToHigh = ((recentHigh - coin.price) / coin.price) * 100;
  }
  const distanceToLiqZone = Math.min(distToLow, distToHigh);

  // Long squeeze probability
  let longBase = 0;
  if (funding?.fundingDirection === "BULLISH_CROWD") {
    longBase += funding.fundingExtremeScore * 0.3;
  }
  if (oiShock && oiShock.leverageBuildupIndicator > 50) {
    longBase += oiShock.leverageBuildupIndicator * 0.2;
  }
  if (distToLow < 2) longBase += 30;
  else if (distToLow < 4) longBase += 15;
  if (volatility?.volatilityRegime === "PANIC") longBase += 20;
  const longSqueezeProb = clamp(Math.round(longBase), 0, 100);

  // Short squeeze probability
  let shortBase = 0;
  if (funding?.fundingDirection === "BEARISH_CROWD") {
    shortBase += funding.fundingExtremeScore * 0.3;
  }
  if (oiShock && oiShock.leverageBuildupIndicator > 50) {
    shortBase += oiShock.leverageBuildupIndicator * 0.2;
  }
  if (distToHigh < 2) shortBase += 30;
  else if (distToHigh < 4) shortBase += 15;
  if (volatility?.volatilityRegime === "PANIC") shortBase += 20;
  const shortSqueezeProb = clamp(Math.round(shortBase), 0, 100);

  const cascadeScore = Math.max(longSqueezeProb, shortSqueezeProb);
  const dominantRisk: LiquidationCascadeSignals["dominantRisk"] =
    longSqueezeProb > 60 && longSqueezeProb > shortSqueezeProb ? "LONG_SQUEEZE" :
    shortSqueezeProb > 60 && shortSqueezeProb > longSqueezeProb ? "SHORT_SQUEEZE" : "LOW_RISK";

  return {
    cascadeScore,
    longSqueezeProb,
    shortSqueezeProb,
    dominantRisk,
    distanceToLiqZone: Math.round(distanceToLiqZone * 100) / 100,
  };
}
