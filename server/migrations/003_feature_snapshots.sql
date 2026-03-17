-- ============================================================
-- Bitrium: Feature Snapshots — Historical ML Feature Store
-- Requires: TimescaleDB extension (from 002_timescaledb_candles.sql)
-- Run: psql -U bitrium_app -d bitrium_db -f 003_feature_snapshots.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS feature_snapshots (
  time            TIMESTAMPTZ   NOT NULL,
  symbol          TEXT          NOT NULL,
  price           NUMERIC(20,8) NOT NULL,
  change24h_pct   NUMERIC(8,4),
  volume24h_usd   NUMERIC(20,2),
  spread_bps      NUMERIC(10,4),
  depth_usd       NUMERIC(20,2),
  imbalance       NUMERIC(8,6),
  funding_rate    NUMERIC(12,8),
  atr_pct         NUMERIC(8,4),
  rsi14           NUMERIC(8,4),
  sr_dist_pct     NUMERIC(8,4),
  tier1_score     NUMERIC(8,4),
  tier2_score     NUMERIC(8,4),
  composite_score NUMERIC(8,4),
  discovery_score NUMERIC(8,4)
);

SELECT create_hypertable('feature_snapshots', 'time',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

-- Query index for ML data loading: WHERE symbol = $1 ORDER BY time DESC
CREATE INDEX IF NOT EXISTS idx_feature_snap_lookup
  ON feature_snapshots (symbol, time DESC);

-- Unique index to prevent duplicate writes from multiple workers
CREATE UNIQUE INDEX IF NOT EXISTS idx_feature_snap_uniq
  ON feature_snapshots (symbol, time);

-- Retain 90 days of feature history
SELECT add_retention_policy('feature_snapshots', INTERVAL '90 days', if_not_exists => TRUE);
