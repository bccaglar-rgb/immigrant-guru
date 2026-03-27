/**
 * Balanced Mode Hub — API Routes
 */

import type { Express } from "express";
import type { BalancedModeHub } from "../engines/balancedModeHub/hubOrchestrator.ts";
import { readSnapshot } from "../engines/balancedModeHub/hubPublisher.ts";
import { pool } from "../db/pool.ts";

export function registerBalancedHubRoutes(app: Express, hub?: BalancedModeHub | null): void {
  app.get("/api/balanced-hub/snapshot", async (_req, res) => {
    try {
      let raw: { cycleId: string; publishedAt: number; count: number; outputs: any[] } | null = null;
      const redisSnapshot = await readSnapshot();
      if (redisSnapshot) {
        raw = redisSnapshot as any;
      } else {
        const memory = hub?.getLastSnapshot() ?? [];
        raw = { cycleId: "memory", publishedAt: Date.now(), count: memory.length, outputs: memory };
      }
      // Transform outputs for frontend consumption
      const outputs = (raw.outputs ?? []).map((o: any) => ({
        symbol: o.symbol,
        cycleId: o.cycleId,
        adjustedScore: o.adjustedScore ?? 0,
        decision: o.decision ?? "NO_TRADE",
        direction: o.direction ?? "NONE",
        regime: o.regime?.regime ?? "RANGE",
        biasScore: o.bias?.score ?? 0,
        coreScore: o.coreScore?.total ?? 0,
        edgeR: o.edge?.expectedEdge ?? 0,
        penalty: o.penalty?.total ?? 0,
        gatesPassed: o.gates?.allPassed ?? false,
        failedGates: o.gates?.failedGates ?? [],
        payload: {
          coreBreakdown: o.coreScore ?? null,
          regimeMultiplier: o.regime?.multiplier ?? null,
          executionScore: o.execution?.score ?? null,
          executionBlocked: o.execution?.blocked ?? false,
          fillProbability: o.execution?.score !== null ? o.execution.score / 100 : null,
          slippage: o.slippage ?? null,
          expectedEdge: o.edge?.expectedEdge ?? null,
          riskAdjustedEdge: o.edge?.riskAdjustedEdge ?? null,
          pWin: o.edge?.pWin ?? null,
          avgWinR: o.edge?.avgWinR ?? null,
          costR: o.edge?.costR ?? null,
          penalties: o.penalty?.breakdown ?? {},
          penaltyTotal: o.penalty?.total ?? 0,
          dataHealth: null,
          riskScore: null,
          tpSl: o.tpSl ?? null,
          positionSize: o.positionSize ?? null,
          reasons: o.reasons ?? [],
        },
        createdAt: new Date(o.processedAt ?? Date.now()).toISOString(),
      }));
      res.set("Cache-Control", "public, max-age=5");
      res.json({ cycleId: raw.cycleId, publishedAt: raw.publishedAt, count: outputs.length, outputs });
    } catch {
      res.status(500).json({ error: "Failed to read snapshot" });
    }
  });

  app.get("/api/balanced-hub/history", async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const symbol = req.query.symbol as string | undefined;
      const query = symbol
        ? `SELECT id, symbol, cycle_id, adjusted_score, decision, direction, regime, bias_score, core_score, edge_r, penalty, gates_passed, created_at FROM balanced_hub_snapshots WHERE symbol = $1 ORDER BY created_at DESC LIMIT $2`
        : `SELECT id, symbol, cycle_id, adjusted_score, decision, direction, regime, bias_score, core_score, edge_r, penalty, gates_passed, created_at FROM balanced_hub_snapshots ORDER BY created_at DESC LIMIT $1`;
      const params = symbol ? [symbol.toUpperCase(), limit] : [limit];
      const { rows } = await pool.query(query, params);
      res.json({ count: rows.length, snapshots: rows });
    } catch {
      res.status(500).json({ error: "Failed to read history" });
    }
  });

  app.get("/api/balanced-hub/detail/:symbol", async (req, res) => {
    try {
      const symbol = req.params.symbol.toUpperCase();
      const memory = hub?.getLastSnapshot() ?? [];
      const memMatch = memory.find(o => o.symbol === symbol);
      if (memMatch) return res.json(memMatch);
      const { rows } = await pool.query(
        `SELECT full_payload FROM balanced_hub_snapshots WHERE symbol = $1 ORDER BY created_at DESC LIMIT 1`,
        [symbol],
      );
      if (rows.length > 0) return res.json((rows[0] as { full_payload: unknown }).full_payload);
      res.status(404).json({ error: "Symbol not found" });
    } catch {
      res.status(500).json({ error: "Failed to read detail" });
    }
  });

  app.get("/api/balanced-hub/health", async (_req, res) => {
    try {
      const memory = hub?.getLastSnapshot() ?? [];
      if (memory.length > 0) {
        return res.json({ status: 'ok', lastSnapshotSize: memory.length, lastProcessedAt: memory[0]?.processedAt ?? null, lastCycleId: memory[0]?.cycleId ?? null });
      }
      const redisData = await readSnapshot();
      if (redisData) {
        return res.json({ status: 'ok', lastSnapshotSize: redisData.count, lastProcessedAt: redisData.publishedAt, lastCycleId: redisData.cycleId });
      }
      res.json({ status: 'ok', lastSnapshotSize: 0, lastProcessedAt: null, lastCycleId: null });
    } catch {
      res.json({ status: 'ok', lastSnapshotSize: 0, lastProcessedAt: null, lastCycleId: null });
    }
  });
}
