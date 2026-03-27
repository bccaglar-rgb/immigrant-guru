/**
 * Aggressive Mode Hub V2 — Type Definitions
 * 4-Block Architecture: MarketQuality + DirectionQuality + ExecutionQuality + EdgeQuality
 * Key difference from FLOW: 3 TP levels, lower thresholds
 */

// Re-export shared types from balanced hub
export type { HubInput } from "../balancedModeHub/types.ts";
export type { RegimeType, BiasDirection, SlippageLevel, EntryWindowState } from "../balancedModeHub/types.ts";

// ── Decision enum ──
export type AggDecision = "NO_TRADE" | "WATCHLIST" | "PROBE" | "CONFIRMED";

// ── 4 Block Results (shared with FLOW) ──

export interface MarketQualityResult {
  structure: number;
  liquidity: number;
  volatility: number;
  regimeFit: number;
  total: number;
}

export interface DirectionQualityResult {
  biasRaw: number;
  qualityScore: number;
  side: "LONG" | "SHORT" | "NONE";
  components: {
    trend: number; vwap: number; ema: number;
    levelReaction: number; orderflow: number; positioning: number;
  };
}

export interface ExecutionQualityResult {
  fill: number; slippage: number; spread: number;
  depth: number; obStability: number; entryTiming: number;
  total: number;
}

export interface EdgeQualityResult {
  expectedEdgeR: number;
  realizedEdgeProxy: number;
  edgeValue: number;
  rrQuality: number;
  winModelAgreement: number;
  exitReliability: number;
  total: number;
}

// ── Penalty Bundle (4 groups) ──
export interface PenaltyGroup {
  total: number;
  items: Array<{ name: string; value: number }>;
}

export interface PenaltyBundle {
  execution: PenaltyGroup;
  positioning: PenaltyGroup;
  regime: PenaltyGroup;
  conflict: PenaltyGroup;
  totalPenalty: number;
}

// ── Multiplier Set ──
export interface MultiplierSet {
  regime: number; dataHealth: number; session: number; confidence: number; combined: number;
}

// ── Entry Zone ──
export interface EntryZoneResult {
  mid: number; low: number; high: number;
}

// ── Hard Gate Result ──
export interface HardGateResult {
  allPassed: boolean; hardFail: boolean; softBlock: boolean;
  failedGates: string[]; blockedGates: string[];
}

// ── Regime Result ──
export interface AggRegimeResult {
  regime: import("../balancedModeHub/types.ts").RegimeType;
  multiplier: number;
  rawScore: number;
}

// ── TP/SL Result (AGG: 3 TP levels) ──
export interface AggTpSlResult {
  entryZone: [number, number];
  tp: number;              // tp1 (main target)
  tp2: number;             // second target
  tp3: number;             // third target
  sl: number;
  tpPricePct: number;     // TP1 price %
  tp2PricePct: number;
  tp3PricePct: number;
  slPricePct: number;
  tpMarginPct: number;    // margin ROI % (compat)
  slMarginPct: number;
  riskRewardRatio: number;
  tpComposite: number;
  rawSLSource: string;
  tpLevels: number[];     // [tp1, tp2, tp3] for idea creator
}

// ── Position Sizing ──
export interface AggPositionResult {
  tier: string;
  modifier: number;
  final: number;
  blocked: boolean;
  blockReason: string;
  riskPct: number;
  reasons: string[];
}

// ── Full Hub Output ──
export interface AggHubOutput {
  symbol: string;
  timeframe: string;
  cycleId: string;
  processedAt: number;
  price: number;
  adjustedScore: number;
  decision: AggDecision;
  direction: "LONG" | "SHORT" | "NONE";

  // V2 block results
  marketQuality: MarketQualityResult;
  directionQuality: DirectionQualityResult;
  executionQuality: ExecutionQualityResult;
  edgeQuality: EdgeQualityResult;

  // V2 penalty + multiplier + gates
  penalties: PenaltyBundle;
  multipliers: MultiplierSet;
  gates: HardGateResult;
  regimeInfo: AggRegimeResult;

  // TP/SL + sizing
  tpSl: AggTpSlResult | null;
  positionSize: AggPositionResult;
  reasons: string[];

  // Backward compat fields
  coreScore: { total: number };
  bias: { score: number; direction: string; confidence: number };
  edge: { expectedEdge: number; riskAdjustedEdge: number; pWin: number; avgWinR: number; costR: number };
  penalty: { total: number; breakdown: Record<string, number> };
  regime: { regime: string; multiplier: number; rawScore: number };
  execution: { score: number; blocked: boolean };
  gates_compat: { allPassed: boolean; failedGates: string[]; maxDecision: string };
}

// ── Config ──
export interface AggHubConfig {
  enabled: boolean;
  intervalMs: number;
  maxCandidates: number;
  dryRun: boolean;
}
