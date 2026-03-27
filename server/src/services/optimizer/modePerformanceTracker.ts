/**
 * P1: Mode Performance Tracker
 *
 * Tracks per-mode (FLOW/AGGRESSIVE/BALANCED/CAPITAL_GUARD) statistics:
 *   - win rate, avg RR, expectancy, drawdown
 *   - false breakout rate, stop-out rate, holding time
 *   - auto-degrades poor-performing modes
 *
 * Updates on every resolved trade idea.
 * Persists daily snapshots to PostgreSQL.
 */

import { pool } from "../../db/pool.ts";
import { redis } from "../../db/redis.ts";

const REDIS_KEY = "optimizer:mode_performance";
const MIN_TRADES_FOR_EVAL = 15;
const DRAWDOWN_THRESHOLD = -5; // -5R triggers throttle
const WIN_RATE_FLOOR = 0.30; // below 30% → mode gets penalized

export interface ModeStats {
  mode: string;
  tradeCount: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  avgRR: number;
  totalR: number;
  expectancy: number;
  maxDrawdown: number;
  currentDrawdown: number;
  avgHoldingMinutes: number;
  falseBreakoutRate: number;
  stopOutRate: number;
  lastUpdated: string;
  // Throttle state
  weight: number;       // 0-1, default 1.0
  throttled: boolean;
  throttleReason: string | null;
}

const EMPTY_STATS = (mode: string): ModeStats => ({
  mode,
  tradeCount: 0, winCount: 0, lossCount: 0, winRate: 0,
  avgRR: 0, totalR: 0, expectancy: 0,
  maxDrawdown: 0, currentDrawdown: 0,
  avgHoldingMinutes: 0, falseBreakoutRate: 0, stopOutRate: 0,
  lastUpdated: new Date().toISOString(),
  weight: 1.0, throttled: false, throttleReason: null,
});

export class ModePerformanceTracker {
  private stats: Map<string, ModeStats> = new Map();
  private rHistory: Map<string, number[]> = new Map(); // rolling R values per mode

  constructor() {
    for (const mode of ["FLOW", "AGGRESSIVE", "BALANCED", "CAPITAL_GUARD"]) {
      this.stats.set(mode, EMPTY_STATS(mode));
      this.rHistory.set(mode, []);
    }
  }

  async loadFromRedis(): Promise<void> {
    try {
      const raw = await redis.get(REDIS_KEY);
      if (raw) {
        const data = JSON.parse(raw) as Record<string, ModeStats>;
        for (const [mode, stats] of Object.entries(data)) {
          this.stats.set(mode, stats);
        }
      }
    } catch { /* ignore */ }
  }

  /** Called when a trade idea is resolved (WIN or LOSS) */
  recordTrade(trade: {
    mode: string;
    win: boolean;
    outcomeR: number;
    holdingMinutes: number;
    falseBreakout: boolean;
    stopOut: boolean;
  }): void {
    const mode = trade.mode.toUpperCase();
    let s = this.stats.get(mode);
    if (!s) {
      s = EMPTY_STATS(mode);
      this.stats.set(mode, s);
    }

    s.tradeCount++;
    if (trade.win) s.winCount++;
    else s.lossCount++;

    s.winRate = s.tradeCount > 0 ? s.winCount / s.tradeCount : 0;
    s.totalR += trade.outcomeR;
    s.avgRR = s.tradeCount > 0 ? s.totalR / s.tradeCount : 0;

    // Expectancy: (winRate * avgWin) - (lossRate * avgLoss)
    const avgWin = s.winCount > 0 ? s.totalR / s.winCount : 0;
    const avgLoss = s.lossCount > 0 ? Math.abs(s.totalR - (avgWin * s.winCount)) / s.lossCount : 1;
    s.expectancy = (s.winRate * avgWin) - ((1 - s.winRate) * avgLoss);

    // Rolling R for drawdown
    const history = this.rHistory.get(mode) ?? [];
    history.push(trade.outcomeR);
    if (history.length > 100) history.shift(); // keep last 100
    this.rHistory.set(mode, history);

    // Calculate drawdown from R history
    let peak = 0;
    let cumR = 0;
    let maxDD = 0;
    for (const r of history) {
      cumR += r;
      if (cumR > peak) peak = cumR;
      const dd = cumR - peak;
      if (dd < maxDD) maxDD = dd;
    }
    s.maxDrawdown = maxDD;
    s.currentDrawdown = cumR - peak;

    // Holding time (rolling average)
    s.avgHoldingMinutes = s.tradeCount > 1
      ? (s.avgHoldingMinutes * (s.tradeCount - 1) + trade.holdingMinutes) / s.tradeCount
      : trade.holdingMinutes;

    // False breakout rate
    if (trade.falseBreakout) {
      const fbCount = Math.round(s.falseBreakoutRate * (s.tradeCount - 1)) + 1;
      s.falseBreakoutRate = fbCount / s.tradeCount;
    } else {
      const fbCount = Math.round(s.falseBreakoutRate * (s.tradeCount - 1));
      s.falseBreakoutRate = fbCount / s.tradeCount;
    }

    // Stop-out rate
    if (trade.stopOut) {
      const soCount = Math.round(s.stopOutRate * (s.tradeCount - 1)) + 1;
      s.stopOutRate = soCount / s.tradeCount;
    } else {
      const soCount = Math.round(s.stopOutRate * (s.tradeCount - 1));
      s.stopOutRate = soCount / s.tradeCount;
    }

    s.lastUpdated = new Date().toISOString();

    // Auto-throttle evaluation
    this.evaluateThrottle(s);

    // Persist to Redis
    this.persistToRedis().catch(() => {});
  }

  private evaluateThrottle(s: ModeStats): void {
    // DISABLED: tracking only — no throttling until manual review
    s.throttled = false;
    s.weight = 1.0;
    s.throttleReason = null;
    return;
    if (s.tradeCount < MIN_TRADES_FOR_EVAL) {
      s.throttled = false;
      s.weight = 1.0;
      s.throttleReason = null;
      return;
    }

    // Check drawdown
    if (s.currentDrawdown < DRAWDOWN_THRESHOLD) {
      s.throttled = true;
      s.weight = 0.3;
      s.throttleReason = `drawdown_${s.currentDrawdown.toFixed(1)}R`;
      return;
    }

    // Check win rate
    if (s.winRate < WIN_RATE_FLOOR) {
      s.throttled = true;
      s.weight = 0.5;
      s.throttleReason = `low_winrate_${(s.winRate * 100).toFixed(0)}%`;
      return;
    }

    // Check false breakout rate
    if (s.falseBreakoutRate > 0.4) {
      s.throttled = true;
      s.weight = 0.6;
      s.throttleReason = `high_fb_rate_${(s.falseBreakoutRate * 100).toFixed(0)}%`;
      return;
    }

    // Check negative expectancy
    if (s.expectancy < -0.3) {
      s.throttled = true;
      s.weight = 0.4;
      s.throttleReason = `neg_expectancy_${s.expectancy.toFixed(2)}`;
      return;
    }

    // All clear
    s.throttled = false;
    s.weight = 1.0;
    s.throttleReason = null;
  }

  /** Get mode weight (1.0 = full, <1 = throttled) */
  getModeWeight(mode: string): number {
    return this.stats.get(mode.toUpperCase())?.weight ?? 1.0;
  }

  /** Check if mode is throttled */
  isThrottled(mode: string): boolean {
    return this.stats.get(mode.toUpperCase())?.throttled ?? false;
  }

  /** Get all mode stats */
  getAllStats(): ModeStats[] {
    return [...this.stats.values()];
  }

  /** Get stats for specific mode */
  getStats(mode: string): ModeStats | null {
    return this.stats.get(mode.toUpperCase()) ?? null;
  }

  private async persistToRedis(): Promise<void> {
    try {
      const data: Record<string, ModeStats> = {};
      for (const [mode, stats] of this.stats) data[mode] = stats;
      await redis.set(REDIS_KEY, JSON.stringify(data), "EX", 86400); // 24h TTL
    } catch { /* ignore */ }
  }

  /** Save daily snapshot to PostgreSQL */
  async saveDailySnapshot(): Promise<void> {
    const now = new Date().toISOString();
    for (const [mode, s] of this.stats) {
      try {
        await pool.query(
          `INSERT INTO mode_performance_daily (mode, trade_count, win_rate, avg_rr, total_r, expectancy, max_drawdown, current_drawdown, avg_holding_min, false_breakout_rate, stop_out_rate, weight, throttled, throttle_reason, snapshot_date, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,CURRENT_DATE,$15)
           ON CONFLICT (mode, snapshot_date) DO UPDATE SET
             trade_count=EXCLUDED.trade_count, win_rate=EXCLUDED.win_rate, avg_rr=EXCLUDED.avg_rr,
             total_r=EXCLUDED.total_r, expectancy=EXCLUDED.expectancy, max_drawdown=EXCLUDED.max_drawdown,
             current_drawdown=EXCLUDED.current_drawdown, avg_holding_min=EXCLUDED.avg_holding_min,
             false_breakout_rate=EXCLUDED.false_breakout_rate, stop_out_rate=EXCLUDED.stop_out_rate,
             weight=EXCLUDED.weight, throttled=EXCLUDED.throttled, throttle_reason=EXCLUDED.throttle_reason,
             created_at=EXCLUDED.created_at`,
          [mode, s.tradeCount, s.winRate, s.avgRR, s.totalR, s.expectancy, s.maxDrawdown,
           s.currentDrawdown, s.avgHoldingMinutes, s.falseBreakoutRate, s.stopOutRate,
           s.weight, s.throttled, s.throttleReason, now],
        );
      } catch (err: any) {
        console.error(`[ModePerformanceTracker] DB save error for ${mode}:`, err?.message);
      }
    }
  }
}
