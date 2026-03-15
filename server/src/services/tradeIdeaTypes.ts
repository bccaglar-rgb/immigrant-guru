import type { ScoringMode } from "./scoringMode.ts";

export type TradeIdeaDirection = "LONG" | "SHORT";

export type TradeIdeaStatus = "PENDING" | "ACTIVE" | "RESOLVED" | "CANCELLED" | "EXPIRED";

export type TradeIdeaResult = "SUCCESS" | "FAIL" | "NONE";

export type TradeIdeaLevelType = "TP" | "SL";

export type TradeIdeaEventType =
  | "IDEA_CREATED"
  | "ENTRY_TOUCHED"
  | "TP_HIT"
  | "SL_HIT"
  | "RESOLVED";

export interface TradeIdeaRecord {
  id: string;
  user_id: string;
  symbol: string;
  direction: TradeIdeaDirection;
  confidence_pct: number;
  scoring_mode: ScoringMode;
  approved_modes: ScoringMode[];
  mode_scores: Partial<Record<ScoringMode, number>>;
  entry_low: number;
  entry_high: number;
  sl_levels: number[];
  tp_levels: number[];
  status: TradeIdeaStatus;
  created_at: string;
  activated_at: string | null;
  resolved_at: string | null;
  result: TradeIdeaResult;
  hit_level_type: TradeIdeaLevelType | null;
  hit_level_index: number | null;
  hit_level_price: number | null;
  minutes_to_entry: number | null;
  minutes_to_exit: number | null;
  minutes_total: number | null;
  horizon: "SCALP" | "INTRADAY" | "SWING";
  timeframe: "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d";
  setup: string;
  trade_validity: "VALID" | "WEAK" | "NO-TRADE";
  entry_window: "OPEN" | "NARROW" | "CLOSED";
  slippage_risk: "LOW" | "MED" | "HIGH";
  triggers_to_activate: string[];
  invalidation: string;
  timestamp_utc: string;
  valid_until_bars: number;
  valid_until_utc: string;
  market_state: {
    trend: string;
    htfBias: string;
    volatility: string;
    execution: string;
  };
  flow_analysis: string[];
  trade_intent: string[];
  raw_text: string;
  incomplete: boolean;
  price_precision?: number;
}

export interface TradeIdeaEventRecord {
  id: string;
  idea_id: string;
  event_type: TradeIdeaEventType;
  ts: string;
  price: number | null;
  meta: Record<string, unknown>;
}

export interface TradeIdeaStorageModel {
  ideas: TradeIdeaRecord[];
  events: TradeIdeaEventRecord[];
}
