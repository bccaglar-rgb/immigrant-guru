/**
 * Coin Pool Resolver — Resolves dynamic coin lists from user-selected pool sources.
 *
 * Reads the CoinUniverseEngine V2 snapshot from Redis and filters/sorts coins
 * based on the trader's CoinPoolConfig (source types + limits).
 *
 * Sources:
 *   - STATIC_LIST: User-defined coin list (stored in config)
 *   - SNIPER: Top coins by composite+trend score (simplified sniper ranking)
 *   - OI_INCREASE: Coins with rising open interest
 *   - OI_DECREASE: Coins with declining open interest
 *   - COIN_UNIVERSE: Top coins by universe composite score
 *
 * Diversity: SNIPER, COIN_UNIVERSE, OI_INCREASE, OI_DECREASE use weighted random
 * sampling from a wider pool (3× limit) to ensure different coins each scan cycle
 * while still favoring higher-quality candidates.
 *
 * Called by botDecisionWorker.ts at each scan cycle.
 * Cost: 1 Redis GET (~0.1ms) — universe snapshot is ~100KB cached.
 */
import { redis } from "../../db/redis.ts";
import type { CoinPoolConfig, CoinPoolSourceType } from "./types.ts";

const UNIVERSE_SNAPSHOT_KEY = "coin_universe_v2:snapshot";
const POOL_MULTIPLIER = 3; // Take 3× the limit as candidate pool for random sampling

interface UniverseCoin {
  symbol: string;
  compositeScore: number;
  trendStrength: number;
  oiChange: number | null;
  selected: boolean;
}

/** Fisher-Yates shuffle (in-place). */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Select `limit` items from a wider pool of top-ranked items.
 * Takes top `POOL_MULTIPLIER × limit` items, shuffles, picks `limit`.
 * This ensures variety across scan cycles while keeping quality.
 */
function diverseSample(sorted: UniverseCoin[], limit: number): UniverseCoin[] {
  const poolSize = Math.min(limit * POOL_MULTIPLIER, sorted.length);
  const pool = sorted.slice(0, poolSize);
  shuffle(pool);
  return pool.slice(0, limit);
}

/** Parse the universe snapshot from Redis into a lightweight coin array. */
async function getUniverseCoins(): Promise<UniverseCoin[]> {
  const raw = await redis.get(UNIVERSE_SNAPSHOT_KEY);
  if (!raw) return [];
  try {
    const snapshot = JSON.parse(raw) as {
      activeCoins?: Array<Record<string, unknown>>;
      cooldownCoins?: Array<Record<string, unknown>>;
    };
    const active = Array.isArray(snapshot.activeCoins) ? snapshot.activeCoins : [];
    const cooldown = Array.isArray(snapshot.cooldownCoins) ? snapshot.cooldownCoins : [];
    return [...active, ...cooldown].map((c) => ({
      symbol: String(c.symbol ?? ""),
      compositeScore: Number(c.compositeScore ?? 0) || 0,
      trendStrength: Number(c.trendStrength ?? 0) || 0,
      oiChange: c.oiChange != null ? (Number(c.oiChange) || 0) : null,
      selected: !!c.selected,
    })).filter((c) => c.symbol.length > 0);
  } catch {
    return [];
  }
}

/** Resolve a single source type into a symbol list with diversity sampling. */
function resolveSource(
  source: CoinPoolSourceType,
  config: CoinPoolConfig,
  universe: UniverseCoin[],
): string[] {
  switch (source) {
    case "STATIC_LIST":
      return config.staticCoins.map((s) =>
        s.toUpperCase().endsWith("USDT") ? s.toUpperCase() : `${s.toUpperCase()}USDT`
      );

    case "SNIPER": {
      // Simplified sniper: composite × 0.7 + trendStrength × 0.3
      const sorted = [...universe].sort((a, b) => {
        const scoreA = a.compositeScore * 0.7 + a.trendStrength * 0.3;
        const scoreB = b.compositeScore * 0.7 + b.trendStrength * 0.3;
        return scoreB - scoreA;
      });
      return diverseSample(sorted, config.sniperLimit).map((c) => c.symbol);
    }

    case "OI_INCREASE": {
      const sorted = [...universe]
        .filter((c) => c.oiChange !== null && c.oiChange > 0)
        .sort((a, b) => (b.oiChange ?? 0) - (a.oiChange ?? 0));
      return diverseSample(sorted, config.oiIncreaseLimit).map((c) => c.symbol);
    }

    case "OI_DECREASE": {
      const sorted = [...universe]
        .filter((c) => c.oiChange !== null && c.oiChange < 0)
        .sort((a, b) => (a.oiChange ?? 0) - (b.oiChange ?? 0));
      return diverseSample(sorted, config.oiDecreaseLimit).map((c) => c.symbol);
    }

    case "COIN_UNIVERSE": {
      const sorted = [...universe].sort((a, b) => b.compositeScore - a.compositeScore);
      return diverseSample(sorted, config.coinUniverseLimit).map((c) => c.symbol);
    }

    default:
      return [];
  }
}

/**
 * Resolve coin pool config into a deduplicated, capped symbol list.
 * Returns USDT-suffixed symbols (e.g., ["BTCUSDT", "ETHUSDT", ...]).
 */
export async function resolveCoinPool(config: CoinPoolConfig): Promise<string[]> {
  const universe = await getUniverseCoins();
  const seen = new Set<string>();
  const result: string[] = [];

  for (const source of config.sourceTypes) {
    const coins = resolveSource(source, config, universe);
    for (const sym of coins) {
      if (!seen.has(sym)) {
        seen.add(sym);
        result.push(sym);
      }
      if (result.length >= config.maxCoins) break;
    }
    if (result.length >= config.maxCoins) break;
  }

  return result;
}
