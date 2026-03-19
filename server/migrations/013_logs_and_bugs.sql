-- Migration 013: System Logs + Bug Reports

-- Unified system logs
CREATE TABLE IF NOT EXISTS system_logs (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  level TEXT NOT NULL DEFAULT 'info',
  module TEXT NOT NULL,
  event_type TEXT NOT NULL,
  message TEXT NOT NULL,
  service_source TEXT DEFAULT 'main',
  user_id TEXT,
  request_id TEXT,
  route TEXT,
  invoice_id TEXT,
  tx_hash TEXT,
  deposit_address TEXT,
  status TEXT,
  metadata JSONB,
  stack_trace TEXT,
  bug_report_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_syslog_time ON system_logs (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_syslog_level ON system_logs (level);
CREATE INDEX IF NOT EXISTS idx_syslog_module ON system_logs (module);
CREATE INDEX IF NOT EXISTS idx_syslog_user ON system_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_syslog_invoice ON system_logs (invoice_id);
CREATE INDEX IF NOT EXISTS idx_syslog_tx ON system_logs (tx_hash);

-- Bug reports
CREATE TABLE IF NOT EXISTS bug_reports (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  module TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'open',
  source TEXT NOT NULL DEFAULT 'user',
  reported_by TEXT,
  assigned_to TEXT,
  user_id TEXT,
  page_url TEXT,
  request_id TEXT,
  invoice_id TEXT,
  tx_hash TEXT,
  deposit_address TEXT,
  browser_info TEXT,
  screen_size TEXT,
  environment TEXT,
  steps_to_reproduce TEXT,
  expected_behavior TEXT,
  actual_behavior TEXT,
  internal_notes TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bugs_status ON bug_reports (status);
CREATE INDEX IF NOT EXISTS idx_bugs_module ON bug_reports (module);
CREATE INDEX IF NOT EXISTS idx_bugs_severity ON bug_reports (severity);
CREATE INDEX IF NOT EXISTS idx_bugs_user ON bug_reports (user_id);

-- Bug report notes/activity
CREATE TABLE IF NOT EXISTS bug_report_notes (
  id TEXT PRIMARY KEY,
  bug_report_id TEXT NOT NULL REFERENCES bug_reports(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL,
  note TEXT NOT NULL,
  action TEXT,
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_brn_bug ON bug_report_notes (bug_report_id);
