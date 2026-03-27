/**
 * Capital Guard Mode Hub — Configuration (v4: 5-Block Scoring)
 *
 * CG is the STRICTEST mode:
 * - 5 blocks: MQ(22%) + DQ(16%) + EQ(24%) + EdgeQ(18%) + CP(20%)
 * - 5 penalty groups (adds CapitalPreservation)
 * - Highest decision thresholds: CONFIRMED >= 84 + edge >= 0.18 + CP >= 78
 * - Narrowest TP/SL: TP 3-12%, SL 1.5-5%
 * - Highest bias threshold: 0.26
 */

import type { CgHubConfig } from "./types.ts";

export function loadCgHubConfig(): CgHubConfig {
  return {
    enabled: process.env.CG_HUB_ENABLED === "true",
    intervalMs: 45_000,
    maxCandidates: 12,
    minDataHealth: 0.90,
    minFillProbability: 0.28,
    minExpectedEdge: 0.10,
    dryRun: process.env.CG_HUB_DRY_RUN === "true",
  };
}

// ── 5-Block Weights ─────────────────────────────────────────────
export const CG_BLOCK_WEIGHTS = {
  MQ: 0.22,      // Market Quality
  DQ: 0.16,      // Direction Quality
  EQ: 0.24,      // Execution Quality
  EdgeQ: 0.18,   // Edge Quality
  CP: 0.20,      // Capital Protection (CG exclusive)
} as const;

// ── Capital Protection Sub-Weights ──────────────────────────────
export const CP_SUB_WEIGHTS = {
  stopIntegrity: 0.28,
  drawdownContainment: 0.24,
  invalidationClarity: 0.18,
  regimeSafety: 0.14,
  adverseMoveResilience: 0.16,
} as const;

// ── Bias Threshold (strictest) ──────────────────────────────────
export const CG_BIAS_THRESHOLD = 0.26;

// ── Regime Multipliers (harsh on non-trend) ─────────────────────
export const CG_REGIME_MULTIPLIERS: Record<string, number> = {
  TREND: 1.10,
  RANGE: 0.85,
  BREAKOUT_SETUP: 0.95,
  FAKE_BREAK_RISK: 0.65,
  HIGH_STRESS: 0.55,
};

// ── 5 Penalty Group Config ──────────────────────────────────────
export const CG_PENALTY_GROUP_CONFIG = {
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
  capitalPreservation: {
    stopHuntable: 6,
    unclearInvalidation: 7,
    riskClustering: 6,
    adverseExcursion: 7,
    unrealisticReward: 8,
    slNearMaxTpWeak: 8,
    maxGroup: 22,
  },
  maxGrandTotal: 55,
} as const;

// ── Edge-Conditional + CP-Conditional Decision Thresholds ───────
export const CG_DECISION_THRESHOLDS = {
  CONFIRMED: { score: 84, edgeNetR: 0.18, cpScore: 78 },
  PROBE: { score: 74, edgeNetR: 0.12, cpScore: 72 },
  WATCHLIST: { score: 62 },
  // Below 62 = NO_TRADE
} as const;

// ── Position Tiers (stricter than balanced) ─────────────────────
export const CG_POSITION_TIERS = [
  { minScore: 94, multiplier: 0.90 },
  { minScore: 88, multiplier: 0.70 },
  { minScore: 81, multiplier: 0.45 },
  { minScore: 74, multiplier: 0.25 },
  { minScore: 0,  multiplier: 0.00 },
] as const;

// ── Session Multipliers ─────────────────────────────────────────
export const CG_SESSION_MULTIPLIERS: Record<string, number> = {
  LONDON: 1.03,
  NY: 1.03,
  ASIAN: 0.92,
  WEEKEND: 0.75,
  OFF_HOURS: 0.88,
};

// ── TP/SL — Narrower than balanced ──────────────────────────────
// $100 margin @ 10x leverage
// SL: $1.5-$5 (1.5-5% margin), TP: $3-$12 (3-12% margin)
export const CG_TPSL_CONFIG = {
  leverage: 10,
  tpMarginRange: [5, 14] as [number, number],   // TP: 3-12% margin
  slMarginRange: [4, 10] as [number, number],  // SL: 1.5-5% margin
  tpMarginClamp: [5, 14] as [number, number],
  slMarginClamp: [4, 10] as [number, number],
  regimeTpMult: {
    TREND: 1.05,
    RANGE: 0.90,
    BREAKOUT_SETUP: 1.00,
    FAKE_BREAK_RISK: 0.85,
    HIGH_STRESS: 0.80,
  } as Record<string, number>,
  regimeSlMult: {
    TREND: 1.00,
    RANGE: 1.05,
    BREAKOUT_SETUP: 1.00,
    FAKE_BREAK_RISK: 1.15,
    HIGH_STRESS: 1.20,
  } as Record<string, number>,
} as const;

// ── Position Sizing Config ──────────────────────────────────────
export const CG_POSITION_CONFIG = {
  baseRiskPct: 0.004,         // 0.4% base risk (most conservative)
  maxMultiplier: 0.90,        // Max position multiplier
  stressMultiplier: 0.35,     // 65% reduction under stress
  weekendMultiplier: 0.65,    // 35% reduction on weekends
} as const;
