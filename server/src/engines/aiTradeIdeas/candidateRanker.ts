import type { GateResult, RankedCandidate } from "./types.ts";
import type { ScoringMode } from "../../services/scoringMode.ts";

const MODE_WEIGHTS: Record<ScoringMode, number> = {
  FLOW: 25,
  AGGRESSIVE: 20,
  BALANCED: 15,
  CAPITAL_GUARD: 20,  // Raised from 10 — CG setups are high-quality, shouldn't lose to weak FLOW/AGG
};

/**
 * Ranks gate survivors by composite score and returns top N.
 * Ensures mode diversity: at least 2 different modes in output.
 */
export function rankCandidates(
  gateResults: GateResult[],
  maxForAi: number,
): RankedCandidate[] {
  // Only process PASS and DOWNGRADE (not VETO)
  const survivors = gateResults.filter((g) => g.verdict !== "VETO");
  if (!survivors.length) return [];

  // Score each candidate
  const scored = survivors.map((g) => {
    const c = g.candidate;

    // Normalize RR (cap at 3:1 = 100)
    const rrNorm = Math.min(c.rrRatio / 3, 1) * 100;

    // Mode weight for diversity
    const modeWeight = MODE_WEIGHTS[c.mode] ?? 15;

    // Freshness: 100 if just scanned, decays over 60s
    const ageMs = Math.max(0, Date.now() - c.scannedAt);
    const freshness = Math.max(0, 100 - ageMs / 600);

    // Small SHORT premium (crypto tends to move down faster)
    const directionBonus = c.direction === "SHORT" ? 8 : 0;

    const compositeScore =
      g.adjustedScore * 0.40 +
      rrNorm * 0.25 +
      modeWeight * 0.15 +
      freshness * 0.10 +
      directionBonus * 0.10;

    return {
      candidate: c,
      compositeScore,
      softFlags: g.softFlags,
      adjustedScore: g.adjustedScore,
    };
  });

  // Sort descending by composite score
  scored.sort((a, b) => b.compositeScore - a.compositeScore);

  // Select top N with mode diversity guarantee
  const selected = scored.slice(0, maxForAi);

  // Ensure at least 2 different modes
  if (selected.length >= 2) {
    const modes = new Set(selected.map((s) => s.candidate.mode));
    if (modes.size < 2) {
      // Find the highest-ranked candidate from a different mode
      const existingMode = selected[0].candidate.mode;
      const altCandidate = scored.find(
        (s) => s.candidate.mode !== existingMode && !selected.includes(s),
      );
      if (altCandidate) {
        // Replace the last slot with the alternative
        selected[selected.length - 1] = altCandidate;
      }
    }
  }

  // Assign ranks
  return selected.map((s, i) => ({
    ...s,
    rank: i + 1,
  }));
}
