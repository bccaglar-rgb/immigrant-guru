/**
 * Capital Guard Mode Hub — Execution Feasibility (v4)
 *
 * Strictest execution checks:
 * - Fill threshold: 0.28 (balanced: 0.22)
 * - Entry window: OPEN or NARROW only (CLOSING = blocked)
 * - CLOSING entry window = blocked in CG (unlike balanced which allows it)
 */

import type { HubInput, ExecutionResult } from "./types.ts";

export function calculateCgExecutionFeasibility(input: HubInput): ExecutionResult {
  // CG requires OPEN or NARROW entry window
  if (input.entryWindowState !== "OPEN" && input.entryWindowState !== "NARROW") {
    return {
      score: 0,
      blocked: true,
      reason: `Entry window ${input.entryWindowState} — CG requires OPEN or NARROW`,
    };
  }

  // Strictest fill probability check
  if (input.fillProbability < 0.28) {
    return {
      score: 0,
      blocked: true,
      reason: "Fill probability below 28% — CG minimum threshold",
    };
  }

  const slippageScore = input.slippage === "LOW" ? 0.9 : input.slippage === "MODERATE" ? 0.6 : 0.25;
  const entryWindowScore = input.entryWindowState === "OPEN" ? 1.0 : 0.7; // NARROW = 0.7

  const score = (
    0.25 * input.fillProbability +
    0.20 * slippageScore +
    0.15 * input.spreadScore +
    0.15 * input.depthScore +
    0.10 * (input.obStability > 0.5 ? 0.8 : 0.4) +
    0.15 * entryWindowScore
  ) * 100;

  return {
    score: Math.round(Math.min(100, score) * 10) / 10,
    blocked: false,
  };
}
