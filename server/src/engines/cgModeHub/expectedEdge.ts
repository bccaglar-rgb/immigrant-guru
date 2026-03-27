/**
 * Capital Guard Mode Hub — Expected Edge (v4)
 *
 * Re-exports from balanced hub — edge calculation is identical.
 * edgeNetR = (pWin * avgWinR) - ((1-pWin) * lossR) - costR
 *
 * CG's differentiation is in HOW edgeNetR is used (stricter thresholds):
 * - Hard gate: edgeNetR < 0.10 → NO_TRADE
 * - CONFIRMED requires edgeNetR >= 0.18
 * - PROBE requires edgeNetR >= 0.12
 */
export { calculateExpectedEdge } from "../balancedModeHub/expectedEdge.ts";
