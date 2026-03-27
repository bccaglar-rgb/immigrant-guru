/**
 * Flow Mode Hub V2 — Penalty Engine (4 Groups)
 *
 * Execution: slip(8/14), spread(5), lowFill(8/14), entryClosed(10), depthCollapse(7), spoof(8)
 * Positioning: crowding(6), fundingExtreme(7), oiDivergence(6), liqTrap(5)
 * Regime: stress(8), fakeBreak(9), deadSession(5), newsWindow(8), weekend(4)
 * Conflict: dirConflict(5), modelAgreement(5), crossFeature(6), vwapCrowding(4)
 */

import type { HubInput, PenaltyBundle, PenaltyGroup } from "./types.ts";
import { PENALTY_VALUES } from "./config.ts";

function calcExecutionPenalty(input: HubInput): PenaltyGroup {
  const items: Array<{ name: string; value: number }> = [];

  // Slippage
  if (input.slippage === "HIGH") {
    const val = input.fillProbability < 0.3
      ? PENALTY_VALUES.execution.slipExtreme
      : PENALTY_VALUES.execution.slipHigh;
    items.push({ name: "slippage", value: val });
  }

  // Spread wide
  if (input.spreadTightness < 0.3) {
    items.push({ name: "spreadWide", value: PENALTY_VALUES.execution.spreadWide });
  }

  // Low fill
  if (input.fillProbability < 0.30) {
    const val = input.fillProbability < 0.20
      ? PENALTY_VALUES.execution.lowFillSevere
      : PENALTY_VALUES.execution.lowFillMod;
    items.push({ name: "lowFill", value: val });
  }

  // Entry closed
  if (input.entryWindowState === "CLOSED") {
    items.push({ name: "entryClosed", value: PENALTY_VALUES.execution.entryClosed });
  }

  // Depth collapse
  if (input.depthQuality < 0.25) {
    items.push({ name: "depthCollapse", value: PENALTY_VALUES.execution.depthCollapse });
  }

  // Spoof detected
  if (input.spoofDetected) {
    items.push({ name: "spoof", value: PENALTY_VALUES.execution.spoof });
  }

  return { total: items.reduce((s, i) => s + i.value, 0), items };
}

function calcPositioningPenalty(input: HubInput): PenaltyGroup {
  const items: Array<{ name: string; value: number }> = [];

  if (input.crowdingHigh > 0.5) {
    items.push({ name: "crowding", value: PENALTY_VALUES.positioning.crowding });
  }
  if (input.fundingHealthy < 0.3) {
    items.push({ name: "fundingExtreme", value: PENALTY_VALUES.positioning.fundingExtreme });
  }
  if (input.oiDivergence > 0.5) {
    items.push({ name: "oiDivergence", value: PENALTY_VALUES.positioning.oiDivergence });
  }
  if (input.liqBiasFit < 0.3 && input.poolProximity > 0.6) {
    items.push({ name: "liqTrap", value: PENALTY_VALUES.positioning.liqTrap });
  }

  return { total: items.reduce((s, i) => s + i.value, 0), items };
}

function calcRegimePenalty(input: HubInput): PenaltyGroup {
  const items: Array<{ name: string; value: number }> = [];

  if (input.riskScore > 0.6) {
    items.push({ name: "stress", value: PENALTY_VALUES.regime.stress });
  }
  if (input.fakeBreakRisk > 0.5) {
    items.push({ name: "fakeBreak", value: PENALTY_VALUES.regime.fakeBreak });
  }
  if (input.deadVolatility > 0.6) {
    items.push({ name: "deadSession", value: PENALTY_VALUES.regime.deadSession });
  }
  // News window: sudden high volatility spike
  if (input.suddenMoveRisk > 0.7) {
    items.push({ name: "newsWindow", value: PENALTY_VALUES.regime.newsWindow });
  }
  // Weekend penalty
  const day = new Date().getUTCDay();
  if (day === 0 || day === 6) {
    items.push({ name: "weekend", value: PENALTY_VALUES.regime.weekend });
  }

  return { total: items.reduce((s, i) => s + i.value, 0), items };
}

function calcConflictPenalty(input: HubInput): PenaltyGroup {
  const items: Array<{ name: string; value: number }> = [];

  // Direction conflict: trend and orderflow disagree
  if ((input.trendDirBias > 0.2 && input.orderflowBias < -0.2) ||
      (input.trendDirBias < -0.2 && input.orderflowBias > 0.2)) {
    items.push({ name: "dirConflict", value: PENALTY_VALUES.conflict.dirConflict });
  }

  // Model agreement: weak participation + weak acceptance
  if (input.weakParticipation > 0.5 && input.weakAcceptance > 0.5) {
    items.push({ name: "modelAgreement", value: PENALTY_VALUES.conflict.modelAgreement });
  }

  // Cross-feature conflict: ema and vwap disagree
  if ((input.emaBias > 0.2 && input.vwapBias < -0.2) ||
      (input.emaBias < -0.2 && input.vwapBias > 0.2)) {
    items.push({ name: "crossFeature", value: PENALTY_VALUES.conflict.crossFeature });
  }

  // VWAP + crowding conflict
  if (input.vwapPosition === "AT" && input.crowdingHigh > 0.4) {
    items.push({ name: "vwapCrowding", value: PENALTY_VALUES.conflict.vwapCrowding });
  }

  return { total: items.reduce((s, i) => s + i.value, 0), items };
}

export function calculatePenalties(input: HubInput): PenaltyBundle {
  const execution = calcExecutionPenalty(input);
  const positioning = calcPositioningPenalty(input);
  const regime = calcRegimePenalty(input);
  const conflict = calcConflictPenalty(input);

  const totalPenalty = execution.total + positioning.total + regime.total + conflict.total;

  return { execution, positioning, regime, conflict, totalPenalty };
}
