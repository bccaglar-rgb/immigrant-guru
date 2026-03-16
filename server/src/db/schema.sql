-- ============================================================
-- Bitrium Production Schema
-- Run once:  psql -U bitrium_app -d bitrium_db -f schema.sql
-- ============================================================

-- ── Auth & Payments ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id                       TEXT PRIMARY KEY,
  email                    TEXT NOT NULL UNIQUE,
  password_hash            TEXT NOT NULL,
  role                     TEXT NOT NULL DEFAULT 'USER' CHECK (role IN ('USER','ADMIN')),
  two_factor_enabled       BOOLEAN NOT NULL DEFAULT false,
  two_factor_secret_enc    JSONB,
  password_reset_token_hash TEXT,
  password_reset_expires_at TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user    ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS plans (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  price_usdt    NUMERIC(12,2) NOT NULL,
  duration_days INT NOT NULL,
  features      JSONB NOT NULL DEFAULT '[]',
  enabled       BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoices (
  id                   TEXT PRIMARY KEY,
  user_id              TEXT NOT NULL REFERENCES users(id),
  plan_id              TEXT REFERENCES plans(id),
  invoice_type         TEXT NOT NULL CHECK (invoice_type IN ('PLAN','TOKEN_CREATOR')),
  title                TEXT NOT NULL,
  external_ref         TEXT,
  expected_amount_usdt NUMERIC(14,6) NOT NULL,
  paid_amount_usdt     NUMERIC(14,6) NOT NULL DEFAULT 0,
  deposit_address      TEXT NOT NULL,
  address_index        INT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'created',
  chain                TEXT NOT NULL DEFAULT 'TRON',
  token                TEXT NOT NULL DEFAULT 'USDT_TRC20',
  expires_at           TIMESTAMPTZ NOT NULL,
  paid_at              TIMESTAMPTZ,
  payment_tx_hash      TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invoices_user   ON invoices (user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices (status);

CREATE TABLE IF NOT EXISTS payment_events (
  id               TEXT PRIMARY KEY,
  invoice_id       TEXT NOT NULL REFERENCES invoices(id),
  tx_hash          TEXT NOT NULL,
  from_address     TEXT NOT NULL,
  to_address       TEXT NOT NULL,
  amount_usdt      NUMERIC(14,6) NOT NULL,
  contract_address TEXT NOT NULL,
  confirmations    INT NOT NULL,
  block_number     BIGINT NOT NULL,
  success          BOOLEAN NOT NULL,
  processed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payment_events_invoice ON payment_events (invoice_id);

CREATE TABLE IF NOT EXISTS processed_event_keys (
  event_key TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id),
  plan_id           TEXT NOT NULL REFERENCES plans(id),
  start_at          TIMESTAMPTZ NOT NULL,
  end_at            TIMESTAMPTZ NOT NULL,
  status            TEXT NOT NULL DEFAULT 'active',
  payment_tx_hash   TEXT NOT NULL,
  paid_amount_usdt  NUMERIC(14,6) NOT NULL,
  paid_at           TIMESTAMPTZ NOT NULL,
  plan_snapshot     JSONB NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user   ON subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions (status);

CREATE TABLE IF NOT EXISTS referral_codes (
  id                 TEXT PRIMARY KEY,
  code               TEXT NOT NULL UNIQUE,
  assigned_user_id   TEXT,
  assigned_email     TEXT,
  created_by_user_id TEXT NOT NULL,
  max_uses           INT NOT NULL DEFAULT 1,
  used_count         INT NOT NULL DEFAULT 0,
  active             BOOLEAN NOT NULL DEFAULT true,
  expires_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS token_creator_orders (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id),
  status          TEXT NOT NULL DEFAULT 'created',
  token_config    JSONB NOT NULL,
  settings        JSONB NOT NULL,
  pricing         JSONB NOT NULL,
  invoice_id      TEXT,
  payment_tx_hash TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS token_creator_fee_config (
  id         INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  config     JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Address cursor for deterministic HD derivation
CREATE SEQUENCE IF NOT EXISTS address_cursor_seq START WITH 1;

-- ── Trade Ideas ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trade_ideas (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL,
  symbol                TEXT NOT NULL,
  direction             TEXT NOT NULL CHECK (direction IN ('LONG','SHORT')),
  confidence_pct        NUMERIC(5,2) NOT NULL,
  scoring_mode          TEXT NOT NULL,
  approved_modes        JSONB NOT NULL DEFAULT '[]',
  mode_scores           JSONB NOT NULL DEFAULT '{}',
  entry_low             NUMERIC(20,8) NOT NULL,
  entry_high            NUMERIC(20,8) NOT NULL,
  sl_levels             JSONB NOT NULL DEFAULT '[]',
  tp_levels             JSONB NOT NULL DEFAULT '[]',
  status                TEXT NOT NULL DEFAULT 'PENDING',
  result                TEXT NOT NULL DEFAULT 'NONE',
  hit_level_type        TEXT,
  hit_level_index       INT,
  hit_level_price       NUMERIC(20,8),
  minutes_to_entry      INT,
  minutes_to_exit       INT,
  minutes_total         INT,
  horizon               TEXT NOT NULL,
  timeframe             TEXT NOT NULL,
  setup                 TEXT NOT NULL DEFAULT '',
  trade_validity        TEXT NOT NULL DEFAULT 'WEAK',
  entry_window          TEXT NOT NULL DEFAULT 'CLOSED',
  slippage_risk         TEXT NOT NULL DEFAULT 'HIGH',
  triggers_to_activate  JSONB NOT NULL DEFAULT '[]',
  invalidation          TEXT NOT NULL DEFAULT '',
  timestamp_utc         TIMESTAMPTZ NOT NULL,
  valid_until_bars      INT NOT NULL,
  valid_until_utc       TIMESTAMPTZ NOT NULL,
  market_state          JSONB NOT NULL DEFAULT '{}',
  flow_analysis         JSONB NOT NULL DEFAULT '[]',
  trade_intent          JSONB NOT NULL DEFAULT '[]',
  raw_text              TEXT NOT NULL DEFAULT '',
  incomplete            BOOLEAN NOT NULL DEFAULT false,
  price_precision       INT,
  activated_at          TIMESTAMPTZ,
  resolved_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_trade_ideas_user   ON trade_ideas (user_id);
CREATE INDEX IF NOT EXISTS idx_trade_ideas_status ON trade_ideas (status);
CREATE INDEX IF NOT EXISTS idx_trade_ideas_symbol ON trade_ideas (symbol);
CREATE INDEX IF NOT EXISTS idx_trade_ideas_active ON trade_ideas (user_id, symbol, scoring_mode) WHERE status IN ('PENDING','ACTIVE');
CREATE INDEX IF NOT EXISTS idx_trade_ideas_created ON trade_ideas (created_at DESC);

CREATE TABLE IF NOT EXISTS trade_idea_events (
  id         TEXT PRIMARY KEY,
  idea_id    TEXT NOT NULL REFERENCES trade_ideas(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  ts         TIMESTAMPTZ NOT NULL,
  price      NUMERIC(20,8),
  meta       JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_trade_idea_events_idea ON trade_idea_events (idea_id);

-- ── User Settings ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_settings (
  user_id       TEXT PRIMARY KEY,
  scoring_mode  TEXT NOT NULL DEFAULT 'FLOW',
  flow_mode     JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Admin Providers ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin_providers (
  id         TEXT PRIMARY KEY,
  config     JSONB NOT NULL,
  enabled    BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_branding (
  id              INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  logo_data_url   TEXT,
  emblem_data_url TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── AI Providers ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_providers (
  id         TEXT PRIMARY KEY,
  config     JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Exchange Connections ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS connection_records (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL,
  exchange          TEXT NOT NULL,
  account_mode      TEXT NOT NULL,
  api_key_masked    TEXT NOT NULL,
  encrypted_secret  JSONB NOT NULL,
  encrypted_passphrase JSONB,
  enabled           BOOLEAN NOT NULL DEFAULT true,
  testnet           BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_connections_user ON connection_records (user_id);

CREATE TABLE IF NOT EXISTS exchange_connection_records (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL,
  exchange_id           TEXT NOT NULL,
  exchange_display_name TEXT NOT NULL,
  account_name          TEXT DEFAULT 'Main',
  enabled               BOOLEAN NOT NULL DEFAULT true,
  environment           TEXT NOT NULL DEFAULT 'mainnet',
  credentials_encrypted JSONB NOT NULL,
  status                TEXT NOT NULL DEFAULT 'READY',
  status_report         JSONB,
  discovery_cache       JSONB NOT NULL DEFAULT '{}',
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, exchange_id, account_name)
);
CREATE INDEX IF NOT EXISTS idx_exchange_conn_user ON exchange_connection_records (user_id);

-- ── Trader Hub ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS traders (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL,
  name                  TEXT NOT NULL DEFAULT 'Trader',
  ai_module             TEXT NOT NULL DEFAULT 'CHATGPT',
  exchange              TEXT NOT NULL DEFAULT 'AUTO',
  exchange_account_id   TEXT NOT NULL DEFAULT '',
  exchange_account_name TEXT NOT NULL DEFAULT 'Auto',
  strategy_id           TEXT NOT NULL DEFAULT 'strategy-default',
  strategy_name         TEXT NOT NULL DEFAULT 'Default Strategy',
  symbol                TEXT NOT NULL DEFAULT 'BTCUSDT',
  timeframe             TEXT NOT NULL DEFAULT '15m',
  scan_interval_sec     INT NOT NULL DEFAULT 180,
  status                TEXT NOT NULL DEFAULT 'STOPPED',
  next_run_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_run_at           TIMESTAMPTZ,
  last_error            TEXT NOT NULL DEFAULT '',
  fail_streak           INT NOT NULL DEFAULT 0,
  stats                 JSONB NOT NULL DEFAULT '{}',
  last_result           JSONB,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_traders_user   ON traders (user_id);
CREATE INDEX IF NOT EXISTS idx_traders_status ON traders (status);

-- ── Scan Counts ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS scan_counts (
  id     SERIAL PRIMARY KEY,
  ts     TIMESTAMPTZ NOT NULL DEFAULT now(),
  counts JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_scan_counts_ts ON scan_counts (ts);
