/**
 * Balanced Mode Hub — Final Score Engine (v4: Multi-Multiplier + Edge-Conditional Decisions)
 *
 * FinalScore = (0.26*MQ + 0.24*DQ + 0.22*EQ + 0.28*EdgeQ)
 *              × RegimeMultiplier × DataHealthMultiplier × SessionMultiplier
 *              − PenaltyGrandTotal
 *
 * Decision matrix (edge-conditional):
 *   CONFIRMED: score ≥ 78 AND edgeNetR ≥ 0.20
 *   PROBE:     score ≥ 68 AND edgeNetR ≥ 0.12
 *   WATCHLIST:  score ≥ 58
 *   NO_TRADE:  below all
 *
 * Non-negotiable principles:
 *   - Good direction + bad execution = NO_TRADE
 *   - Good execution + no edge = NO_TRADE
 *   - Good edge + no bias = WATCHLIST
 *   - Only when all align → TRADE (PROBE/CONFIRMED)
 */
import type {
  HubInput, BlockScoreResult, RegimeResult, BiasResult,
  EdgeResult, GateCheckResult, SoftBlockResult, PenaltyGroupResult,
  FinalScoreOutput, HubDecision, BiasDirection,
} from "./types.ts";
import { DECISION_THRESHOLDS, SESSION_MULTIPLIERS } from "./config.ts";

interface FinalScoreInput {
  input: HubInput;
  blockScores: BlockScoreResult;
  regime: RegimeResult;
  bias: BiasResult;
  edge: EdgeResult;
  gates: GateCheckResult;
  softBlocks: SoftBlockResult;
  penalty: PenaltyGroupResult;
  session: string;
}

const DECISION_ORDER: HubDecision[] = ["NO_TRADE", "WATCHLIST", "PROBE", "CONFIRMED"];

function decisionIdx(d: HubDecision): number {
  return DECISION_ORDER.indexOf(d);
}

function capDecision(current: HubDecision, cap: HubDecision): HubDecision {
  return decisionIdx(cap) < decisionIdx(current) ? cap : current;
}

/** Detect current trading session from UTC hour */
export function detectSession(): string {
  const h = new Date().getUTCHours();
  const day = new Date().getUTCDay();

  if (day === 0 || day === 6) return "WEEKEND";
  if (h >= 7 && h < 16) return "LONDON";    // 07-16 UTC
  if (h >= 13 && h < 22) return "NY";        // 13-22 UTC (overlap 13-16)
  if (h >= 0 && h < 8) return "ASIAN";       // 00-08 UTC
  return "OFF_HOURS";
}

export function calculateFinalScore(p: FinalScoreInput): FinalScoreOutput {
  const { input, blockScores, regime, bias, edge, gates, softBlocks, penalty, session } = p;

  // ── Multi-multiplier score ─────────────────────────────────────
  const regimeMult = regime.multiplier;

  // DataHealth multiplier: tiered
  const dataHealthMult = input.dataHealthScore >= 0.95 ? 1.00
    : input.dataHealthScore >= 0.90 ? 0.95
    : input.dataHealthScore >= 0.85 ? 0.92
    : 0.80;

  // Session multiplier
  const sessionMult = SESSION_MULTIPLIERS[session] ?? 1.00;

  // Raw adjusted score
  const rawAdjusted = blockScores.total * regimeMult * dataHealthMult * sessionMult - penalty.grandTotal;
  const adjustedScore = Math.max(0, Math.min(100, Math.round(rawAdjusted * 10) / 10));

  // ── Edge-conditional decision matrix ───────────────────────────
  let decision: HubDecision;
  if (adjustedScore >= DECISION_THRESHOLDS.CONFIRMED.score && edge.edgeNetR >= DECISION_THRESHOLDS.CONFIRMED.edgeNetR) {
    decision = "CONFIRMED";
  } else if (adjustedScore >= DECISION_THRESHOLDS.PROBE.score && edge.edgeNetR >= DECISION_THRESHOLDS.PROBE.edgeNetR) {
    decision = "PROBE";
  } else if (adjustedScore >= DECISION_THRESHOLDS.WATCHLIST.score) {
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

  // Non-negotiable: bad execution (EQ < 30) + any decision → cap WATCHLIST
  if (blockScores.EQ < 30 && (decision === "CONFIRMED" || decision === "PROBE")) {
    decision = "WATCHLIST";
  }

  // Non-negotiable: no edge (EdgeQ < 25) → cap WATCHLIST
  if (blockScores.EdgeQ < 25 && (decision === "CONFIRMED" || decision === "PROBE")) {
    decision = "WATCHLIST";
  }

  // ── Reasons ────────────────────────────────────────────────────
  const reasons: string[] = [];

  // Positive signals
  if (blockScores.total > 70) reasons.push("Strong block scores");
  if (regime.regime === "TREND") reasons.push("Trending regime");
  if (edge.edgeNetR > 0.25) reasons.push("Good risk-adjusted edge");
  if (blockScores.MQ > 70) reasons.push("Strong market quality");

  // Negative signals
  if (regime.regime === "HIGH_STRESS") reasons.push("High stress environment");
  if (edge.edgeNetR < 0.10) reasons.push("Low edge");
  if (penalty.grandTotal > 15) reasons.push(`Heavy penalties (-${penalty.grandTotal.toFixed(1)})`);
  if (gates.failedGates.length > 0) reasons.push(`Failed gates: ${gates.failedGates.join(", ")}`);
  if (direction === "NONE") reasons.push("No directional bias");
  if (softBlocks.triggered) reasons.push(`Soft blocks: ${softBlocks.reasons.join("; ")}`);
  if (blockScores.EQ < 30) reasons.push("Bad execution quality");
  if (blockScores.EdgeQ < 25) reasons.push("No edge");

  return {
    adjustedScore,
    decision,
    direction,
    reasons,
  };
}
