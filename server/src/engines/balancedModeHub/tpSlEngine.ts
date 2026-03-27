/**
 * Balanced Mode Hub — TP/SL Engine (v4: Structural Stop + Margin Clamp)
 *
 * SL System ($100 notional @ 10x leverage):
 *   1. Compute structural stop from swing levels
 *   2. Clamp to 2-8% margin ($2-$8 loss)
 *
 * TP System:
 *   1. Score-based TP target: higher score → higher TP
 *   2. Clamp to 3-20% margin ($3-$20 profit)
 *   3. Single TP level
 *
 * Regime multipliers applied to both TP and SL.
 */
import type { HubInput, TpSlResult, BiasDirection, RegimeType } from "./types.ts";
import { TPSL_CONFIG } from "./config.ts";

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

export function calculateTpSl(
  input: HubInput,
  direction: BiasDirection,
  regime: RegimeType,
  adjustedScore: number,
  entryZone: [number, number],
  pricePrecision?: number,
): TpSlResult | null {
  if (direction === "NONE") return null;

  const isLong = direction === "LONG";
  const prec = pricePrecision ?? 2;
  const round = (v: number) => Number(v.toFixed(prec));

  const entryLow = round(entryZone[0]);
  const entryHigh = round(entryZone[1]);
  const entryMid = (entryLow + entryHigh) / 2;

  const { leverage, tpMarginRange, slMarginRange, tpMarginClamp, slMarginClamp, regimeTpMult, regimeSlMult } = TPSL_CONFIG;

  const scoreFactor = clamp(adjustedScore / 100, 0, 1);

  // ── SL: Structural Stop → Margin Clamp ─────────────────────────

  // Step 1: Compute structural stop from swing levels
  let structuralSl: number;
  if (isLong) {
    // LONG SL: below nearest support or swing low, with small buffer
    const swingRef = Math.max(input.swingLow, input.nearestSupport);
    const buffer = input.atrPct * entryMid * 0.1; // 10% of ATR as buffer
    structuralSl = swingRef - buffer;
  } else {
    // SHORT SL: above nearest resistance or swing high, with small buffer
    const swingRef = Math.min(input.swingHigh, input.nearestResistance);
    const buffer = input.atrPct * entryMid * 0.1;
    structuralSl = swingRef + buffer;
  }

  // Step 2: Compute structural SL as margin %
  const structuralSlPricePct = Math.abs(structuralSl - entryMid) / entryMid;
  const structuralSlMarginPct = structuralSlPricePct * 100 * leverage;

  // Step 3: ATR floor — SL must be at least 1.2 * ATR to survive noise
  const atrMarginPct = input.atrPct * 100 * leverage * 1.2; // 1.2x ATR in margin %

  // Step 4: Regime-adjusted structural SL
  const slRegimeMult = regimeSlMult[regime] ?? 1.0;
  let slMarginPct = structuralSlMarginPct * slRegimeMult;

  // Step 5: Blend structural(75%) + score-based(25%) — reduced from 60/40
  // Old: 60/40 → high scores tightened SL too aggressively, noise killed 90% of ideas
  const [slMin, slMax] = slMarginRange;
  const scoreBasedSl = slMax - scoreFactor * (slMax - slMin);
  slMarginPct = 0.75 * slMarginPct + 0.25 * scoreBasedSl;

  // Step 6: Apply ATR floor — never let SL be closer than 1.2 * ATR
  slMarginPct = Math.max(slMarginPct, atrMarginPct);

  // Step 7: Final clamp
  slMarginPct = clamp(slMarginPct, slMarginClamp[0], slMarginClamp[1]);
  slMarginPct = Math.round(slMarginPct * 100) / 100;

  // ── TP: Score-based → Margin Clamp ──────────────────────────────

  const [tpMin, tpMax] = tpMarginRange;
  let tpMarginPct = tpMin + scoreFactor * (tpMax - tpMin);
  const tpRegimeMult = regimeTpMult[regime] ?? 1.0;
  tpMarginPct *= tpRegimeMult;
  tpMarginPct = clamp(tpMarginPct, tpMarginClamp[0], tpMarginClamp[1]);
  tpMarginPct = Math.round(tpMarginPct * 100) / 100;

  // ── Convert margin % to price levels ───────────────────────────
  const tpPricePct = tpMarginPct / 100 / leverage;
  const slPricePct = slMarginPct / 100 / leverage;

  const tp = round(isLong ? entryMid * (1 + tpPricePct) : entryMid * (1 - tpPricePct));
  const sl = round(isLong ? entryMid * (1 - slPricePct) : entryMid * (1 + slPricePct));

  const rr = slMarginPct > 0 ? Math.round((tpMarginPct / slMarginPct) * 100) / 100 : 0;

  return {
    entryZone: [entryLow, entryHigh],
    tp,
    sl,
    tpMarginPct,
    slMarginPct,
    riskRewardRatio: rr,
  };
}
