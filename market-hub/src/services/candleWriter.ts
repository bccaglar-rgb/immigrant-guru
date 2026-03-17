/**
 * CandleWriter — Persist closed 1m candles from ExchangeMarketHub to TimescaleDB.
 *
 * Listens for NormalizedKlineEvent (closed=true, interval="1m"),
 * batches them, and writes to candles_1m hypertable via pg.Pool.
 *
 * Buffer strategy: flush every 2s or when batch reaches 50 rows.
 */
import pg from "pg";

interface CandleRow {
  time: Date;
  exchange: string;
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface KlineEvent {
  type: "kline";
  exchange: string;
  symbol: string;
  interval: string;
  openTime: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closed: boolean;
}

export class CandleWriter {
  private readonly pool: pg.Pool;
  private batch: CandleRow[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private totalWritten = 0;
  private totalErrors = 0;
  private lastLogAt = 0;

  constructor(dbConfig: {
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
  }) {
    this.pool = new pg.Pool({
      host: dbConfig.host ?? process.env.DB_HOST ?? "127.0.0.1",
      port: dbConfig.port ?? Number(process.env.DB_PORT ?? 5432),
      database: dbConfig.database ?? process.env.DB_NAME ?? "bitrium_db",
      user: dbConfig.user ?? process.env.DB_USER ?? "bitrium_app",
      password: dbConfig.password ?? process.env.DB_PASSWORD ?? "",
      max: 3, // lightweight — only candle writes
      idleTimeoutMillis: 60_000,
      connectionTimeoutMillis: 10_000,
    });
    this.pool.on("error", (err) => {
      console.error("[CandleWriter] Pool error:", err.message);
    });
  }

  /**
   * Start the flush timer. Call once after construction.
   */
  start(): void {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => void this.flush(), 2_000);
    console.log("[CandleWriter] Started (2s flush interval, max 50 batch)");
  }

  /**
   * Stop flushing and close pool.
   */
  async stop(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush(); // final flush
    await this.pool.end();
    console.log(`[CandleWriter] Stopped (total written: ${this.totalWritten})`);
  }

  /**
   * Ingest a kline event. Only closed 1m candles are persisted.
   */
  ingest(event: KlineEvent): void {
    if (!event.closed) return;
    if (event.interval !== "1m") return;
    if (!event.symbol || !event.exchange) return;

    this.batch.push({
      time: new Date(event.openTime * 1000),
      exchange: event.exchange,
      symbol: event.symbol,
      open: event.open,
      high: event.high,
      low: event.low,
      close: event.close,
      volume: event.volume,
    });

    if (this.batch.length >= 50) {
      void this.flush();
    }
  }

  /**
   * Flush pending batch to TimescaleDB.
   */
  private async flush(): Promise<void> {
    if (!this.batch.length) return;
    const rows = this.batch.splice(0);

    try {
      await this.batchUpsert(rows);
      this.totalWritten += rows.length;
    } catch (err: any) {
      this.totalErrors++;
      console.error(
        `[CandleWriter] Batch upsert failed (${rows.length} rows):`,
        err?.message ?? err,
      );
    }

    // Log stats every 60s
    const now = Date.now();
    if (now - this.lastLogAt > 60_000) {
      this.lastLogAt = now;
      console.log(
        `[CandleWriter] Stats: written=${this.totalWritten}, errors=${this.totalErrors}, pending=${this.batch.length}`,
      );
    }
  }

  /**
   * Multi-row INSERT ... ON CONFLICT DO UPDATE for idempotent writes.
   */
  private async batchUpsert(rows: CandleRow[]): Promise<void> {
    if (!rows.length) return;

    // Build parameterized multi-row INSERT
    const cols = ["time", "exchange", "symbol", "open", "high", "low", "close", "volume"];
    const valuePlaceholders: string[] = [];
    const params: unknown[] = [];

    for (let i = 0; i < rows.length; i++) {
      const offset = i * 8;
      valuePlaceholders.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8})`,
      );
      const r = rows[i];
      params.push(r.time, r.exchange, r.symbol, r.open, r.high, r.low, r.close, r.volume);
    }

    const sql = `
      INSERT INTO candles_1m (${cols.join(", ")})
      VALUES ${valuePlaceholders.join(", ")}
      ON CONFLICT (exchange, symbol, time) DO UPDATE SET
        open   = EXCLUDED.open,
        high   = EXCLUDED.high,
        low    = EXCLUDED.low,
        close  = EXCLUDED.close,
        volume = EXCLUDED.volume
    `;

    await this.pool.query(sql, params);
  }
}
