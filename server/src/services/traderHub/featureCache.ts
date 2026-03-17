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
