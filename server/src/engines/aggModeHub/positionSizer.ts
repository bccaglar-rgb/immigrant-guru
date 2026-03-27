/**
 * Aggressive Mode Hub V2 — Position Sizer (Score-Tiered)
 *
 * Tiers (aligned with AGG thresholds - lower than FLOW):
 *   < 55 -> 0x (no position)
 *   55-64 -> 0.35x (PROBE)
 *   65-74 -> 0.60x (CONFIRMED low)
 *   75-84 -> 0.85x (CONFIRMED mid)
 *   85+   -> 1.00x (CONFIRMED high)
 */

import type { HubInput, AggPositionResult, AggDecision, AggRegimeResult } from "./types.ts";
import { SIZE_TIERS, SIZE_MODIFIERS, SIZE_CONFIG } from "./config.ts";

export function calculateAggPositionSize(
  input: HubInput,
  adjustedScore: number,
  regime: AggRegimeResult,
  decision: AggDecision,
): AggPositionResult {
  const reasons: string[] = [];

  if (decision === "NO_TRADE") {
    return { tier: "NO_POSITION", modifier: 0, final: 0, blocked: false, blockReason: "", riskPct: 0, reasons: ["NO_TRADE decision"] };
  }

  if (input.slippage === "HIGH" && SIZE_MODIFIERS.slipHigh === 0) {
    return { tier: "BLOCKED", modifier: 0, final: 0, blocked: true, blockReason: "Slippage HIGH", riskPct: 0, reasons: ["Blocked: slippage HIGH"] };
  }
  if (input.fakeBreakRisk > 0.7 && SIZE_MODIFIERS.fakeBreakHigh === 0) {
    return { tier: "BLOCKED", modifier: 0, final: 0, blocked: true, blockReason: "Fake break HIGH", riskPct: 0, reasons: ["Blocked: fake break HIGH"] };
  }

  let baseModifier = 0;
  let tier = "NO_POSITION";
  for (const t of SIZE_TIERS) {
    if (adjustedScore >= t.min) {
      baseModifier = t.modifier;
      tier = `SCORE_${t.min}+`;
      break;
    }
  }

  if (baseModifier === 0) {
    return { tier: "NO_POSITION", modifier: 0, final: 0, blocked: false, blockReason: "", riskPct: 0, reasons: ["Score below minimum tier"] };
  }

  let finalModifier = baseModifier;
  if (input.riskScore > 0.6) { finalModifier *= SIZE_MODIFIERS.stressHigh; reasons.push("Stress - 50% reduction"); }
  const day = new Date().getUTCDay();
  if (day === 0 || day === 6) { finalModifier *= SIZE_MODIFIERS.weekend; reasons.push("Weekend - 30% reduction"); }

  finalModifier *= Math.max(input.dataHealthScore, 0.5);
  finalModifier *= regime.multiplier;
  finalModifier = Math.min(finalModifier, SIZE_CONFIG.maxMultiplier);
  finalModifier = Math.round(finalModifier * 10000) / 10000;

  const riskPct = Math.round(SIZE_CONFIG.baseRiskPct * finalModifier * 10000) / 10000;

  return { tier, modifier: baseModifier, final: finalModifier, blocked: false, blockReason: "", riskPct, reasons };
}
