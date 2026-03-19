-- Crypto Payment Engine — Database Schema
-- Separate DB from main platform

CREATE TABLE IF NOT EXISTS engine_wallet_addresses (
  wallet_index SERIAL PRIMARY KEY,
  address TEXT NOT NULL UNIQUE,
  private_key_enc TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available',
  assigned_invoice_id TEXT,
  assigned_user_id TEXT,
  activated_onchain BOOLEAN DEFAULT FALSE,
  swept_at TIMESTAMPTZ,
  sweep_tx_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ewa_status ON engine_wallet_addresses (status);
CREATE INDEX IF NOT EXISTS idx_ewa_invoice ON engine_wallet_addresses (assigned_invoice_id);

CREATE TABLE IF NOT EXISTS engine_invoices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  plan_name TEXT NOT NULL DEFAULT '',
  expected_amount_usdt NUMERIC(20,6) NOT NULL,
  paid_amount_usdt NUMERIC(20,6) NOT NULL DEFAULT 0,
  deposit_address TEXT NOT NULL,
  wallet_index INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'awaiting_payment',
  expires_at TIMESTAMPTZ NOT NULL,
  reference_id TEXT,
  payment_tx_hash TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_einv_status ON engine_invoices (status);
CREATE INDEX IF NOT EXISTS idx_einv_user ON engine_invoices (user_id);
CREATE INDEX IF NOT EXISTS idx_einv_address ON engine_invoices (deposit_address);

CREATE TABLE IF NOT EXISTS engine_payment_events (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  amount_usdt NUMERIC(20,6) NOT NULL,
  contract_address TEXT NOT NULL,
  confirmations INT NOT NULL DEFAULT 0,
  block_number BIGINT NOT NULL DEFAULT 0,
  success BOOLEAN NOT NULL DEFAULT TRUE,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_epe_invoice ON engine_payment_events (invoice_id);
CREATE INDEX IF NOT EXISTS idx_epe_tx ON engine_payment_events (tx_hash);

CREATE TABLE IF NOT EXISTS engine_processed_keys (
  event_key TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS engine_sweeps (
  id TEXT PRIMARY KEY,
  source_address TEXT NOT NULL,
  destination_address TEXT NOT NULL,
  asset TEXT NOT NULL DEFAULT 'USDT',
  amount NUMERIC(20,6) NOT NULL,
  tx_hash TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_esw_status ON engine_sweeps (status);

CREATE TABLE IF NOT EXISTS engine_webhook_logs (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  invoice_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ewl_status ON engine_webhook_logs (status);
