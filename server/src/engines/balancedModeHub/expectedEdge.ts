/**
 * Balanced Mode Hub — Expected Edge (v4)
 *
 * edgeNetR = (pWin * avgWinR) - ((1-pWin) * lossR) - costR
 * riskAdjustedEdge = edgeNetR * regimeMultiplier * dataHealth * fillProbability
 *
 * edgeNetR is used for edge-conditional decision gating:
 * - CONFIRMED requires edgeNetR >= 0.20
 * - PROBE requires edgeNetR >= 0.12
 * - Hard gate: edgeNetR < 0.08 → NO_TRADE
 */
import type { HubInput, EdgeResult } from "./types.ts";

export function calculateExpectedEdge(input: HubInput, regimeMultiplier: number): EdgeResult {
  const lossR = 1.0; // Standard loss = 1R

  // Core edge calculation
  const edgeNetR = (input.pWin * input.avgWinR) - ((1 - input.pWin) * lossR) - input.costR;

  // Risk-adjusted: scale by external factors
  const riskAdjustedEdge = edgeNetR *
    regimeMultiplier *
    input.dataHealthScore *
    Math.max(input.fillProbability, 0.25);

  return {
    expectedEdge: Math.round(edgeNetR * 10000) / 10000,
    riskAdjustedEdge: Math.round(riskAdjustedEdge * 10000) / 10000,
    edgeNetR: Math.round(edgeNetR * 10000) / 10000,
    pWin: input.pWin,
    avgWinR: input.avgWinR,
    costR: input.costR,
  };
}
