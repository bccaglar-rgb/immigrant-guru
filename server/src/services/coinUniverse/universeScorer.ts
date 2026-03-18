/**
 * Universe Scorer — Combines all 5 sub-scorers + false penalty
 *
 * Total raw: Liquidity(25) + Structure(25) + Momentum(20) + Positioning(15) + Execution(15) = 100
 * Final: raw - falsePenalty (clamped 0-100)
 */

import type { CoinUniverseData, UniverseScore } from "./types.ts";
import { scoreLiquidity } from "./liquidityScorer.ts";
import { scoreStructure } from "./structureScorer.ts";
import { scoreMomentum } from "./momentumScorer.ts";
import { scorePositioning } from "./positioningScorer.ts";
import { scoreExecution } from "./executionScorer.ts";
import { computeFalsePenalty } from "./falsePenalty.ts";

export function computeUniverseScore(coin: CoinUniverseData): UniverseScore {
  const liquidity = scoreLiquidity(coin);
  const structure = scoreStructure(coin);
  const momentum = scoreMomentum(coin);
  const positioning = scorePositioning(coin);
  const execution = scoreExecution(coin);
  const falsePenalty = computeFalsePenalty(coin);

  const raw = Math.round(
    (liquidity.total + structure.total + momentum.total + positioning.total + execution.total) * 100
  ) / 100;

  const penalty = falsePenalty.total;
  const final = Math.max(0, Math.min(100, Math.round((raw - penalty) * 100) / 100));

  return {
    raw,
    penalty,
    final,
    liquidity,
    structure,
    momentum,
    positioning,
    execution,
    falsePenalty,
  };
}
