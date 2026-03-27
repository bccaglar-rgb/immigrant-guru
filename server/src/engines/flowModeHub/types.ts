/**
 * Flow Mode Hub V2 — Type Definitions
 * 4-Block Architecture: MarketQuality + DirectionQuality + ExecutionQuality + EdgeQuality
 */

// Re-export shared types from balanced hub
export type { HubInput } from "../balancedModeHub/types.ts";
export type { RegimeType, BiasDirection, SlippageLevel, EntryWindowState } from "../balancedModeHub/types.ts";

// ── Decision enum ──
export type FlowDecision = "NO_TRADE" | "WATCHLIST" | "PROBE" | "CONFIRMED";

// ── 4 Block Results ──

export interface MarketQualityResult {
  structure: number;    // 0-100
  liquidity: number;    // 0-100
  volatility: number;   // 0-100
  regimeFit: number;    // 0-100
  total: number;        // weighted composite 0-100
}

export interface DirectionQualityResult {
  biasRaw: number;      // -1 to +1
  qualityScore: number; // 0-100 = 50 + 50*|biasRaw|
  side: "LONG" | "SHORT" | "NONE";
  components: {
    trend: number;
    vwap: number;
    ema: number;
    levelReaction: number;
    orderflow: number;
    positioning: number;
  };
}

export interface ExecutionQualityResult {
  fill: number;         // 0-100
  slippage: number;     // 0-100
  spread: number;       // 0-100
  depth: number;        // 0-100
  obStability: number;  // 0-100
  entryTiming: number;  // 0-100
  total: number;        // weighted composite 0-100
}

export interface EdgeQualityResult {
  expectedEdgeR: number;      // raw expected edge in R
  realizedEdgeProxy: number;  // adjusted edge
  edgeValue: number;          // 0-100 mapped
  rrQuality: number;          // 0-100
  winModelAgreement: number;  // 0-100
  exitReliability: number;    // 0-100
  total: number;              // weighted composite 0-100
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
  regime: number;
  dataHealth: number;
  session: number;
  confidence: number;
  combined: number;
}

// ── Entry Zone ──

export interface EntryZoneResult {
  mid: number;
  low: number;
  high: number;
}

// ── Hard Gate Result ──

export interface HardGateResult {
  allPassed: boolean;
  hardFail: boolean;
  softBlock: boolean;
  failedGates: string[];
  blockedGates: string[];
}

// ── Regime Result ──

export interface FlowRegimeResult {
  regime: import("../balancedModeHub/types.ts").RegimeType;
  multiplier: number;
  rawScore: number;
}

// ── TP/SL Result (compatible with hubIdeaCreator) ──

export interface FlowTpSlResult {
  entryZone: [number, number];
  tp: number;
  sl: number;
  tpPricePct: number;      // TP as price % from entry
  slPricePct: number;      // SL as price % from entry
  tpMarginPct: number;     // margin ROI % (compat)
  slMarginPct: number;     // margin loss % (compat)
  riskRewardRatio: number;
  tpComposite: number;     // raw composite for diagnostics
  rawSLSource: string;     // what determined SL
}

// ── Position Sizing ──

export interface FlowPositionResult {
  tier: string;
  modifier: number;
  final: number;
  blocked: boolean;
  blockReason: string;
  riskPct: number;
  reasons: string[];
}

// ── Full Hub Output ──

export interface FlowHubOutput {
  symbol: string;
  timeframe: string;
  cycleId: string;
  processedAt: number;
  price: number;
  adjustedScore: number;
  decision: FlowDecision;
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
  regimeInfo: FlowRegimeResult;

  // TP/SL + sizing
  tpSl: FlowTpSlResult | null;
  positionSize: FlowPositionResult;
  reasons: string[];

  // Backward compat fields for hubPublisher + hubIdeaCreator
  coreScore: { total: number };
  bias: { score: number; direction: string; confidence: number };
  edge: { expectedEdge: number; riskAdjustedEdge: number; pWin: number; avgWinR: number; costR: number };
  penalty: { total: number; breakdown: Record<string, number> };
  regime: { regime: string; multiplier: number; rawScore: number };
  execution: { score: number; blocked: boolean };
  gates_compat: { allPassed: boolean; failedGates: string[]; maxDecision: string };
}

// ── Config ──

export interface FlowHubConfig {
  enabled: boolean;
  intervalMs: number;
  maxCandidates: number;
  dryRun: boolean;
}
