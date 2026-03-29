/**
 * P5: Meta-Labeling Filter
 *
 * Second-layer decision: "should this trade actually be taken?"
 * Model 1 (quant engine) = opportunity detector
 * Model 2 (this) = success probability filter
 *
 * Uses historical pattern matching from regime memory + mode performance.
 */

import type { ModePerformanceTracker } from "./modePerformanceTracker.ts";
import type { RegimeParameterEngine } from "./regimeParameterEngine.ts";

export interface MetaLabel {
  shouldTrade: boolean;
  adjustedConfidence: number;  // 0-100
  reason: string;
  skipReason: string | null;
  historicalWinRate: number | null;
  historicalSampleSize: number;
}

export class MetaLabelingFilter {
  private modeTracker: ModePerformanceTracker;
  private regimeEngine: RegimeParameterEngine;

  constructor(
    modeTracker: ModePerformanceTracker,
    regimeEngine: RegimeParameterEngine,
  ) {
    this.modeTracker = modeTracker;
    this.regimeEngine = regimeEngine;
  }

  /**
   * Evaluate whether a setup should be traded.
   * Returns adjusted confidence and skip recommendation.
   */
  evaluate(setup: {
    mode: string;
    regime: string;
    score: number;
    conditions: string; // e.g. "trend+low_spread+oi_rising"
  }): MetaLabel {
    const modeStats = this.modeTracker.getStats(setup.mode);
    const regimeParams = this.regimeEngine.getParams(setup.regime);
    const modeWeight = this.modeTracker.getModeWeight(setup.mode);
    const similarPatterns = this.regimeEngine.findSimilarPatterns(setup.regime, setup.conditions);

    let adjustedConfidence = setup.score;
    let shouldTrade = true;
    let skipReason: string | null = null;
    const reasons: string[] = [];

    // 1. Mode throttle check
    if (this.modeTracker.isThrottled(setup.mode)) {
      adjustedConfidence *= 0.6;
      reasons.push(`mode_throttled(w=${modeWeight.toFixed(1)})`);
      if (modeWeight < 0.4) {
        shouldTrade = false;
        skipReason = "mode_severely_throttled";
      }
    }

    // 2. Score below regime threshold
    if (setup.score < regimeParams.scoreThreshold) {
      shouldTrade = false;
      skipReason = `score_${setup.score}_below_regime_threshold_${regimeParams.scoreThreshold}`;
    }

    // 3. Mode recent performance
    if (modeStats && modeStats.tradeCount >= 10) {
      // Negative expectancy in recent trades
      if (modeStats.expectancy < -0.2) {
        adjustedConfidence *= 0.7;
        reasons.push("negative_expectancy");
      }
      // Win rate bonus/penalty
      if (modeStats.winRate > 0.55) {
        adjustedConfidence *= 1.1;
        reasons.push("high_mode_winrate");
      } else if (modeStats.winRate < 0.35) {
        adjustedConfidence *= 0.75;
        reasons.push("low_mode_winrate");
      }
    }

    // 4. Historical pattern matching
    let historicalWinRate: number | null = null;
    let historicalSampleSize = 0;
    if (similarPatterns.length > 0) {
      const best = similarPatterns[0];
      historicalWinRate = best.winRate;
      historicalSampleSize = best.sampleSize;

      if (best.sampleSize >= 10) {
        if (best.winRate < 0.3) {
          adjustedConfidence *= 0.6;
          reasons.push(`weak_pattern(wr=${(best.winRate * 100).toFixed(0)}%,n=${best.sampleSize})`);
          if (best.winRate < 0.2 && best.sampleSize >= 20) {
            shouldTrade = false;
            skipReason = "historical_pattern_very_weak";
          }
        } else if (best.winRate > 0.6) {
          adjustedConfidence *= 1.15;
          reasons.push(`strong_pattern(wr=${(best.winRate * 100).toFixed(0)}%,n=${best.sampleSize})`);
        }
      }
    }

    // 5. Regime mode weight
    const regimeModeWeight = this.regimeEngine.getModeWeight(setup.mode, setup.regime);
    if (regimeModeWeight < 0.5) {
      adjustedConfidence *= regimeModeWeight;
      reasons.push(`regime_mode_weight_${regimeModeWeight.toFixed(1)}`);
    }

    // Clamp
    adjustedConfidence = Math.max(0, Math.min(100, Math.round(adjustedConfidence)));

    // Final threshold check
    if (shouldTrade && adjustedConfidence < 40) {
      shouldTrade = false;
      skipReason = `adjusted_confidence_too_low_${adjustedConfidence}`;
    }

    return {
      shouldTrade,
      adjustedConfidence,
      reason: reasons.join(", ") || "passed",
      skipReason,
      historicalWinRate,
      historicalSampleSize,
    };
  }
}
