import type {
  AiEngineConfig,
  AiEvaluationResponse,
  RankedCandidate,
  ValidatedResult,
} from "./types.ts";

const PREFIX = "[AIEngineV2:Validator]";
const MAX_LEVEL_DEVIATION = 0.02; // 2%

/**
 * Validates AI output against deterministic inputs.
 * Rejects contradictory, hallucinated, or invalid outputs.
 * Produces final decision + blended score.
 */
export function validateOutputs(
  ranked: RankedCandidate[],
  aiResponses: AiEvaluationResponse[],
  config: AiEngineConfig,
): ValidatedResult[] {
  const results: ValidatedResult[] = [];

  // Build AI response lookup by symbol
  const responseMap = new Map<string, AiEvaluationResponse>();
  for (const r of aiResponses) {
    responseMap.set(r.symbol.toUpperCase(), r);
  }

  for (const r of ranked) {
    const c = r.candidate;
    const ai = responseMap.get(c.symbol.toUpperCase());

    // No AI response for this candidate — use deterministic fallback
    if (!ai) {
      const fallback = deterministicFallback(r, config);
      if (fallback) results.push(fallback);
      continue;
    }

    // Skip rejected
    if (ai.verdict === "REJECT") continue;

    // Validate direction immutability
    const inputDir = c.direction.toUpperCase();
    if (inputDir === "LONG" && ai.adjustedDirection !== "LONG") {
      console.warn(`${PREFIX} ${c.symbol}: AI flipped direction LONG→${ai.adjustedDirection}, rejecting`);
      continue;
    }
    if (inputDir === "SHORT" && ai.adjustedDirection !== "SHORT") {
      console.warn(`${PREFIX} ${c.symbol}: AI flipped direction SHORT→${ai.adjustedDirection}, rejecting`);
      continue;
    }

    // Validate level bounds (entry, SL, TP within 2%)
    const entryLow = ai.adjustedEntryLow > 0 ? ai.adjustedEntryLow : c.entryLow;
    const entryHigh = ai.adjustedEntryHigh > 0 ? ai.adjustedEntryHigh : c.entryHigh;
    const slLevels = ai.adjustedSlLevels.length > 0 ? ai.adjustedSlLevels : c.slLevels;
    const tpLevels = ai.adjustedTpLevels.length > 0 ? ai.adjustedTpLevels : c.tpLevels;

    if (!withinBounds(entryLow, c.entryLow) || !withinBounds(entryHigh, c.entryHigh)) {
      console.warn(`${PREFIX} ${c.symbol}: AI entry out of bounds, using original`);
    }

    // Use original if AI levels deviate too much
    const finalEntryLow = withinBounds(entryLow, c.entryLow) ? entryLow : c.entryLow;
    const finalEntryHigh = withinBounds(entryHigh, c.entryHigh) ? entryHigh : c.entryHigh;
    const finalSl = slLevels.every((sl, i) => i < c.slLevels.length && withinBounds(sl, c.slLevels[i]))
      ? slLevels : c.slLevels;
    const finalTp = tpLevels.every((tp, i) => i < c.tpLevels.length && withinBounds(tp, c.tpLevels[i]))
      ? tpLevels : c.tpLevels;

    // Check RR after adjustment
    const entryMid = (finalEntryLow + finalEntryHigh) / 2;
    const riskR = Math.abs(entryMid - finalSl[0]);
    const rewardR = Math.abs(finalTp[0] - entryMid);
    const adjustedRR = riskR > 0 ? rewardR / riskR : 0;

    if (adjustedRR < config.minRR && ai.verdict === "APPROVE") {
      console.warn(`${PREFIX} ${c.symbol}: adjusted RR ${adjustedRR.toFixed(2)} < ${config.minRR}, downgrading to WATCH`);
    }

    // Score blending: quant 50% + AI 35% + gate 15%
    const gateAdjustment = r.adjustedScore - c.quantScore;
    const blendedScore = clamp(
      c.quantScore * 0.50 + ai.confidence * 0.35 + gateAdjustment * 0.15,
      0, 100,
    );

    // Final decision
    let finalDecision: "TRADE" | "WATCH" | "NO_TRADE";
    if (ai.verdict === "APPROVE" && blendedScore >= 55 && adjustedRR >= config.minRR) {
      finalDecision = "TRADE";
    } else if (ai.verdict === "APPROVE" || ai.verdict === "DOWNGRADE") {
      finalDecision = "WATCH";
    } else {
      finalDecision = "NO_TRADE";
    }

    results.push({
      candidate: c,
      aiResponse: ai,
      finalScore: Math.round(blendedScore * 100) / 100,
      finalDecision,
      finalDirection: ai.adjustedDirection,
      entryLow: finalEntryLow,
      entryHigh: finalEntryHigh,
      slLevels: finalSl,
      tpLevels: finalTp,
    });
  }

  return results;
}

// ── Helpers ────────────────────────────────────────────────────

function withinBounds(adjusted: number, original: number): boolean {
  if (original === 0) return true;
  return Math.abs(adjusted - original) / original <= MAX_LEVEL_DEVIATION;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Deterministic fallback when AI doesn't respond for a candidate.
 * Conservative: never produces TRADE, only WATCH for strong candidates.
 */
function deterministicFallback(
  r: RankedCandidate,
  config: AiEngineConfig,
): ValidatedResult | null {
  const c = r.candidate;

  // Only fallback for strong candidates
  if (c.quantScore < 60 || c.rrRatio < 1.5) return null;

  const dir = c.direction.toUpperCase();
  if (dir !== "LONG" && dir !== "SHORT") return null;

  return {
    candidate: c,
    aiResponse: {
      symbol: c.symbol,
      verdict: "DOWNGRADE",
      confidence: 40,
      adjustedDirection: dir as "LONG" | "SHORT",
      adjustedEntryLow: c.entryLow,
      adjustedEntryHigh: c.entryHigh,
      adjustedSlLevels: c.slLevels,
      adjustedTpLevels: c.tpLevels,
      riskFlags: ["ai_fallback"],
      comment: "AI cevap veremedi, quant verisine dayali WATCH.",
      reasoning: "AI response missing. Deterministic fallback: strong quant score with acceptable RR.",
    },
    finalScore: c.quantScore * 0.55,
    finalDecision: "WATCH",
    finalDirection: dir as "LONG" | "SHORT",
    entryLow: c.entryLow,
    entryHigh: c.entryHigh,
    slLevels: c.slLevels,
    tpLevels: c.tpLevels,
  };
}
