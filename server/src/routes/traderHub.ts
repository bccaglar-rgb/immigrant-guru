import type { Express, Request } from "express";
import { TraderHubEngine } from "../services/traderHub/traderHubEngine.ts";
import type { CoinPoolConfig, CoinPoolSourceType, TraderAiModule, TraderExchange, TraderRunStatus } from "../services/traderHub/types.ts";
import { botCreate } from "../middleware/rateLimit.ts";
import { requireBotTier } from "../middleware/tierEnforcement.ts";

const readUserId = (req: Request): string => {
  const raw = req.headers["x-user-id"];
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (Array.isArray(raw) && raw[0]?.trim()) return raw[0].trim();
  return "demo-user";
};

const normalizeAiModule = (value: unknown): TraderAiModule => (String(value ?? "").toUpperCase() === "QWEN" ? "QWEN" : "CHATGPT");

const normalizeExchange = (value: unknown): TraderExchange => {
  const raw = String(value ?? "").toUpperCase();
  if (raw.includes("BINANCE")) return "BINANCE";
  if (raw.includes("GATE")) return "GATEIO";
  return "AUTO";
};

const normalizeTimeframe = (value: unknown): "1m" | "5m" | "15m" | "30m" | "1h" => {
  const raw = String(value ?? "").trim();
  if (raw === "1m") return "1m";
  if (raw === "5m") return "5m";
  if (raw === "30m") return "30m";
  if (raw === "1h") return "1h";
  return "15m";
};

const normalizeStatus = (value: unknown): TraderRunStatus => {
  const raw = String(value ?? "").toUpperCase();
  if (raw === "RUNNING") return "RUNNING";
  if (raw === "ERROR") return "ERROR";
  return "STOPPED";
};

const normalizeSymbol = (value: unknown): string => {
  const raw = String(value ?? "").toUpperCase().replace(/[-_/]/g, "").trim();
  if (!raw) return "BTCUSDT";
  if (raw === "MULTI") return "MULTI"; // multi-coin pool traders
  return raw.endsWith("USDT") ? raw : `${raw}USDT`;
};

const VALID_SOURCES: CoinPoolSourceType[] = ["STATIC_LIST", "SNIPER", "OI_INCREASE", "OI_DECREASE", "COIN_UNIVERSE"];

const normalizeCoinPool = (value: unknown): CoinPoolConfig | null => {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const sourceTypes = Array.isArray(raw.sourceTypes)
    ? (raw.sourceTypes as unknown[]).filter((s): s is CoinPoolSourceType =>
        typeof s === "string" && VALID_SOURCES.includes(s as CoinPoolSourceType),
      )
    : [];
  if (sourceTypes.length === 0) return null;
  return {
    sourceTypes,
    maxCoins: Math.max(1, Math.min(100, Number(raw.maxCoins) || 10)),
    sniperLimit: Math.max(1, Math.min(100, Number(raw.sniperLimit) || 10)),
    oiIncreaseLimit: Math.max(1, Math.min(100, Number(raw.oiIncreaseLimit) || 10)),
    oiDecreaseLimit: Math.max(1, Math.min(100, Number(raw.oiDecreaseLimit) || 10)),
    coinUniverseLimit: Math.max(1, Math.min(100, Number(raw.coinUniverseLimit) || 10)),
    staticCoins: Array.isArray(raw.staticCoins)
      ? (raw.staticCoins as unknown[]).map((s) => normalizeSymbol(s)).slice(0, 100)
      : [],
  };
};

export const registerTraderHubRoutes = (app: Express, traderHub: TraderHubEngine) => {
  app.get("/api/trader-hub/state", async (_req, res) => {
    const metrics = await traderHub.getMetrics();
    res.json({
      ok: true,
      metrics,
      ts: new Date().toISOString(),
    });
  });

  app.get("/api/trader-hub/traders", async (req, res) => {
    const userId = readUserId(req);
    const scope = String(req.query.scope ?? "user").toLowerCase();
    const items = scope === "all" ? await traderHub.listAll() : await traderHub.listByUser(userId);
    res.json({
      ok: true,
      items,
      ts: new Date().toISOString(),
    });
  });

  app.post("/api/trader-hub/traders", botCreate, requireBotTier(), async (req, res) => {
    const userId = readUserId(req);
    const name = String(req.body?.name ?? "").trim();
    if (!name) return res.status(400).json({ ok: false, error: "name_required" });
    try {
      const created = await traderHub.createTrader({
        userId,
        name,
        aiModule: normalizeAiModule(req.body?.aiModule),
        exchange: normalizeExchange(req.body?.exchange),
        exchangeAccountId: String(req.body?.exchangeAccountId ?? "").trim(),
        exchangeAccountName: String(req.body?.exchangeAccountName ?? "Auto").trim() || "Auto",
        strategyId: String(req.body?.strategyId ?? "strategy-default").trim() || "strategy-default",
        strategyName: String(req.body?.strategyName ?? "Default Strategy").trim() || "Default Strategy",
        symbol: normalizeSymbol(req.body?.symbol),
        timeframe: normalizeTimeframe(req.body?.timeframe),
        scanIntervalSec: Math.max(30, Math.min(600, Number(req.body?.scanIntervalSec ?? 180) || 180)),
        coinPool: normalizeCoinPool(req.body?.coinPool),
      });
      return res.json({ ok: true, item: created });
    } catch (err: any) {
      const message = err?.message ?? "create_failed";
      if (message.includes("Bot limit")) {
        return res.status(429).json({ ok: false, error: "bot_limit_reached", message });
      }
      return res.status(500).json({ ok: false, error: "create_failed", message });
    }
  });

  app.get("/api/trader-hub/traders/:id/scans", async (req, res) => {
    const id = String(req.params.id ?? "").trim();
    if (!id) return res.status(400).json({ ok: false, error: "id_required" });
    const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 100) || 100));
    try {
      const scans = await traderHub.listBotScans(id, limit);
      return res.json({ ok: true, scans, ts: new Date().toISOString() });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: "scan_fetch_failed", message: err?.message ?? "Unknown" });
    }
  });

  app.post("/api/trader-hub/traders/:id/status", async (req, res) => {
    const id = String(req.params.id ?? "").trim();
    if (!id) return res.status(400).json({ ok: false, error: "id_required" });
    const status = normalizeStatus(req.body?.status);
    const updated = await traderHub.updateStatus(id, status);
    if (!updated) return res.status(404).json({ ok: false, error: "not_found" });
    return res.json({ ok: true, item: updated });
  });

  app.delete("/api/trader-hub/traders/:id", async (req, res) => {
    const id = String(req.params.id ?? "").trim();
    if (!id) return res.status(400).json({ ok: false, error: "id_required" });
    const deleted = await traderHub.deleteTrader(id);
    if (!deleted) return res.status(404).json({ ok: false, error: "not_found" });
    return res.json({ ok: true, deleted: true });
  });

  /* ── Take Profit — manually close a virtual position ───── */
  app.post("/api/trader-hub/traders/:id/take-profit", async (req, res) => {
    const id = String(req.params.id ?? "").trim();
    if (!id) return res.status(400).json({ ok: false, error: "id_required" });
    const symbol = String(req.body?.symbol ?? "").toUpperCase().trim();
    if (!symbol) return res.status(400).json({ ok: false, error: "symbol_required" });
    try {
      const result = await traderHub.takeProfit(id, symbol);
      return res.json({ ok: true, ...result });
    } catch (err: any) {
      return res.status(400).json({ ok: false, error: "take_profit_failed", message: err?.message ?? "Unknown" });
    }
  });

  /* ── Get open virtual positions for a trader ───── */
  app.get("/api/trader-hub/traders/:id/positions", async (req, res) => {
    const id = String(req.params.id ?? "").trim();
    if (!id) return res.status(400).json({ ok: false, error: "id_required" });
    try {
      const positions = await traderHub.getOpenPositions(id);
      return res.json({ ok: true, positions, ts: new Date().toISOString() });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: "positions_fetch_failed", message: err?.message ?? "Unknown" });
    }
  });
};
