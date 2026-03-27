-- Aggressive Mode Hub snapshots
CREATE TABLE IF NOT EXISTS agg_hub_snapshots (
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
CREATE INDEX IF NOT EXISTS idx_ahs_symbol ON agg_hub_snapshots(symbol);
CREATE INDEX IF NOT EXISTS idx_ahs_created ON agg_hub_snapshots(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ahs_cycle ON agg_hub_snapshots(cycle_id);

-- Capital Guard Mode Hub snapshots
CREATE TABLE IF NOT EXISTS cg_hub_snapshots (
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
CREATE INDEX IF NOT EXISTS idx_chs_symbol ON cg_hub_snapshots(symbol);
CREATE INDEX IF NOT EXISTS idx_chs_created ON cg_hub_snapshots(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chs_cycle ON cg_hub_snapshots(cycle_id);
