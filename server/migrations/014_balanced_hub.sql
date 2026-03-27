-- Balanced Mode Hub snapshots
CREATE TABLE IF NOT EXISTS balanced_hub_snapshots (
  id              TEXT PRIMARY KEY,
  symbol          TEXT NOT NULL,
  cycle_id        TEXT NOT NULL,
  adjusted_score  NUMERIC(5,2) NOT NULL DEFAULT 0,
  decision        TEXT NOT NULL DEFAULT 'NO_TRADE',
  direction       TEXT NOT NULL DEFAULT 'NONE',
  regime          TEXT NOT NULL DEFAULT 'RANGE',
  bias_score      NUMERIC(5,4) NOT NULL DEFAULT 0,
  core_score      NUMERIC(5,2) NOT NULL DEFAULT 0,
  edge_r          NUMERIC(6,4) NOT NULL DEFAULT 0,
  penalty         NUMERIC(5,2) NOT NULL DEFAULT 0,
  gates_passed    BOOLEAN NOT NULL DEFAULT false,
  failed_gates    JSONB NOT NULL DEFAULT '[]',
  full_payload    JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bhub_symbol ON balanced_hub_snapshots (symbol);
CREATE INDEX IF NOT EXISTS idx_bhub_cycle ON balanced_hub_snapshots (cycle_id);
CREATE INDEX IF NOT EXISTS idx_bhub_created ON balanced_hub_snapshots (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bhub_decision ON balanced_hub_snapshots (decision, adjusted_score DESC);
