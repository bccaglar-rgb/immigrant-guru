import { pool } from "../../db/pool.ts";
import type { TraderRecord, TraderRunStatus } from "./types.ts";

const nowIso = () => new Date().toISOString();

/* ── Row mapper ───────────────────────────────────────────── */

const rowToTrader = (r: Record<string, unknown>): TraderRecord => {
  const stats = (r.stats && typeof r.stats === "object")
    ? r.stats as Record<string, unknown>
    : {};
  const lastResult = (r.last_result && typeof r.last_result === "object")
    ? r.last_result as TraderRecord["lastResult"]
    : null;

  return {
    id: String(r.id),
    userId: String(r.user_id),
    name: String(r.name ?? "Trader"),
    aiModule: String(r.ai_module ?? "CHATGPT").toUpperCase() === "QWEN" ? "QWEN" : "CHATGPT",
    exchange:
      String(r.exchange ?? "AUTO").toUpperCase() === "BINANCE"
        ? "BINANCE"
        : String(r.exchange ?? "AUTO").toUpperCase() === "GATEIO"
          ? "GATEIO"
          : "AUTO",
    exchangeAccountId: String(r.exchange_account_id ?? ""),
    exchangeAccountName: String(r.exchange_account_name ?? "Auto"),
    strategyId: String(r.strategy_id ?? "strategy-default"),
    strategyName: String(r.strategy_name ?? "Default Strategy"),
    symbol: String(r.symbol ?? "BTCUSDT"),
    timeframe:
      String(r.timeframe ?? "15m") === "1m" ? "1m" :
      String(r.timeframe ?? "15m") === "5m" ? "5m" :
      String(r.timeframe ?? "15m") === "30m" ? "30m" :
      String(r.timeframe ?? "15m") === "1h" ? "1h" : "15m",
    scanIntervalSec: Math.max(30, Math.min(600, Number(r.scan_interval_sec ?? 180) || 180)),
    status: toStatus(r.status),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    nextRunAt: String(r.next_run_at ?? nowIso()),
    lastRunAt: r.last_run_at ? String(r.last_run_at) : "",
    lastError: String(r.last_error ?? ""),
    failStreak: Math.max(0, Math.floor(Number(r.fail_streak ?? 0) || 0)),
    stats: {
      runs: Math.max(0, Math.floor(Number(stats.runs ?? 0) || 0)),
      tradeCount: Math.max(0, Math.floor(Number(stats.tradeCount ?? 0) || 0)),
      watchCount: Math.max(0, Math.floor(Number(stats.watchCount ?? 0) || 0)),
      noTradeCount: Math.max(0, Math.floor(Number(stats.noTradeCount ?? 0) || 0)),
      pnlPct: Number(stats.pnlPct ?? 0) || 0,
    },
    lastResult,
  };
};

const toStatus = (value: unknown): TraderRunStatus => {
  const raw = String(value ?? "").toUpperCase();
  if (raw === "RUNNING") return "RUNNING";
  if (raw === "ERROR") return "ERROR";
  return "STOPPED";
};

/* ── Store ────────────────────────────────────────────────── */

export class TraderHubStore {
  async listAll(): Promise<TraderRecord[]> {
    const { rows } = await pool.query(`SELECT * FROM traders ORDER BY created_at DESC`);
    return rows.map(rowToTrader);
  }

  async listByUser(userId: string): Promise<TraderRecord[]> {
    const { rows } = await pool.query(
      `SELECT * FROM traders WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId],
    );
    return rows.map(rowToTrader);
  }

  async upsert(row: TraderRecord): Promise<TraderRecord> {
    await pool.query(
      `INSERT INTO traders
         (id, user_id, name, ai_module, exchange, exchange_account_id, exchange_account_name,
          strategy_id, strategy_name, symbol, timeframe, scan_interval_sec, status,
          next_run_at, last_run_at, last_error, fail_streak, stats, last_result,
          created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       ON CONFLICT (id) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         name = EXCLUDED.name,
         ai_module = EXCLUDED.ai_module,
         exchange = EXCLUDED.exchange,
         exchange_account_id = EXCLUDED.exchange_account_id,
         exchange_account_name = EXCLUDED.exchange_account_name,
         strategy_id = EXCLUDED.strategy_id,
         strategy_name = EXCLUDED.strategy_name,
         symbol = EXCLUDED.symbol,
         timeframe = EXCLUDED.timeframe,
         scan_interval_sec = EXCLUDED.scan_interval_sec,
         status = EXCLUDED.status,
         next_run_at = EXCLUDED.next_run_at,
         last_run_at = EXCLUDED.last_run_at,
         last_error = EXCLUDED.last_error,
         fail_streak = EXCLUDED.fail_streak,
         stats = EXCLUDED.stats,
         last_result = EXCLUDED.last_result,
         updated_at = EXCLUDED.updated_at`,
      [
        row.id,
        row.userId,
        row.name,
        row.aiModule,
        row.exchange,
        row.exchangeAccountId,
        row.exchangeAccountName,
        row.strategyId,
        row.strategyName,
        row.symbol,
        row.timeframe,
        row.scanIntervalSec,
        row.status,
        row.nextRunAt || nowIso(),
        row.lastRunAt || null,
        row.lastError,
        row.failStreak,
        JSON.stringify(row.stats),
        row.lastResult ? JSON.stringify(row.lastResult) : null,
        row.createdAt,
        row.updatedAt,
      ],
    );
    return row;
  }

  async patch(id: string, patch: Partial<TraderRecord>): Promise<TraderRecord | null> {
    // Read current row
    const { rows } = await pool.query(`SELECT * FROM traders WHERE id = $1`, [id]);
    if (!rows[0]) return null;

    const current = rowToTrader(rows[0]);
    const next = { ...current, ...patch, updatedAt: nowIso() };
    await this.upsert(next);
    return next;
  }

  async remove(id: string): Promise<boolean> {
    const result = await pool.query(`DELETE FROM traders WHERE id = $1`, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  // ── New efficient methods for BullMQ scheduler ──

  /** Fetch a single trader by ID. */
  async getById(id: string): Promise<TraderRecord | null> {
    const { rows } = await pool.query(`SELECT * FROM traders WHERE id = $1`, [id]);
    if (!rows[0]) return null;
    return rowToTrader(rows[0]);
  }

  /** Count bots for a user (for per-user limits). */
  async countByUser(userId: string): Promise<number> {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM traders WHERE user_id = $1`,
      [userId],
    );
    return rows[0]?.cnt ?? 0;
  }

  /**
   * Fetch RUNNING traders whose next_run_at is due.
   * Uses the idx_traders_due partial index for O(log n) lookup.
   */
  async listDue(limit: number): Promise<TraderRecord[]> {
    const { rows } = await pool.query(
      `SELECT * FROM traders
       WHERE status = 'RUNNING' AND next_run_at <= NOW()
       ORDER BY next_run_at ASC
       LIMIT $1`,
      [limit],
    );
    return rows.map(rowToTrader);
  }

  /** Lightweight schedule update — avoids full upsert. */
  async patchSchedule(id: string, nextRunAt: string): Promise<void> {
    await pool.query(
      `UPDATE traders SET next_run_at = $1, updated_at = NOW() WHERE id = $2`,
      [nextRunAt, id],
    );
  }

  /** Atomic result update after a bot run — avoids read-modify-write race. */
  async patchRunResult(
    id: string,
    patch: {
      lastRunAt: string;
      lastError: string;
      failStreak: number;
      status: string;
      stats: Record<string, unknown>;
      lastResult: Record<string, unknown> | null;
      nextRunAt: string;
    },
  ): Promise<void> {
    await pool.query(
      `UPDATE traders SET
         last_run_at = $1, last_error = $2, fail_streak = $3,
         status = $4, stats = $5, last_result = $6,
         next_run_at = $7, updated_at = NOW()
       WHERE id = $8`,
      [
        patch.lastRunAt,
        patch.lastError,
        patch.failStreak,
        patch.status,
        JSON.stringify(patch.stats),
        patch.lastResult ? JSON.stringify(patch.lastResult) : null,
        patch.nextRunAt,
        id,
      ],
    );
  }
}
