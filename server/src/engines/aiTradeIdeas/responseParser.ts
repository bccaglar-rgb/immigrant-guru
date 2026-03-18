import type { AiEvaluationResponse } from "./types.ts";

const PREFIX = "[AIEngineV2:Parser]";

const VALID_VERDICTS = new Set(["APPROVE", "DOWNGRADE", "REJECT"]);
const VALID_DIRECTIONS = new Set(["LONG", "SHORT"]);

/**
 * Parses raw LLM response string into typed AiEvaluationResponse[].
 * Handles: direct JSON, fenced blocks, brace extraction.
 */
export function parseAiResponse(raw: string): AiEvaluationResponse[] {
  const parsed = tryParseJson(raw);
  if (!parsed) {
    console.error(`${PREFIX} Failed to parse AI response`);
    return [];
  }

  // Extract evaluations array
  const evaluations = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.evaluations)
      ? parsed.evaluations
      : [];

  if (!evaluations.length) {
    console.error(`${PREFIX} No evaluations array found in AI response`);
    return [];
  }

  const results: AiEvaluationResponse[] = [];

  for (const entry of evaluations) {
    if (!entry || typeof entry !== "object") continue;

    const symbol = String(entry.symbol ?? "").toUpperCase().trim();
    if (!symbol) continue;

    const verdict = normalizeVerdict(entry.verdict);
    if (!verdict) continue;

    const direction = normalizeDirection(entry.adjustedDirection ?? entry.direction);
    if (!direction) continue;

    results.push({
      symbol,
      verdict,
      confidence: clamp(Number(entry.confidence ?? 50), 0, 100),
      adjustedDirection: direction,
      adjustedEntryLow: Number(entry.adjustedEntryLow ?? entry.entry_zone_low ?? 0),
      adjustedEntryHigh: Number(entry.adjustedEntryHigh ?? entry.entry_zone_high ?? 0),
      adjustedSlLevels: toNumberArray(entry.adjustedSlLevels ?? entry.sl_levels ?? []),
      adjustedTpLevels: toNumberArray(entry.adjustedTpLevels ?? entry.tp_levels ?? []),
      riskFlags: toStringArray(entry.riskFlags ?? entry.risk_flags ?? []),
      comment: String(entry.comment ?? entry.comment_30_words ?? "").slice(0, 300),
      reasoning: String(entry.reasoning ?? "").slice(0, 500),
    });
  }

  return results;
}

// ── Helpers ────────────────────────────────────────────────────

function tryParseJson(raw: string): Record<string, unknown> | unknown[] | null {
  const trimmed = raw.trim();

  // 1. Direct parse
  try {
    return JSON.parse(trimmed);
  } catch { /* continue */ }

  // 2. Fenced JSON block
  const fencedMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fencedMatch) {
    try {
      return JSON.parse(fencedMatch[1].trim());
    } catch { /* continue */ }
  }

  // 3. First { to last }
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try {
      return JSON.parse(trimmed.slice(first, last + 1));
    } catch { /* continue */ }
  }

  return null;
}

function normalizeVerdict(v: unknown): AiEvaluationResponse["verdict"] | null {
  const s = String(v ?? "").toUpperCase().trim();
  return VALID_VERDICTS.has(s) ? s as AiEvaluationResponse["verdict"] : null;
}

function normalizeDirection(d: unknown): "LONG" | "SHORT" | null {
  const s = String(d ?? "").toUpperCase().trim();
  return VALID_DIRECTIONS.has(s) ? s as "LONG" | "SHORT" : null;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));
}

function toNumberArray(val: unknown): number[] {
  if (!Array.isArray(val)) return [];
  return val.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0);
}

function toStringArray(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  return val.map((v) => String(v).trim()).filter(Boolean).slice(0, 10);
}
