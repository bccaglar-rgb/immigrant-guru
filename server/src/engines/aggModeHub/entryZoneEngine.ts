/**
 * Aggressive Mode Hub V2 — Entry Zone Engine
 * Same formula as FLOW
 */

import type { HubInput, EntryZoneResult } from "./types.ts";
import { ENTRY_ZONE_WEIGHTS, ENTRY_ZONE_ATR } from "./config.ts";

export function calculateEntryZone(
  input: HubInput,
  side: "LONG" | "SHORT" | "NONE",
): EntryZoneResult {
  const price = input.price;

  if (side === "NONE") {
    return { mid: price, low: input.entryZone[0] || price * 0.998, high: input.entryZone[1] || price * 1.002 };
  }

  const isLong = side === "LONG";
  const atr = price * Math.max(input.atrPct, 0.005);

  const vwapOffset = input.vwapPosition === "ABOVE" ? price * 0.002
    : input.vwapPosition === "BELOW" ? -price * 0.002 : 0;
  const vwapLevel = price - vwapOffset;

  const pullbackLevel = isLong
    ? (input.nearestSupport > 0 ? input.nearestSupport : price * 0.99)
    : (input.nearestResistance > 0 ? input.nearestResistance : price * 1.01);

  const acceptanceLevel = isLong
    ? (input.swingLow > 0 ? input.swingLow : price * 0.985)
    : (input.swingHigh > 0 ? input.swingHigh : price * 1.015);

  const liqReclaimLevel = input.nearestLiquidity > 0 ? input.nearestLiquidity : price;
  const emaProxy = input.htfLevel > 0 ? (price + input.htfLevel) / 2 : price;

  const mid =
    ENTRY_ZONE_WEIGHTS.vwap * vwapLevel +
    ENTRY_ZONE_WEIGHTS.pullback * pullbackLevel +
    ENTRY_ZONE_WEIGHTS.acceptance * acceptanceLevel +
    ENTRY_ZONE_WEIGHTS.liqReclaim * liqReclaimLevel +
    ENTRY_ZONE_WEIGHTS.ema * emaProxy;

  const atrConfig = isLong ? ENTRY_ZONE_ATR.longBias : ENTRY_ZONE_ATR.shortBias;
  let low = mid - atrConfig.below * atr;
  let high = mid + atrConfig.above * atr;

  // ── Enforce minimum zone width (0.6% of price for AGG — aggressive mode needs wider zones) ──
  const MIN_ZONE_WIDTH_PCT = 0.006;
  const zoneWidth = (high - low) / mid;
  if (zoneWidth < MIN_ZONE_WIDTH_PCT && mid > 0) {
    const halfMin = (MIN_ZONE_WIDTH_PCT / 2) * mid;
    low = mid - halfMin;
    high = mid + halfMin;
  }

  return { mid, low, high };
}
