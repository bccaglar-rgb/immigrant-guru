-- ============================================================
-- Bitrium: TimescaleDB Candle Storage
-- Requires: CREATE EXTENSION timescaledb (run as superuser first)
-- Run: psql -U bitrium_app -d bitrium_db -f 002_timescaledb_candles.sql
-- ============================================================

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ── Raw 1-minute candles ────────────────────────────────────
CREATE TABLE IF NOT EXISTS candles_1m (
  time      TIMESTAMPTZ    NOT NULL,
  exchange  TEXT           NOT NULL,  -- BINANCE, GATEIO, BYBIT, OKX
  symbol    TEXT           NOT NULL,  -- normalized: BTCUSDT
  open      NUMERIC(20,8)  NOT NULL,
  high      NUMERIC(20,8)  NOT NULL,
  low       NUMERIC(20,8)  NOT NULL,
  close     NUMERIC(20,8)  NOT NULL,
  volume    NUMERIC(24,8)  NOT NULL DEFAULT 0
);

SELECT create_hypertable('candles_1m', 'time',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

-- Unique index for idempotent upsert (ON CONFLICT)
CREATE UNIQUE INDEX IF NOT EXISTS idx_candles_1m_uniq
  ON candles_1m (exchange, symbol, time);

-- Query index for chart API: SELECT ... WHERE symbol=$1 ORDER BY time DESC LIMIT $2
CREATE INDEX IF NOT EXISTS idx_candles_1m_lookup
  ON candles_1m (symbol, time DESC);

-- Auto-drop 1m chunks older than 30 days (aggregates retained indefinitely)
SELECT add_retention_policy('candles_1m', INTERVAL '30 days', if_not_exists => TRUE);


-- ── Continuous Aggregates ───────────────────────────────────

-- 5-minute candles
CREATE MATERIALIZED VIEW IF NOT EXISTS candles_5m
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('5 minutes', time) AS time,
  exchange,
  symbol,
  first(open, time)  AS open,
  max(high)           AS high,
  min(low)            AS low,
  last(close, time)   AS close,
  sum(volume)          AS volume
FROM candles_1m
GROUP BY time_bucket('5 minutes', time), exchange, symbol
WITH NO DATA;

SELECT add_continuous_aggregate_policy('candles_5m',
  start_offset  => INTERVAL '30 minutes',
  end_offset    => INTERVAL '5 minutes',
  schedule_interval => INTERVAL '5 minutes',
  if_not_exists => TRUE
);

-- 15-minute candles
CREATE MATERIALIZED VIEW IF NOT EXISTS candles_15m
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('15 minutes', time) AS time,
  exchange,
  symbol,
  first(open, time)  AS open,
  max(high)           AS high,
  min(low)            AS low,
  last(close, time)   AS close,
  sum(volume)          AS volume
FROM candles_1m
GROUP BY time_bucket('15 minutes', time), exchange, symbol
WITH NO DATA;

SELECT add_continuous_aggregate_policy('candles_15m',
  start_offset  => INTERVAL '1 hour',
  end_offset    => INTERVAL '15 minutes',
  schedule_interval => INTERVAL '15 minutes',
  if_not_exists => TRUE
);

-- 30-minute candles
CREATE MATERIALIZED VIEW IF NOT EXISTS candles_30m
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('30 minutes', time) AS time,
  exchange,
  symbol,
  first(open, time)  AS open,
  max(high)           AS high,
  min(low)            AS low,
  last(close, time)   AS close,
  sum(volume)          AS volume
FROM candles_1m
GROUP BY time_bucket('30 minutes', time), exchange, symbol
WITH NO DATA;

SELECT add_continuous_aggregate_policy('candles_30m',
  start_offset  => INTERVAL '2 hours',
  end_offset    => INTERVAL '30 minutes',
  schedule_interval => INTERVAL '15 minutes',
  if_not_exists => TRUE
);

-- 1-hour candles
CREATE MATERIALIZED VIEW IF NOT EXISTS candles_1h
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', time)  AS time,
  exchange,
  symbol,
  first(open, time)  AS open,
  max(high)           AS high,
  min(low)            AS low,
  last(close, time)   AS close,
  sum(volume)          AS volume
FROM candles_1m
GROUP BY time_bucket('1 hour', time), exchange, symbol
WITH NO DATA;

SELECT add_continuous_aggregate_policy('candles_1h',
  start_offset  => INTERVAL '4 hours',
  end_offset    => INTERVAL '1 hour',
  schedule_interval => INTERVAL '15 minutes',
  if_not_exists => TRUE
);

-- 4-hour candles
CREATE MATERIALIZED VIEW IF NOT EXISTS candles_4h
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('4 hours', time) AS time,
  exchange,
  symbol,
  first(open, time)  AS open,
  max(high)           AS high,
  min(low)            AS low,
  last(close, time)   AS close,
  sum(volume)          AS volume
FROM candles_1m
GROUP BY time_bucket('4 hours', time), exchange, symbol
WITH NO DATA;

SELECT add_continuous_aggregate_policy('candles_4h',
  start_offset  => INTERVAL '16 hours',
  end_offset    => INTERVAL '4 hours',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists => TRUE
);

-- 1-day candles
CREATE MATERIALIZED VIEW IF NOT EXISTS candles_1d
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 day', time)   AS time,
  exchange,
  symbol,
  first(open, time)  AS open,
  max(high)           AS high,
  min(low)            AS low,
  last(close, time)   AS close,
  sum(volume)          AS volume
FROM candles_1m
GROUP BY time_bucket('1 day', time), exchange, symbol
WITH NO DATA;

SELECT add_continuous_aggregate_policy('candles_1d',
  start_offset  => INTERVAL '3 days',
  end_offset    => INTERVAL '1 day',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists => TRUE
);
