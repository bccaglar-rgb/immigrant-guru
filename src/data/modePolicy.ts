import type { ScoringMode } from "../types";

export const MODE_EDITABILITY: Record<ScoringMode, "USER" | "ADMIN"> = {
  FLOW: "USER",
  AGGRESSIVE: "ADMIN",
  BALANCED: "ADMIN",
  CAPITAL_GUARD: "ADMIN",
};

export type ModeKey = keyof typeof MODE_EDITABILITY;

