/**
 * Bitrium Prime AI Hub — Code Enforcement
 *
 * THE CRITICAL FILE.
 * AI thinks freely, but ALL outputs are validated/overridden in code.
 * AI doesn't get final say on gates, clamps, schema, or formula compliance.
 *
 * Enforcement steps per coin:
 *   A. Hard gate override (recomputed from input data, ignores AI)
 *   B. Block score clamping (0-100 each)
 *   C. Score formula recomputation + verification (±5pt tolerance)
 *   D. Decision override (must match score+edge thresholds)
 *   E. Side validation (bias threshold, entry window, fill prob)
 *   F. TP/SL clamp (SL 0.2-0.8% price, TP 0.3-2.0% price — $100 margin @ 10x)
 *   G. Degradation penalties
 */

import type {
  PrimeAiCoinInput,
  PrimeAiCoinOutput,
  EnforcedResult,
  EnforcedOverride,
  PrimeAiDecision,
  PrimeAiSide,
  PrimeAiConfig,
  HubInput,
} from "./types.ts";
import type { DegradationFlags } from "./degradationHandler.ts";
import { capScore } from "./degradationHandler.ts";
import { BLOCK_WEIGHTS, SCORE_TOLERANCE, LOG_PREFIX, REGIME_MULTIPLIERS, SESSION_MULTIPLIERS } from "./config.ts";

/**
 * Enforce all code rules on a single coin's AI output.
 */
export function enforceOne(
  coin: PrimeAiCoinInput,
  aiOutput: PrimeAiCoinOutput,
  hubInput: HubInput,
  degradation: DegradationFlags,
  config: PrimeAiConfig,
): EnforcedResult {
  const overrides: EnforcedOverride[] = [];

  // Copy AI values (we'll mutate the enforced copy)
  let side = aiOutput.side;
  let decision = aiOutput.decision;
  let { MQ, DQ, EQ, EdgeQ } = { ...aiOutput.blockScores };
  let finalScore = aiOutput.finalScore;
  let stopLoss = aiOutput.stopLoss;
  let takeProfit = aiOutput.takeProfit;
  let hardFail = aiOutput.hardFail;
  let softBlock = aiOutput.softBlock;

  // ════════════════════════════════════════════════════════════
  // A. HARD GATE OVERRIDE (code recomputes from input data, ignores AI)
  // ════════════════════════════════════════════════════════════

  const codeHardFail = checkHardGates(coin, hubInput, config);
  if (codeHardFail.failed && !hardFail) {
    overrides.push({ field: "hardFail", from: false, to: true, reason: codeHardFail.reasons.join(", ") });
    hardFail = true;
  }
  if (hardFail) {
    if (decision !== "NO_TRADE") {
      overrides.push({ field: "decision", from: decision, to: "NO_TRADE", reason: "hard_gate_fail" });
      decision = "NO_TRADE";
    }
    if (side !== "NONE") {
      overrides.push({ field: "side", from: side, to: "NONE", reason: "hard_gate_fail" });
      side = "NONE";
    }
  }

  // ════════════════════════════════════════════════════════════
  // B. BLOCK SCORE CLAMPING (0-100 each)
  // ════════════════════════════════════════════════════════════

  MQ = clampBlock("MQ", MQ, overrides);
  DQ = clampBlock("DQ", DQ, overrides);
  EQ = clampBlock("EQ", EQ, overrides);
  EdgeQ = clampBlock("EdgeQ", EdgeQ, overrides);

  // Apply degradation caps
  if (degradation.eqCap !== undefined) {
    const capped = capScore(EQ, degradation.eqCap);
    if (capped !== EQ) {
      overrides.push({ field: "EQ", from: EQ, to: capped, reason: `degradation_cap_${degradation.eqCap}` });
      EQ = capped;
    }
  }
  if (degradation.edgeQCap !== undefined) {
    const capped = capScore(EdgeQ, degradation.edgeQCap);
    if (capped !== EdgeQ) {
      overrides.push({ field: "EdgeQ", from: EdgeQ, to: capped, reason: `degradation_cap_${degradation.edgeQCap}` });
      EdgeQ = capped;
    }
  }

  // ════════════════════════════════════════════════════════════
  // C. SCORE FORMULA RECOMPUTATION + VERIFICATION
  // ════════════════════════════════════════════════════════════

  // Compute multipliers from input data (code, NOT AI)
  const regimeMult = REGIME_MULTIPLIERS[coin.marketStructure.regime] ?? 0.90;
  const dataHealthMult = coin.dataHealth.completeness >= 0.95 ? 1.0
    : coin.dataHealth.completeness >= 0.85 ? 0.95
    : 0.85;
  const sessionMult = SESSION_MULTIPLIERS[coin.session.name] ?? 0.95;
  const confMult = 0.82 + 0.18 * Math.min(1, Math.abs(computeBiasRaw(hubInput)));

  const combinedMult =
    0.40 * regimeMult +
    0.25 * dataHealthMult +
    0.20 * sessionMult +
    0.15 * confMult;

  // Penalty total from AI
  const totalPenalty =
    aiOutput.penaltyGroups.execution +
    aiOutput.penaltyGroups.positioning +
    aiOutput.penaltyGroups.regime +
    aiOutput.penaltyGroups.conflict +
    degradation.penaltyPoints;

  // Recompute score
  const rawComposite =
    BLOCK_WEIGHTS.MQ * MQ +
    BLOCK_WEIGHTS.DQ * DQ +
    BLOCK_WEIGHTS.EQ * EQ +
    BLOCK_WEIGHTS.EdgeQ * EdgeQ;

  const recomputed = Math.max(0, Math.min(100, rawComposite * combinedMult - totalPenalty));

  if (Math.abs(finalScore - recomputed) > SCORE_TOLERANCE) {
    overrides.push({
      field: "finalScore",
      from: round2(finalScore),
      to: round2(recomputed),
      reason: `score_deviation_${round2(Math.abs(finalScore - recomputed))}pt`,
    });
    finalScore = recomputed;
  }

  // ════════════════════════════════════════════════════════════
  // D. DECISION OVERRIDE (must match score+edge thresholds)
  // ════════════════════════════════════════════════════════════

  if (!hardFail) {
    // Recompute edgeNetR from input data
    const edgeNetR =
      (coin.edgeModel.pWin * coin.edgeModel.avgWinR) -
      ((1 - coin.edgeModel.pWin) * coin.edgeModel.lossR) -
      coin.edgeModel.costR;

    const correctDecision = computeDecision(finalScore, edgeNetR, config, coin.session.name);
    if (correctDecision !== decision) {
      overrides.push({
        field: "decision",
        from: decision,
        to: correctDecision,
        reason: `threshold_mismatch(score=${round2(finalScore)},edge=${round2(edgeNetR)})`,
      });
      decision = correctDecision;
    }
  }

  // ════════════════════════════════════════════════════════════
  // E. SIDE VALIDATION
  // ════════════════════════════════════════════════════════════

  if (!hardFail) {
    const biasRaw = computeBiasRaw(hubInput);

    // Bias too weak for directional trade
    if (Math.abs(biasRaw) < config.gates.biasThreshold && side !== "NONE") {
      overrides.push({
        field: "side",
        from: side,
        to: "NONE",
        reason: `weak_bias(${round2(biasRaw)}<${config.gates.biasThreshold})`,
      });
      side = "NONE";

      // Downgrade decision if needed
      if (decision === "CONFIRMED" || decision === "PROBE") {
        overrides.push({
          field: "decision",
          from: decision,
          to: "WATCHLIST",
          reason: "side_override_to_NONE",
        });
        decision = "WATCHLIST";
      }
    }

    // For PROBE/CONFIRMED: additional requirements
    if (decision === "PROBE" || decision === "CONFIRMED") {
      if (coin.execution.entryWindow === "CLOSED") {
        overrides.push({
          field: "decision",
          from: decision,
          to: "WATCHLIST",
          reason: "entry_window_closed",
        });
        decision = "WATCHLIST";
      }
      if (coin.execution.fillProb < 0.25) {
        overrides.push({
          field: "decision",
          from: decision,
          to: "WATCHLIST",
          reason: `low_fill_prob(${coin.execution.fillProb})`,
        });
        decision = "WATCHLIST";
      }
      if (coin.regime.fakeBreakProb > 0.6) {
        overrides.push({
          field: "decision",
          from: decision,
          to: "WATCHLIST",
          reason: `high_fake_break(${coin.regime.fakeBreakProb})`,
        });
        decision = "WATCHLIST";
      }
    }
  }

  // ════════════════════════════════════════════════════════════
  // F. TP/SL CLAMP (mandatory — price %: SL 0.2-0.8%, TP 0.3-2.0%)
  //    At 10x leverage ($100 margin): SL max $8, TP $3-$20
  // ════════════════════════════════════════════════════════════

  let slPct = 0;
  let tpPct = 0;

  if (side !== "NONE" && coin.price > 0) {
    const entryMid = (coin.price + (coin.levels.pullback > 0 ? coin.levels.pullback : coin.price)) / 2;

    // Compute SL % from entry
    if (stopLoss > 0) {
      slPct = Math.abs(stopLoss - entryMid) / entryMid * 100;
    } else {
      slPct = 0.3; // default 0.3% price (3% margin = $3)
    }

    // Compute TP % from entry
    if (takeProfit > 0) {
      tpPct = Math.abs(takeProfit - entryMid) / entryMid * 100;
    } else {
      tpPct = 0.8; // default 0.8% price (8% margin = $8)
    }

    // Clamp SL: 0.2-0.8% price (2-8% margin @ 10x)
    const clampedSlPct = clamp(slPct, config.clamps.sl[0], config.clamps.sl[1]);
    if (clampedSlPct !== slPct) {
      overrides.push({
        field: "slPct",
        from: round2(slPct),
        to: round2(clampedSlPct),
        reason: `sl_clamp(${config.clamps.sl[0]}-${config.clamps.sl[1]}%price=${config.clamps.sl[0]*10}-${config.clamps.sl[1]*10}%margin)`,
      });
      slPct = clampedSlPct;
    }

    // Clamp TP: 0.3-2.0% price (3-20% margin @ 10x)
    const clampedTpPct = clamp(tpPct, config.clamps.tp[0], config.clamps.tp[1]);
    if (clampedTpPct !== tpPct) {
      overrides.push({
        field: "tpPct",
        from: round2(tpPct),
        to: round2(clampedTpPct),
        reason: `tp_clamp(${config.clamps.tp[0]}-${config.clamps.tp[1]}%price=${config.clamps.tp[0]*10}-${config.clamps.tp[1]*10}%margin)`,
      });
      tpPct = clampedTpPct;
    }

    // Recompute SL/TP prices from clamped percentages
    if (side === "LONG") {
      stopLoss = round8(entryMid * (1 - slPct / 100));
      takeProfit = round8(entryMid * (1 + tpPct / 100));
    } else {
      stopLoss = round8(entryMid * (1 + slPct / 100));
      takeProfit = round8(entryMid * (1 - tpPct / 100));
    }
  }

  return {
    coin,
    aiOutput,
    enforced: {
      side,
      decision,
      finalScore: round2(finalScore),
      blockScores: { MQ: round2(MQ), DQ: round2(DQ), EQ: round2(EQ), EdgeQ: round2(EdgeQ) },
      stopLoss,
      takeProfit,
      slPct: round2(slPct),
      tpPct: round2(tpPct),
      hardFail,
      softBlock,
      overrides,
    },
  };
}

/**
 * Enforce all coins in a cycle.
 */
export function enforceAll(
  pairs: Array<{
    coin: PrimeAiCoinInput;
    aiOutput: PrimeAiCoinOutput;
    hubInput: HubInput;
    degradation: DegradationFlags;
  }>,
  config: PrimeAiConfig,
): EnforcedResult[] {
  return pairs.map(({ coin, aiOutput, hubInput, degradation }) =>
    enforceOne(coin, aiOutput, hubInput, degradation, config),
  );
}

// ── Internal Helpers ────────────────────────────────────────────

function checkHardGates(
  coin: PrimeAiCoinInput,
  hubInput: HubInput,
  config: PrimeAiConfig,
): { failed: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (coin.riskGate.hardFail) {
    reasons.push(...coin.riskGate.reasons);
  }
  if (coin.dataHealth.completeness < config.gates.dataHealth) {
    reasons.push(`data_health(${round2(coin.dataHealth.completeness)}<${config.gates.dataHealth})`);
  }
  if (coin.execution.fillProb < config.gates.fillProb) {
    reasons.push(`fill_prob(${round2(coin.execution.fillProb)}<${config.gates.fillProb})`);
  }
  if (coin.tradeValidity === "INVALID" || coin.tradeValidity === "NO-TRADE") {
    reasons.push(`trade_validity(${coin.tradeValidity})`);
  }

  // Compute edge from input
  const edgeNetR =
    (coin.edgeModel.pWin * coin.edgeModel.avgWinR) -
    ((1 - coin.edgeModel.pWin) * coin.edgeModel.lossR) -
    coin.edgeModel.costR;
  if (edgeNetR < config.gates.realizedEdge) {
    reasons.push(`edge(${round2(edgeNetR)}<${config.gates.realizedEdge})`);
  }

  // Depth broken + high slippage
  if (coin.execution.depth < 0.1 && coin.execution.slippage === "HIGH") {
    reasons.push("depth_broken_high_slip");
  }

  return { failed: reasons.length > 0, reasons };
}

function computeDecision(
  score: number,
  edgeNetR: number,
  config: PrimeAiConfig,
  session: string,
): PrimeAiDecision {
  // Weekend cap: max PROBE
  const isWeekend = session === "WEEKEND";

  if (score >= config.thresholds.confirmed.score && edgeNetR >= config.thresholds.confirmed.edge && !isWeekend) {
    return "CONFIRMED";
  }
  if (score >= config.thresholds.probe.score && edgeNetR >= config.thresholds.probe.edge) {
    return "PROBE";
  }
  if (score >= config.thresholds.watchlist.score) {
    return "WATCHLIST";
  }
  return "NO_TRADE";
}

function computeBiasRaw(hubInput: HubInput): number {
  // Weighted average of directional components (same as FLOW hub)
  const W = { trend: 0.28, vwap: 0.18, ema: 0.14, levelReaction: 0.14, orderflow: 0.12, positioning: 0.14 };
  return (
    W.trend * hubInput.trendDirBias +
    W.vwap * hubInput.vwapBias +
    W.ema * hubInput.emaBias +
    W.levelReaction * hubInput.levelReactionBias +
    W.orderflow * hubInput.orderflowBias +
    W.positioning * hubInput.positioningBias
  );
}

function clampBlock(name: string, value: number, overrides: EnforcedOverride[]): number {
  if (!Number.isFinite(value)) {
    overrides.push({ field: name, from: value, to: 0, reason: "invalid_number" });
    return 0;
  }
  const clamped = Math.max(0, Math.min(100, value));
  if (clamped !== value) {
    overrides.push({ field: name, from: round2(value), to: round2(clamped), reason: "block_clamp_0_100" });
  }
  return clamped;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function round8(v: number): number {
  return Math.round(v * 100000000) / 100000000;
}
