/**
 * Bitrium Prime AI Hub — Entry Calculator
 *
 * Code-computed entry zone (NOT AI).
 * Same formula as FLOW hub entryZoneEngine.ts:
 *
 * EntryMid = 0.35*VWAP + 0.20*pullback + 0.20*acceptance + 0.15*liqReclaim + 0.10*EMA
 *
 * Asymmetric ATR spread:
 *   LONG: Low = Mid - 0.15*ATR, High = Mid + 0.05*ATR
 *   SHORT: Low = Mid - 0.05*ATR, High = Mid + 0.15*ATR
 */

import type { PrimeAiCoinInput, PrimeAiSide } from "./types.ts";
import type { HubInput } from "../balancedModeHub/types.ts";
import { ENTRY_ZONE_WEIGHTS, ENTRY_ZONE_ATR } from "./config.ts";

export interface EntryZoneResult {
  mid: number;
  low: number;
  high: number;
}

/**
 * Calculate code-enforced entry zone.
 */
export function calculateEntryZone(
  coin: PrimeAiCoinInput,
  hubInput: HubInput,
  side: PrimeAiSide,
): EntryZoneResult {
  const price = coin.price;

  if (side === "NONE" || price <= 0) {
    return {
      mid: price,
      low: price * 0.998,
      high: price * 1.002,
    };
  }

  const isLong = side === "LONG";
  const atr = price * Math.max(hubInput.atrPct, 0.005); // min 0.5% ATR

  // VWAP proxy
  const vwapLevel = coin.vwap > 0 ? coin.vwap : price;

  // Pullback level: nearest support (LONG) or resistance (SHORT)
  const pullbackLevel = isLong
    ? (coin.levels.support > 0 ? coin.levels.support : price * 0.99)
    : (coin.levels.resistance > 0 ? coin.levels.resistance : price * 1.01);

  // Acceptance level: swing low (LONG) or swing high (SHORT)
  const acceptanceLevel = isLong
    ? (coin.levels.swingLow > 0 ? coin.levels.swingLow : price * 0.985)
    : (coin.levels.swingHigh > 0 ? coin.levels.swingHigh : price * 1.015);

  // Liquidity reclaim level
  const liqReclaimLevel = coin.levels.reclaim > 0 ? coin.levels.reclaim : price;

  // EMA proxy
  const emaProxy = hubInput.htfLevel > 0 ? (price + hubInput.htfLevel) / 2 : price;

  // Weighted entry zone mid
  const mid =
    ENTRY_ZONE_WEIGHTS.vwap * vwapLevel +
    ENTRY_ZONE_WEIGHTS.pullback * pullbackLevel +
    ENTRY_ZONE_WEIGHTS.acceptance * acceptanceLevel +
    ENTRY_ZONE_WEIGHTS.liqReclaim * liqReclaimLevel +
    ENTRY_ZONE_WEIGHTS.ema * emaProxy;

  // Asymmetric ATR spread
  const atrConfig = isLong ? ENTRY_ZONE_ATR.longBias : ENTRY_ZONE_ATR.shortBias;
  const low = mid - atrConfig.below * atr;
  const high = mid + atrConfig.above * atr;

  return {
    mid: round8(mid),
    low: round8(low),
    high: round8(high),
  };
}

function round8(v: number): number {
  return Math.round(v * 100000000) / 100000000;
}
