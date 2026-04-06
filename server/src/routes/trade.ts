import type { Express } from "express";
import crypto from "crypto";
import { AuditLogService } from "../services/auditLog.ts";
import type { ConnectionService } from "../services/connectionService.ts";
import type { ExchangeCoreService } from "../services/exchangeCore/exchangeCoreService.ts";
import type { CoreVenue, CoreTpSlSpec } from "../services/exchangeCore/types.ts";
import type { AuthService } from "../payments/authService.ts";
import { requireAuth } from "../middleware/authMiddleware.ts";

const VALID_SIDES = ["BUY", "SELL"] as const;
const VALID_ORDER_TYPES = ["MARKET", "LIMIT", "STOP_LIMIT"] as const;
const LIMIT_LIKE_TYPES = new Set(["LIMIT", "STOP_LIMIT"]);

const normalizeExchangeId = (raw: string): string | null => {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "binance") return "binance";
  if (value === "bybit") return "bybit";
  if (value === "okx") return "okx";
  if (value === "gate.io" || value === "gateio" || value === "gate") return "gate";
  return null;
};

const toVenueCode = (exchangeId: string): CoreVenue | null => {
  if (exchangeId === "binance") return "BINANCE";
  if (exchangeId === "gate") return "GATEIO";
  if (exchangeId === "bybit") return "BYBIT";
  if (exchangeId === "okx") return "OKX";
  return null;
};

export const registerTradeRoutes = (
  app: Express,
  audit: AuditLogService,
  connections: ConnectionService,
  exchangeCore?: ExchangeCoreService,
  auth?: AuthService,
) => {
  const authMw = auth ? requireAuth(auth) : (_req: any, _res: any, next: any) => { _req.userId = _req.headers["x-user-id"] ?? "demo-user"; next(); };

  app.post("/api/trade/place", authMw, async (req, res) => {
    const userId = req.userId!;
    const payload = req.body;
    const exchangeId = normalizeExchangeId(String(payload.exchange ?? ""));
    if (!exchangeId) {
      return res.status(400).json({ ok: false, error: "unsupported_exchange" });
    }

    // --- Required fields validation ---
    const missingFields: string[] = [];
    if (!payload.exchange) missingFields.push("exchange");
    if (!payload.symbol) missingFields.push("symbol");
    if (!payload.side) missingFields.push("side");
    if (!payload.orderType) missingFields.push("orderType");
    if (payload.qty == null && payload.notionalUsdt == null) missingFields.push("qty or notionalUsdt");
    if (missingFields.length > 0) {
      return res.status(400).json({ ok: false, error: "MISSING_FIELDS", fields: missingFields });
    }

    // --- Side validation ---
    const side = String(payload.side).toUpperCase();
    if (!VALID_SIDES.includes(side as any)) {
      return res.status(400).json({ ok: false, error: "INVALID_SIDE", message: `side must be one of: ${VALID_SIDES.join(", ")}` });
    }

    // --- Order type validation ---
    const orderType = String(payload.orderType).toUpperCase().replace(/[\s-]+/g, "_");
    if (!VALID_ORDER_TYPES.includes(orderType as any)) {
      return res.status(400).json({ ok: false, error: "INVALID_ORDER_TYPE", message: `orderType must be one of: ${VALID_ORDER_TYPES.join(", ")}` });
    }

    // --- Amount validation ---
    const amount = payload.qty != null ? Number(payload.qty) : Number(payload.notionalUsdt);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ ok: false, error: "INVALID_AMOUNT", message: "qty/notionalUsdt must be a positive number" });
    }

    // --- Price validation (required for Limit-like orders) ---
    if (LIMIT_LIKE_TYPES.has(orderType)) {
      const price = payload.price != null ? Number(payload.price) : NaN;
      if (!Number.isFinite(price) || price <= 0) {
        return res.status(400).json({ ok: false, error: "INVALID_PRICE", message: "price is required and must be positive for Limit / Stop Limit orders" });
      }
    }

    // --- Generate client_order_id for idempotency ---
    const clientOrderId = payload.clientOrderId
      ? String(payload.clientOrderId)
      : `bit_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

    // --- Structured logging ---
    console.log(JSON.stringify({
      level: "info",
      event: "order_attempt",
      userId,
      exchange: exchangeId,
      symbol: String(payload.symbol),
      side,
      orderType,
      qty: payload.qty ?? null,
      notionalUsdt: payload.notionalUsdt ?? null,
      price: payload.price ?? null,
      leverage: payload.leverage ?? null,
      reduceOnly: Boolean(payload.reduceOnly),
      clientOrderId,
      ip: req.ip,
      ts: new Date().toISOString(),
    }));

    const venue = toVenueCode(exchangeId);
    if (!venue || !exchangeCore) {
      // Fallback for unsupported venues or missing exchangeCore (shouldn't happen in production)
      const userConnections = await connections.listExchangeConnections(userId);
      const hasConnectedExchange = userConnections.some(
        (row) => row.exchangeId === exchangeId && row.enabled && row.status !== "FAILED",
      );
      if (!hasConnectedExchange) {
        return res.status(403).json({
          ok: false,
          error: "CONNECT_EXCHANGE_REQUIRED",
          message: "Connect your own exchange API before trading.",
        });
      }
      // Legacy fallback: return mock orderId for unsupported venues
      const response = { orderId: `ord_${Date.now()}`, status: "accepted", mode: "legacy" };
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
      return res.json(response);
    }

    // Find the user's exchange account for this venue
    const userConnections = await connections.listExchangeConnections(userId);
    const account = userConnections.find(
      (row) => row.exchangeId === exchangeId && row.enabled && row.status !== "FAILED",
    );
    if (!account) {
      return res.status(403).json({
        ok: false,
        error: "CONNECT_EXCHANGE_REQUIRED",
        message: "Connect your own exchange API before trading.",
      });
    }

    // Parse TP/SL from payload
    const parseTpSl = (raw: unknown): CoreTpSlSpec | null => {
      if (!raw || typeof raw !== "object") return null;
      const obj = raw as Record<string, unknown>;
      const mode = String(obj.mode ?? "PERCENT").toUpperCase();
      const value = Number(obj.value ?? 0);
      if (!value || (mode !== "PERCENT" && mode !== "PRICE")) return null;
      return { mode: mode as "PERCENT" | "PRICE", value };
    };

    try {
      const intent = await exchangeCore.submitManualIntent({
        userId,
        exchangeAccountId: account.id,
        venue,
        symbolInternal: String(payload.symbol ?? "BTCUSDT"),
        side: String(payload.side ?? "BUY").toUpperCase() as "BUY" | "SELL",
        orderType: String(payload.orderType ?? "MARKET").toUpperCase() as "MARKET" | "LIMIT" | "STOP" | "TAKE_PROFIT",
        timeInForce: payload.timeInForce ? String(payload.timeInForce).toUpperCase() as "GTC" | "IOC" | "FOK" | "POST_ONLY" : null,
        qty: payload.qty != null ? Number(payload.qty) : null,
        notionalUsdt: payload.notionalUsdt != null ? Number(payload.notionalUsdt) : null,
        price: payload.price != null ? Number(payload.price) : null,
        leverage: payload.leverage != null ? Number(payload.leverage) : null,
        reduceOnly: Boolean(payload.reduceOnly),
        tp: parseTpSl(payload.tp),
        sl: parseTpSl(payload.sl),
        clientOrderId,
      });

      const response = {
        ok: intent.state !== "REJECTED",
        intentId: intent.id,
        clientOrderId: intent.clientOrderId,
        state: intent.state,
        venue: intent.venue,
        symbol: intent.symbolInternal,
        side: intent.side,
        rejectCode: intent.rejectCode || undefined,
        rejectReason: intent.rejectReason || undefined,
      };

      await audit.write({
        userId,
        exchange: String(payload.exchange ?? "unknown"),
        symbol: intent.symbolInternal,
        action: "TRADE_PLACE",
        payload,
        response,
        ip: req.ip,
        createdAt: new Date().toISOString(),
      });

      const status = intent.state === "REJECTED" ? 400 : 200;
      return res.status(status).json(response);
    } catch (err: any) {
      const message = err?.message ?? "trade_submission_failed";
      console.error(`[trade.place] Error for user ${userId}:`, message);
      return res.status(500).json({ ok: false, error: "INTERNAL_ERROR", message });
    }
  });

  app.post("/api/trade/cancel", authMw, async (req, res) => {
    const userId = req.userId!;
    const payload = req.body;

    if (!exchangeCore) {
      return res.status(503).json({ ok: false, error: "SERVICE_UNAVAILABLE", message: "Exchange core not initialized." });
    }

    const intentId = String(payload.intentId ?? payload.orderId ?? "").trim();
    if (!intentId) {
      return res.status(400).json({ ok: false, error: "MISSING_INTENT_ID", message: "intentId is required." });
    }

    const reason = String(payload.reason ?? "user_requested");

    try {
      const result = await exchangeCore.cancelIntent(intentId, userId, reason);

      await audit.write({
        userId,
        exchange: result.intent?.venue ?? "unknown",
        symbol: result.intent?.symbolInternal ?? "",
        action: "TRADE_CANCEL",
        payload: { intentId, reason },
        response: { ok: result.ok, code: result.code, state: result.intent?.state },
        ip: req.ip,
        createdAt: new Date().toISOString(),
      });

      const status = result.ok ? 200 : result.code === "NOT_FOUND" ? 404 : result.code === "FORBIDDEN" ? 403 : 400;
      return res.status(status).json({
        ok: result.ok,
        intentId,
        state: result.intent?.state,
        code: result.code,
        message: result.message,
      });
    } catch (err: any) {
      const message = err?.message ?? "cancel_failed";
      console.error(`[trade.cancel] Error for user ${userId}:`, message);
      return res.status(500).json({ ok: false, error: "INTERNAL_ERROR", message });
    }
  });

  app.post("/api/trade/cancel-all", authMw, async (req, res) => {
    const userId = req.userId!;
    const payload = req.body;

    if (!exchangeCore) {
      return res.status(503).json({ ok: false, error: "SERVICE_UNAVAILABLE", message: "Exchange core not initialized." });
    }

    try {
      const result = await exchangeCore.cancelAllIntents(userId, {
        exchangeAccountId: payload.exchangeAccountId ? String(payload.exchangeAccountId) : undefined,
        venue: payload.venue ? String(payload.venue) : undefined,
        symbol: payload.symbol ? String(payload.symbol) : undefined,
      });

      await audit.write({
        userId,
        exchange: payload.venue ?? "all",
        symbol: payload.symbol ?? "all",
        action: "TRADE_CANCEL_ALL",
        payload,
        response: { canceled: result.canceled, failed: result.failed },
        ip: req.ip,
        createdAt: new Date().toISOString(),
      });

      return res.json({
        ok: true,
        canceled: result.canceled,
        failed: result.failed,
        results: result.results,
      });
    } catch (err: any) {
      const message = err?.message ?? "cancel_all_failed";
      console.error(`[trade.cancel-all] Error for user ${userId}:`, message);
      return res.status(500).json({ ok: false, error: "INTERNAL_ERROR", message });
    }
  });
};
