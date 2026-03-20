// ============================================================
// Optimizer Domain Types
// ============================================================

import type { ScoringMode } from "../scoringMode.ts";

// ── Quant Snapshot (captured at trade-open time) ─────────────

export interface QuantSnapshot {
  regime: "TREND" | "RANGE" | "MIXED" | "UNKNOWN";
  volatilityState: "LOW" | "MID" | "HIGH";
  trendStrength: "LOW" | "MID" | "HIGH";
  trendDirection: "UP" | "DOWN" | "NEUTRAL";
  marketBias: "BULL" | "BEAR" | "MIXED";
  playbook: string;
  atrPct: number;           // atrValue / closePrice
  pWin: number;             // consensus engine win probability
  expectedRR: number;       // consensus expected RR
  edgeNetR: number;         // net risk-adjusted edge
  finalScore: number;       // consensus final score (0–100)
  liquidityDensity: "LOW" | "MID" | "HIGH";
  spreadRegime: "TIGHT" | "MID" | "WIDE";
  cascadeRisk: "LOW" | "MID" | "HIGH";
  marketStress: "LOW" | "MID" | "HIGH";
  fundingBias: "BULLISH" | "BEARISH" | "NEUTRAL" | "EXTREME";
  capturedAt: string; // ISO
}

// ── Module Config (the parameters we optimize) ───────────────

export interface ModuleConfig {
  rr: number;               // TP1 multiplier (TP2 = rr * 1.25)
  slBufferFactor: number;   // ATR multiplier for SL buffer
  entryZoneFactor: number;  // ATR multiplier for symmetric entry zone (±)
  minRRFilter: number;      // Ideas below this RR are skipped
  trendFilterEnabled: boolean; // If true, skip RANGE regime ideas (for aggressive modes)
}

export const DEFAULT_MODULE_CONFIG: ModuleConfig = {
  rr: 2.0,
  slBufferFactor: 0.25,
  entryZoneFactor: 0.15,
  minRRFilter: 1.5,
  trendFilterEnabled: false,
};

// Param candidates for grid search
export const PARAM_CANDIDATES = {
  rr: [1.5, 1.75, 2.0, 2.25, 2.5, 3.0],
  slBufferFactor: [0.10, 0.15, 0.20, 0.25, 0.30],
  entryZoneFactor: [0.10, 0.12, 0.15, 0.18, 0.20],
  minRRFilter: [1.5, 1.8, 2.0],
} as const;

// ── Performance Metrics ───────────────────────────────────────

export interface PerformanceMetrics {
  tradeCount: number;
  winRate: number;      // 0–1
  totalR: number;       // sum of R (each WIN = +rr, each LOSS = -1)
  avgR: number;         // totalR / tradeCount
  profitFactor: number; // grossWin / grossLoss (0 if no losses)
  expectancy: number;   // (winRate * avgWin) - (lossRate * avgLoss)
  maxDrawdown: number;  // max consecutive R loss
  tpHitRatio: number;   // 0–1
  slHitRatio: number;   // 0–1
}

export const ZERO_METRICS: PerformanceMetrics = {
  tradeCount: 0, winRate: 0, totalR: 0, avgR: 0,
  profitFactor: 0, expectancy: 0, maxDrawdown: 0,
  tpHitRatio: 0, slHitRatio: 0,
};

// ── Segment Key ───────────────────────────────────────────────

/** e.g. "TREND_HIGH", "RANGE_LOW", "MIXED_MID" */
export type SegmentKey = string;

export function buildSegmentKey(snapshot: Pick<QuantSnapshot, "regime" | "volatilityState">): SegmentKey {
  const regime = snapshot.regime === "UNKNOWN" ? "MIXED" : snapshot.regime;
  return `${regime}_${snapshot.volatilityState}`;
}

// ── Champion / Challenger ─────────────────────────────────────

export interface ChampionState {
  config: ModuleConfig;
  metrics: PerformanceMetrics;
  promotedAt: string;
  tradeCount: number;
}

export interface ChallengerState {
  config: ModuleConfig;
  metrics: PerformanceMetrics;
  generatedAt: string;
  tradeCount: number;
}

export interface ModeOptimizerState {
  global: {
    champion: ChampionState;
    challenger: ChallengerState | null;
    history: ChampionState[]; // last N champions
  };
  segments: Record<SegmentKey, {
    champion: ChampionState;
    challenger: ChallengerState | null;
  }>;
  lastRun: string;
}

export type OptimizerConfig = Record<ScoringMode, ModeOptimizerState>;

// ── Module Weight Decision ────────────────────────────────────

export interface ModuleWeightDecision {
  mode: ScoringMode;
  weight: number;   // 0–1 (1 = full weight)
  active: boolean;
  reason: string;
  segment: SegmentKey;
}
