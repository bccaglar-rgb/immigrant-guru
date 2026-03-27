/**
 * Flow Mode Hub V2 — Hard Gates
 *
 * Hard Fail -> NO_TRADE:
 *   - riskScore >= 0.80
 *   - dataHealthScore < 0.85
 *   - tradeValidity === "INVALID"
 *   - fillProbability < 0.22
 *   - realizedEdgeProxy < 0.08
 *   - depthQuality < 0.2 AND slippage === "HIGH" (combo)
 *
 * Soft Block -> max WATCHLIST:
 *   - entryWindowState !== "OPEN"
 *   - |directionalBiasRaw| < 0.22
 *   - fakeBreakRisk > 0.6
 *   - riskScore > 0.6 (stress)
 *   - deadVolatility > 0.7
 */

import type { HubInput, HardGateResult } from "./types.ts";
import { HARD_GATES } from "./config.ts";

export function evaluateHardGates(
  input: HubInput,
  realizedEdgeProxy: number,
  biasRaw: number,
): HardGateResult {
  const failedGates: string[] = [];
  const blockedGates: string[] = [];

  // ── Hard Fail checks ──
  if (input.riskScore >= HARD_GATES.riskMax) {
    failedGates.push("RiskGate");
  }
  if (input.dataHealthScore < HARD_GATES.dataHealth) {
    failedGates.push("DataHealth");
  }
  if (input.tradeValidity === "INVALID") {
    failedGates.push("TradeValidity");
  }
  if (input.fillProbability < HARD_GATES.fillProb) {
    failedGates.push("FillProbability");
  }
  if (realizedEdgeProxy < HARD_GATES.realizedEdge) {
    failedGates.push("RealizedEdge");
  }
  if (input.depthQuality < 0.2 && input.slippage === "HIGH") {
    failedGates.push("DepthSlippageCombo");
  }

  // ── Soft Block checks ──
  if (input.entryWindowState !== "OPEN") {
    blockedGates.push("EntryWindow");
  }
  if (Math.abs(biasRaw) < 0.22) {
    blockedGates.push("WeakBias");
  }
  if (input.fakeBreakRisk > 0.6) {
    blockedGates.push("FakeBreak");
  }
  if (input.riskScore > 0.6) {
    blockedGates.push("StressLevel");
  }
  if (input.deadVolatility > 0.7) {
    blockedGates.push("DeadVolatility");
  }

  const hardFail = failedGates.length > 0;
  const softBlock = blockedGates.length > 0;

  return {
    allPassed: !hardFail && !softBlock,
    hardFail,
    softBlock,
    failedGates,
    blockedGates,
  };
}
