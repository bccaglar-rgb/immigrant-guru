import type { ScoringMode } from "../types";

export const MODE_CONSENSUS_RANGE_STORAGE_KEY = "trade-ideas-mode-consensus-min-v1";

const SCAN_MODE_ORDER: readonly ScoringMode[] = ["FLOW", "AGGRESSIVE", "BALANCED", "CAPITAL_GUARD"] as const;

const clampPct = (value: number): number => Math.max(40, Math.min(100, Math.round(value)));

export const readUserModeConsensusMinPct = (): Partial<Record<ScoringMode, number>> => {
  try {
    const raw = window.localStorage.getItem(MODE_CONSENSUS_RANGE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<Record<ScoringMode, unknown>>;
    const out: Partial<Record<ScoringMode, number>> = {};
    for (const mode of SCAN_MODE_ORDER) {
      const value = Number(parsed?.[mode]);
      if (!Number.isFinite(value)) continue;
      out[mode] = clampPct(value);
    }
    return out;
  } catch {
    return {};
  }
};

export const writeUserModeConsensusMinPct = (next: Partial<Record<ScoringMode, number>>): void => {
  try {
    const current = readUserModeConsensusMinPct();
    const merged: Partial<Record<ScoringMode, number>> = { ...current };
    for (const mode of SCAN_MODE_ORDER) {
      const value = Number(next?.[mode]);
      if (!Number.isFinite(value)) continue;
      merged[mode] = clampPct(value);
    }
    window.localStorage.setItem(MODE_CONSENSUS_RANGE_STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // ignore localStorage failures
  }
};

