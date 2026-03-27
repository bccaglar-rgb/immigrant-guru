/**
 * Aggressive Mode Hub V2 — Penalty Engine (4 Groups)
 * Same structure as FLOW, uses AGG penalty values (lighter)
 */

import type { HubInput, PenaltyBundle, PenaltyGroup } from "./types.ts";
import { PENALTY_VALUES } from "./config.ts";

function calcExecutionPenalty(input: HubInput): PenaltyGroup {
  const items: Array<{ name: string; value: number }> = [];
  if (input.slippage === "HIGH") {
    const val = input.fillProbability < 0.3 ? PENALTY_VALUES.execution.slipExtreme : PENALTY_VALUES.execution.slipHigh;
    items.push({ name: "slippage", value: val });
  }
  if (input.spreadTightness < 0.3) items.push({ name: "spreadWide", value: PENALTY_VALUES.execution.spreadWide });
  if (input.fillProbability < 0.30) {
    const val = input.fillProbability < 0.20 ? PENALTY_VALUES.execution.lowFillSevere : PENALTY_VALUES.execution.lowFillMod;
    items.push({ name: "lowFill", value: val });
  }
  if (input.entryWindowState === "CLOSED") items.push({ name: "entryClosed", value: PENALTY_VALUES.execution.entryClosed });
  if (input.depthQuality < 0.25) items.push({ name: "depthCollapse", value: PENALTY_VALUES.execution.depthCollapse });
  if (input.spoofDetected) items.push({ name: "spoof", value: PENALTY_VALUES.execution.spoof });
  return { total: items.reduce((s, i) => s + i.value, 0), items };
}

function calcPositioningPenalty(input: HubInput): PenaltyGroup {
  const items: Array<{ name: string; value: number }> = [];
  if (input.crowdingHigh > 0.5) items.push({ name: "crowding", value: PENALTY_VALUES.positioning.crowding });
  if (input.fundingHealthy < 0.3) items.push({ name: "fundingExtreme", value: PENALTY_VALUES.positioning.fundingExtreme });
  if (input.oiDivergence > 0.5) items.push({ name: "oiDivergence", value: PENALTY_VALUES.positioning.oiDivergence });
  if (input.liqBiasFit < 0.3 && input.poolProximity > 0.6) items.push({ name: "liqTrap", value: PENALTY_VALUES.positioning.liqTrap });
  return { total: items.reduce((s, i) => s + i.value, 0), items };
}

function calcRegimePenalty(input: HubInput): PenaltyGroup {
  const items: Array<{ name: string; value: number }> = [];
  if (input.riskScore > 0.6) items.push({ name: "stress", value: PENALTY_VALUES.regime.stress });
  if (input.fakeBreakRisk > 0.5) items.push({ name: "fakeBreak", value: PENALTY_VALUES.regime.fakeBreak });
  if (input.deadVolatility > 0.6) items.push({ name: "deadSession", value: PENALTY_VALUES.regime.deadSession });
  if (input.suddenMoveRisk > 0.7) items.push({ name: "newsWindow", value: PENALTY_VALUES.regime.newsWindow });
  const day = new Date().getUTCDay();
  if (day === 0 || day === 6) items.push({ name: "weekend", value: PENALTY_VALUES.regime.weekend });
  return { total: items.reduce((s, i) => s + i.value, 0), items };
}

function calcConflictPenalty(input: HubInput): PenaltyGroup {
  const items: Array<{ name: string; value: number }> = [];
  if ((input.trendDirBias > 0.2 && input.orderflowBias < -0.2) ||
      (input.trendDirBias < -0.2 && input.orderflowBias > 0.2))
    items.push({ name: "dirConflict", value: PENALTY_VALUES.conflict.dirConflict });
  if (input.weakParticipation > 0.5 && input.weakAcceptance > 0.5)
    items.push({ name: "modelAgreement", value: PENALTY_VALUES.conflict.modelAgreement });
  if ((input.emaBias > 0.2 && input.vwapBias < -0.2) || (input.emaBias < -0.2 && input.vwapBias > 0.2))
    items.push({ name: "crossFeature", value: PENALTY_VALUES.conflict.crossFeature });
  if (input.vwapPosition === "AT" && input.crowdingHigh > 0.4)
    items.push({ name: "vwapCrowding", value: PENALTY_VALUES.conflict.vwapCrowding });
  return { total: items.reduce((s, i) => s + i.value, 0), items };
}

export function calculatePenalties(input: HubInput): PenaltyBundle {
  const execution = calcExecutionPenalty(input);
  const positioning = calcPositioningPenalty(input);
  const regime = calcRegimePenalty(input);
  const conflict = calcConflictPenalty(input);
  return { execution, positioning, regime, conflict, totalPenalty: execution.total + positioning.total + regime.total + conflict.total };
}
