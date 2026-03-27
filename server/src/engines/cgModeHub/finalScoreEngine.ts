/**
 * Capital Guard Mode Hub — Final Score Engine (v4: 5-Block Multi-Multiplier + CP-Conditional)
 *
 * FinalScore = (0.22*MQ + 0.16*DQ + 0.24*EQ + 0.18*EdgeQ + 0.20*CP)
 *              x RegimeMultiplier x DataHealthMultiplier x SessionMultiplier
 *              - PenaltyGrandTotal
 *
 * Decision matrix (edge + CP conditional):
 *   CONFIRMED: score >= 84 AND edgeNetR >= 0.18 AND CP >= 78
 *   PROBE:     score >= 74 AND edgeNetR >= 0.12 AND CP >= 72
 *   WATCHLIST: score >= 62
 *   NO_TRADE:  below all
 *
 * Non-negotiable CG principles:
 *   - Default decision is NO_TRADE (varsayilan karar NO_TRADE olmali)
 *   - Good direction + bad execution = NO_TRADE
 *   - Good execution + no edge = NO_TRADE
 *   - Good edge + no bias = WATCHLIST
 *   - Good edge + bad CP = NO_TRADE (CG exclusive)
 *   - Only when ALL align → TRADE (PROBE/CONFIRMED)
 */

import type {
  HubInput,
  CgBlockScoreResult,
  CapitalProtectionResult,
  RegimeResult,
  BiasResult,
  EdgeResult,
  CgGateCheckResult,
  CgSoftBlockResult,
  CgPenaltyGroupResult,
  CgFinalScoreOutput,
  CgHubDecision,
  BiasDirection,
} from "./types.ts";
import { CG_DECISION_THRESHOLDS, CG_SESSION_MULTIPLIERS } from "./config.ts";

const DECISION_ORDER: CgHubDecision[] = ["NO_TRADE", "WATCHLIST", "PROBE", "CONFIRMED"];

function decisionIdx(d: CgHubDecision): number {
  return DECISION_ORDER.indexOf(d);
}

function capDecision(current: CgHubDecision, cap: CgHubDecision): CgHubDecision {
  return decisionIdx(cap) < decisionIdx(current) ? cap : current;
}

/** Detect current trading session from UTC hour */
export function detectSession(): string {
  const h = new Date().getUTCHours();
  const day = new Date().getUTCDay();

  if (day === 0 || day === 6) return "WEEKEND";
  if (h >= 7 && h < 16) return "LONDON";     // 07-16 UTC
  if (h >= 13 && h < 22) return "NY";         // 13-22 UTC (overlap 13-16)
  if (h >= 0 && h < 8) return "ASIAN";        // 00-08 UTC
  return "OFF_HOURS";
}

interface CgFinalScoreInput {
  input: HubInput;
  blockScores: CgBlockScoreResult;
  capitalProtection: CapitalProtectionResult;
  regime: RegimeResult;
  bias: BiasResult;
  edge: EdgeResult;
  gates: CgGateCheckResult;
  softBlocks: CgSoftBlockResult;
  penalty: CgPenaltyGroupResult;
  session: string;
}

export function calculateCgFinalScore(p: CgFinalScoreInput): CgFinalScoreOutput {
  const { input, blockScores, capitalProtection, regime, bias, edge, gates, softBlocks, penalty, session } = p;

  // ── Multi-multiplier score ─────────────────────────────────────
  const regimeMult = regime.multiplier;

  // DataHealth multiplier: stricter tiers for CG
  const dataHealthMult = input.dataHealthScore >= 0.95 ? 1.00
    : input.dataHealthScore >= 0.92 ? 0.96
    : input.dataHealthScore >= 0.90 ? 0.93
    : 0.78; // Below 0.90 is a hard gate anyway

  // Session multiplier
  const sessionMult = CG_SESSION_MULTIPLIERS[session] ?? 1.00;

  // Raw adjusted score
  const rawAdjusted = blockScores.total * regimeMult * dataHealthMult * sessionMult - penalty.grandTotal;
  const adjustedScore = Math.max(0, Math.min(100, Math.round(rawAdjusted * 10) / 10));

  // ── Edge + CP conditional decision matrix ──────────────────────
  let decision: CgHubDecision;
  if (
    adjustedScore >= CG_DECISION_THRESHOLDS.CONFIRMED.score &&
    edge.edgeNetR >= CG_DECISION_THRESHOLDS.CONFIRMED.edgeNetR &&
    capitalProtection.score >= CG_DECISION_THRESHOLDS.CONFIRMED.cpScore
  ) {
    decision = "CONFIRMED";
  } else if (
    adjustedScore >= CG_DECISION_THRESHOLDS.PROBE.score &&
    edge.edgeNetR >= CG_DECISION_THRESHOLDS.PROBE.edgeNetR &&
    capitalProtection.score >= CG_DECISION_THRESHOLDS.PROBE.cpScore
  ) {
    decision = "PROBE";
  } else if (adjustedScore >= CG_DECISION_THRESHOLDS.WATCHLIST.score) {
    decision = "WATCHLIST";
  } else {
    decision = "NO_TRADE";
  }

  // ── Gate cap ───────────────────────────────────────────────────
  decision = capDecision(decision, gates.maxDecision);

  // ── Soft block cap ─────────────────────────────────────────────
  if (softBlocks.triggered) {
    decision = capDecision(decision, softBlocks.maxDecision);
  }

  // ── Direction from bias ────────────────────────────────────────
  const direction: BiasDirection = bias.direction;

  // Non-negotiable: no directional bias → max WATCHLIST
  if (direction === "NONE" && (decision === "CONFIRMED" || decision === "PROBE")) {
    decision = "WATCHLIST";
  }

  // Non-negotiable: bad execution (EQ < 35 in CG) → cap WATCHLIST
  if (blockScores.EQ < 35 && (decision === "CONFIRMED" || decision === "PROBE")) {
    decision = "WATCHLIST";
  }

  // Non-negotiable: no edge (EdgeQ < 30 in CG) → cap WATCHLIST
  if (blockScores.EdgeQ < 30 && (decision === "CONFIRMED" || decision === "PROBE")) {
    decision = "WATCHLIST";
  }

  // CG Non-negotiable: bad capital protection (CP < 65) → NO_TRADE
  // (This is also a hard gate, but double-check here)
  if (capitalProtection.score < 65 && (decision === "CONFIRMED" || decision === "PROBE")) {
    decision = "NO_TRADE";
  }

  // ── Reasons ────────────────────────────────────────────────────
  const reasons: string[] = [];

  // Positive signals
  if (blockScores.total > 70) reasons.push("Strong block scores");
  if (regime.regime === "TREND") reasons.push("Trending regime");
  if (edge.edgeNetR > 0.20) reasons.push("Good risk-adjusted edge");
  if (capitalProtection.score > 80) reasons.push("Strong capital protection");
  if (blockScores.EQ > 70) reasons.push("Excellent execution quality");

  // Negative signals
  if (regime.regime === "HIGH_STRESS") reasons.push("High stress environment");
  if (edge.edgeNetR < 0.10) reasons.push("Low edge — below CG minimum");
  if (penalty.grandTotal > 20) reasons.push(`Heavy penalties (-${penalty.grandTotal.toFixed(1)})`);
  if (gates.failedGates.length > 0) reasons.push(`Failed gates: ${gates.failedGates.join(", ")}`);
  if (direction === "NONE") reasons.push("No directional bias (threshold 0.26)");
  if (softBlocks.triggered) reasons.push(`Soft blocks: ${softBlocks.reasons.join("; ")}`);
  if (blockScores.EQ < 35) reasons.push("Poor execution quality");
  if (blockScores.EdgeQ < 30) reasons.push("Insufficient edge quality");
  if (capitalProtection.score < 65) reasons.push("Capital protection below CG minimum");
  if (capitalProtection.stopIntegrity < 60) reasons.push("Stop integrity too low");
  if (capitalProtection.invalidationClarity < 55) reasons.push("Unclear trade invalidation");

  return {
    adjustedScore,
    decision,
    direction,
    reasons,
  };
}
