/**
 * Aggressive Mode Hub V2 — Regime Classifier
 * Same logic as FLOW, imports AGG regime multipliers
 */

import type { HubInput, AggRegimeResult } from "./types.ts";
import type { RegimeType } from "../balancedModeHub/types.ts";
import { REGIME_MULTIPLIERS } from "./config.ts";

export function classifyAggRegime(input: HubInput): AggRegimeResult {
  const rawScore =
    0.30 * input.trendStrength +
    0.25 * input.atrFit +
    0.20 * (input.compressionActive ? 0.8 : 0.3) +
    0.15 * (Math.abs(input.vwapBehavior) > 0.3 ? 0.7 : 0.4) +
    0.10 * input.timeInRange;

  let regime: RegimeType;
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
    rawScore: Math.round(rawScore * 1000) / 1000,
  };
}
