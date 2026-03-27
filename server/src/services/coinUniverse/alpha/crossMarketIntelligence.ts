import type { CoinUniverseData } from "../types.ts";
import type { CrossMarketIntelligenceSignals } from "./alphaTypes.ts";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Cross-market universe data provided by the orchestrator.
 * The orchestrator passes BTC and ETH data extracted from the same universe cycle.
 */
export interface CrossMarketContext {
  btcChange24h: number;       // BTC 24h change %
  btcVolume24h: number;       // BTC 24h volume USD
  btcTrendStrength: number;   // BTC trend strength 0-100
  ethChange24h: number;       // ETH 24h change %
  ethVolume24h: number;       // ETH 24h volume USD
  universeMeanChange: number; // average change24h across all universe coins
  universeUpCount: number;    // # of coins with positive change
  universeTotalCount: number; // total coins in universe
}

/**
 * M10: Cross Market Intelligence — inter-coin correlation signals.
 *
 * Signals:
 *   1. BTC Dominance Momentum — BTC's relative strength vs altcoins
 *   2. ETH/BTC Strength Ratio — ETH outperformance signal
 *   3. Risk On/Off Index — overall market risk appetite
 *
 * Uses: cross-market context + individual coin data
 */
export function computeCrossMarketIntelligence(
  coin: CoinUniverseData,
  ctx: CrossMarketContext,
): CrossMarketIntelligenceSignals {
  // ── 1. BTC Dominance Momentum ──
  // Positive = BTC outperforming alts (risk-off / BTC dominance rising)
  // Negative = alts outperforming BTC (alt-season signal)
  const btcVsUniverse = ctx.btcChange24h - ctx.universeMeanChange;
  const btcDominanceMomentum = clamp(Math.round(btcVsUniverse * 10), -100, 100);

  // ── 2. ETH/BTC Strength Ratio ──
  // > 50 = ETH stronger than BTC (alt-friendly)
  // < 50 = BTC stronger (alt-unfriendly)
  const ethBtcDiff = ctx.ethChange24h - ctx.btcChange24h;
  const ethBtcStrengthRatio = clamp(Math.round(50 + ethBtcDiff * 8), 0, 100);

  // ── 3. Risk On/Off Index ──
  // 0 = extreme risk-off, 100 = extreme risk-on
  const upRatio = ctx.universeTotalCount > 0
    ? ctx.universeUpCount / ctx.universeTotalCount
    : 0.5;

  // Combine: market breadth + BTC strength + volume context
  const breadthScore = upRatio * 100;
  const btcStrength = clamp(50 + ctx.btcChange24h * 5, 0, 100);
  const volumeHealth = ctx.btcVolume24h > 0 && ctx.ethVolume24h > 0 ? 60 : 30;

  // Individual coin correlation: does this coin move with or against market?
  const coinVsMarket = coin.change24hPct - ctx.universeMeanChange;
  const correlationBonus = clamp(coinVsMarket * 3, -15, 15);

  const riskOnOffIndex = clamp(
    Math.round(breadthScore * 0.4 + btcStrength * 0.3 + volumeHealth * 0.15 + correlationBonus + 15 * 0.15),
    0,
    100,
  );

  return {
    btcDominanceMomentum,
    ethBtcStrengthRatio,
    riskOnOffIndex,
  };
}
