-- Migration 009: Policy Engine (Faz 10)

-- Per-user trade conflict policies
CREATE TABLE IF NOT EXISTS user_trade_policies (
  user_id TEXT PRIMARY KEY,
  default_policy TEXT NOT NULL DEFAULT 'MANUAL_PRIORITY',
  symbol_overrides JSONB NOT NULL DEFAULT '{}',
  ai_cooldown_after_manual_ms INT NOT NULL DEFAULT 300000,
  manual_overrides_ai_position BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Position snapshot cache (denormalized for fast policy decisions)
CREATE TABLE IF NOT EXISTS position_snapshots (
  user_id TEXT NOT NULL,
  exchange_account_id TEXT NOT NULL,
  venue TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  size NUMERIC(20,8) NOT NULL,
  entry_price NUMERIC(20,8) NOT NULL,
  mark_price NUMERIC(20,8),
  unrealized_pnl NUMERIC(20,8),
  leverage INT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, exchange_account_id, symbol)
);
