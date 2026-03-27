/**
 * Capital Guard Mode Hub — Types (v4: 5-Block Scoring)
 *
 * "Onc kaybi engelle, sonra edge ara."
 * (First prevent loss, then look for edge.)
 *
 * 5-block system: MQ(22%) + DQ(16%) + EQ(24%) + EdgeQ(18%) + CP(20%)
 * CP = Capital Protection Score — unique to CG mode.
 */

// ── Re-export shared base types from balanced hub ───────────────
export type {
  HubInput,
  SlippageLevel,
  EntryWindowState,
  RegimeType,
  BiasDirection,
  RegimeResult,
  BiasResult,
  ExecutionResult,
  EdgeResult,
  TpSlResult,
  PositionSizeResult,
} from "../balancedModeHub/types.ts";

import type {
  HubInput,
  RegimeType,
  BiasDirection,
  RegimeResult,
  BiasResult,
  ExecutionResult,
  EdgeResult,
  TpSlResult,
  PositionSizeResult,
} from "../balancedModeHub/types.ts";

// ── CG Decision = same 4 levels as Balanced ─────────────────────
export type CgHubDecision = "NO_TRADE" | "WATCHLIST" | "PROBE" | "CONFIRMED";

// ── Capital Protection Score (unique to CG) ─────────────────────
export interface CapitalProtectionResult {
  score: number;                 // 0-100
  stopIntegrity: number;         // 0-100, weight 0.28
  drawdownContainment: number;   // 0-100, weight 0.24
  invalidationClarity: number;   // 0-100, weight 0.18
  regimeSafety: number;          // 0-100, weight 0.14
  adverseMoveResilience: number; // 0-100, weight 0.16
}

// ── 5-Block scoring result ──────────────────────────────────────
export interface CgBlockScoreResult {
  MQ: number;      // Market Quality 0-100       (weight 0.22)
  DQ: number;      // Direction Quality 0-100     (weight 0.16)
  EQ: number;      // Execution Quality 0-100     (weight 0.24)
  EdgeQ: number;   // Edge Quality 0-100          (weight 0.18)
  CP: number;      // Capital Protection 0-100    (weight 0.20)
  total: number;   // Weighted sum
}

// ── Gate Check Result (CG-specific with CgHubDecision) ──────────
export interface CgGateCheckResult {
  allPassed: boolean;
  failedGates: string[];
  maxDecision: CgHubDecision;
}

// ── Soft Block Result ───────────────────────────────────────────
export interface CgSoftBlockResult {
  triggered: boolean;
  reasons: string[];
  maxDecision: CgHubDecision;
}

// ── 5 Penalty Groups (adds CapitalPreservation) ─────────────────
export interface CgPenaltyGroupResult {
  execution: { total: number; breakdown: Record<string, number> };
  positioning: { total: number; breakdown: Record<string, number> };
  regime: { total: number; breakdown: Record<string, number> };
  conflict: { total: number; breakdown: Record<string, number> };
  capitalPreservation: { total: number; breakdown: Record<string, number> };
  grandTotal: number;
}

// ── Final Score Output ──────────────────────────────────────────
export interface CgFinalScoreOutput {
  adjustedScore: number;
  decision: CgHubDecision;
  direction: BiasDirection;
  reasons: string[];
}

// ── CG Hub Output (full pipeline result per symbol) ─────────────
export interface CgHubOutput {
  symbol: string;
  timeframe: string;
  mode: "CAPITAL_GUARD";
  price: number;
  blockScores: CgBlockScoreResult;
  capitalProtection: CapitalProtectionResult;
  regime: RegimeResult;
  bias: BiasResult;
  execution: ExecutionResult;
  edge: EdgeResult;
  gates: CgGateCheckResult;
  softBlocks: CgSoftBlockResult;
  penalty: CgPenaltyGroupResult;
  adjustedScore: number;
  decision: CgHubDecision;
  direction: BiasDirection;
  tpSl: TpSlResult | null;
  positionSize: PositionSizeResult;
  reasons: string[];
  processedAt: number;
  cycleId: string;
  // Backward compat for hubIdeaCreator
  coreScore: { total: number };
}

// ── Config ──────────────────────────────────────────────────────
export interface CgHubConfig {
  enabled: boolean;
  intervalMs: number;
  maxCandidates: number;
  minDataHealth: number;
  minFillProbability: number;
  minExpectedEdge: number;
  dryRun: boolean;
}
