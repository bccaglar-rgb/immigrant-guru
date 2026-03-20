import { randomUUID } from "node:crypto";
import { pool } from "../db/pool.ts";
import type { TradeIdeaEventRecord, TradeIdeaRecord, TradeIdeaStatus } from "./tradeIdeaTypes.ts";
import { normalizeScoringMode, type ScoringMode } from "./scoringMode.ts";

/* ─────────── row → TypeScript mappers ────────── */

function rowToIdea(r: any): TradeIdeaRecord {
  return {
    id: r.id,
    user_id: r.user_id,
    symbol: r.symbol,
    direction: r.direction,
    confidence_pct: Number(r.confidence_pct),
    scoring_mode: normalizeScoringMode(r.scoring_mode),
    approved_modes: r.approved_modes ?? [],
    mode_scores: r.mode_scores ?? {},
    entry_low: Number(r.entry_low),
    entry_high: Number(r.entry_high),
    sl_levels: r.sl_levels ?? [],
    tp_levels: r.tp_levels ?? [],
    status: r.status,
    result: r.result,
    hit_level_type: r.hit_level_type ?? null,
    hit_level_index: r.hit_level_index ?? null,
    hit_level_price: r.hit_level_price != null ? Number(r.hit_level_price) : null,
    minutes_to_entry: r.minutes_to_entry ?? null,
    minutes_to_exit: r.minutes_to_exit ?? null,
    minutes_total: r.minutes_total ?? null,
    horizon: r.horizon,
    timeframe: r.timeframe,
    setup: r.setup ?? "",
    trade_validity: r.trade_validity ?? "WEAK",
    entry_window: r.entry_window ?? "CLOSED",
    slippage_risk: r.slippage_risk ?? "HIGH",
    triggers_to_activate: r.triggers_to_activate ?? [],
    invalidation: r.invalidation ?? "",
    timestamp_utc: r.timestamp_utc?.toISOString?.() ?? r.timestamp_utc,
    valid_until_bars: r.valid_until_bars,
    valid_until_utc: r.valid_until_utc?.toISOString?.() ?? r.valid_until_utc,
    market_state: r.market_state ?? {},
    flow_analysis: r.flow_analysis ?? [],
    trade_intent: r.trade_intent ?? [],
    raw_text: r.raw_text ?? "",
    incomplete: r.incomplete ?? false,
    price_precision: r.price_precision ?? undefined,
    created_at: r.created_at?.toISOString?.() ?? r.created_at,
    activated_at: r.activated_at?.toISOString?.() ?? r.activated_at ?? null,
    resolved_at: r.resolved_at?.toISOString?.() ?? r.resolved_at ?? null,
  };
}

function rowToEvent(r: any): TradeIdeaEventRecord {
  return {
    id: r.id,
    idea_id: r.idea_id,
    event_type: r.event_type,
    ts: r.ts?.toISOString?.() ?? r.ts,
    price: r.price != null ? Number(r.price) : null,
    meta: r.meta ?? {},
  };
}

/* ═══════════════════════════════════════════════════════════════
 *  TradeIdeaStore — PostgreSQL-backed
 *  Public interface stays identical for all consumers.
 * ═══════════════════════════════════════════════════════════════ */

export class TradeIdeaStore {
  async createIdea(idea: TradeIdeaRecord, initialPrice: number) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
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
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40)`,
        [
          idea.id, idea.user_id, idea.symbol, idea.direction, idea.confidence_pct, idea.scoring_mode,
          JSON.stringify(idea.approved_modes), JSON.stringify(idea.mode_scores),
          idea.entry_low, idea.entry_high,
          JSON.stringify(idea.sl_levels), JSON.stringify(idea.tp_levels),
          idea.status, idea.result,
          idea.hit_level_type, idea.hit_level_index, idea.hit_level_price,
          idea.minutes_to_entry, idea.minutes_to_exit, idea.minutes_total,
          idea.horizon, idea.timeframe, idea.setup, idea.trade_validity, idea.entry_window, idea.slippage_risk,
          JSON.stringify(idea.triggers_to_activate), idea.invalidation, idea.timestamp_utc,
          idea.valid_until_bars, idea.valid_until_utc, JSON.stringify(idea.market_state),
          JSON.stringify(idea.flow_analysis), JSON.stringify(idea.trade_intent),
          idea.raw_text, idea.incomplete, idea.price_precision ?? null,
          idea.activated_at, idea.resolved_at, idea.created_at,
        ],
      );
      const eventId = randomUUID();
      await client.query(
        `INSERT INTO trade_idea_events (id, idea_id, event_type, ts, price, meta)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          eventId, idea.id, "IDEA_CREATED", idea.created_at, initialPrice,
          JSON.stringify({ symbol: idea.symbol, direction: idea.direction, entry_low: idea.entry_low, entry_high: idea.entry_high }),
        ],
      );
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
    return idea;
  }

  async appendEvent(event: Omit<TradeIdeaEventRecord, "id">) {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO trade_idea_events (id, idea_id, event_type, ts, price, meta)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, event.idea_id, event.event_type, event.ts, event.price, JSON.stringify(event.meta)],
    );
  }

  async updateIdea(id: string, patch: Partial<TradeIdeaRecord>) {
    const setClauses: string[] = [];
    const values: any[] = [];
    let idx = 1;

    const colMap: Record<string, string> = {
      status: "status", result: "result",
      activated_at: "activated_at", resolved_at: "resolved_at",
      hit_level_type: "hit_level_type", hit_level_index: "hit_level_index", hit_level_price: "hit_level_price",
      minutes_to_entry: "minutes_to_entry", minutes_to_exit: "minutes_to_exit", minutes_total: "minutes_total",
      entry_window: "entry_window", trade_validity: "trade_validity", slippage_risk: "slippage_risk",
      incomplete: "incomplete",
    };

    for (const [key, col] of Object.entries(colMap)) {
      if (key in patch) {
        setClauses.push(`${col} = $${idx}`);
        values.push((patch as any)[key]);
        idx++;
      }
    }

    const jsonColMap: Record<string, string> = {
      approved_modes: "approved_modes", mode_scores: "mode_scores",
      sl_levels: "sl_levels", tp_levels: "tp_levels",
      triggers_to_activate: "triggers_to_activate",
      market_state: "market_state", flow_analysis: "flow_analysis", trade_intent: "trade_intent",
    };
    for (const [key, col] of Object.entries(jsonColMap)) {
      if (key in patch) {
        setClauses.push(`${col} = $${idx}`);
        values.push(JSON.stringify((patch as any)[key]));
        idx++;
      }
    }

    if (setClauses.length === 0) return null;

    values.push(id);
    const { rows } = await pool.query(
      `UPDATE trade_ideas SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING *`,
      values,
    );
    return rows.length > 0 ? rowToIdea(rows[0]) : null;
  }

  async getIdea(id: string) {
    const { rows } = await pool.query("SELECT * FROM trade_ideas WHERE id = $1", [id]);
    return rows.length > 0 ? rowToIdea(rows[0]) : null;
  }

  async listIdeas(params?: {
    userId?: string;
    statuses?: TradeIdeaStatus[];
    symbol?: string;
    scoringMode?: ScoringMode;
    limit?: number;
  }) {
    const conditions: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (params?.userId) {
      conditions.push(`user_id = $${idx++}`);
      values.push(params.userId);
    }
    if (params?.statuses?.length) {
      conditions.push(`status = ANY($${idx++})`);
      values.push(params.statuses);
    }
    if (params?.symbol) {
      conditions.push(`symbol = $${idx++}`);
      values.push(params.symbol.toUpperCase());
    }
    if (params?.scoringMode) {
      conditions.push(`scoring_mode = $${idx++}`);
      values.push(params.scoringMode);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = Math.max(1, Math.min(10000, params?.limit ?? 100));

    const { rows } = await pool.query(
      `SELECT * FROM trade_ideas ${where} ORDER BY created_at DESC LIMIT ${limit}`,
      values,
    );
    return rows.map(rowToIdea);
  }

  async listEvents(ideaId: string) {
    const { rows } = await pool.query(
      "SELECT * FROM trade_idea_events WHERE idea_id = $1 ORDER BY ts ASC",
      [ideaId],
    );
    return rows.map(rowToEvent);
  }

  async listOpenIdeas() {
    return this.listIdeas({ statuses: ["PENDING", "ACTIVE"], limit: 5000 });
  }

  async findOpenIdea(userId: string, symbol: string, scoringMode?: ScoringMode) {
    const conditions = ["user_id = $1", "symbol = $2", "status IN ('PENDING','ACTIVE')"];
    const values: any[] = [userId, symbol.toUpperCase()];
    if (scoringMode) {
      conditions.push("scoring_mode = $3");
      values.push(scoringMode);
    }
    const { rows } = await pool.query(
      `SELECT * FROM trade_ideas WHERE ${conditions.join(" AND ")} LIMIT 1`,
      values,
    );
    return rows.length > 0 ? rowToIdea(rows[0]) : null;
  }

  async listLocks(userId?: string) {
    const where = userId
      ? "WHERE user_id = $1 AND status IN ('PENDING','ACTIVE')"
      : "WHERE status IN ('PENDING','ACTIVE')";
    const { rows } = await pool.query(
      `SELECT user_id, symbol, scoring_mode, id AS idea_id, status, created_at
       FROM trade_ideas ${where}`,
      userId ? [userId] : [],
    );
    return rows.map((r: any) => ({
      user_id: r.user_id,
      symbol: r.symbol,
      scoring_mode: normalizeScoringMode(r.scoring_mode),
      idea_id: r.idea_id,
      status: r.status,
      created_at: r.created_at?.toISOString?.() ?? r.created_at,
    }));
  }

  async clearUserIdeas(userId: string) {
    const { rowCount: deletedIdeas } = await pool.query(
      "DELETE FROM trade_ideas WHERE user_id = $1", [userId],
    );
    return { deletedIdeas: deletedIdeas ?? 0, deletedEvents: 0 };
  }

  async clearAll() {
    // Only clears system-scanner (Quant) ideas — AI ideas (ai-* user_ids) are preserved
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "DELETE FROM trade_idea_events WHERE idea_id IN (SELECT id FROM trade_ideas WHERE user_id = 'system-scanner')",
      );
      const { rowCount: deletedIdeas } = await client.query(
        "DELETE FROM trade_ideas WHERE user_id = 'system-scanner'",
      );
      await client.query("COMMIT");
      return { deletedIdeas: deletedIdeas ?? 0, deletedEvents: 0 };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  async clearAiIdeas() {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "DELETE FROM trade_idea_events WHERE idea_id IN (SELECT id FROM trade_ideas WHERE user_id LIKE 'ai-%')",
      );
      const { rowCount: deletedIdeas } = await client.query(
        "DELETE FROM trade_ideas WHERE user_id LIKE 'ai-%'",
      );
      await client.query("COMMIT");
      return { deletedIdeas: deletedIdeas ?? 0, deletedEvents: 0 };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
}
