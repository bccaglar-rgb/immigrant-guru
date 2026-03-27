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
      penalty += 6;
    }
    if (c.entryWindow === "CLOSING") {
      softFlags.push("entry_closing");
      penalty += 3;
    }
    if (c.tradeValidity === "WEAK") {
      softFlags.push("weak_validity");
      penalty += 4;
    }
    // WATCH decisions are lower quality but shouldn't be blocked
    if (c.decision === "WATCH") {
      softFlags.push("watch_decision");
      penalty += 5;
    }
    if (c.quantScore < 55) {
      softFlags.push("borderline_score");
      penalty += 5;
    }
    // AGGRESSIVE: penalize low quant scores — only strong setups
    if (c.mode === "AGGRESSIVE" && c.quantScore < 60) {
      softFlags.push("agg_low_score");
      penalty += 5;
    }
    if (c.mode === "CAPITAL_GUARD" && c.quantScore < 60) {
      softFlags.push("conservative_low_score");
      penalty += 6;
    }
    if (c.mode === "CAPITAL_GUARD" && (c.slippageRisk === "MED" || c.slippageRisk === "MEDIUM")) {
      softFlags.push("cg_medium_slippage");
      penalty += 3;
    }
    if (c.mode === "CAPITAL_GUARD" && c.entryWindow === "CLOSING") {
      softFlags.push("cg_entry_closing");
      penalty += 4;
    }
    // Capital Guard: prefer RR >= 2.5 for capital protection
    if (c.mode === "CAPITAL_GUARD" && c.rrRatio < 2.5) {
      softFlags.push("cg_low_rr");
      penalty += 6;
    }
    // AGGRESSIVE: penalize low RR more aggressively
    if (c.mode === "AGGRESSIVE" && c.rrRatio < 1.5) {
      softFlags.push("agg_low_rr");
      penalty += 5;
    }
    // All modes: penalize suboptimal RR (< 2.0)
    if (c.rrRatio < 2.0 && c.rrRatio >= config.minRR) {
      softFlags.push("suboptimal_rr");
      penalty += 3;
    }
    // Penalize very low RR even above minRR threshold
    if (c.rrRatio < 1.5 && c.rrRatio >= config.minRR) {
      softFlags.push("low_rr");
      penalty += 4;
    }

    // Cap total penalty
    if (softFlags.length >= config.softDowngradeThreshold) {
      penalty = Math.min(penalty, 20);
    }

    const adjustedScore = Math.max(0, c.quantScore - penalty);
    // Allow candidates with moderate flags to PASS — only DOWNGRADE if penalty > 12
    const verdict = penalty > 12 ? "DOWNGRADE" as const : "PASS" as const;

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
