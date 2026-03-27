/**
 * Aggressive Mode Hub V2 — Configuration
 *
 * Same 4-block architecture as FLOW but with:
 * - Lower thresholds (FinalScore: 55, Confirmed: 65) -> max daily trades
 * - 3 TP levels (TP1, TP2, TP3)
 * - Slightly more aggressive penalty tuning
 *
 * Margin-based limits ($100 margin @ 10x leverage):
 *   TP: min $3 profit, max $20 profit
 *   SL: max $8 loss per trade
 */

import type { AggHubConfig } from "./types.ts";

export function loadAggHubConfig(): AggHubConfig {
  return {
    enabled: process.env.AGG_HUB_ENABLED === "true",
    intervalMs: 15_000,
    maxCandidates: 20,
    dryRun: process.env.AGG_HUB_DRY_RUN === "true",
  };
}

// ── Block Weights (same as FLOW) ──
export const BLOCK_WEIGHTS = {
  marketQuality: 0.26,
  direction: 0.24,
  execution: 0.22,
  edge: 0.28,
} as const;

// ── Market Quality Sub-Weights ──
export const MQ_WEIGHTS = {
  structure: 0.30,
  liquidity: 0.25,
  volatility: 0.20,
  regimeFit: 0.25,
} as const;

// ── Direction Quality Sub-Weights ──
export const DQ_WEIGHTS = {
  trend: 0.28,
  vwap: 0.18,
  ema: 0.14,
  levelReaction: 0.14,
  orderflow: 0.12,
  positioning: 0.14,
} as const;

// ── Execution Quality Sub-Weights ──
export const EQ_WEIGHTS = {
  fill: 0.24,
  slippage: 0.18,
  spread: 0.14,
  depth: 0.14,
  obStability: 0.12,
  entryTiming: 0.18,
} as const;

// ── Edge Quality Sub-Weights ──
export const EDGE_WEIGHTS = {
  edgeValue: 0.50,
  rrQuality: 0.20,
  winModelAgreement: 0.15,
  exitReliability: 0.15,
} as const;

// ── Direction Threshold (slightly lower than FLOW for more signals) ──
export const DIRECTION_THRESHOLD = 0.18;

// ── Penalty Values (same structure, slightly lighter for AGG) ──
export const PENALTY_VALUES = {
  execution: {
    slipHigh: 6,
    slipExtreme: 12,
    spreadWide: 4,
    lowFillMod: 6,
    lowFillSevere: 12,
    entryClosed: 8,
    depthCollapse: 5,
    spoof: 6,
  },
  positioning: {
    crowding: 5,
    fundingExtreme: 6,
    oiDivergence: 5,
    liqTrap: 4,
  },
  regime: {
    stress: 6,
    fakeBreak: 7,
    deadSession: 4,
    newsWindow: 6,
    weekend: 3,
  },
  conflict: {
    dirConflict: 4,
    modelAgreement: 4,
    crossFeature: 5,
    vwapCrowding: 3,
  },
} as const;

// ── Hard Gates (slightly softer for AGG) ──
export const HARD_GATES = {
  dataHealth: 0.80,
  fillProb: 0.18,
  realizedEdge: 0.06,
  riskMax: 0.85,
} as const;

// ── Decision Thresholds (AGG-specific from Section 17: lower for max trades) ──
export const DECISION_THRESHOLDS = {
  confirmed: { score: 65, edge: 0.18 },
  probe: { score: 55, edge: 0.10 },
  watchlist: { score: 45 },
} as const;

// ── Entry Zone (same formula as FLOW) ──
export const ENTRY_ZONE_WEIGHTS = {
  vwap: 0.35,
  pullback: 0.20,
  acceptance: 0.20,
  liqReclaim: 0.15,
  ema: 0.10,
} as const;

export const ENTRY_ZONE_ATR = {
  longBias: { below: 0.50, above: 0.30 },
  shortBias: { below: 0.30, above: 0.50 },
} as const;

// ── SL Configuration (price % — at 10x leverage: 0.2-0.8% price = 2-8% margin = $2-$8) ──
export const SL_CONFIG = {
  clamp: [0.2, 0.8] as [number, number],
  stopBuffer: {
    TREND: [0.20, 0.30] as [number, number],
    RANGE: [0.15, 0.25] as [number, number],
    BREAKOUT_SETUP: [0.25, 0.40] as [number, number],
    HIGH_STRESS: [0.35, 0.50] as [number, number],
    FAKE_BREAK_RISK: [0.30, 0.45] as [number, number],
  } as Record<string, [number, number]>,
} as const;

// ── TP Configuration (3 TP levels for AGG, all clamped to 0.3-2.0% price = 3-20% margin) ──
export const TP_CONFIG = {
  compositeWeights: {
    volExpansion: 0.22,
    liqRun: 0.20,
    trendCont: 0.18,
    regimeTarget: 0.15,
    sessionRange: 0.10,
    edgeSupport: 0.15,
  },
  base: 0.3,
  range: 1.7,
  clamp: [0.3, 2.0] as [number, number],
  // TP2 = TP1 * tp2Mult, TP3 = TP1 * tp3Mult (all clamped to global max)
  tp2Mult: 1.6,
  tp3Mult: 2.5,
} as const;

// ── Regime-Dependent TP/SL Ranges (price %, scaled for 10x leverage margin limits) ──
export const REGIME_TPSL = {
  TREND:           { sl: [0.30, 0.65],  tp: [0.80, 2.00] },
  RANGE:           { sl: [0.20, 0.40],  tp: [0.30, 0.80] },
  BREAKOUT_SETUP:  { sl: [0.25, 0.55],  tp: [0.60, 1.50] },
  HIGH_STRESS:     { sl: [0.40, 0.80],  tp: [0.50, 1.00] },
  FAKE_BREAK_RISK: { sl: [0.30, 0.60],  tp: [0.40, 1.00] },
} as Record<string, { sl: number[]; tp: number[] }>;

// ── Position Sizing Tiers (aligned with AGG thresholds: lower) ──
export const SIZE_TIERS = [
  { min: 85, modifier: 1.00 },
  { min: 75, modifier: 0.85 },
  { min: 65, modifier: 0.60 },
  { min: 55, modifier: 0.35 },
] as const;

export const SIZE_MODIFIERS = {
  stressHigh: 0.50,
  weekend: 0.70,
  slipHigh: 0,
  fakeBreakHigh: 0,
} as const;

export const SIZE_CONFIG = {
  baseRiskPct: 0.02,
  maxMultiplier: 1.50,
} as const;

// ── Regime Multipliers (same as FLOW) ──
export const REGIME_MULTIPLIERS: Record<string, number> = {
  TREND: 1.00,
  RANGE: 0.92,
  BREAKOUT_SETUP: 0.96,
  FAKE_BREAK_RISK: 0.80,
  HIGH_STRESS: 0.75,
};

// ── Leverage ──
export const LEVERAGE = 10;
