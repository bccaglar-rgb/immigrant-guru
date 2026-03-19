-- Migration 006: Exchange Trade Engine Foundation (Faz 5 + Faz 6)
-- Idempotency, audit events, symbol info, risk limits

-- ── Faz 5: Intent Foundation ─────────────────────────────────────

-- Idempotency: prevent duplicate intents for same user + clientOrderId
CREATE UNIQUE INDEX IF NOT EXISTS idx_order_intents_dedup
  ON order_intents (user_id, client_order_id)
  WHERE state NOT IN ('DONE', 'CANCELED', 'ERROR');

-- Optional idempotency key column
ALTER TABLE order_intents ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_order_intents_idempotency
  ON order_intents (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Audit events table (replaces AuditLogService no-op)
CREATE TABLE IF NOT EXISTS audit_events (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  exchange TEXT,
  symbol TEXT,
  payload JSONB,
  response JSONB,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_events_user ON audit_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_action ON audit_events (action, created_at DESC);

-- ── Faz 6: Risk Layer & Order Normalization ──────────────────────

-- Exchange symbol info cache (lot size, tick size, min notional, precision)
CREATE TABLE IF NOT EXISTS exchange_symbol_info (
  venue TEXT NOT NULL,
  symbol TEXT NOT NULL,
  min_qty NUMERIC(20,12),
  max_qty NUMERIC(20,12),
  step_size NUMERIC(20,12),
  tick_size NUMERIC(20,12),
  min_notional NUMERIC(20,6),
  price_precision INT,
  qty_precision INT,
  contract_size NUMERIC(20,8),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (venue, symbol)
);

-- Per-user risk limits (override defaults)
CREATE TABLE IF NOT EXISTS user_risk_limits (
  user_id TEXT PRIMARY KEY,
  max_notional_per_order NUMERIC(20,6) DEFAULT 10000,
  max_position_notional NUMERIC(20,6) DEFAULT 50000,
  max_leverage INT DEFAULT 20,
  max_open_orders INT DEFAULT 50,
  max_daily_orders INT DEFAULT 500,
  cooldown_ms INT DEFAULT 1000,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
