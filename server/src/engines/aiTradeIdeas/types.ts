import type { ScoringMode } from "../../services/scoringMode.ts";

// ── Feature flag + operational config ──────────────────────────
export interface AiEngineConfig {
  enabled: boolean;
  intervalMs: number;
  maxCandidatesForAi: number;
  aiProvider: "CHATGPT" | "QWEN" | "QWEN2" | "CLAUDE";
  aiModel: string;
  aiTimeoutMs: number;
  aiTemperature: number;
  aiMaxTokens: number;
  minQuantScore: number;
  minRR: number;
  softDowngradeThreshold: number;
  staleCacheMaxAgeMs: number;
  userId: string;
  dryRun: boolean;
  /** Override prompt style independently of aiProvider.
   *  "STRUCTURED" forces ChatGPT-style structured evaluation prompt.
   *  "AXIOM" forces Axiom master trader prompt.
   *  "QWEN_FREE" forces free evaluation prompt.
   *  "PRIME" forces strategic evaluator prompt (regime-first, conviction-based).
   *  "ALPHA" forces quantitative edge prompt (numbers-first, EV-based).
   *  "CLOUD_FLOW" forces flow/microstructure specialist prompt.
   *  When omitted, prompt style is derived from aiProvider. */
  promptStyle?: "STRUCTURED" | "AXIOM" | "QWEN_FREE" | "PRIME" | "ALPHA" | "CLOUD_FLOW";
}

// ── Normalized candidate from quant scan ───────────────────────
export interface AiEngineCandidate {
  symbol: string;
  mode: ScoringMode;
  quantScore: number;        // scorePct 0-100
  decision: string;          // "TRADE" | "WATCH" | "NO_TRADE"
  direction: string;         // "LONG" | "SHORT" | "NEUTRAL"
  tradeValidity: string;
  entryWindow: string;
  slippageRisk: string;
  setup: string;
  entryLow: number;
  entryHigh: number;
  slLevels: number[];
  tpLevels: number[];
  horizon: string;
  timeframe: string;
  modeScores: Partial<Record<ScoringMode, number>>;
  pricePrecision: number;
  scannedAt: number;
  // Quant snapshot (for market_state enrichment & Optimizer P4 compat)
  quantSnapshot?: Record<string, unknown>;
  // FLOW GOLD SETUP signals (all 5 signal groups + consensus metrics)
  flowSignals?: Record<string, unknown>;
  // Computed
  entryMid: number;
  riskR: number;             // |entryMid - SL1|
  rewardR: number;           // |TP1 - entryMid|
  rrRatio: number;           // rewardR / riskR
}

// ── Gate evaluation ────────────────────────────────────────────
export type GateVerdict = "PASS" | "VETO" | "DOWNGRADE";

export interface GateResult {
  candidate: AiEngineCandidate;
  verdict: GateVerdict;
  hardVetoReasons: string[];
  softFlags: string[];
  adjustedScore: number;
}

// ── Ranked candidate ───────────────────────────────────────────
export interface RankedCandidate {
  candidate: AiEngineCandidate;
  rank: number;
  compositeScore: number;
  softFlags: string[];
  adjustedScore: number;
}

// ── AI evaluation request (what goes to LLM) ──────────────────
export interface AiEvaluationRequest {
  symbol: string;
  direction: string;
  quantScore: number;
  mode: ScoringMode;
  entryLow: number;
  entryHigh: number;
  slLevels: number[];
  tpLevels: number[];
  rrRatio: number;
  horizon: string;
  timeframe: string;
  setup: string;
  tradeValidity: string;
  entryWindow: string;
  slippageRisk: string;
  softFlags: string[];
}

// ── AI response (parsed) ──────────────────────────────────────
export interface AiEvaluationResponse {
  symbol: string;
  verdict: "APPROVE" | "DOWNGRADE" | "REJECT";
  confidence: number;        // 0-100
  adjustedDirection: "LONG" | "SHORT";
  adjustedEntryLow: number;
  adjustedEntryHigh: number;
  adjustedSlLevels: number[];
  adjustedTpLevels: number[];
  riskFlags: string[];
  comment: string;           // Turkish, max 60 words
  reasoning: string;         // English, max 100 words
  // Axiom-specific analysis (populated when provider=QWEN2)
  axiomAnalysis?: AxiomAnalysis;
  // Structured evaluation fields (populated when using structured prompt v2)
  tradeQuality?: string;              // HIGH | MEDIUM | LOW
  directionConfidence?: string;       // STRONG | MODERATE | WEAK
  entryQuality?: string;              // GOOD | FAIR | POOR
  riskQuality?: string;               // GOOD | FAIR | POOR
  scoreInflationRisk?: string;        // NONE | LOW | MEDIUM | HIGH
  strongestSupporting?: string[];     // top 3 supporting factors
  strongestInvalidation?: string[];   // top 2 invalidation factors
  duplicatedSignals?: string[];       // duplicated signal groups
  missingConfirmations?: string[];    // missing confirmation signals
  entryActionableNow?: boolean;       // is entry actionable right now
  pullbackBetterThanMarket?: boolean; // pullback entry preferred
  aiIndependentScore?: number;        // 0-100 independent AI score
  scoreAdjustment?: number;           // recommended score adjustment
}

// ── Axiom Analysis (QWEN2 provider enrichment) ───────────────
export interface AxiomAnalysis {
  regime: string;              // "trend_up" | "range" | "transition" etc.
  primaryThesis: string;       // One-line trade rationale
  entryType: string;           // "pullback" | "breakout" | "reclaim" etc.
  entryCondition: string;      // Condition for entry activation
  invalidation: string;        // When thesis is invalid
  notes: string[];             // AI notes and warnings
  bullishScore: number;        // 0-1 weighted bullish alignment
  bearishScore: number;        // 0-1 weighted bearish alignment
  rrEstimate: number;          // AI-computed risk/reward ratio
  tp1: number;                 // Take profit level 1 (40%)
  tp2: number;                 // Take profit level 2 (35%)
  tp3: number;                 // Take profit level 3 (25%)
}

// ── Validated output ──────────────────────────────────────────
export interface ValidatedResult {
  candidate: AiEngineCandidate;
  aiResponse: AiEvaluationResponse;
  finalScore: number;
  finalDecision: "TRADE" | "WATCH" | "NO_TRADE";
  finalDirection: "LONG" | "SHORT";
  entryLow: number;
  entryHigh: number;
  slLevels: number[];
  tpLevels: number[];
  // Axiom-specific analysis carried through from AI response
  axiomAnalysis?: AxiomAnalysis;
}

// ── Cycle metrics ─────────────────────────────────────────────
export interface CycleMetrics {
  cycleId: string;
  startedAt: number;
  completedAt: number;
  durationMs: number;
  quantCandidates: number;
  afterGate: number;
  sentToAi: number;
  aiApproved: number;
  aiDowngraded: number;
  aiRejected: number;
  persisted: number;
  errors: string[];
}

// ── AI call result ────────────────────────────────────────────
export interface AiCallResult {
  ok: boolean;
  raw?: string;
  error?: string;
  provider?: string;
  latencyMs?: number;
}
