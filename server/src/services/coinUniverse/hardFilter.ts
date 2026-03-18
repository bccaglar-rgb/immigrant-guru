/**
 * Hard Filter — Stage 1
 *
 * Removes untradeable coins before scoring.
 * Criteria:
 *   - Volume < $25M → reject
 *   - Spread > 0.20% (20 bps) → reject
 *   - Missing critical data (no price, no volume) → reject
 *   - Stablecoin base asset → reject
 */

import type { RawCoinData } from "./types.ts";

const MIN_VOLUME_USD = 25_000_000;
const MAX_SPREAD_BPS = 20; // 0.20%

const EXCLUDED_BASE_ASSETS = new Set([
  "USDC", "FDUSD", "BUSD", "TUSD", "USDP", "DAI", "PYUSD", "EURC",
  "GUSD", "USDD", "USDE", "UST", "USTC", "FRAX", "LUSD", "SUSD",
]);

export interface HardFilterResult {
  passed: RawCoinData[];
  rejected: Array<{ coin: RawCoinData; reason: string }>;
}

export function applyHardFilter(coins: RawCoinData[]): HardFilterResult {
  const passed: RawCoinData[] = [];
  const rejected: Array<{ coin: RawCoinData; reason: string }> = [];

  for (const coin of coins) {
    // Stablecoin check
    if (EXCLUDED_BASE_ASSETS.has(coin.baseAsset)) {
      rejected.push({ coin, reason: "stablecoin" });
      continue;
    }

    // Missing critical data
    if (!coin.price || !Number.isFinite(coin.price) || coin.price <= 0) {
      rejected.push({ coin, reason: "missing_price" });
      continue;
    }

    if (!Number.isFinite(coin.volume24hUsd)) {
      rejected.push({ coin, reason: "missing_volume" });
      continue;
    }

    // Volume check
    if (coin.volume24hUsd < MIN_VOLUME_USD) {
      rejected.push({ coin, reason: `volume_below_${MIN_VOLUME_USD / 1e6}M` });
      continue;
    }

    // Spread check
    if (coin.spreadBps !== null && coin.spreadBps > MAX_SPREAD_BPS) {
      rejected.push({ coin, reason: `spread_above_${MAX_SPREAD_BPS}bps` });
      continue;
    }

    passed.push(coin);
  }

  return { passed, rejected };
}
