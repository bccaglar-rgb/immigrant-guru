/**
 * P6: Confidence Calibration Engine
 *
 * Tracks: when system says "85% confidence", does it actually win 85%?
 * Builds calibration curve from score bands → actual win rates.
 * Auto-adjusts score thresholds based on real outcomes.
 */

import { pool } from "../../db/pool.ts";
import { redis } from "../../db/redis.ts";

const REDIS_KEY = "optimizer:confidence_calibration";

export interface CalibrationBand {
  band: string;       // e.g. "80-90"
  min: number;
  max: number;
  predicted: number;  // midpoint of band
  actual: number;     // actual win rate in this band
  sampleSize: number;
  calibrationError: number; // |predicted - actual|
}

export class ConfidenceCalibrator {
  private bands: CalibrationBand[] = [];
  private lastCalibrated = "";

  constructor() {
    // Initialize bands
    const bandDefs = [
      { band: "90-100", min: 90, max: 100 },
      { band: "80-90", min: 80, max: 90 },
      { band: "70-80", min: 70, max: 80 },
      { band: "60-70", min: 60, max: 70 },
      { band: "50-60", min: 50, max: 60 },
      { band: "40-50", min: 40, max: 50 },
      { band: "30-40", min: 30, max: 40 },
      { band: "0-30", min: 0, max: 30 },
    ];
    this.bands = bandDefs.map((d) => ({
      ...d, predicted: (d.min + d.max) / 200, actual: 0, sampleSize: 0, calibrationError: 0,
    }));
  }

  /** Recalibrate from DB */
  async calibrate(): Promise<void> {
    try {
      for (const band of this.bands) {
        const { rows } = await pool.query(
          `SELECT
             COUNT(*) as cnt,
             SUM(CASE WHEN win THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*), 0) as win_rate
           FROM trade_outcome_attribution
           WHERE score >= $1 AND score < $2
             AND created_at > NOW() - INTERVAL '7 days'`,
          [band.min, band.max],
        );
        const row = rows[0];
        band.sampleSize = Number(row?.cnt ?? 0);
        band.actual = Number(row?.win_rate ?? 0);
        band.calibrationError = Math.abs(band.predicted - band.actual);
      }
      this.lastCalibrated = new Date().toISOString();
      await this.persistToRedis();
      console.log(`[ConfidenceCalibrator] Calibrated ${this.bands.filter((b) => b.sampleSize > 0).length} bands`);
    } catch (err: any) {
      console.error("[ConfidenceCalibrator] Error:", err?.message);
    }
  }

  /** Get calibrated win probability for a given score */
  getCalibratedProbability(score: number): number {
    const band = this.bands.find((b) => score >= b.min && score < b.max);
    if (!band || band.sampleSize < 5) return score / 100; // not enough data
    return band.actual;
  }

  /** Check if system is well-calibrated */
  isWellCalibrated(): boolean {
    const significantBands = this.bands.filter((b) => b.sampleSize >= 10);
    if (significantBands.length < 3) return true; // not enough data to judge
    const avgError = significantBands.reduce((s, b) => s + b.calibrationError, 0) / significantBands.length;
    return avgError < 0.15; // within 15% is acceptable
  }

  getBands(): CalibrationBand[] { return this.bands; }
  getLastCalibrated(): string { return this.lastCalibrated; }

  async loadFromRedis(): Promise<void> {
    try {
      const raw = await redis.get(REDIS_KEY);
      if (raw) { this.bands = JSON.parse(raw); }
    } catch { /* ignore */ }
  }

  private async persistToRedis(): Promise<void> {
    try { await redis.set(REDIS_KEY, JSON.stringify(this.bands), "EX", 86400); } catch { /* ignore */ }
  }
}
