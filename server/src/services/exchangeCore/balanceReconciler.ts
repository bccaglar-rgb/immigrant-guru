/**
 * BalanceReconciler — Periodic balance snapshots and discrepancy detection.
 */
import { createHmac } from "node:crypto";
import { pool } from "../../db/pool.ts";
import type { ApiVault } from "./apiVault.ts";
import type { CoreVenue } from "./types.ts";

export interface BalanceSnapshot {
  userId: string;
  exchangeAccountId: string;
  venue: string;
  asset: string;
  available: number;
  total: number;
}

export interface BalanceDiscrepancy {
  asset: string;
  expected: number;
  actual: number;
  diff: number;
}

export class BalanceReconciler {
  private readonly vault: ApiVault;

  constructor(vault: ApiVault) {
    this.vault = vault;
  }

  async reconcileBalances(
    userId: string,
    exchangeAccountId: string,
    venue: CoreVenue,
  ): Promise<{ balances: BalanceSnapshot[]; discrepancies: BalanceDiscrepancy[] }> {
    const creds = await this.vault.getCredentials(userId, exchangeAccountId, "balance_reconciliation");
    if (!creds) return { balances: [], discrepancies: [] };

    let balances: BalanceSnapshot[] = [];
    try {
      if (venue === "BINANCE") {
        balances = await this.fetchBinanceBalances(creds, userId, exchangeAccountId);
      } else if (venue === "GATEIO") {
        balances = await this.fetchGateBalances(creds, userId, exchangeAccountId);
      }
    } catch (err: any) {
      console.error(`[BalanceReconciler] Fetch failed for ${venue}:`, err?.message);
      return { balances: [], discrepancies: [] };
    }

    const discrepancies: BalanceDiscrepancy[] = [];

    // Compare with last known snapshot
    for (const balance of balances) {
      const { rows } = await pool.query(
        `SELECT available, total FROM balance_snapshots
         WHERE user_id = $1 AND exchange_account_id = $2 AND asset = $3
         ORDER BY snapshot_at DESC LIMIT 1`,
        [userId, exchangeAccountId, balance.asset],
      );

      if (rows[0]) {
        const prevTotal = Number(rows[0].total);
        const diff = Math.abs(balance.total - prevTotal);
        // Flag discrepancy if change > 1% and > $1
        if (diff > 1 && diff / prevTotal > 0.01) {
          discrepancies.push({
            asset: balance.asset,
            expected: prevTotal,
            actual: balance.total,
            diff: balance.total - prevTotal,
          });
        }
      }

      // Persist new snapshot
      await pool.query(
        `INSERT INTO balance_snapshots
           (user_id, exchange_account_id, venue, asset, available, total, snapshot_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [userId, exchangeAccountId, venue, balance.asset, balance.available, balance.total],
      );
    }

    if (discrepancies.length > 0) {
      console.warn(`[BalanceReconciler] ${discrepancies.length} discrepancies for ${exchangeAccountId}`);
    }

    return { balances, discrepancies };
  }

  private async fetchBinanceBalances(
    creds: { apiKey: string; apiSecret: string },
    userId: string,
    exchangeAccountId: string,
  ): Promise<BalanceSnapshot[]> {
    const ts = Date.now();
    const params = `timestamp=${ts}&recvWindow=10000`;
    const signature = createHmac("sha256", creds.apiSecret).update(params).digest("hex");

    const res = await fetch(
      `https://fapi.binance.com/fapi/v2/balance?${params}&signature=${signature}`,
      { headers: { "X-MBX-APIKEY": creds.apiKey } },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as Array<{ asset: string; availableBalance: string; balance: string }>;

    return data
      .filter((b) => Number(b.balance) > 0)
      .map((b) => ({
        userId,
        exchangeAccountId,
        venue: "BINANCE",
        asset: b.asset,
        available: Number(b.availableBalance),
        total: Number(b.balance),
      }));
  }

  private async fetchGateBalances(
    creds: { apiKey: string; apiSecret: string },
    userId: string,
    exchangeAccountId: string,
  ): Promise<BalanceSnapshot[]> {
    const path = "/api/v4/futures/usdt/accounts";
    const ts = Math.floor(Date.now() / 1000);
    const bodyHash = createHmac("sha512", "").update("").digest("hex");
    const signStr = `GET\n${path}\n\n${bodyHash}\n${ts}`;
    const signature = createHmac("sha512", creds.apiSecret).update(signStr).digest("hex");

    const res = await fetch(`https://fx-api.gateio.ws${path}`, {
      headers: { KEY: creds.apiKey, SIGN: signature, Timestamp: String(ts) },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { available: string; total: string; currency: string };

    return [{
      userId,
      exchangeAccountId,
      venue: "GATEIO",
      asset: data.currency ?? "USDT",
      available: Number(data.available ?? 0),
      total: Number(data.total ?? 0),
    }];
  }
}
