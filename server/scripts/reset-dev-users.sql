-- ============================================================
-- DEV/STAGING ONLY: Reset all user accounts for fresh testing
-- ============================================================
-- WARNING: This script deletes ALL user data.
-- DO NOT RUN IN PRODUCTION without explicit confirmation.
--
-- Usage (from API-1 server):
--   PGPASSWORD=1907 psql -h 10.110.0.5 -U bitrium -d bitrium \
--     -f server/scripts/reset-dev-users.sql
--
-- What it does:
--   1. Deletes all sessions (logs everyone out)
--   2. Deletes all order intents
--   3. Deletes all trade ideas and events
--   4. Deletes all credential access logs
--   5. Deletes all audit events
--   6. Deletes all users EXCEPT the admin account
--   7. Resets admin password to default (Admin12345!)
--
-- After running: restart PM2 to recreate admin account
-- ============================================================

BEGIN;

-- 1. Clear sessions
DELETE FROM sessions;

-- 2. Clear order-related data
DELETE FROM order_intents;
DELETE FROM reconciliation_log;
DELETE FROM exchange_fills;
DELETE FROM balance_snapshots;
DELETE FROM trade_trace_events;
DELETE FROM shadow_executions;

-- 3. Clear trade ideas
DELETE FROM trade_idea_events;
DELETE FROM trade_ideas;

-- 4. Clear credential/audit logs
DELETE FROM credential_access_log;
DELETE FROM audit_events;

-- 5. Clear exchange connections
DELETE FROM exchange_connection_records;
DELETE FROM connection_records;

-- 6. Clear policy/position snapshots
DELETE FROM user_trade_policies;
DELETE FROM position_snapshots;
DELETE FROM user_risk_limits;

-- 7. Delete all non-admin users
DELETE FROM users WHERE role != 'ADMIN';

-- 8. Reset admin password (will be recreated on PM2 restart via bootstrap)
-- Keep admin account but clear 2FA
UPDATE users SET
  two_factor_enabled = false,
  two_factor_secret_enc = NULL,
  password_reset_token_hash = NULL,
  password_reset_expires_at = NULL,
  updated_at = NOW()
WHERE role = 'ADMIN';

COMMIT;

-- Summary
SELECT 'Reset complete' AS status,
  (SELECT COUNT(*) FROM users) AS remaining_users,
  (SELECT COUNT(*) FROM users WHERE role = 'ADMIN') AS admin_accounts;
