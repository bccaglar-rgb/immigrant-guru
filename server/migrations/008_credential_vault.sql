-- Migration 008: Credential Vault & Audit (Faz 8)

-- Credential access audit trail
CREATE TABLE IF NOT EXISTS credential_access_log (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  exchange_account_id TEXT NOT NULL,
  action TEXT NOT NULL,        -- DECRYPT, ROTATE, VALIDATE, REVOKE
  reason TEXT NOT NULL,
  ip TEXT,
  success BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cred_audit_user ON credential_access_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cred_audit_account ON credential_access_log (exchange_account_id, created_at DESC);

-- Add version + permissions to exchange connections
ALTER TABLE exchange_connection_records
  ADD COLUMN IF NOT EXISTS credential_version INT DEFAULT 1;
ALTER TABLE exchange_connection_records
  ADD COLUMN IF NOT EXISTS permissions TEXT[] DEFAULT '{}';
ALTER TABLE exchange_connection_records
  ADD COLUMN IF NOT EXISTS last_validated_at TIMESTAMPTZ;
ALTER TABLE exchange_connection_records
  ADD COLUMN IF NOT EXISTS rotated_at TIMESTAMPTZ;
