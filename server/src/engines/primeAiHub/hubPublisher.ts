/**
 * Bitrium Prime AI Hub — Publisher
 *
 * Publishes results to:
 *   1. Redis snapshot (bitrium:prime-ai-hub:snapshot, 300s TTL)
 *   2. DB: prime_ai_hub_snapshots table
 *   3. Trade ideas via shared hubIdeaCreator (for PROBE/CONFIRMED)
 */

import { randomUUID } from "node:crypto";
import { redis } from "../../db/redis.ts";
import { pool } from "../../db/pool.ts";
import { createHubTradeIdeas } from "../shared/hubIdeaCreator.ts";
import type { EnforcedResult, PrimeAiHubOutput, PrimeAiSnapshot } from "./types.ts";
import type { PositionSizeResult } from "./positionSizer.ts";
import type { EntryZoneResult } from "./entryCalculator.ts";
import { REDIS_KEYS, LOG_PREFIX, LEVERAGE } from "./config.ts";

interface PublishInput {
  result: EnforcedResult;
  entryZone: EntryZoneResult;
  positionSize: PositionSizeResult;
}

/**
 * Publish all results from a cycle.
 * Returns number of trade ideas created.
 */
export async function publishCycle(
  cycleId: string,
  inputs: PublishInput[],
): Promise<number> {
  const hubOutputs: PrimeAiHubOutput[] = [];
  const snapshots: PrimeAiSnapshot[] = [];

  for (const { result, entryZone, positionSize } of inputs) {
    const { coin, aiOutput, enforced } = result;

    // Build backward-compat HubOutput for hubIdeaCreator
    const hubOutput: PrimeAiHubOutput = {
      symbol: coin.symbol,
      timeframe: coin.timeframe,
      price: coin.price,
      adjustedScore: enforced.finalScore,
      decision: enforced.decision,
      direction: enforced.side,
      tpSl: enforced.side !== "NONE" && enforced.stopLoss > 0 ? {
        entryZone: [entryZone.low, entryZone.high],
        tp: enforced.takeProfit,
        sl: enforced.stopLoss,
        tpMarginPct: enforced.tpPct * LEVERAGE,
        slMarginPct: enforced.slPct * LEVERAGE,
        riskRewardRatio: enforced.slPct > 0 ? enforced.tpPct / enforced.slPct : 0,
      } : null,
      reasons: aiOutput.reasons,
      regime: { regime: coin.marketStructure.regime },
      coreScore: { total: enforced.blockScores.MQ },
      edge: { expectedEdge: coin.edgeModel.pWin * coin.edgeModel.avgWinR - coin.edgeModel.costR },
      processedAt: Date.now(),

      // Prime AI specific
      cycleId,
      confidence: aiOutput.confidence,
      blockScores: enforced.blockScores,
      penaltyGroups: aiOutput.penaltyGroups,
      whyTrade: aiOutput.whyTrade,
      whyNotTrade: aiOutput.whyNotTrade,
      dominantRisk: aiOutput.dominantRisk,
      dominantEdge: aiOutput.dominantEdge,
      engineVersion: aiOutput.engineVersion,
      overrides: enforced.overrides,
      positionSize: positionSize.multiplier,
    };

    hubOutputs.push(hubOutput);

    // Build DB snapshot
    snapshots.push({
      id: randomUUID(),
      cycleId,
      symbol: coin.symbol,
      side: enforced.side,
      decision: enforced.decision,
      finalScore: enforced.finalScore,
      mqScore: enforced.blockScores.MQ,
      dqScore: enforced.blockScores.DQ,
      eqScore: enforced.blockScores.EQ,
      edgeQScore: enforced.blockScores.EdgeQ,
      confidence: aiOutput.confidence,
      penaltyTotal:
        aiOutput.penaltyGroups.execution +
        aiOutput.penaltyGroups.positioning +
        aiOutput.penaltyGroups.regime +
        aiOutput.penaltyGroups.conflict,
      entryLow: entryZone.low,
      entryHigh: entryZone.high,
      sl: enforced.stopLoss,
      tp: enforced.takeProfit,
      slPct: enforced.slPct,
      tpPct: enforced.tpPct,
      hardFail: enforced.hardFail,
      softBlock: enforced.softBlock,
      codeOverrides: enforced.overrides,
      whyTrade: aiOutput.whyTrade,
      whyNotTrade: aiOutput.whyNotTrade,
      dominantRisk: aiOutput.dominantRisk,
      dominantEdge: aiOutput.dominantEdge,
      aiRaw: aiOutput,
      inputData: coin,
      engineVersion: aiOutput.engineVersion,
      createdAt: new Date().toISOString(),
    });
  }

  // 1. Publish Redis snapshot (300s TTL)
  try {
    const snapshotPayload = JSON.stringify({
      cycleId,
      timestamp: new Date().toISOString(),
      evaluations: hubOutputs,
      count: hubOutputs.length,
    });
    await redis.set(REDIS_KEYS.snapshot, snapshotPayload, "EX", REDIS_KEYS.snapshotTtl);
  } catch (err) {
    console.error(`${LOG_PREFIX} Redis snapshot publish error:`, (err as Error).message);
  }

  // 2. Persist to DB
  for (const snap of snapshots) {
    try {
      await pool.query(
        `INSERT INTO prime_ai_hub_snapshots
          (id, cycle_id, symbol, side, decision, final_score,
           mq_score, dq_score, eq_score, edge_q_score, confidence,
           penalty_total, entry_low, entry_high, sl, tp, sl_pct, tp_pct,
           hard_fail, soft_block, code_overrides,
           why_trade, why_not_trade, dominant_risk, dominant_edge,
           ai_raw, input_data, engine_version)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)`,
        [
          snap.id, snap.cycleId, snap.symbol, snap.side, snap.decision, snap.finalScore,
          snap.mqScore, snap.dqScore, snap.eqScore, snap.edgeQScore, snap.confidence,
          snap.penaltyTotal, snap.entryLow, snap.entryHigh, snap.sl, snap.tp, snap.slPct, snap.tpPct,
          snap.hardFail, snap.softBlock, JSON.stringify(snap.codeOverrides),
          snap.whyTrade, snap.whyNotTrade, snap.dominantRisk, snap.dominantEdge,
          JSON.stringify(snap.aiRaw), JSON.stringify(snap.inputData), snap.engineVersion,
        ],
      );
    } catch (err) {
      console.error(`${LOG_PREFIX} DB snapshot error for ${snap.symbol}:`, (err as Error).message);
    }
  }

  // 3. Create trade ideas for tradeable decisions
  let ideasCreated = 0;
  try {
    ideasCreated = await createHubTradeIdeas(hubOutputs as any, "PRIME_AI" as any, cycleId);
  } catch (err) {
    console.error(`${LOG_PREFIX} Trade idea creation error:`, (err as Error).message);
  }

  return ideasCreated;
}
