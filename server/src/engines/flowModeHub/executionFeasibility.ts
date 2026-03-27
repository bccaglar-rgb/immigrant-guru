/**
 * Flow Mode Hub V2 — Execution Quality Score
 *
 * 6 sub-components: Fill (0.24) + Slippage (0.18) + Spread (0.14) +
 *                   Depth (0.14) + OBStability (0.12) + EntryTiming (0.18)
 */

import type { HubInput, ExecutionQualityResult } from "./types.ts";
import { EQ_WEIGHTS } from "./config.ts";

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export function calculateExecutionQuality(input: HubInput): ExecutionQualityResult {
  // Fill: map fillProbability (0-1) to 0-100
  const fill = clamp(input.fillProbability * 100, 0, 100);

  // Slippage: LOW=90, MODERATE=55, HIGH=15
  const slippage = input.slippage === "LOW" ? 90
    : input.slippage === "MODERATE" ? 55
    : 15;

  // Spread: map spreadScore (0-1) to 0-100
  const spread = clamp(input.spreadScore * 100, 0, 100);

  // Depth: map depthScore (0-1) to 0-100
  const depth = clamp(input.depthScore * 100, 0, 100);

  // OB Stability: map obStability (0-1) to 0-100
  const obStability = clamp(input.obStability * 100, 0, 100);

  // Entry Timing: OPEN=90, CLOSING=50, CLOSED=10
  const entryTiming = input.entryWindowState === "OPEN" ? 90
    : input.entryWindowState === "CLOSING" ? 50
    : 10;

  const total = Math.round((
    EQ_WEIGHTS.fill * fill +
    EQ_WEIGHTS.slippage * slippage +
    EQ_WEIGHTS.spread * spread +
    EQ_WEIGHTS.depth * depth +
    EQ_WEIGHTS.obStability * obStability +
    EQ_WEIGHTS.entryTiming * entryTiming
  ) * 10) / 10;

  return { fill, slippage, spread, depth, obStability, entryTiming, total };
}
