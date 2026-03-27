/**
 * Aggressive Mode Hub V2 — Final Score Engine
 *
 * Same weighted-average multiplier formula as FLOW but with AGG thresholds:
 *   CONFIRMED >= 65 + edge >= 0.18
 *   PROBE >= 55 + edge >= 0.10
 *   WATCHLIST >= 45
 *
 * Lower thresholds = more daily trades (AGG priority)
 */

import type { HubInput, AggDecision, MultiplierSet } from "./types.ts";
import type { MarketQualityResult, DirectionQualityResult, ExecutionQualityResult, EdgeQualityResult } from "./types.ts";
import type { PenaltyBundle, HardGateResult, AggRegimeResult } from "./types.ts";
import { BLOCK_WEIGHTS, DECISION_THRESHOLDS } from "./config.ts";

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

// ── Multiplier combination weights (weighted average prevents multiplicative crushing) ──
const MULT_WEIGHTS = {
  regime: 0.40,
  dataHealth: 0.25,
  session: 0.20,
  confidence: 0.15,
} as const;

interface FinalScoreInput {
  input: HubInput;
  marketQuality: MarketQualityResult;
  directionQuality: DirectionQualityResult;
  executionQuality: ExecutionQualityResult;
  edgeQuality: EdgeQualityResult;
  penalties: PenaltyBundle;
  gates: HardGateResult;
  regime: AggRegimeResult;
}

interface FinalScoreOutput {
  adjustedScore: number;
  decision: AggDecision;
  direction: "LONG" | "SHORT" | "NONE";
  multipliers: MultiplierSet;
  reasons: string[];
}

function getSessionMultiplier(): number {
  const hour = new Date().getUTCHours();
  const day = new Date().getUTCDay();
  // Weekend — AGG slightly more lenient
  if (day === 0 || day === 6) return 0.82;
  // Asian session (0-8 UTC)
  if (hour >= 0 && hour < 8) return 0.90;
  // London + NY overlap (13-17 UTC)
  if (hour >= 13 && hour <= 17) return 1.0;
  // London (8-13) or NY (17-22)
  if (hour >= 8 && hour <= 22) return 0.96;
  // Late NY
  return 0.90;
}

export function calculateFinalScore(p: FinalScoreInput): FinalScoreOutput {
  const { input, marketQuality, directionQuality, executionQuality, edgeQuality, penalties, gates, regime } = p;
  const reasons: string[] = [];

  // ── Calculate individual multipliers ──
  const regimeMult = regime.multiplier;
  const dataHealthMult = clamp(input.dataHealthScore, 0.5, 1.0);
  const sessionMult = getSessionMultiplier();
  const confidenceMult = clamp(0.82 + 0.18 * Math.abs(directionQuality.biasRaw), 0.82, 1.0);

  // ── Weighted average multiplier (NOT multiplicative product) ──
  const combined =
    MULT_WEIGHTS.regime * regimeMult +
    MULT_WEIGHTS.dataHealth * dataHealthMult +
    MULT_WEIGHTS.session * sessionMult +
    MULT_WEIGHTS.confidence * confidenceMult;

  const multipliers: MultiplierSet = {
    regime: regimeMult,
    dataHealth: Math.round(dataHealthMult * 1000) / 1000,
    session: sessionMult,
    confidence: Math.round(confidenceMult * 1000) / 1000,
    combined: Math.round(combined * 1000) / 1000,
  };

  // ── 4-Block Composite ──
  const rawComposite =
    BLOCK_WEIGHTS.marketQuality * marketQuality.total +
    BLOCK_WEIGHTS.direction * directionQuality.qualityScore +
    BLOCK_WEIGHTS.execution * executionQuality.total +
    BLOCK_WEIGHTS.edge * edgeQuality.total;

  const multiplied = rawComposite * combined;
  const adjustedScore = Math.max(0, Math.min(100,
    Math.round((multiplied - penalties.totalPenalty) * 10) / 10
  ));

  // ── Decision Matrix ──
  let decision: AggDecision;

  if (gates.hardFail) {
    decision = "NO_TRADE";
    reasons.push("Hard gate failed: " + gates.failedGates.join(", "));
    return { adjustedScore, decision, direction: directionQuality.side, multipliers, reasons };
  }

  if (adjustedScore >= DECISION_THRESHOLDS.confirmed.score &&
      edgeQuality.realizedEdgeProxy >= DECISION_THRESHOLDS.confirmed.edge) {
    decision = "CONFIRMED";
    reasons.push("Confirmed momentum signal");
  } else if (adjustedScore >= DECISION_THRESHOLDS.probe.score &&
             edgeQuality.realizedEdgeProxy >= DECISION_THRESHOLDS.probe.edge) {
    decision = "PROBE";
    reasons.push("Probe momentum setup");
  } else if (adjustedScore >= DECISION_THRESHOLDS.watchlist.score) {
    decision = "WATCHLIST";
    reasons.push("Watchlist - monitor for entry");
  } else {
    decision = "NO_TRADE";
    reasons.push("Below aggressive threshold");
  }

  if (gates.softBlock && (decision === "PROBE" || decision === "CONFIRMED")) {
    decision = "WATCHLIST";
    reasons.push("Soft blocked: " + gates.blockedGates.join(", "));
  }

  // ── LONG/SHORT Validation ──
  let direction = directionQuality.side;

  if ((decision === "PROBE" || decision === "CONFIRMED")) {
    let downgrade = false;
    if (direction === "NONE") { downgrade = true; reasons.push("No directional bias"); }
    if (input.entryWindowState !== "OPEN") { downgrade = true; reasons.push("Entry window not OPEN"); }
    if (input.fillProbability < 0.22) { downgrade = true; reasons.push("Fill probability < 22%"); }
    if (edgeQuality.realizedEdgeProxy < 0.10) { downgrade = true; reasons.push("Edge < 0.10"); }
    if (input.fakeBreakRisk > 0.65) { downgrade = true; reasons.push("High fake break risk"); }
    if (downgrade) {
      decision = "WATCHLIST";
      reasons.push("Downgraded to WATCHLIST by validation");
    }
  }

  return { adjustedScore, decision, direction, multipliers, reasons };
}
