-- Migration 010: Post-Trade Reconciliation & Observability (Faz 12)

-- Exchange fills (denormalized from private streams + REST queries)
CREATE TABLE IF NOT EXISTS exchange_fills (
  id BIGSERIAL PRIMARY KEY,
  intent_id UUID,
  user_id TEXT NOT NULL,
  exchange_account_id TEXT NOT NULL,
  venue TEXT NOT NULL,
  exchange_order_id TEXT NOT NULL,
  exchange_trade_id TEXT,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  price NUMERIC(20,8) NOT NULL,
  qty NUMERIC(20,8) NOT NULL,
  fee NUMERIC(20,8),
  fee_asset TEXT,
  realized_pnl NUMERIC(20,8),
  filled_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SELECT create_hypertable('exchange_fills', 'filled_at', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_fills_intent ON exchange_fills (intent_id);
CREATE INDEX IF NOT EXISTS idx_fills_user ON exchange_fills (user_id, filled_at DESC);
CREATE INDEX IF NOT EXISTS idx_fills_order ON exchange_fills (exchange_order_id);

-- Balance snapshots
CREATE TABLE IF NOT EXISTS balance_snapshots (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  exchange_account_id TEXT NOT NULL,
  venue TEXT NOT NULL,
  asset TEXT NOT NULL,
  available NUMERIC(20,8) NOT NULL,
  total NUMERIC(20,8) NOT NULL,
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SELECT create_hypertable('balance_snapshots', 'snapshot_at', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_balance_user ON balance_snapshots (user_id, snapshot_at DESC);

-- Trace events (pipeline observability)
CREATE TABLE IF NOT EXISTS trade_trace_events (
  id BIGSERIAL PRIMARY KEY,
  trace_id TEXT NOT NULL,
  intent_id UUID NOT NULL,
  stage TEXT NOT NULL,
  data JSONB,
  duration_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SELECT create_hypertable('trade_trace_events', 'created_at', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_trace_intent ON trade_trace_events (intent_id);
CREATE INDEX IF NOT EXISTS idx_trace_id ON trade_trace_events (trace_id);

-- Shadow / dry-run execution log
CREATE TABLE IF NOT EXISTS shadow_executions (
  id BIGSERIAL PRIMARY KEY,
  intent_id UUID NOT NULL,
  would_send BOOLEAN NOT NULL,
  simulated_result JSONB NOT NULL,
  reasoning TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shadow_intent ON shadow_executions (intent_id);
