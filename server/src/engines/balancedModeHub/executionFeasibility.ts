/**
 * Balanced Mode Hub — Execution Feasibility (v4)
 *
 * Hard blocks:
 *   - Entry window CLOSED → blocked
 *   - Fill probability < 0.22 → blocked
 *
 * Score: weighted from fill, slippage, spread, depth, OB stability, entry window
 */
import type { HubInput, ExecutionResult } from "./types.ts";

export function calculateExecutionFeasibility(input: HubInput): ExecutionResult {
  if (input.entryWindowState === "CLOSED") {
    return { score: 0, blocked: true, reason: "Entry window CLOSED" };
  }
  if (input.fillProbability < 0.22) {
    return { score: 0, blocked: true, reason: "Fill probability below 0.22" };
  }

  const slippageScore = input.slippage === "LOW" ? 0.9 : input.slippage === "MODERATE" ? 0.6 : 0.2;
  const entryWindowScore = input.entryWindowState === "OPEN" ? 1.0
    : input.entryWindowState === "NARROW" ? 0.7
    : 0.5; // CLOSING

  const score = (
    0.25 * input.fillProbability +
    0.20 * slippageScore +
    0.15 * input.spreadScore +
    0.15 * input.depthScore +
    0.10 * (input.obStability > 0.5 ? 0.8 : 0.4) +
    0.15 * entryWindowScore
  ) * 100;

  return { score: Math.min(100, Math.round(score * 100) / 100), blocked: false };
}
