import type { ScoringMode } from "../scoringMode.ts";
import { adaptiveRR } from "../adaptiveRRService.ts";
import { ccManager } from "./championChallengerManager.ts";
import type { ModuleConfig, QuantSnapshot } from "./types.ts";
import { DEFAULT_MODULE_CONFIG, buildSegmentKey } from "./types.ts";
import { classifyCurrentContext } from "./segmentAnalyzer.ts";

/**
 * RuntimeDecisionEngine — singleton that returns the active ModuleConfig
 * for a given scoring mode + optional current quant context.
 *
 * Fallback chain:
 *  1. optimizer_config.json → mode → segment match (if snapshot provided)
 *  2. optimizer_config.json → mode → global champion
 *  3. adaptiveRRService.getRR(mode) for rr param (legacy fallback)
 *  4. DEFAULT_MODULE_CONFIG
 */
class RuntimeDecisionEngine {
  getConfig(mode: ScoringMode, snapshot?: Partial<QuantSnapshot>): ModuleConfig {
    const modeState = ccManager.getModeState(mode);

    if (modeState) {
      // Try segment-level first (if context provided and segment has data)
      if (snapshot && Object.keys(modeState.segments).length > 0) {
        const segKey = classifyCurrentContext(snapshot);
        const segState = modeState.segments[segKey];
        if (segState && segState.champion.tradeCount >= 15) {
          return segState.champion.config;
        }
      }

      // Global champion (if has real trade data)
      if (modeState.global.champion.tradeCount > 0) {
        return modeState.global.champion.config;
      }
    }

    // Legacy fallback: use adaptiveRRService for rr, defaults for rest
    const legacyRR = adaptiveRR.getRR(mode);
    if (legacyRR !== DEFAULT_MODULE_CONFIG.rr) {
      return { ...DEFAULT_MODULE_CONFIG, rr: legacyRR };
    }

    return { ...DEFAULT_MODULE_CONFIG };
  }

  /** Get module weight/activation decision based on segment performance */
  getModuleWeight(mode: ScoringMode, snapshot?: Partial<QuantSnapshot>): number {
    const modeState = ccManager.getModeState(mode);
    if (!modeState) return 1.0;

    if (snapshot) {
      const segKey = classifyCurrentContext(snapshot);
      const segState = modeState.segments[segKey];
      if (segState && segState.champion.tradeCount >= 15) {
        const m = segState.champion.metrics;
        // Reduce weight for poor-performing segments
        if (m.winRate < 0.30) return 0.3;
        if (m.expectancy < 0) return 0.5;
        if (m.winRate > 0.60 && m.expectancy > 0.5) return 1.2; // boost
      }
    }

    return 1.0;
  }

  /** Returns the current segment key for the given context */
  getCurrentSegment(snapshot?: Partial<QuantSnapshot>): string {
    if (!snapshot) return "UNKNOWN_UNKNOWN";
    return buildSegmentKey({
      regime: snapshot.regime ?? "UNKNOWN",
      volatilityState: snapshot.volatilityState ?? "MID",
    });
  }
}

export const runtimeDecision = new RuntimeDecisionEngine();
