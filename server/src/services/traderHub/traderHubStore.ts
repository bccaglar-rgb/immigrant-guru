import { pool } from "../../db/pool.ts";
import type { CoinPoolConfig, TraderRecord, TraderRunStatus } from "./types.ts";

const nowIso = () => new Date().toISOString();

/** Safely convert DB timestamp (may be Date object or string) to ISO string. */
const toIso = (val: unknown): string => {
  if (!val) return nowIso();
  if (val instanceof Date) return val.toISOString();
  const s = String(val);
  // If already ISO-like, return as-is
  if (s.match(/^\d{4}-\d{2}-\d{2}/)) return s;
  // Otherwise parse and convert (handles "Thu Mar 26 2026..." format)
  try { return new Date(s).toISOString(); } catch { return nowIso(); }
};

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
    createdAt: toIso(r.created_at),
    updatedAt: toIso(r.updated_at),
    nextRunAt: toIso(r.next_run_at),
    lastRunAt: r.last_run_at ? toIso(r.last_run_at) : "",
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
    coinPool: parseCoinPool(r.coin_pool),
  };
};

const parseCoinPool = (raw: unknown): CoinPoolConfig | null => {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const sourceTypes = Array.isArray(obj.sourceTypes) ? obj.sourceTypes : [];
  if (!sourceTypes.length) return null;
  return {
    sourceTypes: sourceTypes.filter((s: unknown) =>
      typeof s === "string" && ["STATIC_LIST", "SNIPER", "OI_INCREASE", "OI_DECREASE", "COIN_UNIVERSE"].includes(s),
    ) as CoinPoolConfig["sourceTypes"],
    maxCoins: Math.max(1, Math.min(100, Number(obj.maxCoins) || 10)),
    sniperLimit: Math.max(1, Math.min(100, Number(obj.sniperLimit) || 10)),
    oiIncreaseLimit: Math.max(1, Math.min(100, Number(obj.oiIncreaseLimit) || 10)),
    oiDecreaseLimit: Math.max(1, Math.min(100, Number(obj.oiDecreaseLimit) || 10)),
    coinUniverseLimit: Math.max(1, Math.min(100, Number(obj.coinUniverseLimit) || 10)),
    staticCoins: Array.isArray(obj.staticCoins) ? obj.staticCoins.map(String) : [],
    minConfidence: Math.max(0, Math.min(100, Number(obj.minConfidence) || 75)),
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
          created_at, updated_at, coin_pool)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
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
         updated_at = EXCLUDED.updated_at,
         coin_pool = EXCLUDED.coin_pool`,
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
        row.coinPool ? JSON.stringify(row.coinPool) : null,
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

  /** Fetch last N scan decisions for a specific bot from bot_decisions hypertable. */
  async listScansByBot(botId: string, limit = 100): Promise<Array<{
    time: string;
    symbol: string;
    decision: string;
    scorePct: number;
    bias: string;
    execState: string;
    dataStale: boolean;
    strategyId: string;
    pnlPct: number | null;
  }>> {
    const { rows } = await pool.query(
      `SELECT time, symbol, decision, score_pct, bias, exec_state, data_stale, strategy_id, pnl_pct
       FROM bot_decisions
       WHERE bot_id = $1
       ORDER BY time DESC
       LIMIT $2`,
      [botId, limit],
    );
    return rows.map((r: Record<string, unknown>) => ({
      time: String(r.time),
      symbol: String(r.symbol ?? ""),
      decision: String(r.decision ?? "N/A"),
      scorePct: Number(r.score_pct ?? 0) || 0,
      bias: String(r.bias ?? "NEUTRAL"),
      execState: String(r.exec_state ?? "N/A"),
      dataStale: !!r.data_stale,
      strategyId: String(r.strategy_id ?? ""),
      pnlPct: r.pnl_pct != null ? Number(r.pnl_pct) : null,
    }));
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
