import type { Express } from "express";
import type { ExchangeCoreService } from "../services/exchangeCore/exchangeCoreService.ts";
import { KillSwitch, type KillSwitchLevel } from "../services/exchangeCore/killSwitch.ts";
import { TradeTracer } from "../services/exchangeCore/tracer.ts";
import type { AuthService } from "../payments/authService.ts";
import { requireAuth, requireAdmin } from "../middleware/authMiddleware.ts";

const killSwitch = new KillSwitch();
const tracer = new TradeTracer();

export const registerExchangeCoreRoutes = (app: Express, core: ExchangeCoreService, auth?: AuthService) => {
  const authMw = auth ? requireAuth(auth) : (_req: any, _res: any, next: any) => { _req.userId = _req.headers["x-user-id"] ?? "demo-user"; next(); };
  const adminMw = auth ? requireAdmin(auth) : authMw;

  // ── State & Metrics ──────────────────────────────────────────

  app.get("/api/exchange-core/state", (_req, res) => {
    res.json({
      ok: true,
      metrics: core.getMetrics(),
      ts: new Date().toISOString(),
    });
  });

  app.get("/api/exchange-core/intents", authMw, async (req, res) => {
    const userId = req.userId!;
    const items = await core.listIntentsByUser(userId);
    res.json({ ok: true, items, ts: new Date().toISOString() });
  });

  app.get("/api/exchange-core/events", authMw, (req, res) => {
    const userId = req.userId!;
    const items = core.listEventsByUser(userId);
    res.json({ ok: true, items, ts: new Date().toISOString() });
  });

  // ── Kill Switch (admin only) ──────────────────────────────────

  app.get("/api/exchange-core/kill-switch/status", async (_req, res) => {
    const states = await killSwitch.getActiveStates();
    res.json({ ok: true, activeKillSwitches: states, ts: new Date().toISOString() });
  });

  app.post("/api/exchange-core/kill-switch/activate", adminMw, async (req, res) => {
    const userId = req.userId!;
    const { level, target, reason } = req.body as { level: KillSwitchLevel; target: string; reason: string };
    if (!level || !target || !reason) {
      return res.status(400).json({ ok: false, error: "level, target, and reason required" });
    }
    await killSwitch.activate(level, target, userId, reason, false);
    res.json({ ok: true, message: `Kill switch ${level}:${target} activated` });
  });

  app.post("/api/exchange-core/kill-switch/deactivate", adminMw, async (req, res) => {
    const userId = req.userId!;
    const { level, target } = req.body as { level: KillSwitchLevel; target: string };
    if (!level || !target) {
      return res.status(400).json({ ok: false, error: "level and target required" });
    }
    await killSwitch.deactivate(level, target, userId);
    res.json({ ok: true, message: `Kill switch ${level}:${target} deactivated` });
  });

  // ── Trace (admin only) ────────────────────────────────────────

  app.get("/api/exchange-core/trace/:intentId", adminMw, async (req, res) => {
    const events = await tracer.getTrace(req.params.intentId);
    res.json({ ok: true, events, ts: new Date().toISOString() });
  });

  // ── Symbol Info (public — needed by OrderEntryPanel for precision validation) ──

  app.get("/api/exchange-core/symbol-info", async (req, res) => {
    const venue = String(req.query.venue ?? "BINANCE") as any;
    const symbol = String(req.query.symbol ?? "");
    if (!symbol) return res.status(400).json({ ok: false, error: "symbol required" });
    try {
      const info = await core.getSymbolInfo(venue, symbol);
      res.json({ ok: true, info });
    } catch {
      res.json({ ok: true, info: null });
    }
  });
};
