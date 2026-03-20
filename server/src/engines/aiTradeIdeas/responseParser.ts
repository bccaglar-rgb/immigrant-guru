import type { AiEvaluationResponse, AxiomAnalysis } from "./types.ts";

const PREFIX = "[AIEngineV2:Parser]";

const VALID_VERDICTS = new Set(["APPROVE", "DOWNGRADE", "REJECT"]);
const VALID_DIRECTIONS = new Set(["LONG", "SHORT"]);

/**
 * Parses raw LLM response string into typed AiEvaluationResponse[].
 * Handles: direct JSON, fenced blocks, brace extraction.
 *
 * When isAxiom=true, parses Axiom output format:
 *   { decision, confidence, regime, entry_zone, stop_loss, tp1, tp2, tp3, ... }
 * and maps it to the standard AiEvaluationResponse with axiomAnalysis enrichment.
 */
export function parseAiResponse(raw: string, isAxiom = false): AiEvaluationResponse[] {
  const parsed = tryParseJson(raw);
  if (!parsed) {
    console.error(`${PREFIX} Failed to parse AI response`);
    return [];
  }

  if (isAxiom) {
    return parseAxiomResponse(parsed);
  }

  return parseStandardResponse(parsed);
}

// ── Standard parser (ChatGPT/Qwen) ──────────────────────────────

function parseStandardResponse(parsed: Record<string, unknown> | unknown[]): AiEvaluationResponse[] {
  // Extract evaluations array
  const evaluations = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as Record<string, unknown>).evaluations)
      ? (parsed as Record<string, unknown>).evaluations as unknown[]
      : [];

  if (!evaluations.length) {
    console.error(`${PREFIX} No evaluations array found in AI response`);
    return [];
  }

  const results: AiEvaluationResponse[] = [];

  for (const entry of evaluations) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;

    const symbol = String(e.symbol ?? "").toUpperCase().trim();
    if (!symbol) continue;

    const verdict = normalizeVerdict(e.verdict);
    if (!verdict) continue;

    const direction = normalizeDirection(e.adjustedDirection ?? e.direction);
    if (!direction) continue;

    results.push({
      symbol,
      verdict,
      confidence: clamp(Number(e.confidence ?? 50), 0, 100),
      adjustedDirection: direction,
      adjustedEntryLow: Number(e.adjustedEntryLow ?? e.entry_zone_low ?? 0),
      adjustedEntryHigh: Number(e.adjustedEntryHigh ?? e.entry_zone_high ?? 0),
      adjustedSlLevels: toNumberArray(e.adjustedSlLevels ?? e.sl_levels ?? []),
      adjustedTpLevels: toNumberArray(e.adjustedTpLevels ?? e.tp_levels ?? []),
      riskFlags: toStringArray(e.riskFlags ?? e.risk_flags ?? []),
      comment: String(e.comment ?? e.comment_30_words ?? "").slice(0, 300),
      reasoning: String(e.reasoning ?? "").slice(0, 500),
    });
  }

  return results;
}

// ── Axiom parser (QWEN2 / Bitrium Axiom) ─────────────────────────

function parseAxiomResponse(parsed: Record<string, unknown> | unknown[]): AiEvaluationResponse[] {
  // Axiom can return a single object or an evaluations array
  const entries: Record<string, unknown>[] = [];

  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (item && typeof item === "object") entries.push(item as Record<string, unknown>);
    }
  } else {
    const evaluations = (parsed as Record<string, unknown>).evaluations;
    if (Array.isArray(evaluations)) {
      for (const item of evaluations) {
        if (item && typeof item === "object") entries.push(item as Record<string, unknown>);
      }
    } else {
      // Single evaluation object
      entries.push(parsed as Record<string, unknown>);
    }
  }

  if (!entries.length) {
    console.error(`${PREFIX} No Axiom evaluations found in AI response`);
    return [];
  }

  const results: AiEvaluationResponse[] = [];

  for (const e of entries) {
    // Axiom format: { decision: "LONG" | "SHORT" | "NO TRADE", confidence: 0.00-1.00, ... }
    const decision = String(e.decision ?? "").toUpperCase().trim();
    const symbol = String(e.symbol ?? "").toUpperCase().trim();

    // Map Axiom decision to standard verdict + direction
    let verdict: AiEvaluationResponse["verdict"];
    let direction: "LONG" | "SHORT";

    if (decision === "LONG") {
      verdict = "APPROVE";
      direction = "LONG";
    } else if (decision === "SHORT") {
      verdict = "APPROVE";
      direction = "SHORT";
    } else if (decision === "NO TRADE" || decision === "NO_TRADE") {
      verdict = "REJECT";
      direction = "LONG"; // placeholder, won't be used
    } else {
      // Try fallback to standard format
      const stdVerdict = normalizeVerdict(e.verdict);
      const stdDir = normalizeDirection(e.adjustedDirection ?? e.direction);
      if (stdVerdict && stdDir) {
        verdict = stdVerdict;
        direction = stdDir;
      } else {
        continue; // skip unparseable
      }
    }

    // Confidence: Axiom returns 0.00-1.00, scale to 0-100
    let confidence = Number(e.confidence ?? 0);
    if (confidence <= 1.0 && confidence >= 0) {
      confidence = confidence * 100;
    }
    confidence = clamp(confidence, 0, 100);

    // Downgrade low-confidence APPROVE to DOWNGRADE
    if (verdict === "APPROVE" && confidence < 55) {
      verdict = "DOWNGRADE";
    }

    // Entry zone
    const entryZone = Array.isArray(e.entry_zone) ? e.entry_zone : [];
    const entryLow = Number(entryZone[0] ?? e.adjustedEntryLow ?? e.entry_zone_low ?? 0);
    const entryHigh = Number(entryZone[1] ?? e.adjustedEntryHigh ?? e.entry_zone_high ?? 0);

    // SL: Axiom returns single stop_loss value
    const sl = Number(e.stop_loss ?? 0);
    const slLevels = sl > 0 ? [sl] : toNumberArray(e.adjustedSlLevels ?? []);

    // TP: Axiom returns tp1, tp2, tp3 separately
    const tp1 = Number(e.tp1 ?? 0);
    const tp2 = Number(e.tp2 ?? 0);
    const tp3 = Number(e.tp3 ?? 0);
    const tpLevels = [tp1, tp2, tp3].filter((n) => Number.isFinite(n) && n > 0);
    if (!tpLevels.length) {
      const fallbackTp = toNumberArray(e.adjustedTpLevels ?? []);
      tpLevels.push(...fallbackTp);
    }

    // Build Axiom analysis metadata
    const axiomAnalysis: AxiomAnalysis = {
      regime: String(e.regime ?? ""),
      primaryThesis: String(e.primary_thesis ?? ""),
      entryType: String(e.entry_type ?? ""),
      entryCondition: String(e.entry_condition ?? ""),
      invalidation: String(e.invalidation ?? ""),
      notes: toStringArray(e.notes ?? []),
      bullishScore: clampFloat(Number(e.bullish_score ?? 0)),
      bearishScore: clampFloat(Number(e.bearish_score ?? 0)),
      rrEstimate: Number(e.rr_estimate ?? 0),
      tp1,
      tp2,
      tp3,
    };

    // Build reasoning from Axiom fields
    const reasoning = axiomAnalysis.primaryThesis || String(e.reasoning ?? "");
    const comment = String(e.comment ?? e.primary_thesis ?? "").slice(0, 300);

    results.push({
      symbol: symbol || "UNKNOWN",
      verdict,
      confidence: Math.round(confidence),
      adjustedDirection: direction,
      adjustedEntryLow: Number.isFinite(entryLow) ? entryLow : 0,
      adjustedEntryHigh: Number.isFinite(entryHigh) ? entryHigh : 0,
      adjustedSlLevels: slLevels,
      adjustedTpLevels: tpLevels,
      riskFlags: toStringArray(e.notes ?? e.riskFlags ?? e.risk_flags ?? []),
      comment: comment.slice(0, 300),
      reasoning: reasoning.slice(0, 500),
      axiomAnalysis,
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

function clampFloat(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function toNumberArray(val: unknown): number[] {
  if (!Array.isArray(val)) return [];
  return val.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0);
}

function toStringArray(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  return val.map((v) => String(v).trim()).filter(Boolean).slice(0, 10);
}
