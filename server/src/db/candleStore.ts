/**
 * CandleStore — Query layer for TimescaleDB candle data.
 *
 * Reads from hypertable (candles_1m) and continuous aggregates
 * (candles_5m, candles_15m, candles_30m, candles_1h, candles_4h, candles_1d).
 *
 * Used by chart API endpoint as primary data source (before exchange REST fallback).
 */
import { pool } from "./pool.ts";

export interface CandlePoint {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const INTERVAL_TABLE_MAP: Record<string, string> = {
  "1m": "candles_1m",
  "5m": "candles_5m",
  "15m": "candles_15m",
  "30m": "candles_30m",
  "1h": "candles_1h",
  "4h": "candles_4h",
  "1d": "candles_1d",
};

/**
 * Query candles from TimescaleDB.
 * Returns candles in ascending time order (oldest first).
 */
export async function queryCandles(
  symbol: string,
  interval: string,
  limit: number,
  exchange?: string,
): Promise<CandlePoint[]> {
  const table = INTERVAL_TABLE_MAP[interval];
  if (!table) return [];

  const safeLimit = Math.min(Math.max(1, limit), 2000);

  let sql: string;
  let params: unknown[];

  if (exchange) {
    sql = `
      SELECT time, open, high, low, close, volume
      FROM ${table}
      WHERE symbol = $1 AND exchange = $2
      ORDER BY time DESC
      LIMIT $3
    `;
    params = [symbol, exchange, safeLimit];
  } else {
    // Default to BINANCE if no exchange specified
    sql = `
      SELECT time, open, high, low, close, volume
      FROM ${table}
      WHERE symbol = $1 AND exchange = 'BINANCE'
      ORDER BY time DESC
      LIMIT $2
    `;
    params = [symbol, safeLimit];
  }

  try {
    const result = await pool.query(sql, params);
    // Reverse to ascending order (oldest first) for chart rendering
    return result.rows
      .reverse()
      .map((row: any) => ({
        time: Math.floor(new Date(row.time).getTime() / 1000),
        open: Number(row.open),
        high: Number(row.high),
        low: Number(row.low),
        close: Number(row.close),
        volume: Number(row.volume),
      }));
  } catch (err: any) {
    // Table might not exist yet (TimescaleDB not installed)
    if (err?.code === "42P01") {
      // undefined_table
      return [];
    }
    console.error("[CandleStore] Query error:", err?.message ?? err);
    return [];
  }
}

/**
 * Insert backfill candles (batch, idempotent).
 */
export async function insertBackfillCandles(
  rows: Array<{
    time: Date;
    exchange: string;
    symbol: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>,
): Promise<void> {
  if (!rows.length) return;

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

    await pool.query(
      `INSERT INTO candles_1m (time, exchange, symbol, open, high, low, close, volume)
       VALUES ${valuePlaceholders.join(", ")}
       ON CONFLICT (exchange, symbol, time) DO NOTHING`,
      params,
    );
  }
}

/**
 * Check if we have sufficient candle data for a symbol.
 * Returns the count of available candles.
 */
export async function countCandles(
  symbol: string,
  interval: string,
  exchange?: string,
): Promise<number> {
  const table = INTERVAL_TABLE_MAP[interval];
  if (!table) return 0;

  try {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM ${table} WHERE symbol = $1 AND exchange = $2`,
      [symbol, exchange ?? "BINANCE"],
    );
    return result.rows[0]?.cnt ?? 0;
  } catch {
    return 0;
  }
}
