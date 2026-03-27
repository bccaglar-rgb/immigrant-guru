/**
 * Balanced Mode Hub — Penalty Engine (v4: 4 Penalty Groups)
 *
 * ExecutionPenalty:   slippage, spread, depth, fill, spoof     (max 25)
 * PositioningPenalty: crowding, funding, OI divergence, weak   (max 20)
 * RegimePenalty:      fake break, stress, dead volatility      (max 18)
 * ConflictPenalty:    direction conflict, signal disagreement   (max 18)
 *
 * Grand total capped at 50.
 */
import type { HubInput, PenaltyGroupResult, BiasResult } from "./types.ts";
import { PENALTY_GROUP_CONFIG } from "./config.ts";

function sumValues(obj: Record<string, number>): number {
  return Object.values(obj).reduce((a, b) => a + b, 0);
}

export function calculatePenaltyGroups(input: HubInput, bias?: BiasResult): PenaltyGroupResult {
  const cfg = PENALTY_GROUP_CONFIG;

  // ── Execution Penalty ──────────────────────────────────────────
  const execBreakdown: Record<string, number> = {};
  if (input.slippage === "HIGH") {
    execBreakdown.slippageHigh = cfg.execution.slippageHigh;
  }
  if (input.spreadScore < 0.3) {
    execBreakdown.spreadWide = cfg.execution.spreadWide;
  }
  if (input.depthScore < 0.3) {
    execBreakdown.depthPoor = cfg.execution.depthPoor;
  }
  if (input.fillProbability < 0.35) {
    execBreakdown.fillLow = cfg.execution.fillLow;
  }
  if (input.spoofDetected) {
    execBreakdown.spoof = cfg.execution.spoof;
  }
  const execTotal = Math.min(sumValues(execBreakdown), cfg.execution.maxGroup);

  // ── Positioning Penalty ────────────────────────────────────────
  const posBreakdown: Record<string, number> = {};
  if (input.crowdingHigh > 0.5) {
    posBreakdown.crowdingHigh = cfg.positioning.crowdingHigh;
  }
  if (Math.abs(input.positioningBias) > 0.7) {
    posBreakdown.fundingExtreme = cfg.positioning.fundingExtreme;
  }
  if (input.oiDivergence > 0.5) {
    posBreakdown.oiDivergence = cfg.positioning.oiDivergence;
  }
  if (input.weakParticipation > 0.5) {
    posBreakdown.weakParticipation = cfg.positioning.weakParticipation;
  }
  const posTotal = Math.min(sumValues(posBreakdown), cfg.positioning.maxGroup);

  // ── Regime Penalty ─────────────────────────────────────────────
  const regBreakdown: Record<string, number> = {};
  if (input.fakeBreakRisk > 0.5) {
    regBreakdown.fakeBreakRisk = cfg.regime.fakeBreakRisk;
  }
  if (input.riskScore > 0.6) {
    regBreakdown.stressHigh = cfg.regime.stressHigh;
  }
  if (input.deadVolatility > 0.5) {
    regBreakdown.deadVolatility = cfg.regime.deadVolatility;
  }
  const regTotal = Math.min(sumValues(regBreakdown), cfg.regime.maxGroup);

  // ── Conflict Penalty ───────────────────────────────────────────
  const conBreakdown: Record<string, number> = {};

  // Direction conflict: trend bias and positioning bias disagree
  if (bias) {
    const trendSign = input.trendDirBias > 0 ? 1 : input.trendDirBias < 0 ? -1 : 0;
    const biasSign = bias.direction === "LONG" ? 1 : bias.direction === "SHORT" ? -1 : 0;
    if (trendSign !== 0 && biasSign !== 0 && trendSign !== biasSign) {
      conBreakdown.directionConflict = cfg.conflict.directionConflict;
    }
  }

  // Signal disagreement: multiple signals pointing different ways
  const signalDirs = [
    input.trendDirBias > 0.2 ? 1 : input.trendDirBias < -0.2 ? -1 : 0,
    input.vwapBias > 0.2 ? 1 : input.vwapBias < -0.2 ? -1 : 0,
    input.emaBias > 0.2 ? 1 : input.emaBias < -0.2 ? -1 : 0,
    input.orderflowBias > 0.1 ? 1 : input.orderflowBias < -0.1 ? -1 : 0,
  ];
  const positives = signalDirs.filter(s => s > 0).length;
  const negatives = signalDirs.filter(s => s < 0).length;
  if (positives >= 2 && negatives >= 2) {
    conBreakdown.signalDisagreement = cfg.conflict.signalDisagreement;
  }

  // Entry window closed
  if (input.entryWindowState === "CLOSED") {
    conBreakdown.entryClosed = cfg.conflict.entryClosed;
  }

  // Weak acceptance (price not holding key levels)
  if (input.weakAcceptance > 0.5) {
    conBreakdown.weakAcceptance = cfg.conflict.weakAcceptance;
  }
  const conTotal = Math.min(sumValues(conBreakdown), cfg.conflict.maxGroup);

  // ── Grand Total ────────────────────────────────────────────────
  const grandTotal = Math.min(execTotal + posTotal + regTotal + conTotal, cfg.maxGrandTotal);

  return {
    execution: { total: execTotal, breakdown: execBreakdown },
    positioning: { total: posTotal, breakdown: posBreakdown },
    regime: { total: regTotal, breakdown: regBreakdown },
    conflict: { total: conTotal, breakdown: conBreakdown },
    grandTotal,
  };
}
