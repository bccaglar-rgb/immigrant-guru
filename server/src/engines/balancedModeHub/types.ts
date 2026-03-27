/**
 * Balanced Mode Hub — Types (v4: 4-Block Scoring)
 *
 * All interfaces for the 13-layer scoring & decision pipeline.
 * 4-block system: MQ(26%) + DQ(24%) + EQ(22%) + EdgeQ(28%)
 */

// ── Enums ────────────────────────────────────────────────────────

export type RegimeType = "TREND" | "RANGE" | "BREAKOUT_SETUP" | "FAKE_BREAK_RISK" | "HIGH_STRESS";
export type HubDecision = "NO_TRADE" | "WATCHLIST" | "PROBE" | "CONFIRMED";
export type BiasDirection = "LONG" | "SHORT" | "NONE";
export type SlippageLevel = "LOW" | "MODERATE" | "HIGH";
export type EntryWindowState = "OPEN" | "NARROW" | "CLOSING" | "CLOSED";

// ── Raw data shape ──────────────────────────────────────────────

export type QS = Record<string, unknown>;

// ── Hub Input (from flat flow_signals + quant_snapshot) ─────────

export interface HubInput {
  symbol: string;
  timeframe: string;
  price: number;

  /* Structure / Market Quality */
  htfTrend: number;           // 0-1 from trendStrength
  emaAlignment: number;       // 0-1
  vwapPosition: string;       // ABOVE/BELOW/AT
  trendStrength: number;      // 0-1
  compression: number;        // 0-1
  regime: string;             // RANGE/TREND/BREAKOUT/etc.
  levelReaction: number;      // 0-1
  midRangeTrap: number;       // 0-1
  trendMaturity: number;      // 0-1
  weakAcceptance: number;     // 0-1
  chasedEntry: number;        // 0-1

  /* Liquidity */
  poolProximity: number;      // 0-1
  sweepReclaim: number;       // 0-1
  liquidityDensity: number;   // 0-1
  obStability: number;        // 0-1
  spoofRisk: number;          // 0-1
  depthQuality: number;       // 0-1
  spreadTightness: number;    // 0-1
  failedSweep: number;        // 0-1

  /* Positioning / Direction Quality */
  oiConfirm: number;          // 0-1
  volumeConfirm: number;      // 0-1
  fundingHealthy: number;     // 0-1
  crowdingLow: number;        // 0-1
  liqBiasFit: number;         // 0-1
  oiDivergence: number;       // 0-1
  crowdingHigh: number;       // 0-1
  spotDerivDivergence: number; // 0-1
  weakParticipation: number;  // 0-1

  /* Volatility */
  compressionActive: boolean;
  expansionProbability: number; // 0-1
  atrFit: number;             // 0-1
  speedHealthy: number;       // 0-1
  suddenMoveRisk: number;     // 0-1
  fakeBreakRisk: number;      // 0-1
  deadVolatility: number;     // 0-1

  /* Execution Quality */
  entryWindowState: EntryWindowState;
  fillProbability: number;    // 0-1
  slippage: SlippageLevel;
  spreadScore: number;        // 0-1
  depthScore: number;         // 0-1
  capacityScore: number;      // 0-1
  spoofDetected: boolean;

  /* Risk & Data */
  riskScore: number;          // 0-1
  dataHealthScore: number;    // 0-1
  tradeValidity: string;

  /* Edge */
  pWin: number;               // 0-1
  avgWinR: number;            // expected RR
  costR: number;              // cost in R terms

  /* Regime helpers */
  atrPct: number;
  timeInRange: number;        // 0-1
  vwapBehavior: number;       // -1 to 1

  /* Bias helpers */
  trendDirBias: number;       // -1 to 1
  vwapBias: number;           // -1 to 1
  emaBias: number;            // -1 to 1
  levelReactionBias: number;  // -1 to 1
  orderflowBias: number;      // -1 to 1
  positioningBias: number;    // -1 to 1

  /* Levels (for TP/SL) */
  swingLow: number;
  swingHigh: number;
  nearestSupport: number;
  nearestResistance: number;
  entryZone: [number, number];
  nearestLiquidity: number;
  htfLevel: number;

  /* Sub-scores (for display) */
  structureScore: number;
  liquidityScore: number;
  positioningScore: number;
  executionScore: number;
}

// ── Pipeline Results ────────────────────────────────────────────

/** 4-block scoring result: MQ + DQ + EQ + EdgeQ */
export interface BlockScoreResult {
  MQ: number;      // Market Quality 0-100
  DQ: number;      // Direction Quality 0-100
  EQ: number;      // Execution Quality 0-100
  EdgeQ: number;   // Edge Quality 0-100
  total: number;   // Weighted sum: 0.26*MQ + 0.24*DQ + 0.22*EQ + 0.28*EdgeQ
}

export interface RegimeResult {
  regime: RegimeType;
  multiplier: number;
  rawScore: number;
}

export interface BiasResult {
  score: number;          // -1 to +1
  direction: BiasDirection;
  confidence: number;     // 0-1
}

export interface ExecutionResult {
  score: number;          // 0-100
  blocked: boolean;
  reason?: string;
}

export interface EdgeResult {
  expectedEdge: number;   // in R terms
  riskAdjustedEdge: number;
  edgeNetR: number;       // (pWin * avgWinR) - ((1-pWin) * lossR) - costR
  pWin: number;
  avgWinR: number;
  costR: number;
}

export interface GateCheckResult {
  allPassed: boolean;
  failedGates: string[];
  maxDecision: HubDecision;
}

export interface SoftBlockResult {
  triggered: boolean;
  reasons: string[];
  maxDecision: HubDecision;
}

/** 4 penalty groups with per-group caps */
export interface PenaltyGroupResult {
  execution: { total: number; breakdown: Record<string, number> };
  positioning: { total: number; breakdown: Record<string, number> };
  regime: { total: number; breakdown: Record<string, number> };
  conflict: { total: number; breakdown: Record<string, number> };
  grandTotal: number;
}

export interface TpSlResult {
  entryZone: [number, number];
  tp: number;              // single take-profit price
  sl: number;              // single stop-loss price
  tpMarginPct: number;     // TP as margin ROI % (3-20 range)
  slMarginPct: number;     // SL as margin loss % (2-8 range)
  riskRewardRatio: number;
}

export interface PositionSizeResult {
  sizeMultiplier: number;   // 0-1.00
  confidenceTier: string;
  riskPct: number;
  reasons: string[];
}

export interface FinalScoreOutput {
  adjustedScore: number;
  decision: HubDecision;
  direction: BiasDirection;
  reasons: string[];
}

// ── Hub Output (full pipeline result per symbol) ────────────────

export interface HubOutput {
  symbol: string;
  timeframe: string;
  mode: "BALANCED";
  price: number;
  blockScores: BlockScoreResult;
  regime: RegimeResult;
  bias: BiasResult;
  execution: ExecutionResult;
  edge: EdgeResult;
  gates: GateCheckResult;
  softBlocks: SoftBlockResult;
  penalty: PenaltyGroupResult;
  adjustedScore: number;
  decision: HubDecision;
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

export interface BalancedHubConfig {
  enabled: boolean;
  intervalMs: number;
  maxCandidates: number;
  minDataHealth: number;
  minFillProbability: number;
  minExpectedEdge: number;
  dryRun: boolean;
}
