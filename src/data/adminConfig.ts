import type { ScoringMode } from "../types";

export const ADMIN_CONFIG = {
  tradeIdeas: {
    minConfidenceGlobal: 0.7,
    modeMinConfidence: {
      FLOW: 0.6,
      AGGRESSIVE: 0.68,
      BALANCED: 0.7,
      CAPITAL_GUARD: 0.75,
    } as Record<ScoringMode, number>,
  },
} as const;

