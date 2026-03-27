/**
 * Capital Guard Mode Hub — Regime Classifier (v4)
 *
 * Same 5 regimes as balanced: TREND, RANGE, BREAKOUT_SETUP, FAKE_BREAK_RISK, HIGH_STRESS
 * Harsher multipliers — CG strongly penalizes uncertain regimes:
 *   TREND: 1.10, RANGE: 0.85, BREAKOUT: 0.95, FAKE_BREAK: 0.65, STRESS: 0.55
 */

import type { HubInput, RegimeResult, RegimeType } from "./types.ts";
import { CG_REGIME_MULTIPLIERS } from "./config.ts";

export function classifyCgRegime(input: HubInput): RegimeResult {
  const rawScore =
    0.30 * input.trendStrength +
    0.25 * input.atrFit +
    0.20 * (input.compressionActive ? 0.8 : 0.3) +
    0.15 * (Math.abs(input.vwapBehavior) > 0.3 ? 0.7 : 0.4) +
    0.10 * input.timeInRange;

  let regime: RegimeType;

  // Priority order: stress > fake break > breakout > trend > range
  if (input.riskScore > 0.7) {
    regime = "HIGH_STRESS";
  } else if (input.fakeBreakRisk > 0.6) {
    regime = "FAKE_BREAK_RISK";
  } else if (input.compressionActive && input.expansionProbability > 0.5) {
    regime = "BREAKOUT_SETUP";
  } else if (input.trendStrength > 0.6) {
    regime = "TREND";
  } else {
    regime = "RANGE";
  }

  return {
    regime,
    multiplier: CG_REGIME_MULTIPLIERS[regime] ?? 1.0,
    rawScore: Math.round(rawScore * 10000) / 10000,
  };
}
