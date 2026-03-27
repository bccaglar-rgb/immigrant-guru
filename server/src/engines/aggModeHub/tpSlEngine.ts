/**
 * Aggressive Mode Hub V2 — TP/SL Engine
 *
 * Key AGG difference: 3 TP levels (TP1, TP2, TP3)
 *   TP1 = base composite TP (same formula as FLOW)
 *   TP2 = TP1 * 1.6x (clamped to global max)
 *   TP3 = TP1 * 2.5x (clamped to global max)
 *   All clamped to 0.3-2.0% price = 3-20% margin @ 10x
 *
 * SL: same structure-based formula as FLOW (0.2-0.8% price = 2-8% margin @ 10x)
 *
 * Margin-based limits ($100 margin @ 10x leverage):
 *   TP: min $3 profit, max $20 profit (all levels)
 *   SL: max $8 loss per trade
 */

import type { HubInput, AggTpSlResult, EntryZoneResult } from "./types.ts";
import { SL_CONFIG, TP_CONFIG, REGIME_TPSL, LEVERAGE } from "./config.ts";

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

function calcSL(
  input: HubInput,
  side: "LONG" | "SHORT",
  regime: string,
  entryMid: number,
): { slPrice: number; slPricePct: number; rawSource: string } {
  const isLong = side === "LONG";
  const atr = entryMid * Math.max(input.atrPct, 0.005);

  let structuralSL: number;
  let rawSource: string;
  if (isLong) {
    structuralSL = input.swingLow > 0 && input.swingLow < entryMid ? input.swingLow : entryMid * (1 - 0.004);
    rawSource = input.swingLow > 0 ? "swingLow" : "fallback0.4pct";
  } else {
    structuralSL = input.swingHigh > 0 && input.swingHigh > entryMid ? input.swingHigh : entryMid * (1 + 0.004);
    rawSource = input.swingHigh > 0 ? "swingHigh" : "fallback0.4pct";
  }

  const bufferRange = SL_CONFIG.stopBuffer[regime] ?? [0.20, 0.30];
  const riskFactor = clamp(input.riskScore, 0, 1);
  const buffer = bufferRange[0] + riskFactor * (bufferRange[1] - bufferRange[0]);
  const slWithBuffer = isLong ? structuralSL - atr * buffer : structuralSL + atr * buffer;

  let slPricePct = Math.abs(entryMid - slWithBuffer) / entryMid * 100;
  slPricePct = clamp(slPricePct, SL_CONFIG.clamp[0], SL_CONFIG.clamp[1]);

  const regimeRange = REGIME_TPSL[regime];
  if (regimeRange) slPricePct = clamp(slPricePct, regimeRange.sl[0], regimeRange.sl[1]);

  const slPrice = isLong ? entryMid * (1 - slPricePct / 100) : entryMid * (1 + slPricePct / 100);

  return { slPrice, slPricePct: Math.round(slPricePct * 100) / 100, rawSource };
}

function calcTPComposite(
  input: HubInput,
  regime: string,
  realizedEdgeProxy: number,
): number {
  const volExpansion = clamp(input.expansionProbability, 0, 1);
  const liqRun = clamp(input.poolProximity * (1 - input.spoofRisk), 0, 1);
  const trendCont = clamp(input.trendStrength * input.htfTrend, 0, 1);

  const regimeTargetMap: Record<string, number> = {
    TREND: 0.80, RANGE: 0.30, BREAKOUT_SETUP: 0.65, HIGH_STRESS: 0.40, FAKE_BREAK_RISK: 0.35,
  };
  const regimeTarget = regimeTargetMap[regime] ?? 0.50;
  const sessionRange = clamp(input.atrFit, 0, 1);
  const edgeSupport = clamp(realizedEdgeProxy * 3, 0, 1);

  return (
    TP_CONFIG.compositeWeights.volExpansion * volExpansion +
    TP_CONFIG.compositeWeights.liqRun * liqRun +
    TP_CONFIG.compositeWeights.trendCont * trendCont +
    TP_CONFIG.compositeWeights.regimeTarget * regimeTarget +
    TP_CONFIG.compositeWeights.sessionRange * sessionRange +
    TP_CONFIG.compositeWeights.edgeSupport * edgeSupport
  );
}

export function calculateAggTpSl(
  input: HubInput,
  side: "LONG" | "SHORT",
  regime: string,
  adjustedScore: number,
  realizedEdgeProxy: number,
  entryZone: EntryZoneResult,
  pricePrecision?: number,
): AggTpSlResult {
  const prec = pricePrecision ?? 2;
  const round = (v: number) => Number(v.toFixed(prec));

  const entryLow = round(entryZone.low);
  const entryHigh = round(entryZone.high);
  const entryMid = (entryLow + entryHigh) / 2;
  const isLong = side === "LONG";

  // SL (same as FLOW)
  const { slPrice, slPricePct, rawSource } = calcSL(input, side, regime, entryMid);

  // TP1 (base, same formula as FLOW)
  const tpComposite = calcTPComposite(input, regime, realizedEdgeProxy);
  let tp1PricePct = TP_CONFIG.base + TP_CONFIG.range * tpComposite;
  tp1PricePct = clamp(tp1PricePct, TP_CONFIG.clamp[0], TP_CONFIG.clamp[1]);

  const regimeRange = REGIME_TPSL[regime];
  if (regimeRange) tp1PricePct = clamp(tp1PricePct, regimeRange.tp[0], regimeRange.tp[1]);
  tp1PricePct = Math.round(tp1PricePct * 100) / 100;

  // TP2 = TP1 * 1.6x (clamped to global max — all TP levels max $20 profit)
  let tp2PricePct = tp1PricePct * TP_CONFIG.tp2Mult;
  tp2PricePct = clamp(tp2PricePct, TP_CONFIG.clamp[0], TP_CONFIG.clamp[1]);
  if (regimeRange) tp2PricePct = Math.min(tp2PricePct, regimeRange.tp[1]);
  tp2PricePct = Math.round(tp2PricePct * 100) / 100;

  // TP3 = TP1 * 2.5x (clamped to global max — all TP levels max $20 profit)
  let tp3PricePct = tp1PricePct * TP_CONFIG.tp3Mult;
  tp3PricePct = clamp(tp3PricePct, TP_CONFIG.clamp[0], TP_CONFIG.clamp[1]);
  if (regimeRange) tp3PricePct = Math.min(tp3PricePct, regimeRange.tp[1]);
  tp3PricePct = Math.round(tp3PricePct * 100) / 100;

  // Compute actual TP prices
  const tp1Price = isLong ? entryMid * (1 + tp1PricePct / 100) : entryMid * (1 - tp1PricePct / 100);
  const tp2Price = isLong ? entryMid * (1 + tp2PricePct / 100) : entryMid * (1 - tp2PricePct / 100);
  const tp3Price = isLong ? entryMid * (1 + tp3PricePct / 100) : entryMid * (1 - tp3PricePct / 100);

  // Margin % (TP1 for backward compat)
  const tpMarginPct = Math.round(tp1PricePct * LEVERAGE * 100) / 100;
  const slMarginPct = Math.round(slPricePct * LEVERAGE * 100) / 100;

  const riskRewardRatio = slPricePct > 0
    ? Math.round((tp1PricePct / slPricePct) * 100) / 100
    : 0;

  return {
    entryZone: [entryLow, entryHigh],
    tp: round(tp1Price),       // main target (backward compat)
    tp2: round(tp2Price),
    tp3: round(tp3Price),
    sl: round(slPrice),
    tpPricePct: tp1PricePct,
    tp2PricePct,
    tp3PricePct,
    slPricePct,
    tpMarginPct,
    slMarginPct,
    riskRewardRatio,
    tpComposite: Math.round(tpComposite * 1000) / 1000,
    rawSLSource: rawSource,
    tpLevels: [round(tp1Price), round(tp2Price), round(tp3Price)],
  };
}
