/**
 * Bitrium Prime AI Hub — Position Sizer
 *
 * Score-tiered sizing (code-only, NOT AI):
 *   < 58 → 0x (no position)
 *   58-67 → 0.35x
 *   68-77 → 0.60x
 *   78-89 → 0.85x
 *   90+   → 1.00x
 *
 * Blockers: slippage HIGH → 0, fakeBreak HIGH → 0
 * Modifiers: stress HIGH → x0.50, weekend → x0.70
 */

import type { PrimeAiCoinInput, EnforcedResult } from "./types.ts";
import { SIZE_TIERS, SIZE_MODIFIERS } from "./config.ts";

export interface PositionSizeResult {
  multiplier: number;
  tier: string;
  blocked: boolean;
  blockReason: string;
  reasons: string[];
}

/**
 * Calculate position size from enforced score.
 */
export function calculatePositionSize(
  coin: PrimeAiCoinInput,
  result: EnforcedResult,
): PositionSizeResult {
  const score = result.enforced.finalScore;
  const decision = result.enforced.decision;

  // NO_TRADE or WATCHLIST = no position
  if (decision === "NO_TRADE" || decision === "WATCHLIST") {
    return {
      multiplier: 0,
      tier: "NONE",
      blocked: true,
      blockReason: `decision_${decision}`,
      reasons: [`Decision ${decision} does not warrant a position`],
    };
  }

  // Hard fail = no position
  if (result.enforced.hardFail) {
    return {
      multiplier: 0,
      tier: "NONE",
      blocked: true,
      blockReason: "hard_fail",
      reasons: ["Hard gate failure"],
    };
  }

  // Blockers
  if (coin.execution.slippage === "HIGH") {
    return {
      multiplier: 0,
      tier: "BLOCKED",
      blocked: true,
      blockReason: "slippage_high",
      reasons: ["High slippage blocks position"],
    };
  }
  if (coin.regime.fakeBreakProb > 0.7) {
    return {
      multiplier: 0,
      tier: "BLOCKED",
      blocked: true,
      blockReason: "fake_break_high",
      reasons: ["High fake breakout probability blocks position"],
    };
  }

  // Score-tiered sizing
  let multiplier = 0;
  let tier = "NONE";
  const reasons: string[] = [];

  for (const t of SIZE_TIERS) {
    if (score >= t.min) {
      multiplier = t.modifier;
      tier = t.tier;
      reasons.push(`Score ${Math.round(score)} in ${t.tier} tier (>= ${t.min})`);
      break;
    }
  }

  if (multiplier === 0) {
    return {
      multiplier: 0,
      tier: "BELOW_THRESHOLD",
      blocked: true,
      blockReason: `score_below_58(${Math.round(score)})`,
      reasons: [`Score ${Math.round(score)} below minimum 58 for sizing`],
    };
  }

  // Modifiers
  if (coin.regime.stress > 0.7) {
    multiplier *= SIZE_MODIFIERS.stressHigh;
    reasons.push(`Stress modifier: x${SIZE_MODIFIERS.stressHigh}`);
  }
  if (coin.session.name === "WEEKEND") {
    multiplier *= SIZE_MODIFIERS.weekend;
    reasons.push(`Weekend modifier: x${SIZE_MODIFIERS.weekend}`);
  }

  return {
    multiplier: Math.round(multiplier * 100) / 100,
    tier,
    blocked: false,
    blockReason: "",
    reasons,
  };
}
