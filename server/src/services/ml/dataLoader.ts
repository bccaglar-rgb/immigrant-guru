/**
 * ML Data Loader — Query historical candle + feature data for ML training.
 *
 * Joins candles from TimescaleDB with feature snapshots (nearest-in-time match).
 * Returns enriched data points suitable for training ML models.
 */
import { pool } from "../../db/pool.ts";

export interface MLDataQuery {
  symbols: string[];
  startTime: Date;
  endTime: Date;
  candleInterval?: "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
  exchange?: string;
  limit?: number;
}

export interface MLDataPoint {
  time: string; // ISO timestamp
  symbol: string;
  // Candle data
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  // Feature data (from nearest feature snapshot)
  rsi14: number | null;
  atrPct: number | null;
  spreadBps: number | null;
  depthUsd: number | null;
  imbalance: number | null;
  fundingRate: number | null;
  compositeScore: number | null;
  discoveryScore: number | null;
  tier1Score: number | null;
  tier2Score: number | null;
}

export interface FeatureDataPoint {
  time: string;
  symbol: string;
  price: number;
  change24hPct: number | null;
  volume24hUsd: number | null;
  spreadBps: number | null;
  depthUsd: number | null;
  imbalance: number | null;
  fundingRate: number | null;
  atrPct: number | null;
  rsi14: number | null;
  srDistPct: number | null;
  tier1Score: number | null;
  tier2Score: number | null;
  compositeScore: number | null;
  discoveryScore: number | null;
}

const INTERVAL_TABLE_MAP: Record<string, string> = {
  "1m": "candles_1m",
  "5m": "candles_5m",
  "15m": "candles_15m",
  "1h": "candles_1h",
  "4h": "candles_4h",
  "1d": "candles_1d",
};

/**
 * Load candle + feature data for ML training.
 * Joins candles with the nearest preceding feature snapshot per symbol.
 */
export async function loadMLData(query: MLDataQuery): Promise<MLDataPoint[]> {
  const interval = query.candleInterval ?? "15m";
  const table = INTERVAL_TABLE_MAP[interval];
  if (!table) return [];

  const exchange = query.exchange ?? "BINANCE";
  const limit = Math.min(query.limit ?? 10_000, 50_000);

  try {
    const sql = `
      SELECT
        c.time,
        c.symbol,
        c.open,
        c.high,
        c.low,
        c.close,
        c.volume,
        f.rsi14,
        f.atr_pct AS "atrPct",
        f.spread_bps AS "spreadBps",
        f.depth_usd AS "depthUsd",
        f.imbalance,
        f.funding_rate AS "fundingRate",
        f.composite_score AS "compositeScore",
        f.discovery_score AS "discoveryScore",
        f.tier1_score AS "tier1Score",
        f.tier2_score AS "tier2Score"
      FROM ${table} c
      LEFT JOIN LATERAL (
        SELECT *
        FROM feature_snapshots fs
        WHERE fs.symbol = c.symbol
          AND fs.time <= c.time
        ORDER BY fs.time DESC
        LIMIT 1
      ) f ON true
      WHERE c.symbol = ANY($1)
        AND c.exchange = $2
        AND c.time >= $3
        AND c.time <= $4
      ORDER BY c.symbol, c.time
      LIMIT $5
    `;

    const result = await pool.query(sql, [
      query.symbols,
      exchange,
      query.startTime,
      query.endTime,
      limit,
    ]);

    return result.rows.map((row: any) => ({
      time: new Date(row.time).toISOString(),
      symbol: row.symbol,
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume),
      rsi14: row.rsi14 != null ? Number(row.rsi14) : null,
      atrPct: row.atrPct != null ? Number(row.atrPct) : null,
      spreadBps: row.spreadBps != null ? Number(row.spreadBps) : null,
      depthUsd: row.depthUsd != null ? Number(row.depthUsd) : null,
      imbalance: row.imbalance != null ? Number(row.imbalance) : null,
      fundingRate: row.fundingRate != null ? Number(row.fundingRate) : null,
      compositeScore: row.compositeScore != null ? Number(row.compositeScore) : null,
      discoveryScore: row.discoveryScore != null ? Number(row.discoveryScore) : null,
      tier1Score: row.tier1Score != null ? Number(row.tier1Score) : null,
      tier2Score: row.tier2Score != null ? Number(row.tier2Score) : null,
    }));
  } catch (err: any) {
    if (err?.code === "42P01") return []; // table doesn't exist yet
    throw err;
  }
}

/**
 * Load raw feature snapshots for a symbol within a time range.
 */
export async function loadFeatures(
  symbol: string,
  hours: number = 24,
  limit: number = 5000,
): Promise<FeatureDataPoint[]> {
  const safeLimit = Math.min(limit, 50_000);
  const since = new Date(Date.now() - hours * 3600_000);

  try {
    const result = await pool.query(
      `SELECT time, symbol, price, change24h_pct, volume24h_usd,
              spread_bps, depth_usd, imbalance, funding_rate,
              atr_pct, rsi14, sr_dist_pct, tier1_score, tier2_score,
              composite_score, discovery_score
       FROM feature_snapshots
       WHERE symbol = $1 AND time >= $2
       ORDER BY time ASC
       LIMIT $3`,
      [symbol, since, safeLimit],
    );

    return result.rows.map((row: any) => ({
      time: new Date(row.time).toISOString(),
      symbol: row.symbol,
      price: Number(row.price),
      change24hPct: row.change24h_pct != null ? Number(row.change24h_pct) : null,
      volume24hUsd: row.volume24h_usd != null ? Number(row.volume24h_usd) : null,
      spreadBps: row.spread_bps != null ? Number(row.spread_bps) : null,
      depthUsd: row.depth_usd != null ? Number(row.depth_usd) : null,
      imbalance: row.imbalance != null ? Number(row.imbalance) : null,
      fundingRate: row.funding_rate != null ? Number(row.funding_rate) : null,
      atrPct: row.atr_pct != null ? Number(row.atr_pct) : null,
      rsi14: row.rsi14 != null ? Number(row.rsi14) : null,
      srDistPct: row.sr_dist_pct != null ? Number(row.sr_dist_pct) : null,
      tier1Score: row.tier1_score != null ? Number(row.tier1_score) : null,
      tier2Score: row.tier2_score != null ? Number(row.tier2_score) : null,
      compositeScore: row.composite_score != null ? Number(row.composite_score) : null,
      discoveryScore: row.discovery_score != null ? Number(row.discovery_score) : null,
    }));
  } catch (err: any) {
    if (err?.code === "42P01") return [];
    throw err;
  }
}
