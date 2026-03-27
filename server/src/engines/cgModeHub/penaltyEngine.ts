/**
 * Capital Guard Mode Hub — Penalty Engine (v4: 5 Penalty Groups)
 *
 * 5 groups: Execution, Positioning, Regime, Conflict, CapitalPreservation
 * Each group has per-penalty values and a group cap.
 * Grand total capped at 55 (stricter than balanced's 50).
 *
 * CapitalPreservation is unique to CG — penalizes setups that endanger capital.
 */

import type { HubInput, BiasResult, CgPenaltyGroupResult } from "./types.ts";
import { CG_PENALTY_GROUP_CONFIG } from "./config.ts";

function sumValues(obj: Record<string, number>): number {
  return Object.values(obj).reduce((a, b) => a + b, 0);
}

export function calculateCgPenaltyGroups(
  input: HubInput,
  bias: BiasResult,
): CgPenaltyGroupResult {
  const cfg = CG_PENALTY_GROUP_CONFIG;

  // ── Execution Penalty ───────────────────────────────────────
  const execBreakdown: Record<string, number> = {};
  if (input.slippage === "HIGH") execBreakdown.slippageHigh = cfg.execution.slippageHigh;
  if (input.spreadScore < 0.3) execBreakdown.spreadWide = cfg.execution.spreadWide;
  if (input.depthScore < 0.3) execBreakdown.depthPoor = cfg.execution.depthPoor;
  if (input.fillProbability < 0.35) execBreakdown.fillLow = cfg.execution.fillLow;
  if (input.spoofDetected) execBreakdown.spoof = cfg.execution.spoof;
  const execTotal = Math.min(sumValues(execBreakdown), cfg.execution.maxGroup);

  // ── Positioning Penalty ─────────────────────────────────────
  const posBreakdown: Record<string, number> = {};
  if (input.crowdingHigh > 0.5) posBreakdown.crowdingHigh = cfg.positioning.crowdingHigh;
  if (Math.abs(input.positioningBias) > 0.7) posBreakdown.fundingExtreme = cfg.positioning.fundingExtreme;
  if (input.oiDivergence > 0.5) posBreakdown.oiDivergence = cfg.positioning.oiDivergence;
  if (input.weakParticipation > 0.5) posBreakdown.weakParticipation = cfg.positioning.weakParticipation;
  const posTotal = Math.min(sumValues(posBreakdown), cfg.positioning.maxGroup);

  // ── Regime Penalty ──────────────────────────────────────────
  const regBreakdown: Record<string, number> = {};
  if (input.fakeBreakRisk > 0.5) regBreakdown.fakeBreakRisk = cfg.regime.fakeBreakRisk;
  if (input.riskScore > 0.6) regBreakdown.stressHigh = cfg.regime.stressHigh;
  if (input.deadVolatility > 0.5) regBreakdown.deadVolatility = cfg.regime.deadVolatility;
  const regTotal = Math.min(sumValues(regBreakdown), cfg.regime.maxGroup);

  // ── Conflict Penalty ────────────────────────────────────────
  const conBreakdown: Record<string, number> = {};

  // Direction conflict: trend says one way, OB/funding says another
  const trendSign = Math.sign(input.trendDirBias);
  const obSign = Math.sign(input.orderflowBias);
  const fundSign = Math.sign(input.positioningBias);
  if (trendSign !== 0 && obSign !== 0 && trendSign !== obSign) {
    conBreakdown.directionConflict = cfg.conflict.directionConflict;
  }

  // Signal disagreement: bias direction doesn't match trend + funding
  if (bias.direction !== "NONE" && trendSign !== 0 && fundSign !== 0 && trendSign !== fundSign) {
    conBreakdown.signalDisagreement = cfg.conflict.signalDisagreement;
  }

  // Entry closed
  if (input.entryWindowState === "CLOSED") {
    conBreakdown.entryClosed = cfg.conflict.entryClosed;
  }

  // Weak acceptance
  if (input.weakAcceptance > 0.5) {
    conBreakdown.weakAcceptance = cfg.conflict.weakAcceptance;
  }
  const conTotal = Math.min(sumValues(conBreakdown), cfg.conflict.maxGroup);

  // ── Capital Preservation Penalty (CG EXCLUSIVE) ─────────────
  const cpBreakdown: Record<string, number> = {};

  // Stop-huntable: high liquidity density near stops (market makers can sweep)
  if (input.liquidityDensity > 0.7 && input.failedSweep > 0.4) {
    cpBreakdown.stopHuntable = cfg.capitalPreservation.stopHuntable;
  }

  // Unclear invalidation: weak acceptance + mid-range = no clear invalidation
  if (input.weakAcceptance > 0.4 && input.midRangeTrap > 0.4) {
    cpBreakdown.unclearInvalidation = cfg.capitalPreservation.unclearInvalidation;
  }

  // Risk clustering: multiple risk factors active simultaneously
  const riskFactors = [
    input.riskScore > 0.5 ? 1 : 0,
    input.suddenMoveRisk > 0.5 ? 1 : 0,
    input.fakeBreakRisk > 0.5 ? 1 : 0,
    input.crowdingHigh > 0.5 ? 1 : 0,
  ].reduce((a, b) => a + b, 0);
  if (riskFactors >= 2) {
    cpBreakdown.riskClustering = cfg.capitalPreservation.riskClustering;
  }

  // Adverse excursion risk: high ATR + low depth = large potential drawdown
  if (input.atrPct > 0.015 && input.depthScore < 0.4) {
    cpBreakdown.adverseExcursion = cfg.capitalPreservation.adverseExcursion;
  }

  // Unrealistic reward: very high expected RR with low pWin (bait setup)
  if (input.avgWinR > 3.0 && input.pWin < 0.40) {
    cpBreakdown.unrealisticReward = cfg.capitalPreservation.unrealisticReward;
  }

  // SL near max + TP weak: stop is at the maximum allowed distance + TP is low
  if (input.atrPct > 0.02 && input.avgWinR < 1.2) {
    cpBreakdown.slNearMaxTpWeak = cfg.capitalPreservation.slNearMaxTpWeak;
  }

  const cpTotal = Math.min(sumValues(cpBreakdown), cfg.capitalPreservation.maxGroup);

  // ── Grand Total ─────────────────────────────────────────────
  const grandTotal = Math.min(
    execTotal + posTotal + regTotal + conTotal + cpTotal,
    cfg.maxGrandTotal,
  );

  return {
    execution: { total: execTotal, breakdown: execBreakdown },
    positioning: { total: posTotal, breakdown: posBreakdown },
    regime: { total: regTotal, breakdown: regBreakdown },
    conflict: { total: conTotal, breakdown: conBreakdown },
    capitalPreservation: { total: cpTotal, breakdown: cpBreakdown },
    grandTotal,
  };
}
