/**
 * Flow Mode Hub V2 — Position Sizer (Score-Tiered)
 *
 * Tiers (aligned with FLOW decision thresholds):
 *   < 60 -> 0x (no position, NO_TRADE/WATCHLIST)
 *   60-69 -> 0.35x (PROBE)
 *   70-79 -> 0.60x (CONFIRMED low)
 *   80-89 -> 0.85x (CONFIRMED mid)
 *   90+   -> 1.00x (CONFIRMED high)
 *
 * Modifiers:
 *   stress HIGH -> x0.50
 *   weekend -> x0.70
 *
 * Blockers:
 *   slippage HIGH -> 0 (blocked)
 *   fakeBreak HIGH -> 0 (blocked)
 */

import type { HubInput, FlowPositionResult, FlowDecision, FlowRegimeResult } from "./types.ts";
import { SIZE_TIERS, SIZE_MODIFIERS, SIZE_CONFIG } from "./config.ts";

export function calculateFlowPositionSize(
  input: HubInput,
  adjustedScore: number,
  regime: FlowRegimeResult,
  decision: FlowDecision,
): FlowPositionResult {
  const reasons: string[] = [];

  // NO_TRADE -> zero
  if (decision === "NO_TRADE") {
    return {
      tier: "NO_POSITION",
      modifier: 0,
      final: 0,
      blocked: false,
      blockReason: "",
      riskPct: 0,
      reasons: ["NO_TRADE decision"],
    };
  }

  // Check blockers first
  if (input.slippage === "HIGH" && SIZE_MODIFIERS.slipHigh === 0) {
    return {
      tier: "BLOCKED",
      modifier: 0,
      final: 0,
      blocked: true,
      blockReason: "Slippage HIGH",
      riskPct: 0,
      reasons: ["Blocked: slippage HIGH"],
    };
  }
  if (input.fakeBreakRisk > 0.7 && SIZE_MODIFIERS.fakeBreakHigh === 0) {
    return {
      tier: "BLOCKED",
      modifier: 0,
      final: 0,
      blocked: true,
      blockReason: "Fake break HIGH",
      riskPct: 0,
      reasons: ["Blocked: fake break HIGH"],
    };
  }

  // Find tier
  let baseModifier = 0;
  let tier = "NO_POSITION";
  for (const t of SIZE_TIERS) {
    if (adjustedScore >= t.min) {
      baseModifier = t.modifier;
      tier = `SCORE_${t.min}+`;
      break;
    }
  }

  // If score below lowest tier
  if (baseModifier === 0) {
    return {
      tier: "NO_POSITION",
      modifier: 0,
      final: 0,
      blocked: false,
      blockReason: "",
      riskPct: 0,
      reasons: ["Score below minimum tier"],
    };
  }

  let finalModifier = baseModifier;

  // Stress modifier
  if (input.riskScore > 0.6) {
    finalModifier *= SIZE_MODIFIERS.stressHigh;
    reasons.push("Stress - 50% reduction");
  }

  // Weekend modifier
  const day = new Date().getUTCDay();
  if (day === 0 || day === 6) {
    finalModifier *= SIZE_MODIFIERS.weekend;
    reasons.push("Weekend - 30% reduction");
  }

  // Apply data health and regime
  finalModifier *= Math.max(input.dataHealthScore, 0.5);
  finalModifier *= regime.multiplier;

  // Clamp
  finalModifier = Math.min(finalModifier, SIZE_CONFIG.maxMultiplier);
  finalModifier = Math.round(finalModifier * 10000) / 10000;

  const riskPct = Math.round(SIZE_CONFIG.baseRiskPct * finalModifier * 10000) / 10000;

  return {
    tier,
    modifier: baseModifier,
    final: finalModifier,
    blocked: false,
    blockReason: "",
    riskPct,
    reasons,
  };
}
