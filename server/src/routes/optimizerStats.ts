/**
 * Optimizer Stats API Routes
 *
 * GET /api/optimizer/mode-performance — All mode stats
 * GET /api/optimizer/attribution-summary — Recent trade attribution summary
 */

import type { Express } from "express";
import type { ModePerformanceTracker } from "../services/optimizer/modePerformanceTracker.ts";
import type { TradeOutcomeAttributor } from "../services/optimizer/tradeOutcomeAttributor.ts";

export function registerOptimizerStatsRoutes(
  app: Express,
  modeTracker: ModePerformanceTracker,
  attributor: TradeOutcomeAttributor,
): void {
  app.get("/api/optimizer/mode-performance", (_req, res) => {
    res.json({
      ok: true,
      modes: modeTracker.getAllStats(),
      ts: new Date().toISOString(),
    });
  });

  app.get("/api/optimizer/attribution-summary", async (req, res) => {
    const hours = Math.min(168, Math.max(1, Number(req.query.hours ?? 24)));
    const stats = await attributor.getRecentStats(hours);
    res.json({ ok: true, ...stats, hours, ts: new Date().toISOString() });
  });
}
