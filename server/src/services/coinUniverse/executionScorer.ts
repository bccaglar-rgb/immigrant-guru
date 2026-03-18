/**
 * Execution Scorer — 0-15 points
 *
 * Sub-components:
 *   - Spread Quality   (0-6): bid-ask spread tightness for execution
 *   - Depth Quality    (0-5): orderbook depth for slippage control
 *   - Imbalance Score  (0-4): orderbook imbalance (directional edge)
 */

import type { CoinUniverseData, ExecutionScore } from "./types.ts";

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export function scoreExecution(coin: CoinUniverseData): ExecutionScore {
  // Spread Quality (0-6): tighter = better fill price
  let spreadNorm = 0.25;
  if (coin.spreadBps !== null) {
    if (coin.spreadBps <= 1) spreadNorm = 1.0;
    else if (coin.spreadBps <= 2) spreadNorm = 0.85;
    else if (coin.spreadBps <= 5) spreadNorm = 0.6;
    else if (coin.spreadBps <= 10) spreadNorm = 0.3;
    else spreadNorm = 0.1;
  }
  const spreadQuality = Math.round(spreadNorm * 6 * 100) / 100;

  // Depth Quality (0-5): more depth = less slippage
  let depthNorm = 0.2;
  if (coin.depthUsd !== null) {
    if (coin.depthUsd >= 10_000_000) depthNorm = 1.0;
    else if (coin.depthUsd >= 5_000_000) depthNorm = 0.75;
    else if (coin.depthUsd >= 2_000_000) depthNorm = 0.5;
    else if (coin.depthUsd >= 500_000) depthNorm = 0.25;
    else depthNorm = 0.1;
  }
  const depthQuality = Math.round(depthNorm * 5 * 100) / 100;

  // Imbalance Score (0-4): strong imbalance = directional edge for entry
  let imbalanceNorm = 0.15;
  if (coin.imbalance !== null) {
    const absImbalance = Math.abs(coin.imbalance);
    if (absImbalance > 0.5) imbalanceNorm = 1.0;
    else if (absImbalance > 0.3) imbalanceNorm = 0.7;
    else if (absImbalance > 0.15) imbalanceNorm = 0.4;
    else imbalanceNorm = 0.15;
  }
  const imbalanceScore = Math.round(imbalanceNorm * 4 * 100) / 100;

  const total = Math.round((spreadQuality + depthQuality + imbalanceScore) * 100) / 100;

  return {
    total: clamp(total, 0, 15),
    spreadQuality,
    depthQuality,
    imbalanceScore,
  };
}
