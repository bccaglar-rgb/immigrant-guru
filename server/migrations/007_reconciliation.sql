-- Migration 007: Order Reconciliation & Time Sync (Faz 7)

-- Track reconciliation attempts and results
CREATE TABLE IF NOT EXISTS reconciliation_log (
  id BIGSERIAL PRIMARY KEY,
  intent_id UUID NOT NULL,
  venue TEXT NOT NULL,
  previous_state TEXT NOT NULL,
  new_state TEXT NOT NULL,
  exchange_status TEXT,
  filled_qty NUMERIC(20,8),
  avg_price NUMERIC(20,8),
  reconciled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL DEFAULT 'auto'  -- 'auto' | 'manual'
);
CREATE INDEX IF NOT EXISTS idx_recon_intent ON reconciliation_log (intent_id);
CREATE INDEX IF NOT EXISTS idx_recon_time ON reconciliation_log (reconciled_at DESC);

-- Time sync history (for drift monitoring)
CREATE TABLE IF NOT EXISTS time_sync_log (
  id BIGSERIAL PRIMARY KEY,
  venue TEXT NOT NULL,
  server_time_ms BIGINT NOT NULL,
  local_time_ms BIGINT NOT NULL,
  offset_ms INT NOT NULL,
  drift_ms INT NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SELECT create_hypertable('time_sync_log', 'synced_at', if_not_exists => TRUE);

-- Add reconciliation tracking columns to order_intents
ALTER TABLE order_intents ADD COLUMN IF NOT EXISTS last_reconciled_at TIMESTAMPTZ;
ALTER TABLE order_intents ADD COLUMN IF NOT EXISTS reconciliation_count INT DEFAULT 0;
