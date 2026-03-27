/**
 * Bitrium Prime AI Hub — Input Builder
 *
 * Transforms HubInput (73+ fields from balanced hub dataExtractor)
 * into structured PrimeAiCoinInput JSON for the AI prompt.
 *
 * Groups raw flat fields into semantic clusters that the AI
 * can reason about as a trader would.
 */

import type { HubInput } from "../balancedModeHub/types.ts";
import type { PrimeAiCoinInput } from "./types.ts";
import { applyDegradation, type DegradationFlags } from "./degradationHandler.ts";
import { SESSION_MULTIPLIERS } from "./config.ts";

const round2 = (v: number): number => Math.round(v * 100) / 100;
const round4 = (v: number): number => Math.round(v * 10000) / 10000;

function getSessionName(): string {
  const hour = new Date().getUTCHours();
  const day = new Date().getUTCDay();
  if (day === 0 || day === 6) return "WEEKEND";
  if (hour >= 0 && hour < 8) return "ASIAN";
  if (hour >= 8 && hour < 14) return "LONDON";
  return "NY";
}

function directionLabel(bias: number): string {
  if (bias > 0.3) return "BULLISH";
  if (bias < -0.3) return "BEARISH";
  return "NEUTRAL";
}

function trendDirLabel(trendBias: number): string {
  if (trendBias > 0.2) return "UP";
  if (trendBias < -0.2) return "DOWN";
  return "NEUTRAL";
}

function emaAlignLabel(emaBias: number): string {
  if (emaBias > 0.2) return "BULL";
  if (emaBias < -0.2) return "BEAR";
  return "MIXED";
}

function slippageLabel(slip: string): string {
  const upper = slip.toUpperCase();
  if (upper === "HIGH") return "HIGH";
  if (upper === "MODERATE" || upper === "MED") return "MODERATE";
  return "LOW";
}

function volatilityRegime(atrPct: number, compression: boolean): string {
  if (compression) return "LOW";
  if (atrPct > 0.03) return "HIGH";
  return "NORMAL";
}

function timingLabel(entryWindow: string, fillProb: number): string {
  if (entryWindow === "OPEN" && fillProb > 0.6) return "GOOD";
  if (entryWindow === "CLOSING" || fillProb > 0.4) return "FAIR";
  return "POOR";
}

function obImbalanceLabel(orderflowBias: number): string {
  if (orderflowBias > 0.3) return "BUY";
  if (orderflowBias < -0.3) return "SELL";
  return "NEUTRAL";
}

/**
 * Build a PrimeAiCoinInput from HubInput.
 * Also returns degradation flags for use in code enforcement.
 */
export function buildCoinInput(
  input: HubInput,
): { coinInput: PrimeAiCoinInput; degradation: DegradationFlags } {
  const sessionName = getSessionName();
  const sessionMult = SESSION_MULTIPLIERS[sessionName] ?? 0.95;

  // Detect degradation
  const degradation = applyDegradation(input);

  // Derive EMA proxies from available data
  const ema9 = input.price; // best available: current price
  const ema21 = input.htfLevel > 0 ? (input.price + input.htfLevel) / 2 : input.price;
  const ema50 = input.htfLevel > 0 ? input.htfLevel : input.price * 0.998;
  const ema200 = input.htfLevel > 0 ? input.htfLevel * 0.995 : input.price * 0.995;

  // VWAP proxy from price + vwapPosition
  const vwap = input.vwapPosition === "ABOVE"
    ? input.price * 0.998
    : input.vwapPosition === "BELOW"
      ? input.price * 1.002
      : input.price;

  // Regime mapping
  const regimeMap: Record<string, string> = {
    TREND: "TREND",
    RANGE: "RANGE",
    BREAKOUT: "BREAKOUT_SETUP",
    BREAKOUT_SETUP: "BREAKOUT_SETUP",
    VOLATILE: "HIGH_STRESS",
    HIGH_STRESS: "HIGH_STRESS",
    FAKE_BREAK_RISK: "FAKE_BREAK_RISK",
  };
  const regimeType = regimeMap[input.regime.toUpperCase()] || "RANGE";

  // Edge computations
  const lossR = 1.0;
  const edgeNetR = (input.pWin * input.avgWinR) - ((1 - input.pWin) * lossR) - input.costR;

  // Risk gate check
  const hardFailReasons: string[] = [];
  if (input.dataHealthScore < 0.85) hardFailReasons.push("low_data_health");
  if (input.fillProbability < 0.22) hardFailReasons.push("low_fill_prob");
  if (edgeNetR < 0.08) hardFailReasons.push("low_edge");
  if (input.tradeValidity === "INVALID" || input.tradeValidity === "NO-TRADE") hardFailReasons.push("invalid_trade");
  if (input.riskScore > 0.80) hardFailReasons.push("high_risk");

  const coinInput: PrimeAiCoinInput = {
    symbol: input.symbol,
    timeframe: input.timeframe,
    price: round4(input.price),
    vwap: round4(vwap),
    emas: {
      ema9: round4(ema9),
      ema21: round4(ema21),
      ema50: round4(ema50),
      ema200: round4(ema200),
    },
    atr: {
      value: round4(input.atrPct * input.price),
      percentile: round2(input.atrPct > 0.03 ? 0.85 : input.atrPct > 0.015 ? 0.55 : 0.25),
      regime: volatilityRegime(input.atrPct, input.compressionActive),
    },

    htfTrend: {
      bias: directionLabel(input.trendDirBias),
      strength: round2(input.trendStrength),
      alignment: round2(input.emaAlignment),
    },

    marketStructure: {
      regime: regimeType,
      trendDirection: trendDirLabel(input.trendDirBias),
      trendStrength: round2(input.trendStrength),
      emaAlignment: emaAlignLabel(input.emaBias),
      timeInRange: round2(input.timeInRange),
    },

    liquidity: {
      sweep: input.sweepReclaim > 0.5,
      reclaim: input.sweepReclaim > 0.7,
      pool: round2(input.poolProximity),
      spoof: round2(input.spoofRisk),
      absorption: round2(input.liquidityDensity),
      depth: round2(input.depthQuality),
      spread: round2(input.spreadTightness),
      obImbalance: obImbalanceLabel(input.orderflowBias),
    },

    volatility: {
      atrPercentile: round2(input.atrPct > 0.03 ? 0.85 : input.atrPct > 0.015 ? 0.55 : 0.25),
      compression: input.compressionActive,
      expansion: round2(input.expansionProbability),
      deadRisk: round2(input.deadVolatility),
      suddenRisk: round2(input.suddenMoveRisk),
      regime: volatilityRegime(input.atrPct, input.compressionActive),
    },

    regime: {
      type: regimeType,
      fakeBreakProb: round2(input.fakeBreakRisk),
      stress: round2(input.riskScore),
      multipliers: {
        session: sessionMult,
        volatility: round2(input.atrFit),
        regime: round2(
          regimeType === "TREND" ? 1.0
          : regimeType === "RANGE" ? 0.92
          : regimeType === "BREAKOUT_SETUP" ? 0.96
          : regimeType === "FAKE_BREAK_RISK" ? 0.80
          : 0.75,
        ),
      },
    },

    execution: {
      fillProb: round2(input.fillProbability),
      slippage: slippageLabel(input.slippage),
      spread: round2(input.spreadScore),
      depth: round2(input.depthScore),
      obStability: round2(input.obStability),
      entryWindow: input.entryWindowState,
      timing: timingLabel(input.entryWindowState, input.fillProbability),
    },

    positioning: {
      funding: round2(input.fundingHealthy > 0.5 ? 0.1 : input.fundingHealthy < 0.3 ? -0.5 : 0),
      crowding: round2(input.crowdingHigh),
      oiDivergence: round2(input.oiDivergence),
      bias: directionLabel(input.positioningBias),
    },

    edgeModel: {
      pWin: round2(input.pWin),
      avgWinR: round2(input.avgWinR),
      lossR,
      costR: round2(input.costR),
      exitReliability: round2(Math.max(0, 1 - input.fakeBreakRisk - input.suddenMoveRisk * 0.5)),
      rrQuality: round2(Math.min(100, input.avgWinR * 35)),
      winModelAgreement: round2(Math.min(100, input.pWin * 120)),
    },

    session: {
      name: sessionName,
      multiplier: sessionMult,
      thinLiquidity: sessionName === "WEEKEND" || sessionName === "ASIAN",
    },

    dataHealth: {
      completeness: round2(input.dataHealthScore),
      staleFeed: input.dataHealthScore < 0.80,
      degradedFeeds: degradation.degradedFeeds,
    },

    riskGate: {
      hardFail: hardFailReasons.length > 0,
      reasons: hardFailReasons,
    },

    tradeValidity: input.tradeValidity,

    levels: {
      pullback: round4(input.nearestSupport > 0 ? input.nearestSupport : input.price * 0.99),
      acceptance: round4(input.swingLow > 0 ? input.swingLow : input.price * 0.985),
      reclaim: round4(input.nearestLiquidity > 0 ? input.nearestLiquidity : input.price),
      swingHigh: round4(input.swingHigh > 0 ? input.swingHigh : input.price * 1.02),
      swingLow: round4(input.swingLow > 0 ? input.swingLow : input.price * 0.98),
      support: round4(input.nearestSupport > 0 ? input.nearestSupport : input.price * 0.97),
      resistance: round4(input.nearestResistance > 0 ? input.nearestResistance : input.price * 1.03),
    },
  };

  return { coinInput, degradation };
}

/**
 * Build coin inputs for all HubInputs in a cycle.
 * Pre-flight gate: skip coins with missing critical data.
 */
export function buildAllCoinInputs(
  inputs: HubInput[],
): Array<{ coinInput: PrimeAiCoinInput; hubInput: HubInput; degradation: DegradationFlags }> {
  const results: Array<{ coinInput: PrimeAiCoinInput; hubInput: HubInput; degradation: DegradationFlags }> = [];

  for (const input of inputs) {
    // Pre-flight: skip coins with completely broken data
    if (input.price <= 0) continue;
    if (!input.symbol) continue;

    const { coinInput, degradation } = buildCoinInput(input);
    results.push({ coinInput, hubInput: input, degradation });
  }

  return results;
}
