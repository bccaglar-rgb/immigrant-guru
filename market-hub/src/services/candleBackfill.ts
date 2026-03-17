/**
 * CandleBackfill — Fetch historical 1m candles from Binance REST and insert into TimescaleDB.
 *
 * Triggered on market-hub startup for top symbols (30s delay).
 * Uses Redis SET to track already-backfilled symbols (24h TTL).
 * Rate-limited: max 2 requests/second to respect Binance IP limits.
 */
import pg from "pg";
import { redis } from "../redis.ts";

const BACKFILL_KEY_PREFIX = "candle:backfilled:";
const BACKFILL_TTL_SEC = 86_400; // 24 hours
const BINANCE_KLINES_URL = "https://fapi.binance.com/fapi/v1/klines";
const MAX_RPS = 2; // max 2 requests per second
const CANDLES_PER_REQUEST = 1000; // max Binance allows

interface BackfillRow {
  time: Date;
  exchange: string;
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export class CandleBackfill {
  private readonly pool: pg.Pool;

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
      max: 2,
      idleTimeoutMillis: 60_000,
      connectionTimeoutMillis: 10_000,
    });
  }

  /**
   * Backfill historical 1m candles for a list of symbols.
   * Skips symbols already backfilled (checked via Redis).
   */
  async backfillSymbols(symbols: string[]): Promise<void> {
    let filled = 0;
    let skipped = 0;

    for (const symbol of symbols) {
      try {
        const alreadyDone = await redis.get(BACKFILL_KEY_PREFIX + symbol);
        if (alreadyDone) {
          skipped++;
          continue;
        }

        await this.backfillSymbol(symbol);
        await redis.set(BACKFILL_KEY_PREFIX + symbol, "1", "EX", BACKFILL_TTL_SEC);
        filled++;

        // Rate limit: sleep 500ms between requests (2 req/sec)
        await sleep(1000 / MAX_RPS);
      } catch (err: any) {
        console.error(`[CandleBackfill] Failed ${symbol}:`, err?.message ?? err);
      }
    }

    console.log(
      `[CandleBackfill] Done: filled=${filled}, skipped=${skipped}, total=${symbols.length}`,
    );
  }

  /**
   * Fetch last 1000 1m candles for a single symbol from Binance REST and insert.
   */
  private async backfillSymbol(symbol: string): Promise<void> {
    const url = `${BINANCE_KLINES_URL}?symbol=${symbol}&interval=1m&limit=${CANDLES_PER_REQUEST}`;
    const resp = await fetch(url);

    if (!resp.ok) {
      if (resp.status === 429 || resp.status === 418 || resp.status === 403) {
        console.warn(`[CandleBackfill] Rate limited (${resp.status}), pausing 60s...`);
        await sleep(60_000);
        return;
      }
      throw new Error(`HTTP ${resp.status}: ${await resp.text().catch(() => "")}`);
    }

    const klines = (await resp.json()) as Array<
      [number, string, string, string, string, string, number, string, number, string, string, string]
    >;

    if (!Array.isArray(klines) || !klines.length) return;

    const rows: BackfillRow[] = klines.map((k) => ({
      time: new Date(k[0]), // openTime ms
      exchange: "BINANCE",
      symbol,
      open: Number(k[1]),
      high: Number(k[2]),
      low: Number(k[3]),
      close: Number(k[4]),
      volume: Number(k[5]),
    }));

    await this.batchInsert(rows);
    console.log(`[CandleBackfill] ${symbol}: inserted ${rows.length} candles`);
  }

  /**
   * Batch INSERT with ON CONFLICT (idempotent).
   */
  private async batchInsert(rows: BackfillRow[]): Promise<void> {
    if (!rows.length) return;

    // Chunk into batches of 100 to keep query size manageable
    const CHUNK_SIZE = 100;
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const valuePlaceholders: string[] = [];
      const params: unknown[] = [];

      for (let j = 0; j < chunk.length; j++) {
        const offset = j * 8;
        valuePlaceholders.push(
          `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8})`,
        );
        const r = chunk[j];
        params.push(r.time, r.exchange, r.symbol, r.open, r.high, r.low, r.close, r.volume);
      }

      await this.pool.query(
        `INSERT INTO candles_1m (time, exchange, symbol, open, high, low, close, volume)
         VALUES ${valuePlaceholders.join(", ")}
         ON CONFLICT (exchange, symbol, time) DO NOTHING`,
        params,
      );
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
