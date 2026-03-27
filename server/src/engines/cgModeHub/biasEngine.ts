/**
 * Capital Guard Mode Hub — Bias Engine (v4)
 *
 * Highest threshold: 0.26 (balanced uses 0.22)
 * CG requires strong directional conviction before deploying capital.
 *
 * Weighted formula:
 *   0.30 * trendDirBias + 0.20 * vwapBias + 0.15 * emaBias
 *   + 0.15 * levelReactionBias + 0.10 * orderflowBias + 0.10 * positioningBias
 *
 * Direction: >= 0.26 → LONG, <= -0.26 → SHORT, else NONE
 */

import type { HubInput, BiasResult, BiasDirection } from "./types.ts";
import { CG_BIAS_THRESHOLD } from "./config.ts";

export function calculateCgBias(input: HubInput): BiasResult {
  const score =
    0.30 * input.trendDirBias +
    0.20 * input.vwapBias +
    0.15 * input.emaBias +
    0.15 * input.levelReactionBias +
    0.10 * input.orderflowBias +
    0.10 * input.positioningBias;

  const clamped = Math.max(-1, Math.min(1, score));

  let direction: BiasDirection;
  if (clamped >= CG_BIAS_THRESHOLD) direction = "LONG";
  else if (clamped <= -CG_BIAS_THRESHOLD) direction = "SHORT";
  else direction = "NONE";

  return {
    score: Math.round(clamped * 10000) / 10000,
    direction,
    confidence: Math.round(Math.abs(clamped) * 10000) / 10000,
  };
}
