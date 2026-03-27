-- Flow Mode Hub snapshots table
CREATE TABLE IF NOT EXISTS flow_hub_snapshots (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  cycle_id TEXT NOT NULL,
  adjusted_score NUMERIC(5,2),
  decision TEXT NOT NULL,
  direction TEXT NOT NULL,
  regime TEXT NOT NULL,
  bias_score NUMERIC(5,4),
  core_score NUMERIC(5,2),
  edge_r NUMERIC(6,4),
  penalty NUMERIC(5,2),
  gates_passed BOOLEAN,
  failed_gates JSONB DEFAULT '[]',
  full_payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fhs_symbol ON flow_hub_snapshots(symbol);
CREATE INDEX IF NOT EXISTS idx_fhs_created ON flow_hub_snapshots(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fhs_cycle ON flow_hub_snapshots(cycle_id);
