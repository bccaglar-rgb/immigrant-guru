import type { Express } from "express";
import { ExchangeCoreService } from "../services/exchangeCore/exchangeCoreService.ts";

const readUserId = (req: { headers: Record<string, unknown> }): string => {
  const raw = req.headers["x-user-id"];
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (Array.isArray(raw) && typeof raw[0] === "string" && raw[0].trim()) return raw[0].trim();
  return "demo-user";
};

export const registerExchangeCoreRoutes = (app: Express, core: ExchangeCoreService) => {
  app.get("/api/exchange-core/state", (_req, res) => {
    res.json({
      ok: true,
      metrics: core.getMetrics(),
      ts: new Date().toISOString(),
    });
  });

  app.get("/api/exchange-core/intents", (req, res) => {
    const userId = readUserId(req);
    const items = core.listIntentsByUser(userId);
    res.json({
      ok: true,
      items,
      ts: new Date().toISOString(),
    });
  });

  app.get("/api/exchange-core/events", (req, res) => {
    const userId = readUserId(req);
    const items = core.listEventsByUser(userId);
    res.json({
      ok: true,
      items,
      ts: new Date().toISOString(),
    });
  });
};

