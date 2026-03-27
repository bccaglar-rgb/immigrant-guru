/**
 * Aggressive Mode Hub V2 — Publisher
 * Redis key: bitrium:agg-hub:snapshot (120s TTL)
 * DB table: agg_hub_snapshots
 */

import { pool } from "../../db/pool.ts";
import type { AggHubOutput } from "./types.ts";

let redis: any = null;
const REDIS_KEY = "bitrium:agg-hub:snapshot";
const REDIS_TTL = 120;

async function getRedis() {
  if (redis) return redis;
  try {
    const ioredis = await import("ioredis");
    const RedisClass = ioredis.default || ioredis;
    redis = new RedisClass({
      host: process.env.REDIS_HOST || "10.110.0.6",
      port: Number(process.env.REDIS_PORT || 6379),
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
    await redis.connect();
  } catch {
    redis = null;
  }
  return redis;
}

export async function publishAggSnapshot(outputs: AggHubOutput[], cycleId: string): Promise<void> {
  const payload = JSON.stringify({
    cycleId,
    publishedAt: Date.now(),
    count: outputs.length,
    outputs,
  });

  try {
    const r = await getRedis();
    if (r) await r.set(REDIS_KEY, payload, "EX", REDIS_TTL);
  } catch (e) {
    console.error("[AggHub] Redis publish error:", e);
  }

  for (const output of outputs) {
    try {
      await pool.query(
        `INSERT INTO agg_hub_snapshots (id, symbol, cycle_id, adjusted_score, decision, direction, regime, bias_score, core_score, edge_r, penalty, gates_passed, failed_gates, full_payload, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now())
         ON CONFLICT (id) DO NOTHING`,
        [
          `ahub_${output.symbol}_${output.processedAt}`,
          output.symbol,
          cycleId,
          output.adjustedScore,
          output.decision,
          output.direction,
          output.regime.regime,
          output.bias.score,
          output.coreScore.total,
          output.edge.expectedEdge,
          output.penalty.total,
          output.gates.allPassed,
          JSON.stringify([...output.gates.failedGates, ...output.gates.blockedGates]),
          JSON.stringify(output),
        ],
      );
    } catch (e) {
      console.error(`[AggHub] DB insert error for ${output.symbol}:`, e);
    }
  }
}

export async function readAggSnapshot(): Promise<{ cycleId: string; publishedAt: number; count: number; outputs: AggHubOutput[] } | null> {
  try {
    const r = await getRedis();
    if (!r) return null;
    const raw = await r.get(REDIS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
