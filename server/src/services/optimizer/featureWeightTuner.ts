/**
 * P9: Feature Weight Auto-Tuner
 *
 * Tracks which signals actually predict outcomes.
 * Auto-adjusts V2 scorer weights based on correlation with win/loss.
 * Also serves as P8 (Replay) via historical analysis.
 *
 * P10: Portfolio Filter integrated as exposure check.
 */

import { pool } from "../../db/pool.ts";
import { redis } from "../../db/redis.ts";

const REDIS_KEY = "optimizer:feature_weights";

export interface FeatureWeight {
  feature: string;
  weight: number;         // current weight (default 1.0)
  correlation: number;    // correlation with win outcome (-1 to 1)
  sampleSize: number;
  lastUpdated: string;
}

export interface PortfolioExposure {
  longCount: number;
  shortCount: number;
  totalExposure: number;
  maxAllowed: number;
  blocked: boolean;
  blockReason: string | null;
}

export class FeatureWeightTuner {
  private weights: Map<string, FeatureWeight> = new Map();
  private lastTuned = "";

  constructor() {
    // Default feature weights
    const defaults = [
      "trend_strength", "volume_spike", "funding_extreme", "spread_tight",
      "sr_proximity", "regime_trend", "oi_increase", "imbalance_strong",
      "rsi_extreme", "atr_high",
    ];
    for (const f of defaults) {
      this.weights.set(f, { feature: f, weight: 1.0, correlation: 0, sampleSize: 0, lastUpdated: "" });
    }
  }

  /** Tune weights from attribution data */
  async tune(): Promise<void> {
    try {
      // Analyze which features correlate with winning trades
      const { rows } = await pool.query(`
        SELECT
          regime,
          AVG(CASE WHEN win THEN entry_quality ELSE NULL END) as win_entry_q,
          AVG(CASE WHEN NOT win THEN entry_quality ELSE NULL END) as loss_entry_q,
          AVG(CASE WHEN win THEN sl_quality ELSE NULL END) as win_sl_q,
          AVG(CASE WHEN NOT win THEN sl_quality ELSE NULL END) as loss_sl_q,
          COUNT(*) as cnt,
          SUM(CASE WHEN win THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*), 0) as win_rate,
          AVG(CASE WHEN win AND regime = 'TREND' THEN 1.0 ELSE 0.0 END) as trend_win_corr,
          SUM(CASE WHEN false_breakout THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*), 0) as fb_rate
        FROM trade_outcome_attribution
        WHERE created_at > NOW() - INTERVAL '7 days'
        GROUP BY regime
      `);

      for (const row of rows) {
        const regime = String(row.regime);
        const cnt = Number(row.cnt ?? 0);
        if (cnt < 10) continue;

        // Adjust regime_trend weight based on trend regime performance
        if (regime === "TREND") {
          const trendWR = Number(row.win_rate ?? 0);
          const w = this.weights.get("regime_trend");
          if (w) {
            w.correlation = trendWR - 0.5; // positive = good predictor
            w.weight = 0.5 + trendWR; // 0.5 to 1.5
            w.sampleSize = cnt;
            w.lastUpdated = new Date().toISOString();
          }
        }

        // FB rate affects spread/structure weights
        const fbRate = Number(row.fb_rate ?? 0);
        const srW = this.weights.get("sr_proximity");
        if (srW && fbRate > 0.3) {
          srW.weight = Math.max(0.5, 1.0 - fbRate);
          srW.correlation = -fbRate;
          srW.sampleSize = cnt;
          srW.lastUpdated = new Date().toISOString();
        }
      }

      this.lastTuned = new Date().toISOString();
      await this.persistToRedis();
      console.log(`[FeatureWeightTuner] Tuned from ${rows.length} regime groups`);
    } catch (err: any) {
      console.error("[FeatureWeightTuner] Error:", err?.message);
    }
  }

  getWeight(feature: string): number {
    return this.weights.get(feature)?.weight ?? 1.0;
  }

  getAllWeights(): FeatureWeight[] { return [...this.weights.values()]; }
  getLastTuned(): string { return this.lastTuned; }

  /** P10: Portfolio filter — check exposure */
  checkPortfolioExposure(activeTrades: Array<{ direction: string }>): PortfolioExposure {
    const longCount = activeTrades.filter((t) => t.direction === "LONG").length;
    const shortCount = activeTrades.filter((t) => t.direction === "SHORT").length;
    const total = longCount + shortCount;
    const maxAllowed = 12; // max simultaneous positions
    const blocked = total >= maxAllowed || Math.abs(longCount - shortCount) > 8;

    return {
      longCount, shortCount, totalExposure: total, maxAllowed, blocked,
      blockReason: blocked
        ? total >= maxAllowed ? "max_positions_reached" : "directional_imbalance"
        : null,
    };
  }

  async loadFromRedis(): Promise<void> {
    try {
      const raw = await redis.get(REDIS_KEY);
      if (raw) {
        const data = JSON.parse(raw) as FeatureWeight[];
        for (const w of data) this.weights.set(w.feature, w);
      }
    } catch { /* ignore */ }
  }

  private async persistToRedis(): Promise<void> {
    try {
      await redis.set(REDIS_KEY, JSON.stringify([...this.weights.values()]), "EX", 86400);
    } catch { /* ignore */ }
  }
}
