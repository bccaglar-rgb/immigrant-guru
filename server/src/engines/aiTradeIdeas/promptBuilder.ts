import type { AiEvaluationRequest, RankedCandidate } from "./types.ts";

const SYSTEM_PROMPT = `You are a professional crypto trade reviewer for Bitrium quantitative engine.
You will receive a batch of pre-evaluated trade candidates with quantitative scores.
Your role is to REVIEW (not discover) these setups and make APPROVE / DOWNGRADE / REJECT decisions.

EVALUATION CRITERIA:
1. Does the entry zone make sense given the direction and current structure?
2. Are SL/TP levels placed at structurally meaningful prices?
3. Is the risk/reward ratio acceptable for the given mode and horizon?
4. Are there red flags the quant engine may have missed?

HARD RULES:
- Return VALID JSON only. No markdown, no explanation outside JSON.
- Return one evaluation object per input candidate, in the SAME order.
- Direction CANNOT be changed. If input says LONG, output must say LONG.
- Adjusted entry/SL/TP must be within 2% of the original values. Do NOT invent new levels.
- If a candidate has poor structure, choose DOWNGRADE or REJECT rather than fixing it.
- When uncertain, prefer DOWNGRADE or REJECT over APPROVE.
- Quality over quantity: fewer APPROVE decisions with high confidence is better.

FORBIDDEN:
- Do NOT invent price levels not present in the input.
- Do NOT hallucinate market data.
- Do NOT override the quant engine's direction.
- Do NOT return APPROVE for setups with RR < 1.3.

OUTPUT SCHEMA:
{
  "evaluations": [
    {
      "symbol": "BTCUSDT",
      "verdict": "APPROVE | DOWNGRADE | REJECT",
      "confidence": 0-100,
      "adjustedDirection": "LONG | SHORT",
      "adjustedEntryLow": 0.0,
      "adjustedEntryHigh": 0.0,
      "adjustedSlLevels": [0.0],
      "adjustedTpLevels": [0.0],
      "riskFlags": ["flag1", "flag2"],
      "comment": "max 50 words, Turkish",
      "reasoning": "max 80 words, English"
    }
  ]
}

VERDICT MEANINGS:
- APPROVE: Strong setup, worth trading. High confidence required.
- DOWNGRADE: Acceptable but uncertain. Will become WATCH (not TRADE).
- REJECT: Poor setup or too many concerns. Will be discarded.`;

/**
 * Builds system + user prompts for AI evaluation of trade candidates.
 * One batch call per cycle (all candidates in one prompt).
 */
export function buildEvaluationPrompt(
  candidates: AiEvaluationRequest[],
): { systemPrompt: string; userPrompt: string } {
  const blocks = candidates.map((c, i) => {
    const slStr = c.slLevels.map((l) => l.toFixed(getPrecision(c))).join(", ");
    const tpStr = c.tpLevels.map((l) => l.toFixed(getPrecision(c))).join(", ");

    return [
      `Candidate ${i + 1}/${candidates.length}:`,
      `  symbol: ${c.symbol} | mode: ${c.mode} | direction: ${c.direction} | quant_score: ${c.quantScore}`,
      `  horizon: ${c.horizon} | timeframe: ${c.timeframe} | setup: ${c.setup}`,
      `  entry: [${c.entryLow.toFixed(getPrecision(c))}, ${c.entryHigh.toFixed(getPrecision(c))}]`,
      `  SL: [${slStr}] | TP: [${tpStr}]`,
      `  RR: ${c.rrRatio.toFixed(2)} | trade_validity: ${c.tradeValidity} | entry_window: ${c.entryWindow} | slippage: ${c.slippageRisk}`,
      c.softFlags.length > 0 ? `  soft_flags: [${c.softFlags.join(", ")}]` : null,
      ...buildAlphaLines(c),
    ].filter(Boolean).join("\n");
  });

  const userPrompt = [
    `Evaluate the following ${candidates.length} trade candidate(s).`,
    `Return one evaluation per candidate in JSON format as specified.`,
    "",
    ...blocks,
  ].join("\n");

  return { systemPrompt: SYSTEM_PROMPT, userPrompt };
}

/** Helper to convert RankedCandidate to AiEvaluationRequest */
export function toEvaluationRequest(ranked: RankedCandidate): AiEvaluationRequest {
  const c = ranked.candidate;
  return {
    symbol: c.symbol,
    direction: c.direction,
    quantScore: c.quantScore,
    mode: c.mode,
    entryLow: c.entryLow,
    entryHigh: c.entryHigh,
    slLevels: c.slLevels,
    tpLevels: c.tpLevels,
    rrRatio: c.rrRatio,
    horizon: c.horizon,
    timeframe: c.timeframe,
    setup: c.setup,
    tradeValidity: c.tradeValidity,
    entryWindow: c.entryWindow,
    slippageRisk: c.slippageRisk,
    softFlags: ranked.softFlags,
  };
}

function getPrecision(c: { entryLow: number }): number {
  const price = c.entryLow;
  if (price >= 1000) return 2;
  if (price >= 1) return 4;
  if (price >= 0.01) return 6;
  return 8;
}

/** Build alpha signal context lines for the AI prompt (if available). */
function buildAlphaLines(c: AiEvaluationRequest): (string | null)[] {
  // Alpha signals are passed via quantSnapshot in the ranked candidate
  // For now we access via the softFlags which carry alpha grade info
  // In production, alpha data will be available through the enriched candidate pipeline
  const alpha = (c as Record<string, unknown>).alpha as Record<string, unknown> | undefined;
  if (!alpha) return [];

  const lines: (string | null)[] = [];
  lines.push(`  alpha_grade: ${alpha.alphaGrade ?? "?"} | bonus: +${alpha.alphaBonus ?? 0} | penalty: -${alpha.alphaPenalty ?? 0}`);

  const funding = alpha.funding as Record<string, unknown> | null;
  if (funding) {
    lines.push(`  funding: ${funding.fundingDirection} extreme=${funding.isExtreme} crowding=${funding.fundingCrowdingIndex}`);
  }

  const multiTf = alpha.multiTf as Record<string, unknown> | null;
  if (multiTf) {
    lines.push(`  mtf_align: ${multiTf.multiTfAlignmentScore}% htf=${multiTf.htfTrendBias} strength=${multiTf.htfTrendStrength}`);
  }

  const liquidation = alpha.liquidation as Record<string, unknown> | null;
  if (liquidation && (liquidation.cascadeScore as number) > 30) {
    lines.push(`  liq_risk: ${liquidation.cascadeScore} dominant=${liquidation.dominantRisk}`);
  }

  const timing = alpha.timing as Record<string, unknown> | null;
  if (timing) {
    lines.push(`  timing: grade=${timing.timingGrade} ignition=${timing.momentumIgnitionScore}`);
  }

  const vol = alpha.volatility as Record<string, unknown> | null;
  if (vol) {
    lines.push(`  volatility: regime=${vol.volatilityRegime} compression=${vol.compressionScore} expansion=${vol.expansionForecast}`);
  }

  return lines;
}
