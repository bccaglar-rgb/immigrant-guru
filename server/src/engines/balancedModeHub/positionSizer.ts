/**
 * Balanced Mode Hub — Position Sizer (v4: Score-Tiered)
 *
 * Score tiers:
 *   <58  → 0x (no position)
 *   58-67 → 0.35x
 *   68-77 → 0.60x
 *   78-89 → 0.85x
 *   90+   → 1.00x
 *
 * Hard blockers (→ 0):
 *   - slippage HIGH
 *   - fakeBreak risk > 0.6
 *
 * Soft modifiers:
 *   - stress HIGH → ×0.50
 *   - weekend     → ×0.70
 *   - data health and fill probability scaling
 */
import type { HubInput, HubDecision, PositionSizeResult } from "./types.ts";
import { POSITION_TIERS, POSITION_CONFIG } from "./config.ts";

export function calculatePositionSize(
  input: HubInput,
  adjustedScore: number,
  decision: HubDecision,
): PositionSizeResult {
  const reasons: string[] = [];

  // ── Score-tiered base multiplier ───────────────────────────────
  let baseMultiplier = 0;
  let tier = "NO_POSITION";

  for (const t of POSITION_TIERS) {
    if (adjustedScore >= t.minScore) {
      baseMultiplier = t.multiplier;
      tier = adjustedScore >= 90 ? "ELITE"
        : adjustedScore >= 78 ? "CONFIRMED"
        : adjustedScore >= 68 ? "PROBE"
        : adjustedScore >= 58 ? "WATCHLIST"
        : "NO_POSITION";
      break;
    }
  }

  // ── Decision gate ──────────────────────────────────────────────
  if (decision === "NO_TRADE" || decision === "WATCHLIST") {
    baseMultiplier = 0;
    tier = "NO_POSITION";
    reasons.push("Decision does not warrant position");
  }

  // ── Hard blockers (→ 0) ────────────────────────────────────────
  if (input.slippage === "HIGH") {
    baseMultiplier = 0;
    reasons.push("Slippage HIGH → zero position");
  }
  if (input.fakeBreakRisk > 0.6) {
    baseMultiplier = 0;
    reasons.push("Fake break risk HIGH → zero position");
  }

  // ── Soft modifiers ─────────────────────────────────────────────
  if (input.riskScore > 0.6 && baseMultiplier > 0) {
    baseMultiplier *= POSITION_CONFIG.stressMultiplier;
    reasons.push(`Stress HIGH → ${POSITION_CONFIG.stressMultiplier * 100}% reduction`);
  }

  // Weekend check
  const day = new Date().getUTCDay();
  if ((day === 0 || day === 6) && baseMultiplier > 0) {
    baseMultiplier *= POSITION_CONFIG.weekendMultiplier;
    reasons.push(`Weekend → ${POSITION_CONFIG.weekendMultiplier * 100}% reduction`);
  }

  // Data health scaling
  if (baseMultiplier > 0) {
    baseMultiplier *= Math.max(input.dataHealthScore, 0.70);
  }

  // Fill probability scaling
  if (baseMultiplier > 0) {
    baseMultiplier *= Math.max(input.fillProbability, 0.25);
  }

  // Cap at max
  baseMultiplier = Math.min(baseMultiplier, POSITION_CONFIG.maxMultiplier);

  const riskPct = POSITION_CONFIG.baseRiskPct * baseMultiplier;

  return {
    sizeMultiplier: Math.round(Math.max(0, baseMultiplier) * 10000) / 10000,
    confidenceTier: tier,
    riskPct: Math.round(riskPct * 10000) / 10000,
    reasons,
  };
}
