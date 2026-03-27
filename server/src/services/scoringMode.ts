export const SCORING_MODES = ["FLOW", "AGGRESSIVE", "BALANCED", "CAPITAL_GUARD", "PRIME_AI"] as const;

/** Deterministic scoring modes (exclude LLM-based modes like PRIME_AI) */
export const DETERMINISTIC_SCORING_MODES = ["FLOW", "AGGRESSIVE", "BALANCED", "CAPITAL_GUARD"] as const;

export type ScoringMode = (typeof SCORING_MODES)[number];

export const isScoringMode = (value: unknown): value is ScoringMode =>
  typeof value === "string" && (SCORING_MODES as readonly string[]).includes(value);

const SCORING_MODE_ALIASES: Record<string, ScoringMode> = {
  EXTREME: "FLOW",
  VELOCITY: "AGGRESSIVE",
  HEDGE_FUND: "CAPITAL_GUARD",
  NORMAL: "BALANCED",
  AGGRESSIVE: "AGGRESSIVE",
  BALANCED: "BALANCED",
  FLOW: "FLOW",
  CAPITAL_GUARD: "CAPITAL_GUARD",
  "CAPITAL-GUARD": "CAPITAL_GUARD",
  CAPITALGUARD: "CAPITAL_GUARD",
};

export const normalizeScoringMode = (value: unknown, fallback: ScoringMode = "BALANCED"): ScoringMode => {
  if (isScoringMode(value)) return value;
  const normalized = String(value ?? "").toUpperCase().trim();
  if (!normalized) return fallback;
  return SCORING_MODE_ALIASES[normalized] ?? fallback;
};
