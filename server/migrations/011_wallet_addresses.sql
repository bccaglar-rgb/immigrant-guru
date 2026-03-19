-- Migration 011: Wallet Addresses for Per-Invoice TRON Deposit
-- Each invoice gets a unique TRON address from a pre-generated pool.

CREATE TABLE IF NOT EXISTS wallet_addresses (
  wallet_index SERIAL PRIMARY KEY,
  address TEXT NOT NULL UNIQUE,
  private_key_enc TEXT NOT NULL,       -- AES-256-GCM encrypted private key
  status TEXT NOT NULL DEFAULT 'available',  -- available, assigned, paid, swept, disabled
  assigned_invoice_id TEXT,
  assigned_user_id TEXT,
  activated_onchain BOOLEAN DEFAULT FALSE,
  swept_at TIMESTAMPTZ,
  sweep_tx_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_addr_status ON wallet_addresses (status);
CREATE INDEX IF NOT EXISTS idx_wallet_addr_invoice ON wallet_addresses (assigned_invoice_id);

-- Sweeps tracking table
CREATE TABLE IF NOT EXISTS sweeps (
  id TEXT PRIMARY KEY,
  source_address TEXT NOT NULL,
  destination_address TEXT NOT NULL,
  asset TEXT NOT NULL DEFAULT 'USDT',
  amount NUMERIC(20,6) NOT NULL,
  tx_hash TEXT,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, submitted, confirmed, failed
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sweeps_status ON sweeps (status);
