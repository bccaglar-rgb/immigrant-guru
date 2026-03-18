/**
 * P2: Trade Outcome Attribution
 *
 * For every resolved trade, generates:
 *   - Win/loss reason labels
 *   - Entry/SL/TP/hold quality scores
 *   - MFE (max favorable excursion) / MAE (max adverse excursion)
 *   - Setup fingerprint for pattern matching
 *
 * Stores in trade_outcome_attribution table.
 * Feeds into ModePerformanceTracker.
 */

import { pool } from "../../db/pool.ts";
import type { ModePerformanceTracker } from "./modePerformanceTracker.ts";

// Win reason labels
type WinReason =
  | "aligned_structure"
  | "liquidity_support"
  | "strong_execution"
  | "squeeze_continuation"
  | "trend_alignment"
  | "volume_confirmation"
  | "funding_divergence";

// Loss reason labels
type LossReason =
  | "bad_entry"
  | "bad_location"
  | "weak_structure"
  | "fake_breakout"
  | "poor_execution"
  | "news_shock"
  | "stop_too_tight"
  | "target_too_ambitious"
  | "regime_shift"
  | "liquidity_gap";

export interface TradeAttribution {
  setupId: string;
  symbol: string;
  mode: string;
  regime: string;
  score: number;
  direction: "LONG" | "SHORT";
  entry: number;
  sl: number;
  tp1: number;
  tp2: number | null;
  entryQuality: number;    // 0-1
  slQuality: number;       // 0-1
  tpQuality: number;       // 0-1
  holdQuality: number;     // 0-1
  outcomeR: number;
  win: boolean;
  mfe: number;             // max favorable excursion in R
  mae: number;             // max adverse excursion in R
  holdingMinutes: number;
  winReason: WinReason | null;
  lossReason: LossReason | null;
  falseBreakout: boolean;
  stopOut: boolean;
  createdAt: string;
}

export class TradeOutcomeAttributor {
  private modeTracker: ModePerformanceTracker;

  constructor(modeTracker: ModePerformanceTracker) {
    this.modeTracker = modeTracker;
  }

  /**
   * Attribute a resolved trade idea.
   * Called by TradeIdeaTracker when a trade resolves.
   */
  async attributeTrade(trade: {
    id: string;
    symbol: string;
    direction: "LONG" | "SHORT";
    scoringMode: string;
    finalScore: number;
    entry: number;
    sl: number;
    tp1: number;
    tp2: number | null;
    exitPrice: number;
    win: boolean;
    regime: string;
    createdAt: string;
    resolvedAt: string;
    highPrice: number;   // highest price during trade
    lowPrice: number;    // lowest price during trade
  }): Promise<TradeAttribution> {
    const isLong = trade.direction === "LONG";
    const riskR = Math.abs(trade.entry - trade.sl);
    if (riskR === 0) return this.emptyAttribution(trade);

    // MFE / MAE in R
    const mfe = isLong
      ? (trade.highPrice - trade.entry) / riskR
      : (trade.entry - trade.lowPrice) / riskR;
    const mae = isLong
      ? (trade.entry - trade.lowPrice) / riskR
      : (trade.highPrice - trade.entry) / riskR;

    // Outcome in R
    const outcomeR = isLong
      ? (trade.exitPrice - trade.entry) / riskR
      : (trade.entry - trade.exitPrice) / riskR;

    // Holding time
    const holdingMinutes = (Date.parse(trade.resolvedAt) - Date.parse(trade.createdAt)) / 60_000;

    // Quality scores (0-1)
    const entryQuality = this.scoreEntryQuality(trade, mfe, mae);
    const slQuality = this.scoreSlQuality(trade, mae, riskR);
    const tpQuality = this.scoreTpQuality(trade, mfe, outcomeR);
    const holdQuality = this.scoreHoldQuality(mfe, outcomeR);

    // Attribution labels
    const falseBreakout = mae > 1.5 && !trade.win; // went past SL significantly
    const stopOut = !trade.win && mae >= 0.95; // hit SL precisely
    const winReason = trade.win ? this.determineWinReason(trade, mfe, entryQuality) : null;
    const lossReason = !trade.win ? this.determineLossReason(trade, mae, mfe, entryQuality, falseBreakout) : null;

    const attribution: TradeAttribution = {
      setupId: trade.id,
      symbol: trade.symbol,
      mode: trade.scoringMode,
      regime: trade.regime,
      score: trade.finalScore,
      direction: trade.direction,
      entry: trade.entry,
      sl: trade.sl,
      tp1: trade.tp1,
      tp2: trade.tp2,
      entryQuality,
      slQuality,
      tpQuality,
      holdQuality,
      outcomeR: Math.round(outcomeR * 100) / 100,
      win: trade.win,
      mfe: Math.round(mfe * 100) / 100,
      mae: Math.round(mae * 100) / 100,
      holdingMinutes: Math.round(holdingMinutes),
      winReason,
      lossReason,
      falseBreakout,
      stopOut,
      createdAt: new Date().toISOString(),
    };

    // Feed mode tracker
    this.modeTracker.recordTrade({
      mode: trade.scoringMode,
      win: trade.win,
      outcomeR: attribution.outcomeR,
      holdingMinutes: attribution.holdingMinutes,
      falseBreakout,
      stopOut,
    });

    // Persist to DB
    await this.saveAttribution(attribution);

    return attribution;
  }

  private scoreEntryQuality(trade: any, mfe: number, mae: number): number {
    // Good entry: low MAE, price moved in favor quickly
    if (mae < 0.3 && mfe > 1.0) return 0.95;
    if (mae < 0.5 && mfe > 0.5) return 0.75;
    if (mae < 1.0) return 0.50;
    return 0.25;
  }

  private scoreSlQuality(_trade: any, mae: number, riskR: number): number {
    // Good SL: not hit unnecessarily, not too tight
    if (mae < 0.5) return 0.90; // never came close to SL
    if (mae < 0.8) return 0.70;
    if (mae < 1.0) return 0.50; // nearly hit but held
    return 0.20; // SL was too tight or bad location
  }

  private scoreTpQuality(_trade: any, mfe: number, outcomeR: number): number {
    // Good TP: captured most of the favorable move
    if (mfe <= 0) return 0.10;
    const captureRatio = outcomeR / mfe;
    if (captureRatio > 0.8) return 0.95;
    if (captureRatio > 0.5) return 0.70;
    if (captureRatio > 0.3) return 0.45;
    return 0.20; // TP was too ambitious, left money or reversed
  }

  private scoreHoldQuality(mfe: number, outcomeR: number): number {
    // Good hold: didn't exit too early or too late
    if (mfe <= 0) return 0.10;
    const captureRatio = mfe > 0 ? outcomeR / mfe : 0;
    if (captureRatio > 0.7) return 0.90;
    if (captureRatio > 0.4) return 0.65;
    return 0.30;
  }

  private determineWinReason(trade: any, mfe: number, entryQuality: number): WinReason {
    if (trade.regime === "TREND" && mfe > 2.0) return "trend_alignment";
    if (entryQuality > 0.8) return "strong_execution";
    if (mfe > 1.5) return "squeeze_continuation";
    return "aligned_structure";
  }

  private determineLossReason(trade: any, mae: number, mfe: number, entryQuality: number, falseBreakout: boolean): LossReason {
    if (falseBreakout) return "fake_breakout";
    if (entryQuality < 0.3) return "bad_entry";
    if (mae > 2.0 && mfe < 0.3) return "bad_location";
    if (mae >= 0.95 && mae <= 1.05) return "stop_too_tight";
    if (mfe > 1.5 && trade.win === false) return "target_too_ambitious";
    if (trade.regime === "RANGE" || trade.regime === "UNKNOWN") return "weak_structure";
    return "poor_execution";
  }

  private emptyAttribution(trade: any): TradeAttribution {
    return {
      setupId: trade.id, symbol: trade.symbol, mode: trade.scoringMode,
      regime: trade.regime, score: trade.finalScore, direction: trade.direction,
      entry: trade.entry, sl: trade.sl, tp1: trade.tp1, tp2: trade.tp2,
      entryQuality: 0, slQuality: 0, tpQuality: 0, holdQuality: 0,
      outcomeR: 0, win: trade.win, mfe: 0, mae: 0, holdingMinutes: 0,
      winReason: null, lossReason: null, falseBreakout: false, stopOut: false,
      createdAt: new Date().toISOString(),
    };
  }

  private async saveAttribution(a: TradeAttribution): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO trade_outcome_attribution
         (setup_id, symbol, mode, regime, score, direction, entry_price, sl_price, tp1_price, tp2_price,
          entry_quality, sl_quality, tp_quality, hold_quality, outcome_r, win, mfe, mae,
          holding_minutes, win_reason, loss_reason, false_breakout, stop_out, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
         ON CONFLICT (setup_id) DO UPDATE SET
           entry_quality=EXCLUDED.entry_quality, sl_quality=EXCLUDED.sl_quality,
           tp_quality=EXCLUDED.tp_quality, hold_quality=EXCLUDED.hold_quality,
           outcome_r=EXCLUDED.outcome_r, win=EXCLUDED.win, mfe=EXCLUDED.mfe, mae=EXCLUDED.mae,
           holding_minutes=EXCLUDED.holding_minutes, win_reason=EXCLUDED.win_reason,
           loss_reason=EXCLUDED.loss_reason, false_breakout=EXCLUDED.false_breakout,
           stop_out=EXCLUDED.stop_out`,
        [a.setupId, a.symbol, a.mode, a.regime, a.score, a.direction,
         a.entry, a.sl, a.tp1, a.tp2,
         a.entryQuality, a.slQuality, a.tpQuality, a.holdQuality,
         a.outcomeR, a.win, a.mfe, a.mae,
         a.holdingMinutes, a.winReason, a.lossReason,
         a.falseBreakout, a.stopOut, a.createdAt],
      );
    } catch (err: any) {
      console.error("[TradeOutcomeAttributor] DB save error:", err?.message);
    }
  }

  /** Get attribution stats summary */
  async getRecentStats(hours = 24): Promise<{
    total: number;
    wins: number;
    losses: number;
    avgMFE: number;
    avgMAE: number;
    topLossReasons: Array<{ reason: string; count: number }>;
    topWinReasons: Array<{ reason: string; count: number }>;
  }> {
    try {
      const { rows } = await pool.query(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN win THEN 1 ELSE 0 END) as wins,
           SUM(CASE WHEN NOT win THEN 1 ELSE 0 END) as losses,
           AVG(mfe) as avg_mfe,
           AVG(mae) as avg_mae
         FROM trade_outcome_attribution
         WHERE created_at > NOW() - INTERVAL '${hours} hours'`,
      );
      const row = rows[0] ?? {};

      const { rows: lossReasons } = await pool.query(
        `SELECT loss_reason as reason, COUNT(*) as count
         FROM trade_outcome_attribution
         WHERE NOT win AND loss_reason IS NOT NULL AND created_at > NOW() - INTERVAL '${hours} hours'
         GROUP BY loss_reason ORDER BY count DESC LIMIT 5`,
      );
      const { rows: winReasons } = await pool.query(
        `SELECT win_reason as reason, COUNT(*) as count
         FROM trade_outcome_attribution
         WHERE win AND win_reason IS NOT NULL AND created_at > NOW() - INTERVAL '${hours} hours'
         GROUP BY win_reason ORDER BY count DESC LIMIT 5`,
      );

      return {
        total: Number(row.total ?? 0),
        wins: Number(row.wins ?? 0),
        losses: Number(row.losses ?? 0),
        avgMFE: Number(row.avg_mfe ?? 0),
        avgMAE: Number(row.avg_mae ?? 0),
        topLossReasons: lossReasons.map((r: any) => ({ reason: r.reason, count: Number(r.count) })),
        topWinReasons: winReasons.map((r: any) => ({ reason: r.reason, count: Number(r.count) })),
      };
    } catch {
      return { total: 0, wins: 0, losses: 0, avgMFE: 0, avgMAE: 0, topLossReasons: [], topWinReasons: [] };
    }
  }
}
