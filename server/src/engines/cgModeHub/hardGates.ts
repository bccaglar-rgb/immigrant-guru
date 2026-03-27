/**
 * Capital Guard Mode Hub — Hard Gates + Soft Blocks (v4)
 *
 * STRICTEST GATES in the system:
 * Hard gates (→ immediate cap):
 *   - DataHealth < 0.90 → NO_TRADE
 *   - TradeValidity === "INVALID" → NO_TRADE
 *   - FillProbability < 0.28 → NO_TRADE
 *   - EdgeNetR < 0.10 → NO_TRADE
 *   - DepthScore < 0.2 AND Slippage === "HIGH" → NO_TRADE
 *   - CapitalProtection < 65 → NO_TRADE (CG exclusive)
 *   - StopIntegrity < 60 → NO_TRADE (CG exclusive)
 *   - InvalidationClarity < 55 → NO_TRADE (CG exclusive)
 *   - RiskScore > 0.75 → WATCHLIST
 *   - EntryWindow not OPEN/NARROW → WATCHLIST
 *
 * Soft blocks (→ cap at WATCHLIST or PROBE):
 *   - fakeBreakRisk > 0.6 AND trendStrength < 0.4 → cap WATCHLIST
 *   - stressLevel > 0.7 AND fillProbability < 0.40 → cap WATCHLIST
 *   - deadVolatility > 0.5 → cap PROBE
 *   - chasedEntry > 0.5 → cap WATCHLIST
 *   - midRangeTrap > 0.6 AND weakAcceptance > 0.4 → cap WATCHLIST (CG specific)
 */

import type { HubInput, EdgeResult, CapitalProtectionResult, CgHubDecision, CgGateCheckResult, CgSoftBlockResult, BiasDirection } from "./types.ts";

const DECISION_ORDER: CgHubDecision[] = ["NO_TRADE", "WATCHLIST", "PROBE", "CONFIRMED"];

function capDecision(current: CgHubDecision, cap: CgHubDecision): CgHubDecision {
  const curIdx = DECISION_ORDER.indexOf(current);
  const capIdx = DECISION_ORDER.indexOf(cap);
  return capIdx < curIdx ? cap : current;
}

interface CgGateDef {
  name: string;
  check: (input: HubInput, edge: EdgeResult, cp: CapitalProtectionResult) => boolean;
  onFail: CgHubDecision;
}

const CG_HARD_GATES: CgGateDef[] = [
  // Data health (strictest: 0.90)
  { name: "DataHealth>=0.90", check: (i) => i.dataHealthScore >= 0.90, onFail: "NO_TRADE" },

  // Trade validity
  { name: "TradeValidity", check: (i) => i.tradeValidity !== "INVALID", onFail: "NO_TRADE" },

  // Fill probability (stricter: 0.28)
  { name: "FillProb>=0.28", check: (i) => i.fillProbability >= 0.28, onFail: "NO_TRADE" },

  // Edge proxy (new: edgeNetR >= 0.10)
  { name: "EdgeNetR>=0.10", check: (_i, e) => e.edgeNetR >= 0.10, onFail: "NO_TRADE" },

  // Depth + Slippage combo
  { name: "Depth+Slip", check: (i) => !(i.depthScore < 0.2 && i.slippage === "HIGH"), onFail: "NO_TRADE" },

  // Capital Protection score (CG exclusive)
  { name: "CP>=65", check: (_i, _e, cp) => cp.score >= 65, onFail: "NO_TRADE" },

  // Stop Integrity (CG exclusive)
  { name: "StopIntegrity>=60", check: (_i, _e, cp) => cp.stopIntegrity >= 60, onFail: "NO_TRADE" },

  // Invalidation Clarity (CG exclusive)
  { name: "InvalidClarity>=55", check: (_i, _e, cp) => cp.invalidationClarity >= 55, onFail: "NO_TRADE" },

  // Risk score → WATCHLIST cap
  { name: "RiskScore<0.75", check: (i) => i.riskScore < 0.75, onFail: "WATCHLIST" },

  // Entry window
  { name: "EntryWindow", check: (i) => i.entryWindowState === "OPEN" || i.entryWindowState === "NARROW", onFail: "WATCHLIST" },
];

export function checkCgHardGates(
  input: HubInput,
  edge: EdgeResult,
  cp: CapitalProtectionResult,
): CgGateCheckResult {
  const failedGates: string[] = [];
  let maxDecision: CgHubDecision = "CONFIRMED"; // Start at highest

  for (const gate of CG_HARD_GATES) {
    if (!gate.check(input, edge, cp)) {
      failedGates.push(gate.name);
      maxDecision = capDecision(maxDecision, gate.onFail);
    }
  }

  return {
    allPassed: failedGates.length === 0,
    failedGates,
    maxDecision,
  };
}

/**
 * Soft blocks — don't force NO_TRADE, but cap decision level.
 * CG has more soft blocks than balanced.
 */
export function checkCgSoftBlocks(input: HubInput): CgSoftBlockResult {
  const reasons: string[] = [];
  let maxDecision: CgHubDecision = "CONFIRMED";

  // Fake break + weak trend → cap WATCHLIST
  if (input.fakeBreakRisk > 0.6 && input.trendStrength < 0.4) {
    reasons.push("Fake break risk with weak trend");
    maxDecision = capDecision(maxDecision, "WATCHLIST");
  }

  // Stress + low fill → cap WATCHLIST
  if (input.riskScore > 0.7 && input.fillProbability < 0.40) {
    reasons.push("High stress with low fill probability");
    maxDecision = capDecision(maxDecision, "WATCHLIST");
  }

  // Dead volatility → cap PROBE
  if (input.deadVolatility > 0.5) {
    reasons.push("Dead volatility — limited movement potential");
    maxDecision = capDecision(maxDecision, "PROBE");
  }

  // Chased entry → cap WATCHLIST
  if (input.chasedEntry > 0.5) {
    reasons.push("Chased entry — late to the move");
    maxDecision = capDecision(maxDecision, "WATCHLIST");
  }

  // CG specific: mid-range trap + weak acceptance → cap WATCHLIST
  if (input.midRangeTrap > 0.6 && input.weakAcceptance > 0.4) {
    reasons.push("Mid-range chop with no acceptance — unclear invalidation");
    maxDecision = capDecision(maxDecision, "WATCHLIST");
  }

  // CG specific: high crowding + spot/deriv divergence → cap WATCHLIST
  if (input.crowdingHigh > 0.5 && input.spotDerivDivergence > 0.5) {
    reasons.push("Crowded positioning with spot/derivatives divergence");
    maxDecision = capDecision(maxDecision, "WATCHLIST");
  }

  return {
    triggered: reasons.length > 0,
    reasons,
    maxDecision,
  };
}

/**
 * Direction Alignment Gate (v4.1) — CG EXCLUSIVE
 *
 * CG should NEVER trade against the HTF trend or dominant market direction.
 * Analysis showed ALL 5 CG trades were SHORT in an uptrending market → 0% win rate.
 *
 * Rules:
 *   - SHORT + trendDirBias > 0 + trendStrength > 0.5 → NO_TRADE (strong uptrend, don't short)
 *   - LONG + trendDirBias < 0 + trendStrength > 0.5 → NO_TRADE (strong downtrend, don't long)
 *   - SHORT + emaBias > 0.2 → WATCHLIST (EMA is bullish, shorting is risky)
 *   - LONG + emaBias < -0.2 → WATCHLIST (EMA is bearish, longing is risky)
 *   - Direction conflicts OI direction → WATCHLIST
 */

export function checkCgDirectionAlignment(
  input: HubInput,
  biasDirection: BiasDirection,
): CgSoftBlockResult {
  const reasons: string[] = [];
  let maxDecision: CgHubDecision = "CONFIRMED";

  if (biasDirection === "NONE") {
    return { triggered: false, reasons, maxDecision };
  }

  const isLong = biasDirection === "LONG";
  const isShort = biasDirection === "SHORT";

  // ── HTF Trend alignment (strictest) ─────────────────────────
  // trendDirBias > 0 = bullish trend, < 0 = bearish trend
  if (isShort && input.trendDirBias > 0 && input.trendStrength > 0.5) {
    reasons.push("SHORT against strong bullish HTF trend — blocked");
    maxDecision = capDecision(maxDecision, "NO_TRADE");
  }
  if (isLong && input.trendDirBias < 0 && input.trendStrength > 0.5) {
    reasons.push("LONG against strong bearish HTF trend — blocked");
    maxDecision = capDecision(maxDecision, "NO_TRADE");
  }

  // ── EMA alignment (moderate) ────────────────────────────────
  // emaBias > 0 = bullish EMA, < 0 = bearish EMA
  if (isShort && input.emaBias > 0.2) {
    reasons.push("SHORT with bullish EMA alignment — risky");
    maxDecision = capDecision(maxDecision, "WATCHLIST");
  }
  if (isLong && input.emaBias < -0.2) {
    reasons.push("LONG with bearish EMA alignment — risky");
    maxDecision = capDecision(maxDecision, "WATCHLIST");
  }

  // ── OI direction conflict ───────────────────────────────────
  // oiConfirm > 0.5 means OI confirms CURRENT direction, but if direction
  // goes against OI, that's a conflict
  if (input.oiDivergence > 0.5) {
    reasons.push("OI divergence — direction conflicts open interest flow");
    maxDecision = capDecision(maxDecision, "WATCHLIST");
  }

  return {
    triggered: reasons.length > 0,
    reasons,
    maxDecision,
  };
}
