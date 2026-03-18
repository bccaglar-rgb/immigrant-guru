-- P1: Mode Performance Daily Snapshots
CREATE TABLE IF NOT EXISTS mode_performance_daily (
  id SERIAL PRIMARY KEY,
  mode TEXT NOT NULL,
  trade_count INT NOT NULL DEFAULT 0,
  win_rate NUMERIC(5,4) NOT NULL DEFAULT 0,
  avg_rr NUMERIC(8,4) NOT NULL DEFAULT 0,
  total_r NUMERIC(10,4) NOT NULL DEFAULT 0,
  expectancy NUMERIC(8,4) NOT NULL DEFAULT 0,
  max_drawdown NUMERIC(8,4) NOT NULL DEFAULT 0,
  current_drawdown NUMERIC(8,4) NOT NULL DEFAULT 0,
  avg_holding_min NUMERIC(10,2) NOT NULL DEFAULT 0,
  false_breakout_rate NUMERIC(5,4) NOT NULL DEFAULT 0,
  stop_out_rate NUMERIC(5,4) NOT NULL DEFAULT 0,
  weight NUMERIC(3,2) NOT NULL DEFAULT 1.0,
  throttled BOOLEAN NOT NULL DEFAULT FALSE,
  throttle_reason TEXT,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(mode, snapshot_date)
);
CREATE INDEX IF NOT EXISTS idx_mode_perf_mode ON mode_performance_daily(mode);
CREATE INDEX IF NOT EXISTS idx_mode_perf_date ON mode_performance_daily(snapshot_date);

-- P2: Trade Outcome Attribution
CREATE TABLE IF NOT EXISTS trade_outcome_attribution (
  setup_id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  mode TEXT NOT NULL,
  regime TEXT NOT NULL,
  score NUMERIC(5,2) NOT NULL DEFAULT 0,
  direction TEXT NOT NULL,
  entry_price NUMERIC(20,8) NOT NULL,
  sl_price NUMERIC(20,8) NOT NULL,
  tp1_price NUMERIC(20,8) NOT NULL,
  tp2_price NUMERIC(20,8),
  entry_quality NUMERIC(4,3) NOT NULL DEFAULT 0,
  sl_quality NUMERIC(4,3) NOT NULL DEFAULT 0,
  tp_quality NUMERIC(4,3) NOT NULL DEFAULT 0,
  hold_quality NUMERIC(4,3) NOT NULL DEFAULT 0,
  outcome_r NUMERIC(8,4) NOT NULL DEFAULT 0,
  win BOOLEAN NOT NULL DEFAULT FALSE,
  mfe NUMERIC(8,4) NOT NULL DEFAULT 0,
  mae NUMERIC(8,4) NOT NULL DEFAULT 0,
  holding_minutes INT NOT NULL DEFAULT 0,
  win_reason TEXT,
  loss_reason TEXT,
  false_breakout BOOLEAN NOT NULL DEFAULT FALSE,
  stop_out BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_toa_mode ON trade_outcome_attribution(mode);
CREATE INDEX IF NOT EXISTS idx_toa_symbol ON trade_outcome_attribution(symbol);
CREATE INDEX IF NOT EXISTS idx_toa_win ON trade_outcome_attribution(win);
CREATE INDEX IF NOT EXISTS idx_toa_created ON trade_outcome_attribution(created_at);
CREATE INDEX IF NOT EXISTS idx_toa_regime ON trade_outcome_attribution(regime);
