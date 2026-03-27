/**
 * Bitrium Prime AI Hub — Type Definitions
 *
 * 3-Layer Architecture:
 *   Layer 1: System prompt (immutable AI personality + scoring rules)
 *   Layer 2: Code enforcement (hard gates, TP/SL clamps, score verification)
 *   Layer 3: Runtime prompt + structured JSON payload per coin
 *
 * AI is the PRIMARY scorer computing 4-block scores.
 * Code ENFORCES/VALIDATES everything.
 */

// Re-export shared types
export type { HubInput } from "../balancedModeHub/types.ts";
export type { RegimeType, BiasDirection, SlippageLevel, EntryWindowState } from "../balancedModeHub/types.ts";

// ── Decision Types ──

export type PrimeAiDecision = "NO_TRADE" | "WATCHLIST" | "PROBE" | "CONFIRMED";
export type PrimeAiSide = "LONG" | "SHORT" | "NONE";

// ── Structured Input (sent to AI per coin) ──

export interface PrimeAiCoinInput {
  symbol: string;
  timeframe: string;
  price: number;
  vwap: number;
  emas: { ema9: number; ema21: number; ema50: number; ema200: number };
  atr: { value: number; percentile: number; regime: string };

  htfTrend: {
    bias: string;        // BULLISH/BEARISH/NEUTRAL
    strength: number;    // 0-1
    alignment: number;   // 0-1
  };

  marketStructure: {
    regime: string;           // TREND/RANGE/BREAKOUT_SETUP/HIGH_STRESS/FAKE_BREAK_RISK
    trendDirection: string;   // UP/DOWN/NEUTRAL
    trendStrength: number;    // 0-1
    emaAlignment: string;     // BULL/BEAR/MIXED
    timeInRange: number;      // 0-1
  };

  liquidity: {
    sweep: boolean;
    reclaim: boolean;
    pool: number;             // 0-1 proximity
    spoof: number;            // 0-1 risk
    absorption: number;       // 0-1
    depth: number;            // 0-1
    spread: number;           // 0-1
    obImbalance: string;      // BUY/SELL/NEUTRAL
  };

  volatility: {
    atrPercentile: number;    // 0-1
    compression: boolean;
    expansion: number;        // 0-1 probability
    deadRisk: number;         // 0-1
    suddenRisk: number;       // 0-1
    regime: string;           // LOW/NORMAL/HIGH
  };

  regime: {
    type: string;             // same as marketStructure.regime
    fakeBreakProb: number;    // 0-1
    stress: number;           // 0-1
    multipliers: {
      session: number;
      volatility: number;
      regime: number;
    };
  };

  execution: {
    fillProb: number;         // 0-1
    slippage: string;         // LOW/MODERATE/HIGH
    spread: number;           // 0-1
    depth: number;            // 0-1
    obStability: number;      // 0-1
    entryWindow: string;      // OPEN/CLOSING/CLOSED
    timing: string;           // GOOD/FAIR/POOR
  };

  positioning: {
    funding: number;          // -1 to 1
    crowding: number;         // 0-1
    oiDivergence: number;     // 0-1
    bias: string;             // BULLISH/BEARISH/NEUTRAL
  };

  edgeModel: {
    pWin: number;             // 0-1
    avgWinR: number;          // expected RR
    lossR: number;            // 1.0 (standard)
    costR: number;            // cost in R terms
    exitReliability: number;  // 0-1
    rrQuality: number;        // 0-100
    winModelAgreement: number; // 0-100
  };

  session: {
    name: string;             // ASIAN/LONDON/NY/WEEKEND
    multiplier: number;
    thinLiquidity: boolean;
  };

  dataHealth: {
    completeness: number;     // 0-1
    staleFeed: boolean;
    degradedFeeds: string[];
  };

  riskGate: {
    hardFail: boolean;
    reasons: string[];
  };

  tradeValidity: string;      // VALID/STRONG/WEAK/INVALID/NO-TRADE

  levels: {
    pullback: number;
    acceptance: number;
    reclaim: number;
    swingHigh: number;
    swingLow: number;
    support: number;
    resistance: number;
  };
}

// ── AI Output (what AI returns per coin — strict schema) ──

export interface PrimeAiCoinOutput {
  symbol: string;
  side: PrimeAiSide;
  decision: PrimeAiDecision;
  finalScore: number;          // 0-100
  blockScores: {
    MQ: number;                // Market Quality 0-100
    DQ: number;                // Direction Quality 0-100
    EQ: number;                // Execution Quality 0-100
    EdgeQ: number;             // Edge Quality 0-100
  };
  penaltyGroups: {
    execution: number;
    positioning: number;
    regime: number;
    conflict: number;
  };
  entryZone: [number, number]; // [low, high]
  stopLoss: number;            // price
  takeProfit: number;          // price
  sizeMultiplier: number;      // 0-2
  reasons: string[];           // max 5
  hardFail: boolean;
  softBlock: boolean;
  confidence: number;          // 0-100 (AI's subjective conviction, separate from score)
  whyTrade: string;
  whyNotTrade: string;
  dominantRisk: string;
  dominantEdge: string;
  engineVersion: string;       // "prime_ai_v1"
}

// ── AI Full Response Wrapper ──

export interface PrimeAiResponse {
  evaluations: PrimeAiCoinOutput[];
}

// ── Enforced Result (after code enforcement) ──

export interface EnforcedOverride {
  field: string;
  from: unknown;
  to: unknown;
  reason: string;
}

export interface EnforcedResult {
  coin: PrimeAiCoinInput;
  aiOutput: PrimeAiCoinOutput;
  enforced: {
    side: PrimeAiSide;
    decision: PrimeAiDecision;
    finalScore: number;
    blockScores: PrimeAiCoinOutput["blockScores"];
    stopLoss: number;
    takeProfit: number;
    slPct: number;
    tpPct: number;
    hardFail: boolean;
    softBlock: boolean;
    overrides: EnforcedOverride[];
  };
}

// ── Prime AI Hub Output (full pipeline result — backward compat for hubIdeaCreator) ──

export interface PrimeAiHubOutput {
  symbol: string;
  timeframe: string;
  price: number;
  adjustedScore: number;
  decision: string;
  direction: string;
  tpSl: {
    entryZone: [number, number];
    tp: number;
    sl: number;
    tpMarginPct: number;
    slMarginPct: number;
    riskRewardRatio: number;
  } | null;
  reasons: string[];
  regime: { regime: string };
  coreScore: { total: number };
  edge: { expectedEdge: number };
  processedAt: number;

  // Prime AI specific
  cycleId: string;
  confidence: number;
  blockScores: PrimeAiCoinOutput["blockScores"];
  penaltyGroups: PrimeAiCoinOutput["penaltyGroups"];
  whyTrade: string;
  whyNotTrade: string;
  dominantRisk: string;
  dominantEdge: string;
  engineVersion: string;
  overrides: EnforcedOverride[];
  positionSize: number;
}

// ── Configuration ──

export interface PrimeAiConfig {
  enabled: boolean;
  intervalMs: number;
  maxCoins: number;
  timeoutMs: number;
  temperature: number;
  maxTokens: number;
  model: string;
  dryRun: boolean;
  apiKey: string;

  // Decision thresholds
  thresholds: {
    confirmed: { score: number; edge: number };
    probe: { score: number; edge: number };
    watchlist: { score: number };
  };

  // Daily limits
  limits: {
    maxConfirmedPerDay: number;
    maxProbePerDay: number;
    cooldownMinutes: number;
    revengeBlockMinutes: number;
    duplicateFilterMinutes: number;
  };

  // Clamps
  clamps: {
    sl: [number, number];  // [min%, max%]
    tp: [number, number];  // [min%, max%]
  };

  // Hard gates
  gates: {
    dataHealth: number;
    fillProb: number;
    realizedEdge: number;
    biasThreshold: number;
  };
}

// ── Cycle Metrics ──

export interface PrimeAiCycleMetrics {
  cycleId: string;
  startMs: number;
  endMs: number;
  llmLatencyMs: number;
  coinsEvaluated: number;
  confirmed: number;
  probe: number;
  watchlist: number;
  noTrade: number;
  overrideCount: number;
  cooldownBlocked: number;
  ideasCreated: number;
  errors: string[];
}

// ── LLM Call Result ──

export interface PrimeAiCallResult {
  ok: boolean;
  raw?: string;
  error?: string;
  latencyMs: number;
}

// ── Cooldown Check Result ──

export interface CooldownCheckResult {
  allowed: boolean;
  reason?: string;
}

// ── Snapshot (for DB persistence) ──

export interface PrimeAiSnapshot {
  id: string;
  cycleId: string;
  symbol: string;
  side: string;
  decision: string;
  finalScore: number;
  mqScore: number;
  dqScore: number;
  eqScore: number;
  edgeQScore: number;
  confidence: number;
  penaltyTotal: number;
  entryLow: number;
  entryHigh: number;
  sl: number;
  tp: number;
  slPct: number;
  tpPct: number;
  hardFail: boolean;
  softBlock: boolean;
  codeOverrides: EnforcedOverride[];
  whyTrade: string;
  whyNotTrade: string;
  dominantRisk: string;
  dominantEdge: string;
  aiRaw: PrimeAiCoinOutput;
  inputData: PrimeAiCoinInput;
  engineVersion: string;
  createdAt: string;
}
