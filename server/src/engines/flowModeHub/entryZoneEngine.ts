/**
 * Flow Mode Hub V2 — Entry Zone Engine (NEW FILE)
 *
 * Entry Zone Mid = 0.35*VWAP + 0.20*pullback + 0.20*acceptance + 0.15*liqReclaim + 0.10*ema
 *
 * Derived from available HubInput fields:
 *   - VWAP: derive from price + vwapPosition (ABOVE/BELOW/AT)
 *   - pullbackLevel: nearestSupport (LONG) / nearestResistance (SHORT)
 *   - acceptanceLevel: swingLow (LONG) / swingHigh (SHORT)
 *   - liqReclaimLevel: nearestLiquidity
 *   - ema: (price + htfLevel) / 2 as proxy
 *
 * Asymmetric ATR spread:
 *   LONG: Low = Mid - 0.15*ATR, High = Mid + 0.05*ATR
 *   SHORT: Low = Mid - 0.05*ATR, High = Mid + 0.15*ATR
 */

import type { HubInput, EntryZoneResult } from "./types.ts";
import { ENTRY_ZONE_WEIGHTS, ENTRY_ZONE_ATR } from "./config.ts";

export function calculateEntryZone(
  input: HubInput,
  side: "LONG" | "SHORT" | "NONE",
): EntryZoneResult {
  const price = input.price;

  // If no direction or zone already exists and is valid, use existing
  if (side === "NONE") {
    return {
      mid: price,
      low: input.entryZone[0] || price * 0.998,
      high: input.entryZone[1] || price * 1.002,
    };
  }

  const isLong = side === "LONG";
  const atr = price * Math.max(input.atrPct, 0.005); // min 0.5% ATR

  // Derive component levels
  // VWAP proxy: use existing entry zone mid if available, else price offset by vwap position
  const vwapOffset = input.vwapPosition === "ABOVE" ? price * 0.002
    : input.vwapPosition === "BELOW" ? -price * 0.002
    : 0;
  const vwapLevel = price - vwapOffset; // entry closer to VWAP

  // Pullback level: nearest support (LONG) or resistance (SHORT)
  const pullbackLevel = isLong
    ? (input.nearestSupport > 0 ? input.nearestSupport : price * 0.99)
    : (input.nearestResistance > 0 ? input.nearestResistance : price * 1.01);

  // Acceptance level: swing low (LONG) or swing high (SHORT)
  const acceptanceLevel = isLong
    ? (input.swingLow > 0 ? input.swingLow : price * 0.985)
    : (input.swingHigh > 0 ? input.swingHigh : price * 1.015);

  // Liq reclaim level
  const liqReclaimLevel = input.nearestLiquidity > 0 ? input.nearestLiquidity : price;

  // EMA proxy: average of price and htf level
  const emaProxy = input.htfLevel > 0 ? (price + input.htfLevel) / 2 : price;

  // Weighted entry zone mid
  const mid =
    ENTRY_ZONE_WEIGHTS.vwap * vwapLevel +
    ENTRY_ZONE_WEIGHTS.pullback * pullbackLevel +
    ENTRY_ZONE_WEIGHTS.acceptance * acceptanceLevel +
    ENTRY_ZONE_WEIGHTS.liqReclaim * liqReclaimLevel +
    ENTRY_ZONE_WEIGHTS.ema * emaProxy;

  // Asymmetric spread based on direction
  const atrConfig = isLong ? ENTRY_ZONE_ATR.longBias : ENTRY_ZONE_ATR.shortBias;
  let low = mid - atrConfig.below * atr;
  let high = mid + atrConfig.above * atr;

  // ── Enforce minimum zone width (0.5% of price — prevents ENTRY_MISSED from too-narrow zones) ──
  const MIN_ZONE_WIDTH_PCT = 0.005;
  const zoneWidth = (high - low) / mid;
  if (zoneWidth < MIN_ZONE_WIDTH_PCT && mid > 0) {
    const halfMin = (MIN_ZONE_WIDTH_PCT / 2) * mid;
    low = mid - halfMin;
    high = mid + halfMin;
  }

  return { mid, low, high };
}
