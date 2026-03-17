/**
 * Feature Cache — Per-symbol feature snapshots stored in Redis.
 *
 * Written by Worker 0 after each CoinUniverseEngine refresh (~60s).
 * Read by bot decision workers via readFeature() / readFeaturesBatch().
 *
 * This is the "shared feature engine" layer: compute once, serve to all bots.
 * Bots never touch BinanceFuturesHub or CoinUniverseEngine directly.
 */
import { redis } from "../../db/redis.ts";
import { pool } from "../../db/pool.ts";
import { writeSignalCache } from "./signalCache.ts";

const FEATURE_KEY_PREFIX = "bot:features:";
const FEATURE_TTL_SEC = 120; // 2 minutes, refreshed every 60s

export interface BotFeatureSnapshot {
  symbol: string;
  price: number;
  change24hPct: number;
  volume24hUsd: number;
  spreadBps: number | null;
  depthUsd: number | null;
  imbalance: number | null;
  fundingRate: number | null;
  atrPct: number | null;
  rsi14: number | null;
  srDistPct: number | null;
  tier1Score: number;
  tier2Score: number | null;
  compositeScore: number;
  discoveryScore: number;
  updatedAt: number;
}

/**
 * Write per-symbol feature snapshots to Redis (called by Worker 0 after engine refresh).
 * Uses Redis pipeline for batch efficiency (~300 writes in 1 round-trip).
 */
export async function writeFeatureCache(
  coins: Array<{
    symbol: string;
    price: number;
    change24hPct: number;
    volume24hUsd: number;
    spreadBps: number | null;
    depthUsd?: number | null;
    imbalance?: number | null;
    fundingRate: number | null;
    atrPct: number | null;
    rsi14: number | null;
    srDistPct: number | null;
    tier1Score: number;
    tier2Score: number | null;
    compositeScore: number;
    discoveryScore: number;
  }>,
): Promise<void> {
  if (!coins.length) return;
  const pipeline = redis.pipeline();
  const now = Date.now();
  for (const coin of coins) {
    const key = FEATURE_KEY_PREFIX + coin.symbol;
    const data: BotFeatureSnapshot = {
      symbol: coin.symbol,
      price: coin.price,
      change24hPct: coin.change24hPct,
      volume24hUsd: coin.volume24hUsd,
      spreadBps: coin.spreadBps,
      depthUsd: coin.depthUsd ?? null,
      imbalance: coin.imbalance ?? null,
      fundingRate: coin.fundingRate,
      atrPct: coin.atrPct,
      rsi14: coin.rsi14,
      srDistPct: coin.srDistPct,
      tier1Score: coin.tier1Score,
      tier2Score: coin.tier2Score,
      compositeScore: coin.compositeScore,
      discoveryScore: coin.discoveryScore,
      updatedAt: now,
    };
    pipeline.set(key, JSON.stringify(data), "EX", FEATURE_TTL_SEC);
  }
  await pipeline.exec();

  // Pre-compute signals for all symbols (batch, ~0ms per symbol after feature write)
  const snapshots = coins.map((coin) => ({
    symbol: coin.symbol,
    price: coin.price,
    change24hPct: coin.change24hPct,
    volume24hUsd: coin.volume24hUsd,
    spreadBps: coin.spreadBps,
    depthUsd: coin.depthUsd ?? null,
    imbalance: coin.imbalance ?? null,
    fundingRate: coin.fundingRate,
    atrPct: coin.atrPct,
    rsi14: coin.rsi14,
    srDistPct: coin.srDistPct,
    tier1Score: coin.tier1Score,
    tier2Score: coin.tier2Score,
    compositeScore: coin.compositeScore,
    discoveryScore: coin.discoveryScore,
    updatedAt: now,
  }));
  void writeSignalCache(snapshots).catch((err) => {
    console.error("[featureCache] Signal cache write error:", (err as Error)?.message ?? err);
  });

  // Dual-write: persist to PostgreSQL feature_snapshots (best-effort, non-blocking)
  void writeFeatureSnapshots(coins).catch((err) => {
    console.error("[featureCache] PG write error:", (err as Error)?.message ?? err);
  });
}

/** Read feature snapshot for a single symbol (bot decision workers). */
export async function readFeature(symbol: string): Promise<BotFeatureSnapshot | null> {
  const raw = await redis.get(FEATURE_KEY_PREFIX + symbol);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as BotFeatureSnapshot;
  } catch {
    return null;
  }
}

/**
 * Write feature snapshots to PostgreSQL (warm store, 90-day retention).
 * Called as best-effort dual-write alongside Redis.
 */
async function writeFeatureSnapshots(
  coins: Array<{
    symbol: string;
    price: number;
    change24hPct: number;
    volume24hUsd: number;
    spreadBps: number | null;
    depthUsd?: number | null;
    imbalance?: number | null;
    fundingRate: number | null;
    atrPct: number | null;
    rsi14: number | null;
    srDistPct: number | null;
    tier1Score: number;
    tier2Score: number | null;
    compositeScore: number;
    discoveryScore: number;
  }>,
): Promise<void> {
  if (!coins.length) return;

  const now = new Date();
  const COLS = 16; // number of columns per row
  const CHUNK_SIZE = 50; // max rows per INSERT

  for (let i = 0; i < coins.length; i += CHUNK_SIZE) {
    const chunk = coins.slice(i, i + CHUNK_SIZE);
    const valuePlaceholders: string[] = [];
    const params: unknown[] = [];

    for (let j = 0; j < chunk.length; j++) {
      const offset = j * COLS;
      valuePlaceholders.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14}, $${offset + 15}, $${offset + 16})`,
      );
      const c = chunk[j];
      params.push(
        now, c.symbol, c.price, c.change24hPct, c.volume24hUsd,
        c.spreadBps, c.depthUsd ?? null, c.imbalance ?? null, c.fundingRate,
        c.atrPct, c.rsi14, c.srDistPct, c.tier1Score, c.tier2Score,
        c.compositeScore, c.discoveryScore,
      );
    }

    try {
      await pool.query(
        `INSERT INTO feature_snapshots (time, symbol, price, change24h_pct, volume24h_usd, spread_bps, depth_usd, imbalance, funding_rate, atr_pct, rsi14, sr_dist_pct, tier1_score, tier2_score, composite_score, discovery_score)
         VALUES ${valuePlaceholders.join(", ")}
         ON CONFLICT (symbol, time) DO NOTHING`,
        params,
      );
    } catch (err: any) {
      // Table might not exist yet (migration not run)
      if (err?.code === "42P01") return; // undefined_table — silently skip
      throw err;
    }
  }
}

/** Read features for multiple symbols at once (batch, uses MGET). */
export async function readFeaturesBatch(symbols: string[]): Promise<Map<string, BotFeatureSnapshot>> {
  const map = new Map<string, BotFeatureSnapshot>();
  if (!symbols.length) return map;
  const keys = symbols.map((s) => FEATURE_KEY_PREFIX + s);
  const values = await redis.mget(...keys);
  for (let i = 0; i < symbols.length; i++) {
    const raw = values[i];
    if (raw) {
      try {
        map.set(symbols[i], JSON.parse(raw) as BotFeatureSnapshot);
      } catch {
        // malformed — skip
      }
    }
  }
  return map;
}
