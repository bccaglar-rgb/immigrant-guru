import type { TradeIdeaRecord } from "../tradeIdeaTypes.ts";
import type {
  ModuleConfig,
  PerformanceMetrics,
  ChampionState,
  ChallengerState,
  ModeOptimizerState,
  SegmentKey,
} from "./types.ts";
import { DEFAULT_MODULE_CONFIG, ZERO_METRICS } from "./types.ts";
import { calcMetrics } from "./performanceAnalyzer.ts";
import { findBestConfig } from "./paramSimulator.ts";

const GLOBAL_MIN_TRADES = 30;
const SEGMENT_MIN_TRADES = 15;
const IMPROVEMENT_THRESHOLD = 0.05; // 5% expectancy improvement required

function buildDefaultChampion(config: ModuleConfig = DEFAULT_MODULE_CONFIG): ChampionState {
  return {
    config,
    metrics: { ...ZERO_METRICS },
    promotedAt: new Date().toISOString(),
    tradeCount: 0,
  };
}

function meetsImprovementThreshold(
  current: PerformanceMetrics,
  candidate: PerformanceMetrics,
): boolean {
  if (current.expectancy <= 0) return candidate.expectancy > 0;
  const improvement = (candidate.expectancy - current.expectancy) / Math.abs(current.expectancy);
  return improvement >= IMPROVEMENT_THRESHOLD;
}

/**
 * Optimize a single scoring mode globally (all segments combined).
 * Returns a new challenger if found, null if no improvement.
 */
export function optimizeModeGlobal(
  trades: TradeIdeaRecord[],
  currentChampion: ChampionState,
): ChallengerState | null {
  const best = findBestConfig(trades, GLOBAL_MIN_TRADES);
  if (!best) return null;

  const currentMetrics = calcMetrics(trades, currentChampion.config);

  if (!meetsImprovementThreshold(currentMetrics, best.metrics)) return null;

  // Don't generate a challenger identical to the current champion
  const cfg = best.config;
  const champ = currentChampion.config;
  if (
    cfg.rr === champ.rr &&
    cfg.slBufferFactor === champ.slBufferFactor &&
    cfg.entryZoneFactor === champ.entryZoneFactor &&
    cfg.minRRFilter === champ.minRRFilter
  ) return null;

  return {
    config: best.config,
    metrics: best.metrics,
    generatedAt: new Date().toISOString(),
    tradeCount: best.metrics.tradeCount,
  };
}

/**
 * Optimize a single scoring mode per segment.
 * Returns a map of segment → challenger (or null).
 */
export function optimizeModeSegments(
  tradesBySegment: Map<SegmentKey, TradeIdeaRecord[]>,
  globalChampion: ChampionState,
  currentSegmentChampions: Record<SegmentKey, ChampionState>,
): Map<SegmentKey, ChallengerState | null> {
  const result = new Map<SegmentKey, ChallengerState | null>();

  for (const [segment, trades] of tradesBySegment) {
    if (trades.length < SEGMENT_MIN_TRADES) {
      result.set(segment, null);
      continue;
    }

    const segChampion = currentSegmentChampions[segment] ?? globalChampion;
    const best = findBestConfig(trades, SEGMENT_MIN_TRADES);
    if (!best) { result.set(segment, null); continue; }

    const currentMetrics = calcMetrics(trades, segChampion.config);
    if (!meetsImprovementThreshold(currentMetrics, best.metrics)) {
      result.set(segment, null);
      continue;
    }

    // Segment config must be at least as good as the global champion
    const globalMetrics = calcMetrics(trades, globalChampion.config);
    if (best.metrics.expectancy < globalMetrics.expectancy) {
      result.set(segment, null);
      continue;
    }

    result.set(segment, {
      config: best.config,
      metrics: best.metrics,
      generatedAt: new Date().toISOString(),
      tradeCount: best.metrics.tradeCount,
    });
  }

  return result;
}

/** Build initial default state for a mode */
export function buildDefaultModeState(config: ModuleConfig = DEFAULT_MODULE_CONFIG): ModeOptimizerState {
  return {
    global: {
      champion: buildDefaultChampion(config),
      challenger: null,
      history: [],
    },
    segments: {},
    lastRun: new Date().toISOString(),
  };
}
