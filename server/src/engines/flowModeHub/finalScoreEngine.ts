/**
 * Flow Mode Hub V2 — Final Score Engine
 *
 * Formula:
 *   rawComposite = 0.26*MQ + 0.24*DQ + 0.22*EQ + 0.28*EdgeQ
 *   effectiveMultiplier = weighted average of 4 multipliers (prevents multiplicative stacking)
 *   multiplied = rawComposite * effectiveMultiplier
 *   FinalScore = max(0, multiplied - totalPenalty)
 *
 * Decision Matrix (FLOW thresholds from Section 17):
 *   if hardFail -> NO_TRADE
 *   if softBlock -> min(WATCHLIST, score-based)
 *   if FinalScore >= 70 AND realizedEdge >= 0.20 -> CONFIRMED
 *   if FinalScore >= 60 AND realizedEdge >= 0.12 -> PROBE
 *   if FinalScore >= 50 -> WATCHLIST
 *   else -> NO_TRADE
 *
 * LONG/SHORT validation:
 *   PROBE/CONFIRMED require: side!=NONE, FinalScore>=60, entryWindow=OPEN,
 *   fillProb>=0.25, edge>=0.12, fakeBreak!=HIGH
 */

import type { HubInput, FlowDecision, MultiplierSet } from "./types.ts";
import type { MarketQualityResult, DirectionQualityResult, ExecutionQualityResult, EdgeQualityResult } from "./types.ts";
import type { PenaltyBundle, HardGateResult, FlowRegimeResult } from "./types.ts";
import { BLOCK_WEIGHTS, DECISION_THRESHOLDS, DIRECTION_THRESHOLD } from "./config.ts";

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
  regime: FlowRegimeResult;
}

interface FinalScoreOutput {
  adjustedScore: number;
  decision: FlowDecision;
  direction: "LONG" | "SHORT" | "NONE";
  multipliers: MultiplierSet;
  reasons: string[];
}

function getSessionMultiplier(): number {
  const hour = new Date().getUTCHours();
  const day = new Date().getUTCDay();
  // Weekend
  if (day === 0 || day === 6) return 0.80;
  // Asian session (0-8 UTC) — mildly reduced
  if (hour >= 0 && hour < 8) return 0.88;
  // London + NY overlap (13-17 UTC) — optimal
  if (hour >= 13 && hour <= 17) return 1.0;
  // London (8-13) or NY (17-22) — near-optimal
  if (hour >= 8 && hour <= 22) return 0.96;
  // Late NY
  return 0.88;
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
  // This prevents 4 mild reductions from compounding into a 30%+ penalty
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
  let decision: FlowDecision;

  // Hard fail -> NO_TRADE
  if (gates.hardFail) {
    decision = "NO_TRADE";
    reasons.push("Hard gate failed: " + gates.failedGates.join(", "));
    return { adjustedScore, decision, direction: directionQuality.side, multipliers, reasons };
  }

  // Score-based decision
  if (adjustedScore >= DECISION_THRESHOLDS.confirmed.score &&
      edgeQuality.realizedEdgeProxy >= DECISION_THRESHOLDS.confirmed.edge) {
    decision = "CONFIRMED";
    reasons.push("Confirmed flow signal");
  } else if (adjustedScore >= DECISION_THRESHOLDS.probe.score &&
             edgeQuality.realizedEdgeProxy >= DECISION_THRESHOLDS.probe.edge) {
    decision = "PROBE";
    reasons.push("Probe flow setup");
  } else if (adjustedScore >= DECISION_THRESHOLDS.watchlist.score) {
    decision = "WATCHLIST";
    reasons.push("Watchlist - monitor for entry");
  } else {
    decision = "NO_TRADE";
    reasons.push("Below flow threshold");
  }

  // Soft block -> cap at WATCHLIST
  if (gates.softBlock && (decision === "PROBE" || decision === "CONFIRMED")) {
    decision = "WATCHLIST";
    reasons.push("Soft blocked: " + gates.blockedGates.join(", "));
  }

  // ── LONG/SHORT Validation (Section 7) ──
  let direction = directionQuality.side;

  if ((decision === "PROBE" || decision === "CONFIRMED")) {
    let downgrade = false;

    if (direction === "NONE") {
      downgrade = true;
      reasons.push("No directional bias");
    }
    if (input.entryWindowState !== "OPEN") {
      downgrade = true;
      reasons.push("Entry window not OPEN");
    }
    if (input.fillProbability < 0.25) {
      downgrade = true;
      reasons.push("Fill probability < 25%");
    }
    if (edgeQuality.realizedEdgeProxy < 0.12) {
      downgrade = true;
      reasons.push("Edge < 0.12");
    }
    if (input.fakeBreakRisk > 0.6) {
      downgrade = true;
      reasons.push("High fake break risk");
    }

    if (downgrade) {
      decision = "WATCHLIST";
      reasons.push("Downgraded to WATCHLIST by validation");
    }
  }

  return { adjustedScore, decision, direction, multipliers, reasons };
}
