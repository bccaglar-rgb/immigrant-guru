/**
 * P4: Regime-Based Parameter Switching
 *
 * Different trading parameters for different market regimes:
 *   TREND → wider TP, trailing stop, lower threshold
 *   RANGE → tighter TP, fixed stop, higher threshold
 *   BREAKOUT → wider SL, aggressive TP
 *   COMPRESSION → hold off, higher score requirement
 *   PANIC → reduce exposure, higher threshold
 *
 * Regime memory: stores regime→outcome correlations for pattern matching.
 */

import { redis } from "../../db/redis.ts";
import { pool } from "../../db/pool.ts";

const REDIS_KEY = "optimizer:regime_params";

export interface RegimeParams {
  scoreThreshold: number;       // minimum score to trade (default 65)
  maxPositions: number;          // max simultaneous positions
  slMultiplier: number;          // SL width multiplier (1.0 = normal)
  tpMultiplier: number;          // TP target multiplier
  useTrailing: boolean;
  modeWeights: Record<string, number>;  // per-mode weight override
}

const REGIME_DEFAULTS: Record<string, RegimeParams> = {
  TREND: {
    scoreThreshold: 55,
    maxPositions: 8,
    slMultiplier: 1.0,
    tpMultiplier: 1.3,  // bigger targets in trend
    useTrailing: true,
    modeWeights: { FLOW: 1.0, AGGRESSIVE: 0.8, BALANCED: 1.0, CAPITAL_GUARD: 0.7 },
  },
  RANGE: {
    scoreThreshold: 70,  // higher bar in range
    maxPositions: 4,
    slMultiplier: 0.8,   // tighter stops
    tpMultiplier: 0.7,   // lower targets
    useTrailing: false,
    modeWeights: { FLOW: 0.6, AGGRESSIVE: 0.3, BALANCED: 1.0, CAPITAL_GUARD: 1.2 },
  },
  BREAKOUT: {
    scoreThreshold: 60,
    maxPositions: 6,
    slMultiplier: 1.3,   // wider stops for breakout
    tpMultiplier: 1.5,   // aggressive targets
    useTrailing: true,
    modeWeights: { FLOW: 1.2, AGGRESSIVE: 1.0, BALANCED: 0.8, CAPITAL_GUARD: 0.5 },
  },
  UNKNOWN: {
    scoreThreshold: 65,
    maxPositions: 5,
    slMultiplier: 1.0,
    tpMultiplier: 1.0,
    useTrailing: false,
    modeWeights: { FLOW: 1.0, AGGRESSIVE: 0.7, BALANCED: 1.0, CAPITAL_GUARD: 1.0 },
  },
};

export interface RegimeMemoryEntry {
  regime: string;
  conditions: string;     // e.g. "trend+low_spread+oi_rising"
  outcomeAvgR: number;
  winRate: number;
  sampleSize: number;
  lastSeen: string;
}

export class RegimeParameterEngine {
  private params: Map<string, RegimeParams> = new Map();
  private memory: RegimeMemoryEntry[] = [];
  private currentRegime = "UNKNOWN";

  constructor() {
    // Initialize with defaults
    for (const [regime, p] of Object.entries(REGIME_DEFAULTS)) {
      this.params.set(regime, { ...p });
    }
  }

  /** Get params for current or specific regime */
  getParams(regime?: string): RegimeParams {
    const r = regime ?? this.currentRegime;
    return this.params.get(r) ?? this.params.get("UNKNOWN")!;
  }

  /** Update current regime from V2 engine data */
  setCurrentRegime(regime: string): void {
    if (regime !== this.currentRegime) {
      console.log(`[RegimeParameterEngine] Regime switched: ${this.currentRegime} → ${regime}`);
      this.currentRegime = regime;
    }
  }

  /** Get mode weight adjusted by regime */
  getModeWeight(mode: string, regime?: string): number {
    const p = this.getParams(regime);
    return p.modeWeights[mode] ?? 1.0;
  }

  /** Record regime→outcome for memory */
  async recordRegimeOutcome(entry: {
    regime: string;
    conditions: string;
    outcomeR: number;
    win: boolean;
  }): Promise<void> {
    // Find existing memory entry
    const existing = this.memory.find(
      (m) => m.regime === entry.regime && m.conditions === entry.conditions,
    );

    if (existing) {
      // Update rolling average
      existing.sampleSize++;
      existing.outcomeAvgR = (existing.outcomeAvgR * (existing.sampleSize - 1) + entry.outcomeR) / existing.sampleSize;
      existing.winRate = (existing.winRate * (existing.sampleSize - 1) + (entry.win ? 1 : 0)) / existing.sampleSize;
      existing.lastSeen = new Date().toISOString();
    } else {
      this.memory.push({
        regime: entry.regime,
        conditions: entry.conditions,
        outcomeAvgR: entry.outcomeR,
        winRate: entry.win ? 1 : 0,
        sampleSize: 1,
        lastSeen: new Date().toISOString(),
      });
    }

    // Keep memory bounded
    if (this.memory.length > 200) {
      this.memory.sort((a, b) => b.sampleSize - a.sampleSize);
      this.memory = this.memory.slice(0, 150);
    }

    await this.persistToRedis();
  }

  /** Find similar historical patterns for a setup */
  findSimilarPatterns(regime: string, conditions: string): RegimeMemoryEntry[] {
    return this.memory
      .filter((m) => m.regime === regime && m.sampleSize >= 5)
      .sort((a, b) => {
        // Score similarity by condition overlap
        const aTokens = a.conditions.split("+");
        const condTokens = conditions.split("+");
        const aOverlap = aTokens.filter((t) => condTokens.includes(t)).length;
        const bTokens = b.conditions.split("+");
        const bOverlap = bTokens.filter((t) => condTokens.includes(t)).length;
        return bOverlap - aOverlap;
      })
      .slice(0, 5);
  }

  /** Auto-adjust regime params based on accumulated outcomes */
  async autoAdjust(): Promise<void> {
    try {
      const { rows } = await pool.query(`
        SELECT
          regime,
          COUNT(*) as cnt,
          AVG(outcome_r) as avg_r,
          SUM(CASE WHEN win THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*),0) as win_rate,
          AVG(mae) as avg_mae,
          AVG(mfe) as avg_mfe
        FROM trade_outcome_attribution
        WHERE created_at > NOW() - INTERVAL '3 days'
        GROUP BY regime
        HAVING COUNT(*) >= 10
      `);

      for (const row of rows) {
        const regime = String(row.regime);
        const p = this.params.get(regime);
        if (!p) continue;

        const winRate = Number(row.win_rate ?? 0);
        const avgMAE = Number(row.avg_mae ?? 0);
        const avgMFE = Number(row.avg_mfe ?? 0);

        // Adjust score threshold based on win rate
        if (winRate < 0.35) {
          p.scoreThreshold = Math.min(80, p.scoreThreshold + 5);
        } else if (winRate > 0.55) {
          p.scoreThreshold = Math.max(45, p.scoreThreshold - 3);
        }

        // Adjust SL based on MAE
        if (avgMAE > 1.5) {
          p.slMultiplier = Math.min(1.8, p.slMultiplier * 1.1);
        } else if (avgMAE < 0.5) {
          p.slMultiplier = Math.max(0.6, p.slMultiplier * 0.95);
        }

        // Adjust TP based on MFE
        if (avgMFE > 2.5) {
          p.tpMultiplier = Math.min(2.0, p.tpMultiplier * 1.1);
        } else if (avgMFE < 1.0) {
          p.tpMultiplier = Math.max(0.5, p.tpMultiplier * 0.9);
        }
      }

      await this.persistToRedis();
      console.log(`[RegimeParameterEngine] Auto-adjusted ${rows.length} regime params`);
    } catch (err: any) {
      console.error("[RegimeParameterEngine] autoAdjust error:", err?.message);
    }
  }

  async loadFromRedis(): Promise<void> {
    try {
      const raw = await redis.get(REDIS_KEY);
      if (raw) {
        const data = JSON.parse(raw) as {
          params: Record<string, RegimeParams>;
          memory: RegimeMemoryEntry[];
          currentRegime: string;
        };
        for (const [k, v] of Object.entries(data.params)) this.params.set(k, v);
        this.memory = data.memory ?? [];
        this.currentRegime = data.currentRegime ?? "UNKNOWN";
      }
    } catch { /* ignore */ }
  }

  private async persistToRedis(): Promise<void> {
    try {
      const data = {
        params: Object.fromEntries(this.params),
        memory: this.memory,
        currentRegime: this.currentRegime,
      };
      await redis.set(REDIS_KEY, JSON.stringify(data), "EX", 86400);
    } catch { /* ignore */ }
  }

  /** API summary */
  getSummary(): {
    currentRegime: string;
    params: Record<string, RegimeParams>;
    memorySize: number;
    topPatterns: RegimeMemoryEntry[];
  } {
    return {
      currentRegime: this.currentRegime,
      params: Object.fromEntries(this.params),
      memorySize: this.memory.length,
      topPatterns: this.memory
        .filter((m) => m.sampleSize >= 5)
        .sort((a, b) => b.sampleSize - a.sampleSize)
        .slice(0, 10),
    };
  }
}
