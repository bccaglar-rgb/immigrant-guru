-- Migration 017: Prime AI Hub Snapshots
-- Creates the table for storing Prime AI evaluation snapshots per cycle

CREATE TABLE IF NOT EXISTS prime_ai_hub_snapshots (
  id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  decision TEXT NOT NULL,
  final_score NUMERIC(6,2),
  mq_score NUMERIC(6,2),
  dq_score NUMERIC(6,2),
  eq_score NUMERIC(6,2),
  edge_q_score NUMERIC(6,2),
  confidence NUMERIC(6,2),
  penalty_total NUMERIC(6,2),
  entry_low NUMERIC(20,8),
  entry_high NUMERIC(20,8),
  sl NUMERIC(20,8),
  tp NUMERIC(20,8),
  sl_pct NUMERIC(6,2),
  tp_pct NUMERIC(6,2),
  hard_fail BOOLEAN DEFAULT FALSE,
  soft_block BOOLEAN DEFAULT FALSE,
  code_overrides JSONB DEFAULT '[]',
  why_trade TEXT,
  why_not_trade TEXT,
  dominant_risk TEXT,
  dominant_edge TEXT,
  ai_raw JSONB,
  input_data JSONB,
  engine_version TEXT DEFAULT 'prime_ai_v1',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prime_ai_symbol ON prime_ai_hub_snapshots (symbol, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prime_ai_decision ON prime_ai_hub_snapshots (decision, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prime_ai_cycle ON prime_ai_hub_snapshots (cycle_id);
