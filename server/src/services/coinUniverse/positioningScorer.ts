/**
 * Positioning Scorer — 0-15 points
 *
 * Sub-components:
 *   - Funding Score (0-6): funding rate extremity (mean-reversion signal)
 *   - OI Score      (0-5): open interest change direction
 *   - Flow Score    (0-4): aggressor flow bias
 */

import type { CoinUniverseData, PositioningScore } from "./types.ts";

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export function scorePositioning(coin: CoinUniverseData): PositioningScore {
  // Funding Score (0-6): |fundingRate| extremity
  let fundingNorm = 0.15;
  if (coin.fundingRate !== null) {
    const absFunding = Math.abs(coin.fundingRate);
    if (absFunding > 0.001) fundingNorm = 1.0;       // > 0.1%
    else if (absFunding > 0.0005) fundingNorm = 0.75; // > 0.05%
    else if (absFunding > 0.0002) fundingNorm = 0.45; // > 0.02%
    else if (absFunding > 0.0001) fundingNorm = 0.25; // > 0.01%
    else fundingNorm = 0.10;                           // < 0.01% (neutral)
  }
  const fundingScore = Math.round(fundingNorm * 6 * 100) / 100;

  // OI Score (0-5): OI change proxy — positive OI change = new interest
  let oiNorm = 0.2;
  if (coin.oiChange !== null) {
    if (coin.oiChange > 5) oiNorm = 1.0;        // > 5% OI increase
    else if (coin.oiChange > 2) oiNorm = 0.7;   // > 2%
    else if (coin.oiChange > 0) oiNorm = 0.4;   // positive
    else if (coin.oiChange > -2) oiNorm = 0.2;  // slight decrease
    else oiNorm = 0.05;                           // large decrease
  }
  const oiScore = Math.round(oiNorm * 5 * 100) / 100;

  // Flow Score (0-4): aggressor flow — directional = opportunity
  let flowNorm = 0.25;
  if (coin.aggressorFlow === "BUY" || coin.aggressorFlow === "SELL") {
    flowNorm = 0.8; // directional flow detected
  } else {
    flowNorm = 0.15; // neutral
  }
  const flowScore = Math.round(flowNorm * 4 * 100) / 100;

  const total = Math.round((fundingScore + oiScore + flowScore) * 100) / 100;

  return {
    total: clamp(total, 0, 15),
    fundingScore,
    oiScore,
    flowScore,
  };
}
