/**
 * Balanced Mode Hub — Hard Gates + Soft Blocks (v4)
 *
 * Hard gates: immediate decision cap (NO_TRADE or WATCHLIST)
 * Soft blocks: conditional caps (cap at WATCHLIST or PROBE)
 *
 * Hard gates (NO_TRADE):
 *   - DataHealth < 0.85
 *   - TradeValidity = "INVALID"
 *   - FillProbability < 0.22
 *   - EdgeNetR < 0.08
 *   - DepthScore < 0.2 AND Slippage = "HIGH"
 *
 * Hard gates (WATCHLIST):
 *   - RiskScore >= 0.80
 *   - EntryWindow = "CLOSED"
 *
 * Soft blocks (contextual caps):
 *   - FakeBreakRisk > 0.6 AND TrendStrength < 0.4 → cap WATCHLIST
 *   - StressLevel > 0.7 AND FillProb < 0.40 → cap WATCHLIST
 *   - DeadVolatility > 0.5 → cap PROBE
 */
import type { HubInput, EdgeResult, GateCheckResult, SoftBlockResult, HubDecision } from "./types.ts";

interface GateDef {
  name: string;
  check: (input: HubInput, edge: EdgeResult) => boolean;
  onFail: HubDecision;
}

const GATES: GateDef[] = [
  // ── NO_TRADE gates ──
  { name: "DataHealth",      check: (i) => i.dataHealthScore >= 0.85,          onFail: "NO_TRADE" },
  { name: "TradeValidity",   check: (i) => i.tradeValidity !== "INVALID",      onFail: "NO_TRADE" },
  { name: "FillProbability", check: (i) => i.fillProbability >= 0.22,          onFail: "NO_TRADE" },
  { name: "EdgeNetR",        check: (_i, e) => e.edgeNetR >= 0.08,            onFail: "NO_TRADE" },
  { name: "DepthSlippage",   check: (i) => !(i.depthScore < 0.2 && i.slippage === "HIGH"), onFail: "NO_TRADE" },

  // ── WATCHLIST gates ──
  { name: "RiskGate",        check: (i) => i.riskScore < 0.80,                onFail: "WATCHLIST" },
  { name: "EntryWindow",     check: (i) => i.entryWindowState !== "CLOSED",   onFail: "WATCHLIST" },
];

const DECISION_ORDER: HubDecision[] = ["NO_TRADE", "WATCHLIST", "PROBE", "CONFIRMED"];

function decisionIdx(d: HubDecision): number {
  return DECISION_ORDER.indexOf(d);
}

export function checkHardGates(input: HubInput, edge: EdgeResult): GateCheckResult {
  const failedGates: string[] = [];
  let maxDecision: HubDecision = "CONFIRMED"; // start optimistic

  for (const gate of GATES) {
    if (!gate.check(input, edge)) {
      failedGates.push(gate.name);
      if (decisionIdx(gate.onFail) < decisionIdx(maxDecision)) {
        maxDecision = gate.onFail;
      }
    }
  }

  return {
    allPassed: failedGates.length === 0,
    failedGates,
    maxDecision,
  };
}

/** Soft blocks — contextual caps that don't force NO_TRADE */
export function checkSoftBlocks(input: HubInput): SoftBlockResult {
  const reasons: string[] = [];
  let maxDecision: HubDecision = "CONFIRMED";

  // Fake break + weak trend → cap WATCHLIST
  if (input.fakeBreakRisk > 0.6 && input.trendStrength < 0.4) {
    reasons.push("Fake break risk HIGH + weak trend → cap WATCHLIST");
    if (decisionIdx("WATCHLIST") < decisionIdx(maxDecision)) {
      maxDecision = "WATCHLIST";
    }
  }

  // High stress + low fill → cap WATCHLIST
  if (input.riskScore > 0.7 && input.fillProbability < 0.40) {
    reasons.push("Stress HIGH + fill < 40% → cap WATCHLIST");
    if (decisionIdx("WATCHLIST") < decisionIdx(maxDecision)) {
      maxDecision = "WATCHLIST";
    }
  }

  // Dead volatility → cap PROBE (not enough movement for targets)
  if (input.deadVolatility > 0.5) {
    reasons.push("Dead volatility → cap PROBE");
    if (decisionIdx("PROBE") < decisionIdx(maxDecision)) {
      maxDecision = "PROBE";
    }
  }

  // Chased entry → cap PROBE
  if (input.chasedEntry > 0.5) {
    reasons.push("Chased entry → cap PROBE");
    if (decisionIdx("PROBE") < decisionIdx(maxDecision)) {
      maxDecision = "PROBE";
    }
  }

  return {
    triggered: reasons.length > 0,
    reasons,
    maxDecision,
  };
}

/**
 * Direction Alignment Gate (v4.1)
 *
 * Prevents trading against the HTF trend.
 * Analysis showed BOTH LONG and SHORT had ~10% win rate — direction quality was terrible.
 *
 * Rules (less strict than CG but still protective):
 *   - SHORT + trendDirBias > 0 + trendStrength > 0.6 → WATCHLIST (strong uptrend)
 *   - LONG + trendDirBias < 0 + trendStrength > 0.6 → WATCHLIST (strong downtrend)
 *   - emaBias misalignment → cap PROBE
 */
export function checkDirectionAlignment(
  input: HubInput,
  biasDirection: string,
): SoftBlockResult {
  const reasons: string[] = [];
  let maxDecision: HubDecision = "CONFIRMED";

  if (biasDirection === "NONE") {
    return { triggered: false, reasons, maxDecision };
  }

  const isLong = biasDirection === "LONG";
  const isShort = biasDirection === "SHORT";

  // V4.1: HTF Trend alignment — upgraded to NO_TRADE (was WATCHLIST)
  // Previous WATCHLIST cap still allowed PROBE trades against trend → 92% SHORT failures
  if (isShort && input.trendDirBias > 0 && input.trendStrength > 0.5) {
    reasons.push("SHORT against bullish HTF trend — blocked");
    if (decisionIdx("NO_TRADE") < decisionIdx(maxDecision)) maxDecision = "NO_TRADE";
  }
  if (isLong && input.trendDirBias < 0 && input.trendStrength > 0.5) {
    reasons.push("LONG against bearish HTF trend — blocked");
    if (decisionIdx("NO_TRADE") < decisionIdx(maxDecision)) maxDecision = "NO_TRADE";
  }

  // EMA misalignment — cap PROBE
  if (isShort && input.emaBias > 0.3) {
    reasons.push("SHORT with bullish EMA");
    if (decisionIdx("PROBE") < decisionIdx(maxDecision)) maxDecision = "PROBE";
  }
  if (isLong && input.emaBias < -0.3) {
    reasons.push("LONG with bearish EMA");
    if (decisionIdx("PROBE") < decisionIdx(maxDecision)) maxDecision = "PROBE";
  }

  return {
    triggered: reasons.length > 0,
    reasons,
    maxDecision,
  };
}
