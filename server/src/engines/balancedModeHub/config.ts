/**
 * Balanced Mode Hub — Config (v4: 4-Block Scoring)
 *
 * 4-block weights: MQ(26%) + DQ(24%) + EQ(22%) + EdgeQ(28%)
 * 4 penalty groups with per-group caps
 * Edge-conditional decision thresholds
 * Score-tiered position sizing
 * $100 notional @ 10x leverage: TP $3-$20, SL $2-$8
 */

import type { BalancedHubConfig } from "./types.ts";

export function loadHubConfig(): BalancedHubConfig {
  return {
    enabled: process.env.BALANCED_HUB_ENABLED === "true",
    intervalMs: Number(process.env.BALANCED_HUB_INTERVAL_MS) || 30_000,
    maxCandidates: Number(process.env.BALANCED_HUB_MAX_CANDIDATES) || 12,
    minDataHealth: Number(process.env.BALANCED_HUB_MIN_DATA_HEALTH) || 0.85,
    minFillProbability: Number(process.env.BALANCED_HUB_MIN_FILL_PROB) || 0.22,
    minExpectedEdge: Number(process.env.BALANCED_HUB_MIN_EDGE) || 0.08,
    dryRun: process.env.BALANCED_HUB_DRY_RUN === "true",
  };
}

// ── 4-Block Scoring Weights ──────────────────────────────────────
export const BLOCK_WEIGHTS = {
  MQ: 0.26,    // Market Quality
  DQ: 0.24,    // Direction Quality
  EQ: 0.22,    // Execution Quality
  EdgeQ: 0.28, // Edge Quality
} as const;

// ── Bias Weights (same formula, threshold lowered) ──────────────
export const BIAS_WEIGHTS = {
  trendDirection: 0.30,
  vwapBias: 0.20,
  emaAlignment: 0.15,
  levelReaction: 0.15,
  orderflowBias: 0.10,
  positioningBias: 0.10,
} as const;

export const BIAS_THRESHOLD = 0.22;

// ── Regime Weights ──────────────────────────────────────────────
export const REGIME_WEIGHTS = {
  trendStrength: 0.30,
  atrState: 0.25,
  compression: 0.20,
  vwapBehavior: 0.15,
  timeInRange: 0.10,
} as const;

// ── Regime Multipliers ──────────────────────────────────────────
export const REGIME_MULTIPLIERS: Record<string, number> = {
  TREND: 1.12,
  RANGE: 0.90,
  BREAKOUT_SETUP: 1.08,
  FAKE_BREAK_RISK: 0.78,
  HIGH_STRESS: 0.68,
};

// ── Session Multipliers ─────────────────────────────────────────
export const SESSION_MULTIPLIERS: Record<string, number> = {
  LONDON: 1.05,
  NY: 1.05,
  ASIAN: 0.95,
  WEEKEND: 0.80,
  OFF_HOURS: 0.90,
};

// ── 4 Penalty Group Config ──────────────────────────────────────
export const PENALTY_GROUP_CONFIG = {
  execution: {
    slippageHigh: 12,
    spreadWide: 8,
    depthPoor: 10,
    fillLow: 8,
    spoof: 6,
    maxGroup: 25,
  },
  positioning: {
    crowdingHigh: 12,
    fundingExtreme: 8,
    oiDivergence: 10,
    weakParticipation: 8,
    maxGroup: 20,
  },
  regime: {
    fakeBreakRisk: 12,
    stressHigh: 10,
    deadVolatility: 8,
    maxGroup: 18,
  },
  conflict: {
    directionConflict: 10,
    signalDisagreement: 8,
    entryClosed: 8,
    weakAcceptance: 6,
    maxGroup: 18,
  },
  maxGrandTotal: 50,
} as const;

// ── Decision Thresholds (edge-conditional) ──────────────────────
// CONFIRMED: score >= 78 AND edgeNetR >= 0.20
// PROBE:     score >= 68 AND edgeNetR >= 0.12
// WATCHLIST:  score >= 58
// NO_TRADE:  below all
export const DECISION_THRESHOLDS = {
  CONFIRMED: { score: 78, edgeNetR: 0.20 },
  PROBE: { score: 68, edgeNetR: 0.12 },
  WATCHLIST: { score: 58 },
} as const;

// ── Position Sizing Tiers ───────────────────────────────────────
// <58 → 0x, 58-67 → 0.35x, 68-77 → 0.60x, 78-89 → 0.85x, 90+ → 1.00x
export const POSITION_TIERS = [
  { minScore: 90, multiplier: 1.00 },
  { minScore: 78, multiplier: 0.85 },
  { minScore: 68, multiplier: 0.60 },
  { minScore: 58, multiplier: 0.35 },
  { minScore: 0,  multiplier: 0.00 },
] as const;

// ── TP/SL Config (margin % — $100 margin @ 10x leverage) ───────
// TP: min $5 (5% margin), max $18 (18% margin) — tighter TP for faster hit
// SL: min $4 (4% margin), max $12 (12% margin) — wider SL to survive noise
// Old: TP [3,20], SL [2,8] → SL was 0.7% price, noise killed 90% of ideas
export const TPSL_CONFIG = {
  leverage: 10,
  tpMarginRange: [5, 18] as [number, number],
  slMarginRange: [4, 12] as [number, number],
  tpMarginClamp: [5, 18] as [number, number],
  slMarginClamp: [4, 12] as [number, number],
  regimeTpMult: {
    TREND: 1.05,
    RANGE: 0.95,
    BREAKOUT_SETUP: 1.05,
    FAKE_BREAK_RISK: 0.90,
    HIGH_STRESS: 0.85,
  } as Record<string, number>,
  regimeSlMult: {
    TREND: 1.00,
    RANGE: 1.05,
    BREAKOUT_SETUP: 1.00,
    FAKE_BREAK_RISK: 1.10,
    HIGH_STRESS: 1.15,
  } as Record<string, number>,
} as const;

// ── Position Sizing Base Config ─────────────────────────────────
export const POSITION_CONFIG = {
  baseRiskPct: 0.01,
  maxMultiplier: 1.00,
  stressMultiplier: 0.50,
  weekendMultiplier: 0.70,
} as const;
