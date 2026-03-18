import type { SystemScanResult } from "../../services/systemScannerService.ts";
import type { AiEngineCandidate } from "./types.ts";

/**
 * Converts raw SystemScanResult[] from the Quant Trade Idea Engine
 * into normalized AiEngineCandidate[] with computed RR fields.
 */
export function buildCandidates(results: SystemScanResult[]): AiEngineCandidate[] {
  const candidates: AiEngineCandidate[] = [];

  for (const r of results) {
    // Skip candidates with missing entry zone
    if (!r.entryLow || r.entryLow <= 0 || !r.entryHigh || r.entryHigh <= 0) continue;
    // Skip candidates with no SL or TP
    if (!r.slLevels?.length || !r.tpLevels?.length) continue;

    const entryMid = (r.entryLow + r.entryHigh) / 2;
    const sl1 = r.slLevels[0];
    const tp1 = r.tpLevels[0];

    const riskR = Math.abs(entryMid - sl1);
    const rewardR = Math.abs(tp1 - entryMid);
    const rrRatio = riskR > 0 ? rewardR / riskR : 0;

    // quantSnapshot may be present on cache items (EnrichedScanResult extends SystemScanResult)
    const quantSnapshot = (r as Record<string, unknown>).quantSnapshot as Record<string, unknown> | undefined;

    candidates.push({
      symbol: r.symbol,
      mode: r.mode,
      quantScore: r.scorePct,
      decision: r.decision,
      direction: r.direction,
      tradeValidity: r.tradeValidity,
      entryWindow: r.entryWindow,
      slippageRisk: r.slippageRisk,
      setup: r.setup,
      entryLow: r.entryLow,
      entryHigh: r.entryHigh,
      slLevels: r.slLevels,
      tpLevels: r.tpLevels,
      horizon: r.horizon,
      timeframe: r.timeframe,
      modeScores: r.modeScores,
      pricePrecision: r.pricePrecision ?? 8,
      scannedAt: r.scannedAt,
      quantSnapshot,
      entryMid,
      riskR,
      rewardR,
      rrRatio,
    });
  }

  return candidates;
}
