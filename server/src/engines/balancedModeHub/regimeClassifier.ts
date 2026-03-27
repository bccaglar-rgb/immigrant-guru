/**
 * Balanced Mode Hub — Regime Classifier (v4)
 *
 * 5 regimes: TREND, RANGE, BREAKOUT_SETUP, FAKE_BREAK_RISK, HIGH_STRESS
 * Priority: HIGH_STRESS > FAKE_BREAK_RISK > BREAKOUT_SETUP > TREND > RANGE
 *
 * Multipliers: TREND 1.12, RANGE 0.90, BREAKOUT 1.08, FAKE_BREAK 0.78, STRESS 0.68
 */
import type { HubInput, RegimeResult, RegimeType } from "./types.ts";
import { REGIME_MULTIPLIERS } from "./config.ts";

export function classifyRegime(input: HubInput): RegimeResult {
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
    multiplier: REGIME_MULTIPLIERS[regime] ?? 1.0,
    rawScore: Math.round(rawScore * 10000) / 10000,
  };
}
