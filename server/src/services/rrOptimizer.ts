import type { TradeIdeaRecord } from "./tradeIdeaTypes.ts";
import { calcTotalR } from "./rrSimulator.ts";

export const RR_CANDIDATES = [1.5, 1.75, 2.0, 2.25, 2.5, 3.0] as const;

/** Minimum number of resolved trades required before we change the active RR */
export const MIN_TRADES_FOR_OPTIMIZATION = 30;

/** Only update if new RR differs by at least this much from current */
const HYSTERESIS_RR_DELTA = 0.25;

/** Only update if totalR improvement is at least this fraction over current */
const HYSTERESIS_IMPROVEMENT_THRESHOLD = 0.1;

export interface RROptimizationResult {
  bestRR: number;
  totalR: number;
  winRate: number;
  tradeCount: number;
  changed: boolean;
}

/**
 * Find the RR candidate that maximizes totalR for the given trade set.
 * Applies hysteresis to prevent noise-driven thrashing.
 *
 * @param trades      Resolved trades for a single scoring mode
 * @param currentRR   Currently active RR for this mode (for hysteresis)
 */
export function optimizeRR(
  trades: TradeIdeaRecord[],
  currentRR: number,
): RROptimizationResult {
  // Baseline: evaluate current RR
  const baseline = calcTotalR(trades, currentRR);

  if (baseline.total < MIN_TRADES_FOR_OPTIMIZATION) {
    return {
      bestRR: currentRR,
      totalR: baseline.totalR,
      winRate: baseline.total > 0 ? baseline.wins / baseline.total : 0,
      tradeCount: baseline.total,
      changed: false,
    };
  }

  // Evaluate all candidates
  let best = {
    rr: currentRR,
    totalR: baseline.totalR,
    wins: baseline.wins,
    total: baseline.total,
  };

  for (const rr of RR_CANDIDATES) {
    const { totalR, wins, total } = calcTotalR(trades, rr);
    if (total < MIN_TRADES_FOR_OPTIMIZATION) continue;
    if (totalR > best.totalR) {
      best = { rr, totalR, wins, total };
    }
  }

  // Hysteresis: don't update if the difference is trivial
  const rrDelta = Math.abs(best.rr - currentRR);
  const improvement =
    baseline.totalR !== 0
      ? (best.totalR - baseline.totalR) / Math.abs(baseline.totalR)
      : best.totalR > 0
        ? 1
        : 0;

  const shouldChange =
    best.rr !== currentRR &&
    (rrDelta >= HYSTERESIS_RR_DELTA || improvement >= HYSTERESIS_IMPROVEMENT_THRESHOLD);

  return {
    bestRR: shouldChange ? best.rr : currentRR,
    totalR: best.totalR,
    winRate: best.total > 0 ? best.wins / best.total : 0,
    tradeCount: best.total,
    changed: shouldChange,
  };
}
