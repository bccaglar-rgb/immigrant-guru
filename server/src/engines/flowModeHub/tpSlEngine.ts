/**
 * Flow Mode Hub V2 — TP/SL Engine
 *
 * Single TP (0.3-2.0% price = 3-20% margin @ 10x) + Single SL (0.2-0.8% price = 2-8% margin @ 10x)
 *
 * Margin-based limits ($100 margin @ 10x leverage):
 *   TP: min $3 profit, max $20 profit
 *   SL: max $8 loss per trade
 *
 * SL:
 *   RawSL = swingLow/High (structural) + ATR * StopBuffer(regime)
 *   SLpct = clamp(|entry - rawSL| / entry * 100, 0.2, 0.8)
 *   Then further clamp to REGIME_TPSL ranges
 *
 * TP:
 *   TPComposite = 0.22*volExpansion + 0.20*liqRun + 0.18*trendCont + 0.15*regimeTarget + 0.10*sessionRange + 0.15*edgeSupport
 *   RawTPpct = 0.3 + 1.7 * TPComposite
 *   FinalTPpct = clamp(RawTPpct, 0.3, 2.0)
 *   Then further clamp to REGIME_TPSL ranges
 */

import type { HubInput, FlowTpSlResult } from "./types.ts";
import type { EntryZoneResult } from "./types.ts";
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

  // Structural SL: swing level
  let structuralSL: number;
  let rawSource: string;
  if (isLong) {
    structuralSL = input.swingLow > 0 && input.swingLow < entryMid
      ? input.swingLow
      : entryMid * (1 - 0.004); // fallback 0.4% (4% margin @ 10x)
    rawSource = input.swingLow > 0 ? "swingLow" : "fallback0.4pct";
  } else {
    structuralSL = input.swingHigh > 0 && input.swingHigh > entryMid
      ? input.swingHigh
      : entryMid * (1 + 0.004);
    rawSource = input.swingHigh > 0 ? "swingHigh" : "fallback0.4pct";
  }

  // ATR buffer based on regime
  const bufferRange = SL_CONFIG.stopBuffer[regime] ?? [0.20, 0.30];
  const riskFactor = clamp(input.riskScore, 0, 1);
  const buffer = bufferRange[0] + riskFactor * (bufferRange[1] - bufferRange[0]);
  const atrBuffer = atr * buffer;

  // Apply buffer (widen SL)
  const slWithBuffer = isLong
    ? structuralSL - atrBuffer
    : structuralSL + atrBuffer;

  // Calculate price % distance
  let slPricePct = Math.abs(entryMid - slWithBuffer) / entryMid * 100;

  // Clamp to global range (0.2-0.8% price = 2-8% margin @ 10x)
  slPricePct = clamp(slPricePct, SL_CONFIG.clamp[0], SL_CONFIG.clamp[1]);

  // Further clamp to regime range
  const regimeRange = REGIME_TPSL[regime];
  if (regimeRange) {
    slPricePct = clamp(slPricePct, regimeRange.sl[0], regimeRange.sl[1]);
  }

  // Compute actual SL price
  const slPrice = isLong
    ? entryMid * (1 - slPricePct / 100)
    : entryMid * (1 + slPricePct / 100);

  return { slPrice, slPricePct: Math.round(slPricePct * 100) / 100, rawSource };
}

function calcTP(
  input: HubInput,
  side: "LONG" | "SHORT",
  regime: string,
  entryMid: number,
  realizedEdgeProxy: number,
): { tpPrice: number; tpPricePct: number; tpComposite: number } {
  const isLong = side === "LONG";

  // TP Composite sub-scores (each 0-1)
  const volExpansion = clamp(input.expansionProbability, 0, 1);
  const liqRun = clamp(input.poolProximity * (1 - input.spoofRisk), 0, 1);
  const trendCont = clamp(input.trendStrength * input.htfTrend, 0, 1);

  // Regime target mapping
  const regimeTargetMap: Record<string, number> = {
    TREND: 0.80,
    RANGE: 0.30,
    BREAKOUT_SETUP: 0.65,
    HIGH_STRESS: 0.40,
    FAKE_BREAK_RISK: 0.35,
  };
  const regimeTarget = regimeTargetMap[regime] ?? 0.50;

  const sessionRange = clamp(input.atrFit, 0, 1);
  const edgeSupport = clamp(realizedEdgeProxy * 3, 0, 1);

  const tpComposite =
    TP_CONFIG.compositeWeights.volExpansion * volExpansion +
    TP_CONFIG.compositeWeights.liqRun * liqRun +
    TP_CONFIG.compositeWeights.trendCont * trendCont +
    TP_CONFIG.compositeWeights.regimeTarget * regimeTarget +
    TP_CONFIG.compositeWeights.sessionRange * sessionRange +
    TP_CONFIG.compositeWeights.edgeSupport * edgeSupport;

  // Raw TP % (0.3 + 1.7 * composite → range 0.3-2.0%)
  let tpPricePct = TP_CONFIG.base + TP_CONFIG.range * tpComposite;

  // Clamp to global range (0.3-2.0% price = 3-20% margin @ 10x)
  tpPricePct = clamp(tpPricePct, TP_CONFIG.clamp[0], TP_CONFIG.clamp[1]);

  // Further clamp to regime range
  const regimeRange = REGIME_TPSL[regime];
  if (regimeRange) {
    tpPricePct = clamp(tpPricePct, regimeRange.tp[0], regimeRange.tp[1]);
  }

  tpPricePct = Math.round(tpPricePct * 100) / 100;

  // Compute actual TP price
  const tpPrice = isLong
    ? entryMid * (1 + tpPricePct / 100)
    : entryMid * (1 - tpPricePct / 100);

  return { tpPrice, tpPricePct, tpComposite: Math.round(tpComposite * 1000) / 1000 };
}

export function calculateFlowTpSl(
  input: HubInput,
  side: "LONG" | "SHORT",
  regime: string,
  adjustedScore: number,
  realizedEdgeProxy: number,
  entryZone: EntryZoneResult,
  pricePrecision?: number,
): FlowTpSlResult {
  const prec = pricePrecision ?? 2;
  const round = (v: number) => Number(v.toFixed(prec));

  const entryLow = round(entryZone.low);
  const entryHigh = round(entryZone.high);
  const entryMid = (entryLow + entryHigh) / 2;

  const { slPrice, slPricePct, rawSource } = calcSL(input, side, regime, entryMid);
  const { tpPrice, tpPricePct, tpComposite } = calcTP(input, side, regime, entryMid, realizedEdgeProxy);

  // Convert price % to margin % (for backward compat)
  const tpMarginPct = Math.round(tpPricePct * LEVERAGE * 100) / 100;
  const slMarginPct = Math.round(slPricePct * LEVERAGE * 100) / 100;

  const riskRewardRatio = slPricePct > 0
    ? Math.round((tpPricePct / slPricePct) * 100) / 100
    : 0;

  return {
    entryZone: [entryLow, entryHigh],
    tp: round(tpPrice),
    sl: round(slPrice),
    tpPricePct,
    slPricePct,
    tpMarginPct,
    slMarginPct,
    riskRewardRatio,
    tpComposite,
    rawSLSource: rawSource,
  };
}
