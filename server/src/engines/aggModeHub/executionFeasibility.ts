/**
 * Aggressive Mode Hub V2 — Execution Quality Score
 * Same 6 sub-component formula as FLOW, uses AGG config weights
 */

import type { HubInput, ExecutionQualityResult } from "./types.ts";
import { EQ_WEIGHTS } from "./config.ts";

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export function calculateExecutionQuality(input: HubInput): ExecutionQualityResult {
  const fill = clamp(input.fillProbability * 100, 0, 100);
  const slippage = input.slippage === "LOW" ? 90 : input.slippage === "MODERATE" ? 55 : 15;
  const spread = clamp(input.spreadScore * 100, 0, 100);
  const depth = clamp(input.depthScore * 100, 0, 100);
  const obStability = clamp(input.obStability * 100, 0, 100);
  const entryTiming = input.entryWindowState === "OPEN" ? 90 : input.entryWindowState === "CLOSING" ? 50 : 10;

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
