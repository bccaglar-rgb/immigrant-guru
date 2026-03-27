/**
 * Balanced Mode Hub — Publisher (v4)
 *
 * Publishes hub snapshots to Redis (for frontend polling) and PostgreSQL (for history).
 * Now includes 4-block scores, penalty groups, edgeNetR.
 */

import type { HubOutput } from "./types.ts";
import { redis } from "../../db/redis.ts";
import { pool } from "../../db/pool.ts";

const REDIS_KEY = "bitrium:balanced-hub:snapshot";
const REDIS_TTL = 120; // seconds

/** Publish snapshot to Redis + DB */
export async function publishSnapshot(outputs: HubOutput[], cycleId: string): Promise<void> {
  // 1. Publish to Redis for frontend consumption
  try {
    const payload = JSON.stringify({
      cycleId,
      publishedAt: Date.now(),
      count: outputs.length,
      outputs,
    });
    await redis.set(REDIS_KEY, payload, "EX", REDIS_TTL);
  } catch (err) {
    console.error("[BalancedModeHub] Redis publish error:", err);
  }

  // 2. Persist to PostgreSQL
  for (const output of outputs) {
    try {
      await pool.query(
        `INSERT INTO balanced_hub_snapshots
          (id, symbol, cycle_id, adjusted_score, decision, direction, regime, bias_score,
           core_score, edge_r, penalty, gates_passed, failed_gates,
           mq_score, dq_score, eq_score, edge_q_score, penalty_groups, edge_net_r,
           full_payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
         ON CONFLICT (id) DO NOTHING`,
        [
          `bhub_${output.symbol}_${output.processedAt}`,
          output.symbol,
          cycleId,
          output.adjustedScore,
          output.decision,
          output.direction,
          output.regime.regime,
          output.bias.score,
          output.blockScores.total,
          output.edge.edgeNetR,
          output.penalty.grandTotal,
          output.gates.allPassed,
          JSON.stringify(output.gates.failedGates),
          output.blockScores.MQ,
          output.blockScores.DQ,
          output.blockScores.EQ,
          output.blockScores.EdgeQ,
          JSON.stringify(output.penalty),
          output.edge.edgeNetR,
          JSON.stringify(output),
        ],
      );
    } catch (err) {
      console.error(`[BalancedModeHub] DB insert error for ${output.symbol}:`, (err as Error).message);
    }
  }
}

/** Read latest snapshot from Redis */
export async function readSnapshot(): Promise<{
  cycleId: string;
  publishedAt: number;
  count: number;
  outputs: HubOutput[];
} | null> {
  try {
    const raw = await redis.get(REDIS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
