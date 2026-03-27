/**
 * Balanced Mode Hub — Bias/Direction Engine (v4)
 *
 * DirectionalBiasRaw = weighted sum of 6 bias signals → score from -1 to +1
 * Threshold: |bias| >= 0.22 → LONG/SHORT, else NONE
 *
 * Non-negotiable: if |bias| < 0.22 → direction = NONE → max decision = WATCHLIST
 */
import type { HubInput, BiasResult, BiasDirection } from "./types.ts";
import { BIAS_THRESHOLD } from "./config.ts";

export function calculateBias(input: HubInput): BiasResult {
  // Weighted DirectionalBiasRaw formula
  const score =
    0.30 * input.trendDirBias +
    0.20 * input.vwapBias +
    0.15 * input.emaBias +
    0.15 * input.levelReactionBias +
    0.10 * input.orderflowBias +
    0.10 * input.positioningBias;

  const clamped = Math.max(-1, Math.min(1, score));

  let direction: BiasDirection;
  if (clamped >= BIAS_THRESHOLD) direction = "LONG";
  else if (clamped <= -BIAS_THRESHOLD) direction = "SHORT";
  else direction = "NONE";

  return {
    score: Math.round(clamped * 10000) / 10000,
    direction,
    confidence: Math.round(Math.abs(clamped) * 10000) / 10000,
  };
}
