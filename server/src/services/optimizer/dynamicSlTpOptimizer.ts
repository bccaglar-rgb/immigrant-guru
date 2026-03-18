/**
 * P3: Dynamic SL/TP Optimizer
 *
 * Learns optimal SL/TP parameters from resolved trades:
 *   - Per regime: TREND vs RANGE vs BREAKOUT
 *   - Per mode: FLOW vs AGGRESSIVE vs BALANCED vs CAPITAL_GUARD
 *   - Adapts: sl_buffer, tp_multiplier, trailing vs fixed
 *
 * Uses MFE/MAE from TradeOutcomeAttributor to find optimal levels.
 */

import { pool } from "../../db/pool.ts";
import { redis } from "../../db/redis.ts";

const REDIS_KEY = "optimizer:dynamic_sl_tp";
const MIN_TRADES = 20; // minimum trades before adjusting

export interface SlTpParams {
  slBufferATR: number;    // SL distance as ATR multiplier (default 1.2)
  tp1Multiplier: number;  // TP1 as R multiple (default 1.0)
  tp2Multiplier: number;  // TP2 as R multiple (default 2.0)
  tp3Multiplier: number;  // TP3 as R multiple (default 3.0)
  useTrailing: boolean;   // trailing stop vs fixed
  trailingTriggerR: number; // activate trailing after this R (default 1.0)
  trailingStepPct: number;  // trailing step size (default 0.3%)
}

const DEFAULT_PARAMS: SlTpParams = {
  slBufferATR: 1.2,
  tp1Multiplier: 1.0,
  tp2Multiplier: 2.0,
  tp3Multiplier: 3.0,
  useTrailing: false,
  trailingTriggerR: 1.0,
  trailingStepPct: 0.3,
};

export interface RegimeModeKey {
  regime: string;
  mode: string;
}

export class DynamicSlTpOptimizer {
  private params: Map<string, SlTpParams> = new Map();
  private lastOptimized = "";

  private key(regime: string, mode: string): string {
    return `${regime}:${mode}`;
  }

  /** Get optimized SL/TP params for regime+mode combo */
  getParams(regime: string, mode: string): SlTpParams {
    return this.params.get(this.key(regime, mode))
      ?? this.params.get(this.key(regime, "ALL"))
      ?? this.params.get(this.key("ALL", mode))
      ?? { ...DEFAULT_PARAMS };
  }

  /** Run optimization based on historical attribution data */
  async optimize(): Promise<void> {
    try {
      // Get MFE/MAE stats grouped by regime+mode
      const { rows } = await pool.query(`
        SELECT
          regime,
          mode,
          COUNT(*) as cnt,
          AVG(mfe) as avg_mfe,
          AVG(mae) as avg_mae,
          AVG(CASE WHEN win THEN outcome_r ELSE NULL END) as avg_win_r,
          AVG(CASE WHEN NOT win THEN outcome_r ELSE NULL END) as avg_loss_r,
          AVG(CASE WHEN win THEN mfe ELSE NULL END) as avg_win_mfe,
          AVG(CASE WHEN NOT win THEN mae ELSE NULL END) as avg_loss_mae,
          SUM(CASE WHEN win THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*), 0) as win_rate,
          AVG(sl_quality) as avg_sl_quality,
          AVG(tp_quality) as avg_tp_quality,
          SUM(CASE WHEN loss_reason = 'stop_too_tight' THEN 1 ELSE 0 END) as tight_sl_count,
          SUM(CASE WHEN loss_reason = 'target_too_ambitious' THEN 1 ELSE 0 END) as ambitious_tp_count
        FROM trade_outcome_attribution
        WHERE created_at > NOW() - INTERVAL '7 days'
        GROUP BY regime, mode
        HAVING COUNT(*) >= ${MIN_TRADES}
      `);

      for (const row of rows) {
        const regime = String(row.regime ?? "ALL");
        const mode = String(row.mode ?? "ALL");
        const k = this.key(regime, mode);

        const avgMFE = Number(row.avg_mfe ?? 0);
        const avgMAE = Number(row.avg_mae ?? 0);
        const avgWinMFE = Number(row.avg_win_mfe ?? 0);
        const avgLossMAE = Number(row.avg_loss_mae ?? 0);
        const avgSlQuality = Number(row.avg_sl_quality ?? 0.5);
        const avgTpQuality = Number(row.avg_tp_quality ?? 0.5);
        const tightSlCount = Number(row.tight_sl_count ?? 0);
        const ambitiousTpCount = Number(row.ambitious_tp_count ?? 0);
        const cnt = Number(row.cnt ?? 0);
        const winRate = Number(row.win_rate ?? 0);

        const p = { ...DEFAULT_PARAMS };

        // SL optimization: if too many stop_too_tight losses, widen SL
        const tightSlRate = cnt > 0 ? tightSlCount / cnt : 0;
        if (tightSlRate > 0.2) {
          // More than 20% of losses are "stop too tight" → widen
          p.slBufferATR = Math.min(2.0, DEFAULT_PARAMS.slBufferATR * 1.3);
        } else if (avgSlQuality > 0.8 && avgMAE < 0.5) {
          // SL quality is great, MAE is low → can tighten slightly
          p.slBufferATR = Math.max(0.8, DEFAULT_PARAMS.slBufferATR * 0.9);
        }

        // TP optimization: based on MFE capture
        const ambitiousTpRate = cnt > 0 ? ambitiousTpCount / cnt : 0;
        if (ambitiousTpRate > 0.15) {
          // TP too ambitious → lower TP targets
          p.tp1Multiplier = 0.8;
          p.tp2Multiplier = 1.5;
          p.tp3Multiplier = 2.5;
        } else if (avgTpQuality < 0.4 && avgWinMFE > 2.0) {
          // Winning trades go much further than TP → raise targets
          p.tp1Multiplier = 1.2;
          p.tp2Multiplier = 2.5;
          p.tp3Multiplier = 4.0;
        }

        // Trailing stop: use in TREND regime with high MFE
        if (regime === "TREND" && avgWinMFE > 2.0) {
          p.useTrailing = true;
          p.trailingTriggerR = 1.0;
          p.trailingStepPct = 0.25;
        } else if (regime === "RANGE") {
          // Range: fixed TP, tighter
          p.useTrailing = false;
          p.tp1Multiplier = Math.min(p.tp1Multiplier, 0.8);
          p.tp2Multiplier = Math.min(p.tp2Multiplier, 1.5);
        }

        this.params.set(k, p);
      }

      this.lastOptimized = new Date().toISOString();
      await this.persistToRedis();

      console.log(`[DynamicSlTpOptimizer] Optimized ${rows.length} regime+mode combos`);
    } catch (err: any) {
      console.error("[DynamicSlTpOptimizer] Error:", err?.message);
    }
  }

  async loadFromRedis(): Promise<void> {
    try {
      const raw = await redis.get(REDIS_KEY);
      if (raw) {
        const data = JSON.parse(raw) as Record<string, SlTpParams>;
        for (const [k, v] of Object.entries(data)) this.params.set(k, v);
      }
    } catch { /* ignore */ }
  }

  private async persistToRedis(): Promise<void> {
    try {
      const data: Record<string, SlTpParams> = {};
      for (const [k, v] of this.params) data[k] = v;
      await redis.set(REDIS_KEY, JSON.stringify(data), "EX", 86400);
    } catch { /* ignore */ }
  }

  /** Get all optimized params for API */
  getAllParams(): Array<{ regime: string; mode: string; params: SlTpParams }> {
    const result: Array<{ regime: string; mode: string; params: SlTpParams }> = [];
    for (const [k, v] of this.params) {
      const [regime, mode] = k.split(":");
      result.push({ regime, mode, params: v });
    }
    return result;
  }

  getLastOptimized(): string { return this.lastOptimized; }
}
