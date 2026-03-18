/**
 * Structure Scorer — 0-25 points
 *
 * Sub-components:
 *   - S/R Proximity (0-12): distance to nearest support/resistance
 *   - Regime Score  (0-7):  market regime quality (trend > breakout > range)
 *   - Trend Score   (0-6):  trend strength alignment
 */

import type { CoinUniverseData, StructureScore } from "./types.ts";

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export function scoreStructure(coin: CoinUniverseData): StructureScore {
  // S/R Proximity (0-12): closer to S/R = higher score
  let srProximity = 1.0; // default low
  if (coin.srDistPct !== null) {
    if (coin.srDistPct < 0.5) srProximity = 12;
    else if (coin.srDistPct < 1.0) srProximity = 10;
    else if (coin.srDistPct < 2.0) srProximity = 7.5;
    else if (coin.srDistPct < 3.0) srProximity = 5;
    else if (coin.srDistPct < 5.0) srProximity = 2.5;
    else srProximity = 1;
  }

  // Regime Score (0-7): TREND=7, BREAKOUT=5, RANGE=2, UNKNOWN=1
  let regimeScore = 1;
  switch (coin.regime) {
    case "TREND": regimeScore = 7; break;
    case "BREAKOUT": regimeScore = 5; break;
    case "RANGE": regimeScore = 2; break;
    default: regimeScore = 1; break;
  }

  // Trend Score (0-6): trendStrength 0-100 → 0-6
  const trendNorm = clamp(coin.trendStrength / 100, 0, 1);
  const trendScore = Math.round(trendNorm * 6 * 100) / 100;

  const total = Math.round((srProximity + regimeScore + trendScore) * 100) / 100;

  return {
    total: clamp(total, 0, 25),
    srProximity,
    regimeScore,
    trendScore,
  };
}
