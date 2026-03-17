import type { TradeIdeaRecord } from "../tradeIdeaTypes.ts";
import type { ModuleConfig, PerformanceMetrics } from "./types.ts";
import { PARAM_CANDIDATES } from "./types.ts";
import { calcMetrics } from "./performanceAnalyzer.ts";

export interface SimulationResult {
  config: ModuleConfig;
  metrics: PerformanceMetrics;
}

/**
 * Run a grid search over all candidate parameter combinations.
 * Returns results sorted by expectancy descending.
 *
 * Note: Full grid search over all 4 params = 8×5×5×5 = 1000 combos.
 * This is fast (pure in-memory math) for up to ~10k trades.
 */
export function runGridSearch(
  trades: TradeIdeaRecord[],
  minTradeCount = 30,
): SimulationResult[] {
  const results: SimulationResult[] = [];

  for (const rr of PARAM_CANDIDATES.rr) {
    for (const slBufferFactor of PARAM_CANDIDATES.slBufferFactor) {
      for (const entryZoneFactor of PARAM_CANDIDATES.entryZoneFactor) {
        for (const minRRFilter of PARAM_CANDIDATES.minRRFilter) {
          const config: ModuleConfig = {
            rr,
            slBufferFactor,
            entryZoneFactor,
            minRRFilter,
            trendFilterEnabled: false, // Phase 1: not optimized
          };

          const metrics = calcMetrics(trades, config);
          if (metrics.tradeCount >= minTradeCount) {
            results.push({ config, metrics });
          }
        }
      }
    }
  }

  // Sort by expectancy (primary), then totalR (secondary)
  results.sort((a, b) => {
    const eDiff = b.metrics.expectancy - a.metrics.expectancy;
    if (Math.abs(eDiff) > 0.001) return eDiff;
    return b.metrics.totalR - a.metrics.totalR;
  });

  return results;
}

/** Find the single best config for a trade set */
export function findBestConfig(
  trades: TradeIdeaRecord[],
  minTradeCount = 30,
): SimulationResult | null {
  const results = runGridSearch(trades, minTradeCount);
  return results[0] ?? null;
}
