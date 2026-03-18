/**
 * Liquidity Scorer — 0-25 points
 *
 * Sub-components:
 *   - Volume (0-10): log-scale volume scoring
 *   - Depth  (0-8):  orderbook depth quality
 *   - Spread (0-7):  bid-ask spread tightness
 */

import type { CoinUniverseData, LiquidityScore } from "./types.ts";

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export function scoreLiquidity(coin: CoinUniverseData): LiquidityScore {
  // Volume (0-10): log10 scale — $25M=0, $500M=0.5, $5B+=1.0
  const logVol = Math.log10(Math.max(coin.volume24hUsd, 1));
  const volumeNorm = clamp((logVol - 7.4) / 2.3, 0, 1); // 7.4 = log10(25M), 9.7 = log10(5B)
  const volumeScore = Math.round(volumeNorm * 10 * 100) / 100;

  // Depth (0-8): orderbook depth — $1M=0.25, $5M=0.6, $20M+=1.0
  let depthNorm = 0.15;
  if (coin.depthUsd !== null) {
    depthNorm = clamp(coin.depthUsd / 20_000_000, 0, 1);
  }
  const depthScore = Math.round(depthNorm * 8 * 100) / 100;

  // Spread (0-7): tighter spread = better — 1bps=1.0, 5bps=0.55, 10bps=0.1, 20bps=0
  let spreadNorm = 0.3;
  if (coin.spreadBps !== null) {
    spreadNorm = clamp(1 - (coin.spreadBps - 1) / 19, 0, 1);
  }
  const spreadScore = Math.round(spreadNorm * 7 * 100) / 100;

  const total = Math.round((volumeScore + depthScore + spreadScore) * 100) / 100;

  return {
    total: clamp(total, 0, 25),
    volumeScore,
    depthScore,
    spreadScore,
  };
}
