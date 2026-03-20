/**
 * Egress Admin Routes
 *
 * Admin endpoints for monitoring and controlling the egress failover system.
 *
 * Routes:
 *   GET  /api/admin/egress/status          — Full egress status (all exchanges)
 *   GET  /api/admin/egress/history/:exchange — Failover event history
 *   POST /api/admin/egress/failover        — Force manual failover
 *   POST /api/admin/egress/recovery        — Force return to primary
 *   POST /api/admin/egress/quarantine/release — Release path from quarantine
 *   POST /api/admin/egress/probe           — Force immediate health probe
 */

import { Router, type Request, type Response } from "express";
import { getEgressController } from "../services/egress/index.ts";
import { getWsSwitchoverManager } from "../services/egress/wsSwitchover.ts";

const router = Router();

// ── GET /api/admin/egress/status ──
router.get("/status", (_req: Request, res: Response) => {
  const ctrl = getEgressController();
  if (!ctrl) {
    res.json({ enabled: false, message: "Egress controller not initialized" });
    return;
  }

  const status = ctrl.getStatus();
  const wsMgr = getWsSwitchoverManager();
  const wsTasks = wsMgr.getTasks();

  res.json({
    enabled: true,
    exchanges: status,
    wsSwitch: {
      recentTasks: wsTasks.slice(-5),
    },
  });
});

// ── GET /api/admin/egress/history/:exchange ──
router.get("/history/:exchange", (req: Request, res: Response) => {
  const ctrl = getEgressController();
  if (!ctrl) { res.json({ events: [] }); return; }

  const exchange = req.params.exchange;
  const events = ctrl.getFailoverHistory(exchange);
  res.json({ exchange, events });
});

// ── POST /api/admin/egress/failover ──
router.post("/failover", (req: Request, res: Response) => {
  const ctrl = getEgressController();
  if (!ctrl) { res.status(503).json({ error: "egress_not_initialized" }); return; }

  const { exchange = "binance", reason = "manual_admin_failover" } = req.body ?? {};
  const event = ctrl.forceFailover(exchange, reason);

  if (event) {
    console.log(`[EgressAdmin] Manual failover: ${event.fromPath} → ${event.toPath}`);
    res.json({ success: true, event });
  } else {
    res.json({ success: false, message: "No healthy standby path available or cooldown active" });
  }
});

// ── POST /api/admin/egress/recovery ──
router.post("/recovery", (req: Request, res: Response) => {
  const ctrl = getEgressController();
  if (!ctrl) { res.status(503).json({ error: "egress_not_initialized" }); return; }

  const { exchange = "binance" } = req.body ?? {};
  const event = ctrl.forceRecovery(exchange);

  if (event) {
    console.log(`[EgressAdmin] Manual recovery: ${event.fromPath} → ${event.toPath}`);
    res.json({ success: true, event });
  } else {
    res.json({ success: false, message: "Already on primary or primary not healthy" });
  }
});

// ── POST /api/admin/egress/quarantine/release ──
router.post("/quarantine/release", (req: Request, res: Response) => {
  const ctrl = getEgressController();
  if (!ctrl) { res.status(503).json({ error: "egress_not_initialized" }); return; }

  const { exchange = "binance", pathId } = req.body ?? {};
  if (!pathId) { res.status(400).json({ error: "pathId required" }); return; }

  ctrl.releaseQuarantine(exchange, pathId);
  console.log(`[EgressAdmin] Released quarantine: ${exchange}/${pathId}`);
  res.json({ success: true, message: `Path ${pathId} released from quarantine` });
});

// ── POST /api/admin/egress/probe ──
router.post("/probe", async (req: Request, res: Response) => {
  const ctrl = getEgressController();
  if (!ctrl) { res.status(503).json({ error: "egress_not_initialized" }); return; }

  const { exchange = "binance", pathId } = req.body ?? {};
  if (!pathId) { res.status(400).json({ error: "pathId required" }); return; }

  const result = await ctrl.forceProbe(exchange, pathId);
  res.json({ pathId, probeResult: result });
});

export default router;
