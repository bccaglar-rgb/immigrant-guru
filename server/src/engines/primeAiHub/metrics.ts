/**
 * Bitrium Prime AI Hub — Metrics & Structured Logging
 *
 * All logs use [PrimeAI] prefix for easy filtering.
 * Provides cycle stats, override counts, LLM latency, and decision breakdown.
 */

import type { PrimeAiCycleMetrics, EnforcedResult } from "./types.ts";
import { LOG_PREFIX } from "./config.ts";

/**
 * Build cycle metrics from enforced results.
 */
export function buildCycleMetrics(
  cycleId: string,
  startMs: number,
  llmLatencyMs: number,
  results: EnforcedResult[],
  ideasCreated: number,
  cooldownBlocked: number,
  errors: string[],
): PrimeAiCycleMetrics {
  let confirmed = 0;
  let probe = 0;
  let watchlist = 0;
  let noTrade = 0;
  let overrideCount = 0;

  for (const r of results) {
    switch (r.enforced.decision) {
      case "CONFIRMED": confirmed++; break;
      case "PROBE": probe++; break;
      case "WATCHLIST": watchlist++; break;
      case "NO_TRADE": noTrade++; break;
    }
    overrideCount += r.enforced.overrides.length;
  }

  return {
    cycleId,
    startMs,
    endMs: Date.now(),
    llmLatencyMs,
    coinsEvaluated: results.length,
    confirmed,
    probe,
    watchlist,
    noTrade,
    overrideCount,
    cooldownBlocked,
    ideasCreated,
    errors,
  };
}

/**
 * Log cycle metrics in structured format.
 */
export function logCycleMetrics(metrics: PrimeAiCycleMetrics): void {
  const elapsed = metrics.endMs - metrics.startMs;

  console.log(
    `${LOG_PREFIX} Cycle ${metrics.cycleId}: ${metrics.coinsEvaluated} coins -> ` +
    `${metrics.confirmed} confirmed, ${metrics.probe} probe, ` +
    `${metrics.watchlist} watchlist, ${metrics.noTrade} no_trade | ` +
    `LLM: ${metrics.llmLatencyMs}ms | Overrides: ${metrics.overrideCount} | ` +
    `Cooldown blocked: ${metrics.cooldownBlocked} | ` +
    `Ideas: ${metrics.ideasCreated} | Total: ${elapsed}ms`,
  );

  if (metrics.errors.length > 0) {
    console.error(`${LOG_PREFIX} Cycle ${metrics.cycleId} errors:`, metrics.errors);
  }
}

/**
 * Log engine startup.
 */
export function logStartup(model: string, intervalMs: number): void {
  console.log(
    `${LOG_PREFIX} V1 Started (Claude-powered, ${model}, ${intervalMs / 1000}s cycle)`,
  );
}

/**
 * Log a single result's enforcement details (debug level).
 */
export function logEnforcement(result: EnforcedResult): void {
  const { coin, enforced } = result;
  if (enforced.overrides.length === 0) return;

  const overrideStr = enforced.overrides
    .map(o => `${o.field}: ${JSON.stringify(o.from)}->${JSON.stringify(o.to)} (${o.reason})`)
    .join(", ");

  console.log(
    `${LOG_PREFIX}   ${coin.symbol}: ${enforced.decision} score=${enforced.finalScore.toFixed(1)} ` +
    `[MQ=${enforced.blockScores.MQ.toFixed(0)} DQ=${enforced.blockScores.DQ.toFixed(0)} ` +
    `EQ=${enforced.blockScores.EQ.toFixed(0)} EdgeQ=${enforced.blockScores.EdgeQ.toFixed(0)}] ` +
    `overrides: ${overrideStr}`,
  );
}
