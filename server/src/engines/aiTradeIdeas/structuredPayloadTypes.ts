/**
 * Structured AI Payload Types
 *
 * 3-layer structured data format for AI trade evaluation:
 *   Layer 1: Decision summary (market metadata + core decision + trade plan + core metrics)
 *   Layer 2: Group scores (8 groups) + penalty groups (4 groups) + model agreement
 *   Layer 3: Raw signals with feature roles + completeness + contradiction map
 */

// ── Feature role for each signal ────────────────────────────────
export type SignalRole = "primary" | "supporting" | "contextual" | "informational";

export interface RawSignalEntry {
  value: unknown;
  role: SignalRole;
}

// ── Layer 1: Decision Summary ───────────────────────────────────

export interface AiPayloadMarket {
  symbol: string;
  venue: string;
  timeframe: string;
  price: number;
  mode: string;
}

export interface AiPayloadDecision {
  final_score: number;          // 0-100
  decision: string;             // TRADE | WATCH | NO_TRADE
  bias: string;                 // LONG | SHORT | NEUTRAL
  direction: string;            // LONG | SHORT
  intent: string;               // setup / playbook name
  urgency: string;              // ACT | WAIT | CLOSED
  trade_validity: string;       // VALID | WEAK | NO-TRADE
  conflict_level: string;       // LOW | MID | HIGH
}

export interface AiPayloadTradePlan {
  entry_zone: [number, number];
  stop_levels: number[];
  targets: number[];
  rr_ratio: number;
  horizon: string;              // SCALP | INTRADAY | SWING
}

export interface AiPayloadCoreMetrics {
  p_win: number;
  expected_rr: number;
  edge_net_r: number;
  fill_probability: number;
  capacity: number;
  slippage_risk: string;
}

// ── Layer 2: Group Scores ───────────────────────────────────────

export interface GroupScoreDetail {
  score: number;                // 0-100
  weight: number;               // 0-1
  completeness: number;         // 0-1 (% of available signals)
  signals: Record<string, RawSignalEntry>;
}

export interface AiPayloadGroupScores {
  structure: GroupScoreDetail;
  liquidity: GroupScoreDetail;
  positioning: GroupScoreDetail;
  execution: GroupScoreDetail;
  volatility: GroupScoreDetail;
  risk_environment: GroupScoreDetail;
  data_health: GroupScoreDetail;
  onchain_context: GroupScoreDetail;
}

// ── Layer 2: Penalty Groups ─────────────────────────────────────

export interface PenaltyGroupDetail {
  score_impact: number;         // total penalty points
  drivers: string[];            // human-readable reasons
}

export interface AiPayloadPenaltyGroups {
  execution_penalty: PenaltyGroupDetail;
  risk_penalty: PenaltyGroupDetail;
  data_penalty: PenaltyGroupDetail;
  context_penalty: PenaltyGroupDetail;
}

// ── Layer 2: Model Agreement ────────────────────────────────────

export interface AiPayloadModelAgreement {
  aligned_long: number;
  aligned_short: number;
  neutral: number;
  opposite: number;
  unknown: number;
}

// ── Layer 3: Raw Signals ────────────────────────────────────────

export interface AiPayloadRawSignals {
  // Structure group
  market_regime: RawSignalEntry;
  structure_age: RawSignalEntry;
  time_in_range_bars: RawSignalEntry;
  trend_direction: RawSignalEntry;
  trend_strength: RawSignalEntry;
  ema_alignment: RawSignalEntry;
  vwap_position: RawSignalEntry;
  pivot_swing_high: RawSignalEntry;
  pivot_swing_low: RawSignalEntry;

  // Liquidity group
  orderbook_imbalance: RawSignalEntry;
  liquidity_distance_pct: RawSignalEntry;
  depth_quality: RawSignalEntry;
  spread_regime: RawSignalEntry;
  stop_cluster_above: RawSignalEntry;
  stop_cluster_below: RawSignalEntry;

  // Positioning group
  funding_bias: RawSignalEntry;
  funding_crowding: RawSignalEntry;
  funding_extreme: RawSignalEntry;
  oi_shock_score: RawSignalEntry;
  liquidations_bias: RawSignalEntry;
  buy_sell_imbalance: RawSignalEntry;

  // Execution group
  fill_probability: RawSignalEntry;
  capacity: RawSignalEntry;
  entry_timing: RawSignalEntry;
  slippage: RawSignalEntry;
  entry_quality_score: RawSignalEntry;

  // Volatility group
  atr_regime: RawSignalEntry;
  compression: RawSignalEntry;
  market_speed: RawSignalEntry;
  expansion_probability: RawSignalEntry;
  breakout_risk: RawSignalEntry;
  volatility_regime: RawSignalEntry;

  // Risk environment group
  signal_conflict: RawSignalEntry;
  cascade_risk: RawSignalEntry;
  market_stress: RawSignalEntry;
  crowding_risk: RawSignalEntry;

  // Timing group (alpha)
  timing_grade: RawSignalEntry;
  momentum_ignition: RawSignalEntry;
  trigger_candle_score: RawSignalEntry;

  // Multi-TF group (alpha)
  htf_trend_bias: RawSignalEntry;
  multi_tf_alignment: RawSignalEntry;
  ltf_pullback_quality: RawSignalEntry;

  // Allow additional signals
  [key: string]: RawSignalEntry;
}

// ── Layer 3: Contradiction Map ──────────────────────────────────

export interface ContradictionEntry {
  signal_a: string;
  signal_b: string;
  description: string;
  severity: "low" | "medium" | "high";
}

// ── Layer 3: Data Health ────────────────────────────────────────

export interface AiPayloadDataHealth {
  overall_completeness: number;   // 0-1
  group_completeness: Record<string, number>;
  stale_feed: boolean;
  missing_fields: number;
  feeds: Record<string, "healthy" | "degraded" | "missing">;
}

// ── Pine Script Strategy Rules (flexible thresholds) ────────────

export interface AiPayloadStrategyRules {
  // Mandatory (no flexibility)
  ema_trend_filter: boolean;      // price vs EMA200 alignment — MUST match
  min_confirmations: number;      // always 2
  valid_swing_required: boolean;  // must have pivot swing for SL anchor
  positive_risk_required: boolean; // risk R > 0

  // Flexible (AI can adjust within range)
  rsi_long_range: [number, number];   // default [35,45], flex [30,50]
  rsi_short_range: [number, number];  // default [55,65], flex [50,70]
  sl_buffer_pct: number;              // default 0.2, flex 0.1-0.5
  min_rr: number;                     // default 2.0, flex 1.8-2.5
  pullback_to_ema50: boolean;         // price touched EMA50 zone
  candle_confirmation: boolean;       // engulfing or rejection candle present
}

// ── Complete Structured Payload ─────────────────────────────────

export interface StructuredAiPayload {
  engine: "Bitrium Quant Engine";
  version: "2.0";

  // Layer 1 — Decision Summary
  market: AiPayloadMarket;
  decision: AiPayloadDecision;
  trade_plan: AiPayloadTradePlan;
  core_metrics: AiPayloadCoreMetrics;

  // Layer 2 — Group Scores + Penalties
  group_scores: AiPayloadGroupScores;
  penalty_groups: AiPayloadPenaltyGroups;
  model_agreement: AiPayloadModelAgreement;

  // Layer 3 — Raw Signals + Meta
  raw_signals: AiPayloadRawSignals;
  contradictions: ContradictionEntry[];
  data_health: AiPayloadDataHealth;

  // Pine Script Strategy Rules
  strategy_rules: AiPayloadStrategyRules;
}
