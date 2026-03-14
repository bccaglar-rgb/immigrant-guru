import type { Express } from "express";
import { AuditLogService } from "../services/auditLog.ts";
import type { ConnectionService } from "../services/connectionService.ts";

const normalizeExchangeId = (raw: string): string | null => {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "binance") return "binance";
  if (value === "bybit") return "bybit";
  if (value === "okx") return "okx";
  if (value === "gate.io" || value === "gateio" || value === "gate") return "gate";
  return null;
};

export const registerTradeRoutes = (app: Express, audit: AuditLogService, connections: ConnectionService) => {
  app.post("/api/trade/place", async (req, res) => {
    const userId = String(req.headers["x-user-id"] ?? "demo-user");
    const payload = req.body;
    const exchangeId = normalizeExchangeId(String(payload.exchange ?? ""));
    if (!exchangeId) {
      return res.status(400).json({ ok: false, error: "unsupported_exchange" });
    }
    const userConnections = await connections.listExchangeConnections(userId);
    const hasConnectedExchange = userConnections.some(
      (row) => row.exchangeId === exchangeId && row.enabled && row.status !== "FAILED",
    );
    if (!hasConnectedExchange) {
      return res.status(403).json({
        ok: false,
        error: "CONNECT_EXCHANGE_REQUIRED",
        message: "Connect your own exchange API before trading with AI bot.",
      });
    }
    const response = { orderId: `ord_${Date.now()}`, status: "accepted" };
    await audit.write({
      userId,
      exchange: String(payload.exchange ?? "unknown"),
      symbol: String(payload.symbol ?? ""),
      action: "TRADE_PLACE",
      payload,
      response,
      ip: req.ip,
      createdAt: new Date().toISOString(),
    });
    res.json(response);
  });

  app.post("/api/trade/cancel", async (req, res) => {
    const userId = String(req.headers["x-user-id"] ?? "demo-user");
    const payload = req.body;
    const exchangeId = normalizeExchangeId(String(payload.exchange ?? ""));
    if (!exchangeId) {
      return res.status(400).json({ ok: false, error: "unsupported_exchange" });
    }
    const userConnections = await connections.listExchangeConnections(userId);
    const hasConnectedExchange = userConnections.some(
      (row) => row.exchangeId === exchangeId && row.enabled && row.status !== "FAILED",
    );
    if (!hasConnectedExchange) {
      return res.status(403).json({
        ok: false,
        error: "CONNECT_EXCHANGE_REQUIRED",
        message: "Connect your own exchange API before managing AI bot orders.",
      });
    }
    const response = { status: "cancelled" };
    await audit.write({
      userId,
      exchange: String(payload.exchange ?? "unknown"),
      symbol: String(payload.symbol ?? ""),
      action: "TRADE_CANCEL",
      payload,
      response,
      ip: req.ip,
      createdAt: new Date().toISOString(),
    });
    res.json(response);
  });
};
