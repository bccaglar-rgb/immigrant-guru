/**
 * Hub Idea Creator — Shared helper for all 4 mode hubs
 *
 * When a hub produces a tradeable decision (PROBE/CONFIRMED/APPROVED+), creates a
 * trade idea record in the database for reporting and tracking.
 * Deduplicates: skips if an active idea already exists for symbol+mode.
 *
 * V2 Changes:
 *   - Added "PROBE" and "CONFIRMED" to TRADEABLE_DECISIONS
 *   - Support for multi-TP: uses tpSl.tpLevels array if available, else wraps tpSl.tp
 */

import { randomUUID } from "node:crypto";
import { pool } from "../../db/pool.ts";

type ScoringMode = "BALANCED" | "FLOW" | "AGGRESSIVE" | "CAPITAL_GUARD" | "PRIME_AI";

interface HubOutputForIdea {
  symbol: string;
  timeframe: string;
  price: number;
  adjustedScore: number;
  decision: string;
  direction: string; // "LONG" | "SHORT" | "NONE"
  tpSl: {
    entryZone: [number, number];
    tp: number;
    sl: number;
    tpMarginPct: number;
    slMarginPct: number;
    riskRewardRatio: number;
    tpLevels?: number[];  // optional multi-TP (AGG: [tp1, tp2, tp3])
  } | null;
  reasons: string[];
  regime: { regime: string };
  coreScore: { total: number };
  edge: { expectedEdge: number };
  processedAt: number;
}

/** Decisions that count as "tradeable" for each hub type */
const TRADEABLE_DECISIONS = new Set([
  "APPROVED", "HIGH_QUALITY", "STRONG_FLOW", "STRONG_MOMENTUM", "VERIFIED_SAFE",
  "PROBE", "CONFIRMED",  // V2 decision types
]);

/**
 * Create trade ideas for all tradeable outputs from a hub cycle.
 * Skips outputs that are not tradeable, have no direction, or already have active ideas.
 */
export async function createHubTradeIdeas(
  outputs: HubOutputForIdea[],
  mode: ScoringMode,
  cycleId: string,
): Promise<number> {
  let created = 0;

  for (const output of outputs) {
    // Only create ideas for tradeable decisions
    if (!TRADEABLE_DECISIONS.has(output.decision)) continue;

    // Must have a direction
    if (output.direction === "NONE") continue;

    // Must have TP/SL levels
    if (!output.tpSl) continue;

    try {
      // Check for existing active idea for this symbol+mode
      const existing = await pool.query(
        `SELECT id FROM trade_ideas
         WHERE symbol = $1 AND scoring_mode = $2 AND user_id LIKE 'hub-%'
         AND status IN ('PENDING', 'ACTIVE')
         LIMIT 1`,
        [output.symbol, mode],
      );

      if (existing.rows.length > 0) continue; // Already tracked

      const ideaId = `hub_${mode.toLowerCase()}_${output.symbol}_${Date.now()}`;
      const userId = `hub-${mode.toLowerCase()}`;
      const now = new Date().toISOString();
      const tpSl = output.tpSl;

      // Valid for 60 bars from creation
      const validBars = 60;
      const barMs = output.timeframe === "1m" ? 60_000
        : output.timeframe === "5m" ? 300_000
        : output.timeframe === "15m" ? 900_000
        : output.timeframe === "30m" ? 1_800_000
        : output.timeframe === "1h" ? 3_600_000
        : output.timeframe === "4h" ? 14_400_000
        : 86_400_000;
      const validUntil = new Date(Date.now() + validBars * barMs).toISOString();

      // Use tpLevels if available (AGG: 3 TPs), else wrap single tp
      const tpLevels = tpSl.tpLevels && tpSl.tpLevels.length > 0
        ? tpSl.tpLevels
        : [tpSl.tp];

      await pool.query(
        `INSERT INTO trade_ideas
          (id, user_id, symbol, direction, confidence_pct, scoring_mode,
           approved_modes, mode_scores, entry_low, entry_high,
           sl_levels, tp_levels, status, result,
           hit_level_type, hit_level_index, hit_level_price,
           minutes_to_entry, minutes_to_exit, minutes_total,
           horizon, timeframe, setup, trade_validity, entry_window, slippage_risk,
           triggers_to_activate, invalidation, timestamp_utc,
           valid_until_bars, valid_until_utc, market_state,
           flow_analysis, trade_intent, raw_text, incomplete, price_precision,
           activated_at, resolved_at, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40)
         ON CONFLICT (id) DO NOTHING`,
        [
          ideaId, userId, output.symbol,
          output.direction as "LONG" | "SHORT",
          output.adjustedScore,
          mode,
          JSON.stringify([mode]),
          JSON.stringify({ [mode]: output.adjustedScore }),
          tpSl.entryZone[0], tpSl.entryZone[1],
          JSON.stringify([tpSl.sl]),
          JSON.stringify(tpLevels),
          "PENDING", "NONE",
          null, null, null,
          null, null, null,
          "INTRADAY", output.timeframe,
          output.reasons[0] ?? output.decision,
          "VALID", "OPEN", "LOW",
          JSON.stringify([]), "",
          now,
          validBars, validUntil,
          JSON.stringify({
            trend: output.regime.regime,
            htfBias: output.direction,
            volatility: "NORMAL",
            execution: "NORMAL",
          }),
          JSON.stringify(output.reasons),
          JSON.stringify([`${mode} hub: ${output.decision}`]),
          `${mode} Hub ${output.decision}: ${output.symbol} ${output.direction} score=${output.adjustedScore}`,
          false,
          null,
          null, null, now,
        ],
      );

      // Create IDEA_CREATED event
      await pool.query(
        `INSERT INTO trade_idea_events (id, idea_id, event_type, ts, price, meta)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          randomUUID(), ideaId, "IDEA_CREATED", now, output.price,
          JSON.stringify({
            symbol: output.symbol,
            direction: output.direction,
            entry_low: tpSl.entryZone[0],
            entry_high: tpSl.entryZone[1],
            tp_count: tpLevels.length,
            source: `${mode}_HUB`,
            cycleId,
          }),
        ],
      );

      created++;
    } catch (err) {
      console.error(`[HubIdeaCreator] Error creating idea for ${output.symbol}@${mode}:`, (err as Error).message);
    }
  }

  return created;
}
