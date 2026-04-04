import type { AIStrategyResponse, StrategyContextMode } from "@/types/ai";

const KEY_PREFIX = "immigrant-ai.ai-strategy";

type CachedStrategyPayload = {
  caseId: string;
  caseUpdatedAt: string;
  contextMode: StrategyContextMode;
  question: string;
  strategy: AIStrategyResponse;
};

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function getStorageKey(caseId: string): string {
  return `${KEY_PREFIX}.${caseId}`;
}

export function readAIStrategyCache(caseId: string): CachedStrategyPayload | null {
  if (!isBrowser()) {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(getStorageKey(caseId));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as CachedStrategyPayload;
    if (
      typeof parsed?.caseId !== "string" ||
      typeof parsed?.caseUpdatedAt !== "string" ||
      typeof parsed?.contextMode !== "string" ||
      typeof parsed?.question !== "string" ||
      typeof parsed?.strategy !== "object" ||
      parsed.caseId !== caseId
    ) {
      window.sessionStorage.removeItem(getStorageKey(caseId));
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function writeAIStrategyCache(payload: CachedStrategyPayload): void {
  if (!isBrowser()) {
    return;
  }

  try {
    window.sessionStorage.setItem(
      getStorageKey(payload.caseId),
      JSON.stringify(payload)
    );
  } catch {}
}

export function clearAIStrategyCache(caseId: string): void {
  if (!isBrowser()) {
    return;
  }

  try {
    window.sessionStorage.removeItem(getStorageKey(caseId));
  } catch {}
}
