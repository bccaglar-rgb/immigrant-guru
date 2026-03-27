/**
 * Capital Guard Mode Hub — Entry Zone Engine (v4)
 *
 * Code-computed entry zone (NOT from API/AI).
 * CG uses narrower ATR multipliers than balanced:
 *
 * EntryMid = 0.30*VWAP + 0.22*pullback + 0.22*acceptance + 0.16*liqReclaim + 0.10*EMA
 *
 * LONG: Low = Mid - 0.12*ATR, High = Mid + 0.04*ATR
 * SHORT: Low = Mid - 0.04*ATR, High = Mid + 0.12*ATR
 *
 * CG differences from Balanced:
 * - Narrower zones: 0.12/0.04 ATR (balanced: 0.15/0.05)
 * - More weight on pullback + acceptance (0.22 each vs 0.20)
 * - Less weight on VWAP (0.30 vs 0.35)
 * - More weight on liquidity reclaim (0.16 vs 0.15)
 */

import type { HubInput, BiasDirection } from "./types.ts";

export function calculateCgEntryZone(
  input: HubInput,
  direction: BiasDirection,
  pricePrecision?: number,
): [number, number] {
  // VWAP approximation from price + vwapPosition
  const vwapAdjust = input.vwapPosition === "ABOVE" ? 0.001 : input.vwapPosition === "BELOW" ? -0.001 : 0;
  const vwap = input.price * (1 + vwapAdjust);

  const pullback = input.nearestSupport;
  const acceptance = (input.nearestSupport + input.nearestResistance) / 2;
  const liqReclaim = input.nearestLiquidity;
  const ema = input.price * (1 + input.emaBias * 0.005);

  // CG-specific weighted formula
  const entryMid = 0.30 * vwap + 0.22 * pullback + 0.22 * acceptance + 0.16 * liqReclaim + 0.10 * ema;

  const atr = input.atrPct * input.price;

  // Narrower ATR multipliers for CG (0.12/0.04 vs balanced 0.15/0.05)
  let low: number, high: number;
  if (direction === "LONG") {
    low = entryMid - 0.12 * atr;
    high = entryMid + 0.04 * atr;
  } else {
    // SHORT
    low = entryMid - 0.04 * atr;
    high = entryMid + 0.12 * atr;
  }

  const prec = pricePrecision ?? 2;
  return [Number(low.toFixed(prec)), Number(high.toFixed(prec))];
}
