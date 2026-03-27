/**
 * Balanced Mode Hub — Entry Zone Engine (v4)
 *
 * Code-computed entry zone — NOT from API or AI.
 *
 * EntryMid = 0.35*VWAP + 0.20*pullback + 0.20*acceptance + 0.15*liqReclaim + 0.10*EMA
 * LONG: Low = Mid - 0.15*ATR, High = Mid + 0.05*ATR  (asymmetric — favor pullback entries)
 * SHORT: Low = Mid - 0.05*ATR, High = Mid + 0.15*ATR
 */

import type { HubInput, BiasDirection } from "./types.ts";

export function calculateEntryZone(
  input: HubInput,
  direction: BiasDirection,
  pricePrecision?: number,
): [number, number] {
  if (direction === "NONE") {
    // Fallback to API entry zone for non-directional
    return input.entryZone;
  }

  const prec = pricePrecision ?? 2;
  const round = (v: number) => Number(v.toFixed(prec));

  // ── Component prices ──
  // VWAP approximation: use price adjusted by vwapPosition
  const vwap = input.vwapPosition === "ABOVE"
    ? input.price * 0.999   // price above VWAP → VWAP slightly below
    : input.vwapPosition === "BELOW"
      ? input.price * 1.001  // price below VWAP → VWAP slightly above
      : input.price;          // AT VWAP

  const pullback = input.nearestSupport;
  const acceptance = (input.nearestSupport + input.nearestResistance) / 2;
  const liqReclaim = input.nearestLiquidity;

  // EMA reference: use price + emaBias direction
  const ema = input.price * (1 + input.emaBias * 0.003);

  // ── Weighted EntryMid ──
  const entryMid = 0.35 * vwap + 0.20 * pullback + 0.20 * acceptance + 0.15 * liqReclaim + 0.10 * ema;

  // ── ATR-based zone width (asymmetric) ──
  const atr = input.atrPct * input.price;

  let low: number;
  let high: number;

  if (direction === "LONG") {
    // LONG: wider below (pullback room), narrow above
    low = entryMid - 0.15 * atr;
    high = entryMid + 0.05 * atr;
  } else {
    // SHORT: narrow below, wider above (bounce room)
    low = entryMid - 0.05 * atr;
    high = entryMid + 0.15 * atr;
  }

  // Sanity: ensure low < high and both positive
  if (low >= high) {
    const mid = (low + high) / 2;
    low = mid - 0.001 * mid;
    high = mid + 0.001 * mid;
  }
  if (low <= 0) low = input.price * 0.995;
  if (high <= 0) high = input.price * 1.005;

  return [round(low), round(high)];
}
