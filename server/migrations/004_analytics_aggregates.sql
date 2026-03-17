-- ============================================================
-- Bitrium: Analytics Aggregates + Bot Decision Log
-- Faz 3 — TimescaleDB continuous aggregates for dashboards
-- Requires: 002_timescaledb_candles.sql, 003_feature_snapshots.sql
-- Run: psql -U bitrium_app -d bitrium_db -f 004_analytics_aggregates.sql
-- ============================================================

-- ── Bot Decision Log (hypertable) ───────────────────────────────────────────
-- Lightweight append-only log of every bot decision.
-- Dual-written by batchResultWriter alongside the traders UPDATE.
-- Provides historical signal quality analytics (90-day retention).

CREATE TABLE IF NOT EXISTS bot_decisions (
  time         TIMESTAMPTZ   NOT NULL,
  bot_id       TEXT          NOT NULL,
  user_id      TEXT          NOT NULL,
  symbol       TEXT          NOT NULL,
  strategy_id  TEXT          NOT NULL,
  decision     TEXT          NOT NULL,   -- TRADE | WATCH | NO_TRADE | N/A | SKIP
  score_pct    NUMERIC(6,2),
  bias         TEXT,                      -- LONG | SHORT | NEUTRAL
  exec_state   TEXT,                      -- QUEUED | REJECTED | N/A
  data_stale   BOOLEAN       DEFAULT FALSE
);

SELECT create_hypertable('bot_decisions', 'time',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

-- Fast lookup by bot or symbol for per-bot analytics
CREATE INDEX IF NOT EXISTS idx_bot_decisions_bot    ON bot_decisions (bot_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_bot_decisions_symbol ON bot_decisions (symbol, time DESC);

-- 90-day retention (matches feature_snapshots)
SELECT add_retention_policy('bot_decisions', INTERVAL '90 days', if_not_exists => TRUE);

-- ── Continuous Aggregate: Hourly signal summary per symbol ──────────────────
-- Refreshes every 30 minutes. Used by optimizer for historical signal quality.
CREATE MATERIALIZED VIEW IF NOT EXISTS signal_hourly
WITH (timescaledb.continuous) AS
  SELECT
    time_bucket('1 hour', time) AS bucket,
    symbol,
    COUNT(*)                                      AS sample_count,
    AVG(change24h_pct)                            AS avg_change24h_pct,
    AVG(depth_usd)                                AS avg_depth_usd,
    AVG(imbalance)                                AS avg_imbalance,
    AVG(spread_bps)                               AS avg_spread_bps,
    AVG(composite_score)                          AS avg_composite_score
  FROM feature_snapshots
  GROUP BY bucket, symbol
WITH NO DATA;

SELECT add_continuous_aggregate_policy('signal_hourly',
  start_offset  => INTERVAL '3 hours',
  end_offset    => INTERVAL '1 hour',
  schedule_interval => INTERVAL '30 minutes',
  if_not_exists => TRUE
);

-- ── Continuous Aggregate: Daily bot decision stats per symbol ───────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS bot_decisions_daily
WITH (timescaledb.continuous) AS
  SELECT
    time_bucket('1 day', time)                    AS bucket,
    symbol,
    COUNT(*)                                      AS total_decisions,
    COUNT(*) FILTER (WHERE decision = 'TRADE')    AS trade_count,
    COUNT(*) FILTER (WHERE decision = 'WATCH')    AS watch_count,
    COUNT(*) FILTER (WHERE decision = 'NO_TRADE') AS no_trade_count,
    COUNT(*) FILTER (WHERE exec_state = 'QUEUED') AS executions,
    COUNT(*) FILTER (WHERE exec_state = 'REJECTED') AS rejections,
    AVG(score_pct)                                AS avg_score,
    MAX(score_pct)                                AS max_score
  FROM bot_decisions
  GROUP BY bucket, symbol
WITH NO DATA;

SELECT add_continuous_aggregate_policy('bot_decisions_daily',
  start_offset  => INTERVAL '2 days',
  end_offset    => INTERVAL '1 day',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists => TRUE
);

-- ── Query helpers (for optimizer) ────────────────────────────────────────────
-- Example: Signal quality for BTCUSDT last 7 days
--   SELECT bucket, avg_composite_score, avg_depth_usd
--   FROM signal_hourly
--   WHERE symbol = 'BTCUSDT' AND bucket >= NOW() - INTERVAL '7 days'
--   ORDER BY bucket;
--
-- Example: Bot decision rate by symbol
--   SELECT symbol, SUM(trade_count)::float / NULLIF(SUM(total_decisions), 0) AS trade_rate
--   FROM bot_decisions_daily
--   WHERE bucket >= NOW() - INTERVAL '30 days'
--   GROUP BY symbol ORDER BY trade_rate DESC;
