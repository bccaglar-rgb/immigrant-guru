import type { Express } from "express";
import { ExchangeManager } from "../exchangeManager/ExchangeManager.ts";
import type { AuthService } from "../payments/authService.ts";
import { requireAuth } from "../middleware/authMiddleware.ts";

export const registerPortfolioRoutes = (app: Express, manager: ExchangeManager, auth?: AuthService) => {
  const authMw = auth ? requireAuth(auth) : (_req: any, _res: any, next: any) => { _req.userId = _req.headers["x-user-id"] ?? "demo-user"; next(); };

  app.get("/api/portfolio", authMw, async (req, res) => {
    try {
      const userId = req.userId!;
      const exchanges = await manager.list(userId);

      const snapshotResults = await Promise.allSettled(
        exchanges.map(async (ex) => {
          const snapshot = await manager.getAccountSnapshot(userId, ex.exchangeId, undefined, ex.accountName);
          return { exchange: ex, snapshot };
        }),
      );

      const accounts: Array<{
        connectionId?: string;
        exchangeId: string;
        exchangeDisplayName: string;
        accountName: string;
        status: string;
        enabled: boolean;
        environment?: string;
        balances: Array<{ asset: string; available: number; total: number; wallet?: string }>;
        spotBalances: Array<{ asset: string; available: number; total: number }>;
        positions: Array<{
          id: string;
          symbol: string;
          side: string;
          size: number;
          entry: number;
          mark: number;
          pnl: number;
          liquidation: number;
          leverage: number;
        }>;
        openOrders: Array<Record<string, unknown>>;
        fetchedAt: string;
        error?: string;
      }> = [];

      for (let i = 0; i < snapshotResults.length; i++) {
        const result = snapshotResults[i];
        const exchange = exchanges[i];
        if (result.status === "fulfilled") {
          const { snapshot } = result.value;
          const allBalances = (snapshot.balances ?? []) as Array<{ asset: string; available: number; total: number; wallet?: string }>;
          // Split into futures and spot based on wallet tag
          const spotBalances = allBalances.filter((b: any) => b.wallet === "spot").map(({ asset, available, total }) => ({ asset, available, total }));
          const futuresBalances = allBalances.filter((b: any) => b.wallet !== "spot").map(({ asset, available, total }) => ({ asset, available, total }));

          accounts.push({
            connectionId: exchange.id,
            exchangeId: exchange.exchangeId,
            exchangeDisplayName: exchange.exchangeDisplayName,
            accountName: exchange.accountName ?? "Main",
            status: exchange.status,
            enabled: exchange.enabled,
            environment: exchange.environment,
            balances: futuresBalances.length > 0 ? futuresBalances : allBalances.map(({ asset, available, total }) => ({ asset, available, total })),
            spotBalances,
            positions: snapshot.positions ?? [],
            openOrders: snapshot.openOrders ?? [],
            fetchedAt: snapshot.fetchedAt ?? new Date().toISOString(),
          });
        } else {
          console.error(`[Portfolio] Snapshot failed for ${exchange.exchangeId}/${exchange.accountName}:`, result.reason?.message ?? result.reason);
          accounts.push({
            connectionId: exchange.id,
            exchangeId: exchange.exchangeId,
            exchangeDisplayName: exchange.exchangeDisplayName,
            accountName: exchange.accountName ?? "Main",
            status: "ERROR",
            enabled: exchange.enabled,
            environment: exchange.environment,
            balances: [],
            spotBalances: [],
            positions: [],
            openOrders: [],
            fetchedAt: new Date().toISOString(),
            error: result.reason?.message ?? "Failed to fetch account data",
          });
        }
      }

      return res.json({ ok: true, accounts });
    } catch (err: any) {
      console.error("[Portfolio] Route error:", err?.message ?? err);
      return res.status(500).json({ ok: false, error: err?.message ?? "portfolio_failed" });
    }
  });
};
