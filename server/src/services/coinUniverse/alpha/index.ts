/**
 * Alpha Signal Orchestrator — runs all 7 modules and computes composite bonus/penalty.
 */

import type { CoinUniverseData } from "../types.ts";
import type { AlphaSignals } from "./alphaTypes.ts";
import type { AlphaConfig } from "./alphaConfig.ts";

import { computeFundingIntelligence } from "./fundingIntelligence.ts";
import { computeOiShock } from "./oiShockDetection.ts";
import { computeAdvancedVolatility } from "./advancedVolatilityModel.ts";
import { computeDeltaImbalance } from "./deltaImbalanceCvd.ts";
import { computeMultiTimeframe } from "./multiTimeframeAlignment.ts";
import { computeLiquidationCascade } from "./liquidationCascadeProb.ts";
import { computeTradeTiming } from "./tradeTimingIntelligence.ts";

export type FundingHistoryStore = Map<string, number[]>;

export function computeAllAlphaSignals(
  coin: CoinUniverseData,
  fundingHistory: FundingHistoryStore,
  config: AlphaConfig,
): AlphaSignals | null {
  if (!config.globalEnabled) return null;

  const mc = config.modules;

  // Phase 1: Independent modules
  const funding = mc.fundingIntelligence.enabled
    ? computeFundingIntelligence(coin, fundingHistory.get(coin.symbol) ?? [])
    : null;

  const oiShock = mc.oiShockDetection.enabled
    ? computeOiShock(coin) : null;

  const volatility = mc.advancedVolatility.enabled
    ? computeAdvancedVolatility(coin) : null;

  const delta = mc.deltaImbalance.enabled
    ? computeDeltaImbalance(coin) : null;

  const multiTf = mc.multiTimeframe.enabled
    ? computeMultiTimeframe(coin) : null;

  const timing = mc.tradeTiming.enabled
    ? computeTradeTiming(coin) : null;

  // Phase 2: Composite module (depends on M1, M2, M3)
  const liquidation = mc.liquidationCascade.enabled
    ? computeLiquidationCascade(coin, funding, oiShock, volatility)
    : null;

  // Phase 3: Compute bonus/penalty
  let alphaBonus = 0;
  let alphaPenalty = 0;

  // M1: Funding
  if (funding) {
    if (funding.isExtreme && funding.fundingCrowdingIndex > 70)
      alphaBonus += 2 * mc.fundingIntelligence.weight;
    if (funding.isExtreme && funding.fundingCrowdingIndex > 85)
      alphaPenalty += 1 * mc.fundingIntelligence.weight;
  }

  // M2: OI Shock
  if (oiShock) {
    if (oiShock.shockType === "DIVERGENT")
      alphaBonus += 2 * mc.oiShockDetection.weight;
    if (oiShock.shockType === "SPIKE" && oiShock.leverageBuildupIndicator > 70)
      alphaPenalty += 2 * mc.oiShockDetection.weight;
  }

  // M3: Volatility
  if (volatility) {
    if (volatility.volatilityRegime === "COMPRESSED" && volatility.expansionForecast > 70)
      alphaBonus += 3 * mc.advancedVolatility.weight;
    if (volatility.volatilityRegime === "PANIC")
      alphaPenalty += 2 * mc.advancedVolatility.weight;
  }

  // M4: Delta/CVD
  if (delta) {
    const priceUp = coin.change24hPct > 0.5;
    const cvdConfirms = (priceUp && delta.cvdTrend === "RISING") || (!priceUp && delta.cvdTrend === "FALLING");
    if (Math.abs(delta.deltaImbalanceScore) > 60 && cvdConfirms)
      alphaBonus += 2 * mc.deltaImbalance.weight;

    const cvdConflicts = (priceUp && delta.cvdTrend === "FALLING") || (!priceUp && delta.cvdTrend === "RISING");
    if (cvdConflicts && Math.abs(delta.deltaImbalanceScore) > 40)
      alphaPenalty += 1 * mc.deltaImbalance.weight;
  }

  // M5: Multi-TF
  if (multiTf) {
    if (multiTf.multiTfAlignmentScore === 100 && multiTf.htfTrendStrength > 60)
      alphaBonus += 3 * mc.multiTimeframe.weight;
    if (multiTf.multiTfAlignmentScore === 0)
      alphaPenalty += 1 * mc.multiTimeframe.weight;
  }

  // M6: Liquidation Cascade
  if (liquidation) {
    if (liquidation.cascadeScore > 70)
      alphaPenalty += 2 * mc.liquidationCascade.weight;
    const contrarian =
      (liquidation.dominantRisk === "LONG_SQUEEZE" && coin.aggressorFlow === "SELL") ||
      (liquidation.dominantRisk === "SHORT_SQUEEZE" && coin.aggressorFlow === "BUY");
    if (liquidation.dominantRisk !== "LOW_RISK" && contrarian)
      alphaBonus += 2 * mc.liquidationCascade.weight;
  }

  // M7: Trade Timing
  if (timing) {
    if (timing.timingGrade === "A")
      alphaBonus += 2 * mc.tradeTiming.weight;
    if (timing.timingGrade === "D" && timing.momentumIgnitionScore < 20)
      alphaPenalty += 1 * mc.tradeTiming.weight;
  }

  // Clamp
  alphaBonus = Math.min(config.maxAlphaBonus, Math.round(alphaBonus * 100) / 100);
  alphaPenalty = Math.min(config.maxAlphaPenalty, Math.round(alphaPenalty * 100) / 100);

  // Grade
  const net = alphaBonus - alphaPenalty;
  const alphaGrade: AlphaSignals["alphaGrade"] =
    net >= 8 ? "S" : net >= 4 ? "A" : net >= 1 ? "B" : net >= -2 ? "C" : "D";

  return {
    funding, oiShock, volatility, delta, multiTf, liquidation, timing,
    alphaBonus, alphaPenalty, alphaGrade,
  };
}
