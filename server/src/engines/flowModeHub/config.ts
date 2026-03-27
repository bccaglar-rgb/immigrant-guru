/**
 * Flow Mode Hub V2 — Configuration
 *
 * 4-Block Architecture: Market Quality + Direction Quality + Execution Quality + Edge Quality
 * 4-Group Penalties: Execution + Positioning + Regime + Conflict
 * Decision Matrix: NO_TRADE / WATCHLIST / PROBE / CONFIRMED
 * TP: 0.3-2.0% price (3-20% margin at 10x), SL: 0.2-0.8% price (2-8% margin at 10x)
 *
 * Margin-based limits ($100 margin @ 10x leverage):
 *   TP: min $3 profit, max $20 profit
 *   SL: max $8 loss per trade
 */

import type { FlowHubConfig } from "./types.ts";

export function loadFlowHubConfig(): FlowHubConfig {
  return {
    enabled: process.env.FLOW_HUB_ENABLED === "true",
    intervalMs: 20_000,
    maxCandidates: 20,
    dryRun: process.env.FLOW_HUB_DRY_RUN === "true",
  };
}

// ── Block Weights ──
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

// ── Direction Threshold ──
export const DIRECTION_THRESHOLD = 0.22;

// ── Penalty Values (4 groups) ──
export const PENALTY_VALUES = {
  execution: {
    slipHigh: 8,
    slipExtreme: 14,
    spreadWide: 5,
    lowFillMod: 8,
    lowFillSevere: 14,
    entryClosed: 10,
    depthCollapse: 7,
    spoof: 8,
  },
  positioning: {
    crowding: 6,
    fundingExtreme: 7,
    oiDivergence: 6,
    liqTrap: 5,
  },
  regime: {
    stress: 8,
    fakeBreak: 9,
    deadSession: 5,
    newsWindow: 8,
    weekend: 4,
  },
  conflict: {
    dirConflict: 5,
    modelAgreement: 5,
    crossFeature: 6,
    vwapCrowding: 4,
  },
} as const;

// ── Hard Gates ──
export const HARD_GATES = {
  dataHealth: 0.85,
  fillProb: 0.22,
  realizedEdge: 0.08,
  riskMax: 0.80,
} as const;

// ── Decision Thresholds (FLOW-specific from Section 17) ──
export const DECISION_THRESHOLDS = {
  confirmed: { score: 70, edge: 0.20 },
  probe: { score: 60, edge: 0.12 },
  watchlist: { score: 50 },
} as const;

// ── Entry Zone ──
export const ENTRY_ZONE_WEIGHTS = {
  vwap: 0.35,
  pullback: 0.20,
  acceptance: 0.20,
  liqReclaim: 0.15,
  ema: 0.10,
} as const;

export const ENTRY_ZONE_ATR = {
  longBias: { below: 0.40, above: 0.20 },
  shortBias: { below: 0.20, above: 0.40 },
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

// ── TP Configuration (price % — at 10x leverage: 0.3-2.0% price = 3-20% margin = $3-$20) ──
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
} as const;

// ── Regime-Dependent TP/SL Ranges (price %, scaled for 10x leverage margin limits) ──
export const REGIME_TPSL = {
  TREND:           { sl: [0.30, 0.65],  tp: [0.80, 2.00] },
  RANGE:           { sl: [0.20, 0.40],  tp: [0.30, 0.80] },
  BREAKOUT_SETUP:  { sl: [0.25, 0.55],  tp: [0.60, 1.50] },
  HIGH_STRESS:     { sl: [0.40, 0.80],  tp: [0.50, 1.00] },
  FAKE_BREAK_RISK: { sl: [0.30, 0.60],  tp: [0.40, 1.00] },
} as Record<string, { sl: number[]; tp: number[] }>;

// ── Position Sizing Tiers (aligned with FLOW decision thresholds) ──
export const SIZE_TIERS = [
  { min: 90, modifier: 1.00 },
  { min: 80, modifier: 0.85 },
  { min: 70, modifier: 0.60 },
  { min: 60, modifier: 0.35 },
] as const;

export const SIZE_MODIFIERS = {
  stressHigh: 0.50,
  weekend: 0.70,
  slipHigh: 0,        // block
  fakeBreakHigh: 0,   // block
} as const;

export const SIZE_CONFIG = {
  baseRiskPct: 0.015,
  maxMultiplier: 1.30,
} as const;

// ── Regime Multipliers ──
export const REGIME_MULTIPLIERS: Record<string, number> = {
  TREND: 1.00,
  RANGE: 0.92,
  BREAKOUT_SETUP: 0.96,
  FAKE_BREAK_RISK: 0.80,
  HIGH_STRESS: 0.75,
};

// ── Leverage (for margin % conversion) ──
export const LEVERAGE = 10;
