/**
 * Batch Result Writer — Accumulates bot run results in memory, flushes to
 * PostgreSQL every FLUSH_INTERVAL_MS via a single bulk UPDATE.
 *
 * Problem it solves:
 *   20k bots × 1 UPDATE/run → up to 667 writes/second (30s interval avg)
 *   Each UPDATE is a separate DB round-trip → overwhelms PgBouncer at scale
 *
 * Solution:
 *   Results are enqueued in-memory. Flush timer runs every 2s.
 *   One SQL statement updates all pending bots using unnest():
 *   UPDATE traders SET ... FROM unnest($1, $2, ...) WHERE id = v.id
 *   → 667 writes/s → ~3 bulk flushes/s (each handling ~400 rows)
 *
 * If latest result wins: same bot may be updated twice in same flush window,
 * Map ensures only the most recent result is written (O(1) dedup).
 */
import { pool } from "../../db/pool.ts";

const FLUSH_INTERVAL_MS = Number(process.env.BATCH_WRITER_INTERVAL_MS ?? 2000);

export interface BotRunResult {
  id: string;
  lastRunAt: string;
  lastError: string;
  failStreak: number;
  status: string;
  stats: Record<string, unknown>;
  lastResult: Record<string, unknown> | null;
  nextRunAt: string;
  // Analytics fields — optional, written to bot_decisions hypertable
  userId?: string;
  symbol?: string;
  strategyId?: string;
  decision?: string;
  scorePct?: number;
  bias?: string;
  execState?: string;
  dataStale?: boolean;
}

export interface AnalyticsRow {
  time: string;
  botId: string;
  userId: string;
  symbol: string;
  strategyId: string;
  decision: string;
  scorePct: number;
  bias: string;
  execState: string;
  dataStale: boolean;
  pnlPct?: number;
}

export class BatchResultWriter {
  // Map ensures latest result per bot (dedup by ID)
  private pending: Map<string, BotRunResult> = new Map();
  // Analytics rows: NOT deduped — one row per coin per scan cycle
  private pendingAnalytics: AnalyticsRow[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.flush().catch((err) =>
        console.error("[BatchResultWriter] Flush error:", (err as Error)?.message ?? err),
      );
    }, FLUSH_INTERVAL_MS);
    console.log(`[BatchResultWriter] Started — flush every ${FLUSH_INTERVAL_MS}ms`);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    // Final flush on shutdown
    void this.flush().catch(() => {});
  }

  /** Enqueue a bot run result. If same bot is enqueued twice before flush, latest wins. */
  enqueue(result: BotRunResult): void {
    this.pending.set(result.id, result);
  }

  /** Enqueue per-coin analytics row (multi-coin scan). NOT deduped — accumulates as list. */
  enqueueAnalytics(row: AnalyticsRow): void {
    this.pendingAnalytics.push(row);
  }

  /** Flush all pending results to PostgreSQL in one bulk statement. */
  async flush(): Promise<void> {
    if (this.flushing || (!this.pending.size && !this.pendingAnalytics.length)) return;
    this.flushing = true;

    const batch = [...this.pending.values()];
    this.pending.clear();
    const analyticsBatch = this.pendingAnalytics.splice(0);

    try {
      if (batch.length) await this.writeBatch(batch);
      // Flush multi-coin analytics rows (from coinPool scans)
      if (analyticsBatch.length) {
        void this.writeMultiCoinAnalytics(analyticsBatch).catch(() => { /* best-effort */ });
      }
    } finally {
      this.flushing = false;
    }
  }

  private async writeBatch(batch: BotRunResult[]): Promise<void> {
    if (!batch.length) return;

    // Build unnest arrays
    const ids:         string[] = [];
    const lastRunAts:  string[] = [];
    const lastErrors:  string[] = [];
    const failStreaks:  number[] = [];
    const statuses:    string[] = [];
    const statsArr:    string[] = [];
    const lastResults: string[] = [];
    const nextRunAts:  string[] = [];

    for (const r of batch) {
      ids.push(r.id);
      lastRunAts.push(r.lastRunAt);
      lastErrors.push(r.lastError);
      failStreaks.push(r.failStreak);
      statuses.push(r.status);
      statsArr.push(JSON.stringify(r.stats));
      lastResults.push(r.lastResult ? JSON.stringify(r.lastResult) : "null");
      nextRunAts.push(r.nextRunAt);
    }

    await pool.query(
      `UPDATE traders SET
         last_run_at  = v.last_run_at::timestamptz,
         last_error   = v.last_error,
         fail_streak  = v.fail_streak::int,
         status       = v.status,
         stats        = v.stats::jsonb,
         last_result  = CASE WHEN v.last_result = 'null' THEN NULL ELSE v.last_result::jsonb END,
         next_run_at  = v.next_run_at::timestamptz,
         updated_at   = NOW()
       FROM unnest(
         $1::text[], $2::text[], $3::text[], $4::int[], $5::text[],
         $6::text[], $7::text[], $8::text[]
       ) AS v(id, last_run_at, last_error, fail_streak, status, stats, last_result, next_run_at)
       WHERE traders.id = v.id`,
      [ids, lastRunAts, lastErrors, failStreaks, statuses, statsArr, lastResults, nextRunAts],
    );

    if (batch.length > 20) {
      console.log(`[BatchResultWriter] Flushed ${batch.length} bot results`);
    }

    // Dual-write: analytics log to bot_decisions hypertable (best-effort, non-blocking)
    const analyticsRows = batch.filter(
      (r) => r.userId && r.symbol && r.decision && r.decision !== "SKIP",
    );
    if (analyticsRows.length > 0) {
      void this.writeAnalytics(analyticsRows).catch(() => { /* best-effort */ });
    }
  }

  private async writeAnalytics(batch: BotRunResult[]): Promise<void> {
    if (!batch.length) return;

    const times:       string[] = [];
    const botIds:      string[] = [];
    const userIds:     string[] = [];
    const symbols:     string[] = [];
    const strategies:  string[] = [];
    const decisions:   string[] = [];
    const scores:      (number | null)[] = [];
    const biases:      string[] = [];
    const execStates:  string[] = [];
    const staleFlags:  boolean[] = [];

    for (const r of batch) {
      times.push(r.lastRunAt);
      botIds.push(r.id);
      userIds.push(r.userId!);
      symbols.push(r.symbol!);
      strategies.push(r.strategyId ?? "unknown");
      decisions.push(r.decision!);
      scores.push(r.scorePct ?? null);
      biases.push(r.bias ?? "NEUTRAL");
      execStates.push(r.execState ?? "N/A");
      staleFlags.push(r.dataStale ?? false);
    }

    try {
      await pool.query(
        `INSERT INTO bot_decisions
           (time, bot_id, user_id, symbol, strategy_id, decision, score_pct, bias, exec_state, data_stale)
         SELECT * FROM unnest(
           $1::timestamptz[], $2::text[], $3::text[], $4::text[], $5::text[],
           $6::text[], $7::numeric[], $8::text[], $9::text[], $10::boolean[]
         ) ON CONFLICT DO NOTHING`,
        [times, botIds, userIds, symbols, strategies, decisions, scores, biases, execStates, staleFlags],
      );
    } catch (err: any) {
      // Table might not exist (migration not run yet) — silently skip
      if (err?.code !== "42P01") {
        console.error("[BatchResultWriter] Analytics write error:", err?.message ?? err);
      }
    }
  }
  /** Write multi-coin analytics rows to bot_decisions hypertable. */
  private async writeMultiCoinAnalytics(batch: AnalyticsRow[]): Promise<void> {
    if (!batch.length) return;
    const times: string[] = [];
    const botIds: string[] = [];
    const userIds: string[] = [];
    const symbols: string[] = [];
    const strategies: string[] = [];
    const decisions: string[] = [];
    const scores: (number | null)[] = [];
    const biases: string[] = [];
    const execStates: string[] = [];
    const staleFlags: boolean[] = [];
    const pnls: (number | null)[] = [];

    for (const r of batch) {
      times.push(r.time);
      botIds.push(r.botId);
      userIds.push(r.userId);
      symbols.push(r.symbol);
      strategies.push(r.strategyId);
      decisions.push(r.decision);
      scores.push(r.scorePct);
      biases.push(r.bias);
      execStates.push(r.execState);
      staleFlags.push(r.dataStale);
      pnls.push(r.pnlPct ?? null);
    }

    try {
      await pool.query(
        `INSERT INTO bot_decisions
           (time, bot_id, user_id, symbol, strategy_id, decision, score_pct, bias, exec_state, data_stale, pnl_pct)
         SELECT * FROM unnest(
           $1::timestamptz[], $2::text[], $3::text[], $4::text[], $5::text[],
           $6::text[], $7::numeric[], $8::text[], $9::text[], $10::boolean[], $11::numeric[]
         ) ON CONFLICT DO NOTHING`,
        [times, botIds, userIds, symbols, strategies, decisions, scores, biases, execStates, staleFlags, pnls],
      );
    } catch (err: any) {
      if (err?.code !== "42P01") {
        console.error("[BatchResultWriter] Multi-coin analytics write error:", err?.message ?? err);
      }
    }
  }
}

export const batchResultWriter = new BatchResultWriter();
