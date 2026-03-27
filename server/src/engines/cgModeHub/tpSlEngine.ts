/**
 * Capital Guard Mode Hub — TP/SL Engine (v4.1: ATR Floor + Wider SL)
 *
 * SL System ($100 notional @ 10x leverage):
 *   1. Compute structural stop from swing levels
 *   2. ATR floor: SL must be ≥ 1.2 * ATR to survive noise
 *   3. Blend 75% structural + 25% score-based (reduced score tightening)
 *   4. Clamp to 4-10% margin ($4-$10 loss)
 *
 * TP System:
 *   1. Score-based TP: higher score → higher TP
 *   2. Clamp to 5-14% margin ($5-$14 profit)
 *
 * v4.1 changes (from failure analysis):
 *   - SL [1.5,5] → [4,10]: old 0.5% price SL hit by noise in 8-86 seconds
 *   - ATR floor: SL never closer than 1.2×ATR
 *   - Blend 60/40 → 75/25: less score-based tightening
 *   - TP [3,12] → [5,14]: slightly wider for bigger catch
 */

import type { HubInput, TpSlResult, BiasDirection, RegimeType } from "./types.ts";
import { CG_TPSL_CONFIG } from "./config.ts";

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

export function calculateCgTpSl(
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

  const entryMid = (entryZone[0] + entryZone[1]) / 2;
  const { leverage, tpMarginRange, slMarginRange, tpMarginClamp, slMarginClamp, regimeTpMult, regimeSlMult } = CG_TPSL_CONFIG;

  const scoreFactor = clamp(adjustedScore / 100, 0, 1);

  // ── Step 1: Structural Stop from swing levels ─────────────────
  let structuralSlPricePct: number;
  if (isLong) {
    const swingRef = Math.max(input.swingLow, input.nearestSupport);
    const buffer = input.atrPct * entryMid * 0.1; // 10% of ATR as buffer
    const structuralSl = swingRef - buffer;
    structuralSlPricePct = Math.abs((entryMid - structuralSl) / entryMid);
  } else {
    const swingRef = Math.min(input.swingHigh, input.nearestResistance);
    const buffer = input.atrPct * entryMid * 0.1;
    const structuralSl = swingRef + buffer;
    structuralSlPricePct = Math.abs((structuralSl - entryMid) / entryMid);
  }
  const structuralSlMarginPct = structuralSlPricePct * leverage * 100;

  // ── Step 2: ATR floor — SL must be ≥ 1.2 * ATR to survive noise
  // v4.1: Without ATR floor, SL was 0.5% price = hit in 8 seconds
  const atrMarginPct = input.atrPct * 100 * leverage * 1.2;

  // ── Step 3: Regime-adjusted structural SL ─────────────────────
  const slRegimeMult = regimeSlMult[regime] ?? 1.0;
  let slMarginPct = structuralSlMarginPct * slRegimeMult;

  // ── Step 4: Score-based SL ────────────────────────────────────
  const [slMin, slMax] = slMarginRange;
  const scoreSlMarginPct = slMax - scoreFactor * (slMax - slMin);

  // ── Step 5: Blend 75% structural + 25% score-based ───────────
  // v4.1: Was 60/40 — high scores tightened SL too aggressively
  slMarginPct = 0.75 * slMarginPct + 0.25 * scoreSlMarginPct;

  // ── Step 6: ATR floor — never let SL be closer than 1.2 * ATR
  slMarginPct = Math.max(slMarginPct, atrMarginPct);

  // ── Step 7: Final clamp ───────────────────────────────────────
  slMarginPct = clamp(slMarginPct, slMarginClamp[0], slMarginClamp[1]);
  slMarginPct = Math.round(slMarginPct * 100) / 100;

  // ── TP: Score-based → Margin Clamp ────────────────────────────
  const [tpMin, tpMax] = tpMarginRange;
  let tpMarginPct = tpMin + scoreFactor * (tpMax - tpMin);
  tpMarginPct *= (regimeTpMult[regime] ?? 1.0);
  tpMarginPct = clamp(tpMarginPct, tpMarginClamp[0], tpMarginClamp[1]);
  tpMarginPct = Math.round(tpMarginPct * 100) / 100;

  // ── Convert margin % to price levels ──────────────────────────
  const tpPricePct = tpMarginPct / 100 / leverage;
  const slPricePct = slMarginPct / 100 / leverage;

  const tp = round(isLong ? entryMid * (1 + tpPricePct) : entryMid * (1 - tpPricePct));
  const sl = round(isLong ? entryMid * (1 - slPricePct) : entryMid * (1 + slPricePct));

  const rr = slMarginPct > 0 ? Math.round((tpMarginPct / slMarginPct) * 100) / 100 : 0;

  return {
    entryZone: [round(entryZone[0]), round(entryZone[1])],
    tp,
    sl,
    tpMarginPct,
    slMarginPct,
    riskRewardRatio: rr,
  };
}
