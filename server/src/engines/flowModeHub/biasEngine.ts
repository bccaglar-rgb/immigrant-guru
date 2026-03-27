/**
 * Flow Mode Hub V2 — Direction Quality Score
 *
 * BiasRaw = weighted sum of 6 directional signals (-1 to +1)
 * QualityScore = 50 + 50 * |BiasRaw| (0-100)
 * Side: if BiasRaw >= +0.22 -> LONG, <= -0.22 -> SHORT, else NONE
 */

import type { HubInput, DirectionQualityResult } from "./types.ts";
import { DQ_WEIGHTS, DIRECTION_THRESHOLD } from "./config.ts";

export function calculateDirectionQuality(input: HubInput): DirectionQualityResult {
  const components = {
    trend: input.trendDirBias,
    vwap: input.vwapBias,
    ema: input.emaBias,
    levelReaction: input.levelReactionBias,
    orderflow: input.orderflowBias,
    positioning: input.positioningBias,
  };

  const biasRaw = Math.max(-1, Math.min(1,
    DQ_WEIGHTS.trend * components.trend +
    DQ_WEIGHTS.vwap * components.vwap +
    DQ_WEIGHTS.ema * components.ema +
    DQ_WEIGHTS.levelReaction * components.levelReaction +
    DQ_WEIGHTS.orderflow * components.orderflow +
    DQ_WEIGHTS.positioning * components.positioning
  ));

  const qualityScore = Math.round((50 + 50 * Math.abs(biasRaw)) * 10) / 10;

  let side: "LONG" | "SHORT" | "NONE";
  if (biasRaw >= DIRECTION_THRESHOLD) side = "LONG";
  else if (biasRaw <= -DIRECTION_THRESHOLD) side = "SHORT";
  else side = "NONE";

  return {
    biasRaw: Math.round(biasRaw * 1000) / 1000,
    qualityScore,
    side,
    components,
  };
}
