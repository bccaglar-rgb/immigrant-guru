import type { AiEngineCandidate, AiEngineConfig, GateResult } from "./types.ts";

/**
 * Deterministic gate: runs BEFORE any LLM call.
 * Hard veto removes candidates entirely.
 * Soft downgrade applies score penalties but lets candidates survive.
 */
export function applyGate(
  candidates: AiEngineCandidate[],
  config: AiEngineConfig,
): GateResult[] {
  const results: GateResult[] = [];

  for (const c of candidates) {
    const hardVetoReasons: string[] = [];
    const softFlags: string[] = [];

    // ── Hard Veto Rules ──────────────────────────────────────
    if (c.quantScore < config.minQuantScore) {
      hardVetoReasons.push(`quantScore ${c.quantScore} < ${config.minQuantScore}`);
    }
    if (c.decision === "NO_TRADE") {
      hardVetoReasons.push("decision=NO_TRADE");
    }
    if (c.rrRatio < config.minRR) {
      hardVetoReasons.push(`rrRatio ${c.rrRatio.toFixed(2)} < ${config.minRR}`);
    }
    if (!c.slLevels.length || !c.tpLevels.length) {
      hardVetoReasons.push("missing SL or TP levels");
    }
    if (c.direction === "NEUTRAL") {
      hardVetoReasons.push("direction=NEUTRAL");
    }
    if (c.tradeValidity === "NO-TRADE") {
      hardVetoReasons.push("tradeValidity=NO-TRADE");
    }

    if (hardVetoReasons.length > 0) {
      results.push({
        candidate: c,
        verdict: "VETO",
        hardVetoReasons,
        softFlags: [],
        adjustedScore: 0,
      });
      continue;
    }

    // ── Soft Downgrade Rules ─────────────────────────────────
    let penalty = 0;

    if (c.slippageRisk === "HIGH") {
      softFlags.push("high_slippage");
      penalty += 5;
    }
    if (c.entryWindow === "CLOSED") {
      softFlags.push("entry_closed");
      penalty += 8;
    }
    if (c.tradeValidity === "WEAK") {
      softFlags.push("weak_validity");
      penalty += 4;
    }
    if (c.quantScore < 55) {
      softFlags.push("borderline_score");
      penalty += 3;
    }
    if (c.mode === "CAPITAL_GUARD" && c.quantScore < 50) {
      softFlags.push("conservative_low_score");
      penalty += 6;
    }

    // Cap total penalty
    if (softFlags.length >= config.softDowngradeThreshold) {
      penalty = Math.min(penalty, 20);
    }

    const adjustedScore = Math.max(0, c.quantScore - penalty);
    const verdict = softFlags.length > 0 ? "DOWNGRADE" as const : "PASS" as const;

    results.push({
      candidate: c,
      verdict,
      hardVetoReasons: [],
      softFlags,
      adjustedScore,
    });
  }

  return results;
}
