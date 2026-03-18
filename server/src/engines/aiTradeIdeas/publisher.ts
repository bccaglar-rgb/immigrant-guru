import { redis } from "../../db/redis.ts";
import type { CycleMetrics, ValidatedResult } from "./types.ts";

const REDIS_KEY = "bitrium:ai-engine-v2:state";
const TTL_SECONDS = 300; // 5 min

/**
 * Publishes engine cycle results to Redis for cross-worker visibility
 * and frontend consumption via the health endpoint.
 */
export async function publishCycleResults(
  metrics: CycleMetrics,
  results: ValidatedResult[],
): Promise<void> {
  try {
    const state = {
      lastCycle: {
        cycleId: metrics.cycleId,
        startedAt: metrics.startedAt,
        completedAt: metrics.completedAt,
        durationMs: metrics.durationMs,
        quantCandidates: metrics.quantCandidates,
        afterGate: metrics.afterGate,
        sentToAi: metrics.sentToAi,
        aiApproved: metrics.aiApproved,
        aiDowngraded: metrics.aiDowngraded,
        aiRejected: metrics.aiRejected,
        persisted: metrics.persisted,
        errors: metrics.errors,
      },
      results: results.map((r) => ({
        symbol: r.candidate.symbol,
        mode: r.candidate.mode,
        decision: r.finalDecision,
        direction: r.finalDirection,
        score: r.finalScore,
        aiVerdict: r.aiResponse.verdict,
        aiConfidence: r.aiResponse.confidence,
      })),
      updatedAt: new Date().toISOString(),
    };

    await redis.set(REDIS_KEY, JSON.stringify(state), "EX", TTL_SECONDS);
  } catch {
    // Non-critical — engine continues without publish
  }
}

/** Read latest engine state from Redis (for health endpoint). */
export async function readEngineState(): Promise<unknown> {
  try {
    const raw = await redis.get(REDIS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
