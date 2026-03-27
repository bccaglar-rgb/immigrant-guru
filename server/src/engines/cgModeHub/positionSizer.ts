/**
 * Capital Guard Mode Hub — Position Sizer (v4: Score-Tiered)
 *
 * MOST CONSERVATIVE sizing in the system.
 *
 * Score-tiered (from CG_POSITION_TIERS):
 *   < 74 → 0.00 (no position)
 *   74-80 → 0.25
 *   81-87 → 0.45
 *   88-93 → 0.70
 *   94+   → 0.90
 *
 * Hard blockers (→ 0):
 *   - decision === "NO_TRADE" || "WATCHLIST"
 *   - slippage === "HIGH"
 *   - fakeBreakRisk > 0.6
 *   - capitalProtection < 65
 *
 * Soft modifiers:
 *   - stress (riskScore > 0.6) → x0.35
 *   - weekend → x0.65
 *   - dataHealth → clamp to min 0.70
 *   - fillProbability → clamp to min 0.25
 */

import type { HubInput, PositionSizeResult, CapitalProtectionResult } from "./types.ts";
import type { CgHubDecision } from "./types.ts";
import { CG_POSITION_TIERS, CG_POSITION_CONFIG } from "./config.ts";

export function calculateCgPositionSize(
  input: HubInput,
  adjustedScore: number,
  decision: CgHubDecision,
  cp: CapitalProtectionResult,
): PositionSizeResult {
  const reasons: string[] = [];

  // ── Score-tiered base multiplier ──────────────────────────────
  let baseMultiplier = 0;
  let tier = "NO_POSITION";
  for (const t of CG_POSITION_TIERS) {
    if (adjustedScore >= t.minScore) {
      baseMultiplier = t.multiplier;
      if (t.minScore >= 94) tier = "CONFIRMED_HIGH";
      else if (t.minScore >= 88) tier = "CONFIRMED";
      else if (t.minScore >= 81) tier = "PROBE_HIGH";
      else if (t.minScore >= 74) tier = "PROBE";
      else tier = "NO_POSITION";
      break;
    }
  }

  // ── Decision gate ─────────────────────────────────────────────
  if (decision === "NO_TRADE" || decision === "WATCHLIST") {
    baseMultiplier = 0;
    tier = "NO_POSITION";
    reasons.push(`Decision ${decision} — no position`);
  }

  // ── Hard blockers (→ 0) ───────────────────────────────────────
  if (input.slippage === "HIGH" && baseMultiplier > 0) {
    baseMultiplier = 0;
    reasons.push("Slippage HIGH — position blocked");
  }

  if (input.fakeBreakRisk > 0.6 && baseMultiplier > 0) {
    baseMultiplier = 0;
    reasons.push("Fake break risk > 0.6 — position blocked");
  }

  if (cp.score < 65 && baseMultiplier > 0) {
    baseMultiplier = 0;
    reasons.push("Capital protection < 65 — position blocked");
  }

  // ── Soft modifiers ────────────────────────────────────────────
  if (baseMultiplier > 0) {
    // Stress reduction
    if (input.riskScore > 0.6) {
      baseMultiplier *= CG_POSITION_CONFIG.stressMultiplier;
      reasons.push("High stress — 65% size reduction");
    }

    // Weekend reduction
    const day = new Date().getUTCDay();
    if (day === 0 || day === 6) {
      baseMultiplier *= CG_POSITION_CONFIG.weekendMultiplier;
      reasons.push("Weekend — 35% size reduction");
    }

    // Data health adjustment
    baseMultiplier *= Math.max(input.dataHealthScore, 0.70);

    // Fill probability adjustment
    baseMultiplier *= Math.max(input.fillProbability, 0.25);

    // Cap at max multiplier
    baseMultiplier = Math.min(baseMultiplier, CG_POSITION_CONFIG.maxMultiplier);
  }

  const riskPct = CG_POSITION_CONFIG.baseRiskPct * baseMultiplier;

  return {
    sizeMultiplier: Math.round(baseMultiplier * 10000) / 10000,
    confidenceTier: tier,
    riskPct: Math.round(riskPct * 10000) / 10000,
    reasons,
  };
}
