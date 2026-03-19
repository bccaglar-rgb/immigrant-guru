import type { Express } from "express";
import { ExchangeManager } from "../exchangeManager/ExchangeManager.ts";
import type { AuthService } from "../payments/authService.ts";
import { requireAuth } from "../middleware/authMiddleware.ts";

export const registerExchangeRoutes = (app: Express, manager: ExchangeManager, auth?: AuthService) => {
  const authMw = auth ? requireAuth(auth) : (_req: any, _res: any, next: any) => { _req.userId = _req.headers["x-user-id"] ?? "demo-user"; next(); };

  app.post("/api/exchanges/connect", authMw, async (req, res) => {
    try {
      const userId = req.userId!;
      const { exchangeId, credentials, options } = req.body ?? {};
      if (!exchangeId || !credentials) {
        return res.status(400).json({ ok: false, error: "missing_exchange_or_credentials" });
      }
      const report = await manager.connect(userId, {
        exchangeId: String(exchangeId),
        credentials: {
          apiKey: String(credentials.apiKey ?? ""),
          apiSecret: String(credentials.apiSecret ?? ""),
          ...(credentials.passphrase ? { passphrase: String(credentials.passphrase) } : {}),
          ...(credentials.subaccount ? { subaccount: String(credentials.subaccount) } : {}),
        },
        options,
        accountName: options?.accountName ? String(options.accountName) : undefined,
      });
      return res.json({ ok: true, report });
    } catch (err: any) {
      const code = err?.code ?? err?.issue?.code ?? "UNKNOWN";
      const message = err?.message ?? err?.issue?.message ?? "connect_failed";
      return res.status(500).json({ ok: false, error: code, message });
    }
  });

  app.get("/api/exchanges", authMw, async (req, res) => {
    try {
      const userId = req.userId!;
      const exchanges = await manager.list(userId);
      return res.json({ ok: true, exchanges });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message ?? "list_failed" });
    }
  });

  app.get("/api/exchanges/:exchangeId/symbols", authMw, async (req, res) => {
    try {
      const userId = req.userId!;
      const data = await manager.getSymbols(userId, req.params.exchangeId, String(req.query.marketType ?? ""));
      return res.json({ ok: true, ...data });
    } catch (err: any) {
      const code = err?.code ?? err?.issue?.code ?? "UNKNOWN";
      return res.status(500).json({ ok: false, error: code, message: err?.message ?? "symbols_failed" });
    }
  });

  app.get("/api/exchanges/:exchangeId/status", authMw, async (req, res) => {
    try {
      const userId = req.userId!;
      const report = await manager.getStatus(userId, req.params.exchangeId);
      if (!report) return res.status(404).json({ ok: false, error: "not_found" });
      return res.json({ ok: true, report, checkedAt: report.checkedAt });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message ?? "status_failed" });
    }
  });

  app.get("/api/exchanges/:exchangeId/account", authMw, async (req, res) => {
    try {
      const userId = req.userId!;
      const symbol = String(req.query.symbol ?? "BTCUSDT");
      const accountName = req.query.accountName ? String(req.query.accountName) : undefined;
      const data = await manager.getAccountSnapshot(userId, req.params.exchangeId, symbol, accountName);
      return res.json({ ok: true, ...data });
    } catch (err: any) {
      const code = err?.code ?? err?.issue?.code ?? "UNKNOWN";
      const message = err?.message ?? err?.issue?.message ?? "account_snapshot_failed";
      return res.status(500).json({ ok: false, error: code, message });
    }
  });

  app.delete("/api/exchanges/:exchangeId", authMw, async (req, res) => {
    try {
      const userId = req.userId!;
      const accountName = req.query.accountName ? String(req.query.accountName) : undefined;
      await manager.removeConnection(userId, req.params.exchangeId, accountName);
      return res.json({ ok: true });
    } catch (err: any) {
      const code = err?.code ?? err?.issue?.code ?? "UNKNOWN";
      const message = err?.message ?? err?.issue?.message ?? "delete_failed";
      return res.status(500).json({ ok: false, error: code, message });
    }
  });
};
