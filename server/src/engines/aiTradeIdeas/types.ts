import type { ScoringMode } from "../../services/scoringMode.ts";

// ── Feature flag + operational config ──────────────────────────
export interface AiEngineConfig {
  enabled: boolean;
  intervalMs: number;
  maxCandidatesForAi: number;
  aiProvider: "CHATGPT" | "QWEN" | "QWEN2";
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
  comment: string;           // Turkish, max 50 words
  reasoning: string;         // English, max 80 words
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
