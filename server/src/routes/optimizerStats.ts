/**
 * Optimizer Stats API Routes
 *
 * GET /api/optimizer/mode-performance — P1: All mode stats
 * GET /api/optimizer/attribution-summary — P2: Trade attribution summary
 * GET /api/optimizer/sl-tp-params — P3: Dynamic SL/TP parameters
 * GET /api/optimizer/regime — P4: Regime parameters + memory
 * GET /api/optimizer/health — Combined optimizer health
 */

import type { Express } from "express";
import type { ModePerformanceTracker } from "../services/optimizer/modePerformanceTracker.ts";
import type { TradeOutcomeAttributor } from "../services/optimizer/tradeOutcomeAttributor.ts";
import type { DynamicSlTpOptimizer } from "../services/optimizer/dynamicSlTpOptimizer.ts";
import type { RegimeParameterEngine } from "../services/optimizer/regimeParameterEngine.ts";

export function registerOptimizerStatsRoutes(
  app: Express,
  modeTracker: ModePerformanceTracker,
  attributor: TradeOutcomeAttributor,
  slTpOptimizer: DynamicSlTpOptimizer,
  regimeEngine: RegimeParameterEngine,
): void {
  // P1: Mode performance
  app.get("/api/optimizer/mode-performance", (_req, res) => {
    res.json({ ok: true, modes: modeTracker.getAllStats(), ts: new Date().toISOString() });
  });

  // P2: Attribution summary
  app.get("/api/optimizer/attribution-summary", async (req, res) => {
    const hours = Math.min(168, Math.max(1, Number(req.query.hours ?? 24)));
    const stats = await attributor.getRecentStats(hours);
    res.json({ ok: true, ...stats, hours, ts: new Date().toISOString() });
  });

  // P3: Dynamic SL/TP
  app.get("/api/optimizer/sl-tp-params", (_req, res) => {
    res.json({
      ok: true,
      params: slTpOptimizer.getAllParams(),
      lastOptimized: slTpOptimizer.getLastOptimized(),
      ts: new Date().toISOString(),
    });
  });

  // P4: Regime parameters
  app.get("/api/optimizer/regime", (_req, res) => {
    res.json({ ok: true, ...regimeEngine.getSummary(), ts: new Date().toISOString() });
  });

  // Combined health
  app.get("/api/optimizer/health", async (req, res) => {
    const hours = Math.min(168, Math.max(1, Number(req.query.hours ?? 24)));
    const attrStats = await attributor.getRecentStats(hours);
    const regimeSummary = regimeEngine.getSummary();
    const throttledModes = modeTracker.getAllStats().filter((m) => m.throttled);

    res.json({
      ok: true,
      modules: {
        p1_modeTracker: { active: true, throttledModes: throttledModes.map((m) => ({ mode: m.mode, reason: m.throttleReason, weight: m.weight })) },
        p2_attribution: { active: true, totalTrades: attrStats.total, wins: attrStats.wins, losses: attrStats.losses },
        p3_slTpOptimizer: { active: true, lastOptimized: slTpOptimizer.getLastOptimized(), paramCount: slTpOptimizer.getAllParams().length },
        p4_regimeEngine: { active: true, currentRegime: regimeSummary.currentRegime, memorySize: regimeSummary.memorySize },
      },
      ts: new Date().toISOString(),
    });
  });
}
