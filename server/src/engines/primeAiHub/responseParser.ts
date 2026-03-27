/**
 * Bitrium Prime AI Hub — Response Parser
 *
 * Parses strict JSON from AI response with multiple fallback strategies:
 *   1. Direct JSON.parse
 *   2. Extract from ```json ... ``` code blocks
 *   3. First { to last } extraction
 *   4. Validate evaluations array
 *   5. Per-evaluation field validation + defaults
 */

import type { PrimeAiCoinOutput, PrimeAiResponse, PrimeAiDecision, PrimeAiSide } from "./types.ts";
import { LOG_PREFIX } from "./config.ts";

const VALID_DECISIONS = new Set<PrimeAiDecision>(["NO_TRADE", "WATCHLIST", "PROBE", "CONFIRMED"]);
const VALID_SIDES = new Set<PrimeAiSide>(["LONG", "SHORT", "NONE"]);

/**
 * Parse the raw AI response into PrimeAiResponse.
 * Returns null if parsing completely fails.
 */
export function parseAiResponse(raw: string): PrimeAiResponse | null {
  let parsed: unknown;

  // Strategy 1: Direct JSON.parse
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Strategy 2: Extract from ```json ... ``` code blocks
    const codeBlockMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (codeBlockMatch) {
      try {
        parsed = JSON.parse(codeBlockMatch[1].trim());
      } catch {
        // Strategy 3: First { to last }
        parsed = extractBraceContent(raw);
      }
    } else {
      parsed = extractBraceContent(raw);
    }
  }

  if (!parsed || typeof parsed !== "object") {
    console.error(`${LOG_PREFIX} Failed to parse AI response as JSON`);
    return null;
  }

  const obj = parsed as Record<string, unknown>;

  // Validate evaluations array exists
  if (!Array.isArray(obj.evaluations)) {
    // Maybe the response IS the evaluations array
    if (Array.isArray(parsed)) {
      return { evaluations: (parsed as unknown[]).map(validateEvaluation).filter(Boolean) as PrimeAiCoinOutput[] };
    }
    console.error(`${LOG_PREFIX} Response missing "evaluations" array`);
    return null;
  }

  const evaluations = (obj.evaluations as unknown[])
    .map(validateEvaluation)
    .filter(Boolean) as PrimeAiCoinOutput[];

  if (evaluations.length === 0) {
    console.error(`${LOG_PREFIX} All evaluations failed validation`);
    return null;
  }

  return { evaluations };
}

/**
 * Extract JSON from first { to last } in the string.
 */
function extractBraceContent(raw: string): unknown | null {
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;

  try {
    return JSON.parse(raw.slice(firstBrace, lastBrace + 1));
  } catch {
    return null;
  }
}

/**
 * Validate and normalize a single evaluation object.
 * Returns null if critically invalid.
 */
function validateEvaluation(raw: unknown): PrimeAiCoinOutput | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;

  // Symbol is required
  const symbol = String(e.symbol ?? "").trim();
  if (!symbol) return null;

  // Side validation
  const rawSide = String(e.side ?? "NONE").toUpperCase() as PrimeAiSide;
  const side = VALID_SIDES.has(rawSide) ? rawSide : "NONE";

  // Decision validation
  const rawDecision = String(e.decision ?? "NO_TRADE").toUpperCase() as PrimeAiDecision;
  const decision = VALID_DECISIONS.has(rawDecision) ? rawDecision : "NO_TRADE";

  // Score validation
  const finalScore = clampScore(Number(e.finalScore ?? 0));

  // Block scores
  const blockScoresRaw = (e.blockScores ?? {}) as Record<string, unknown>;
  const blockScores = {
    MQ: clampScore(Number(blockScoresRaw.MQ ?? 0)),
    DQ: clampScore(Number(blockScoresRaw.DQ ?? 0)),
    EQ: clampScore(Number(blockScoresRaw.EQ ?? 0)),
    EdgeQ: clampScore(Number(blockScoresRaw.EdgeQ ?? 0)),
  };

  // Penalty groups
  const penaltyRaw = (e.penaltyGroups ?? {}) as Record<string, unknown>;
  const penaltyGroups = {
    execution: Math.max(0, Number(penaltyRaw.execution ?? 0)),
    positioning: Math.max(0, Number(penaltyRaw.positioning ?? 0)),
    regime: Math.max(0, Number(penaltyRaw.regime ?? 0)),
    conflict: Math.max(0, Number(penaltyRaw.conflict ?? 0)),
  };

  // Entry zone
  const entryZoneRaw = Array.isArray(e.entryZone) ? e.entryZone : [0, 0];
  const entryZone: [number, number] = [
    Number(entryZoneRaw[0]) || 0,
    Number(entryZoneRaw[1]) || 0,
  ];

  // TP/SL
  const stopLoss = Number(e.stopLoss ?? 0);
  const takeProfit = Number(e.takeProfit ?? 0);

  // Reasons (max 5)
  const reasons = Array.isArray(e.reasons)
    ? (e.reasons as unknown[]).map(String).slice(0, 5)
    : [];

  return {
    symbol,
    side,
    decision,
    finalScore,
    blockScores,
    penaltyGroups,
    entryZone,
    stopLoss,
    takeProfit,
    sizeMultiplier: clamp(Number(e.sizeMultiplier ?? 0), 0, 2),
    reasons,
    hardFail: Boolean(e.hardFail),
    softBlock: Boolean(e.softBlock),
    confidence: clampScore(Number(e.confidence ?? 50)),
    whyTrade: String(e.whyTrade ?? ""),
    whyNotTrade: String(e.whyNotTrade ?? ""),
    dominantRisk: String(e.dominantRisk ?? ""),
    dominantEdge: String(e.dominantEdge ?? ""),
    engineVersion: String(e.engineVersion ?? "prime_ai_v1"),
  };
}

function clampScore(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
}

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}
