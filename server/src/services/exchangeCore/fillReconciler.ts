/**
 * FillReconciler — Matches exchange fills to order intents.
 * Fetches recent fills from exchange and stores in exchange_fills table.
 */
import { createHmac } from "node:crypto";
import { pool } from "../../db/pool.ts";
import type { ApiVault } from "./apiVault.ts";
import type { CoreVenue } from "./types.ts";

export interface FillRecord {
  intentId: string | null;
  userId: string;
  exchangeAccountId: string;
  venue: string;
  exchangeOrderId: string;
  exchangeTradeId: string | null;
  symbol: string;
  side: string;
  price: number;
  qty: number;
  fee: number | null;
  feeAsset: string | null;
  realizedPnl: number | null;
  filledAt: string;
}

export class FillReconciler {
  private readonly vault: ApiVault;

  constructor(vault: ApiVault) {
    this.vault = vault;
  }

  /** Store a fill from private stream or REST query. */
  async recordFill(fill: FillRecord): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO exchange_fills
           (intent_id, user_id, exchange_account_id, venue, exchange_order_id,
            exchange_trade_id, symbol, side, price, qty, fee, fee_asset,
            realized_pnl, filled_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT DO NOTHING`,
        [
          fill.intentId, fill.userId, fill.exchangeAccountId, fill.venue,
          fill.exchangeOrderId, fill.exchangeTradeId, fill.symbol, fill.side,
          fill.price, fill.qty, fill.fee, fill.feeAsset,
          fill.realizedPnl, fill.filledAt,
        ],
      );
    } catch (err: any) {
      console.error("[FillReconciler] Record failed:", err?.message);
    }
  }

  /** Fetch recent fills from exchange and match to intents. */
  async reconcileFills(
    userId: string,
    exchangeAccountId: string,
    venue: CoreVenue,
  ): Promise<{ matched: number; unmatched: number }> {
    const creds = await this.vault.getCredentials(userId, exchangeAccountId, "fill_reconciliation");
    if (!creds) return { matched: 0, unmatched: 0 };

    let fills: FillRecord[] = [];
    try {
      if (venue === "BINANCE") {
        fills = await this.fetchBinanceFills(creds, userId, exchangeAccountId);
      } else if (venue === "GATEIO") {
        fills = await this.fetchGateFills(creds, userId, exchangeAccountId);
      }
    } catch (err: any) {
      console.error(`[FillReconciler] Fetch failed for ${venue}:`, err?.message);
      return { matched: 0, unmatched: 0 };
    }

    let matched = 0;
    let unmatched = 0;

    for (const fill of fills) {
      // Try to match to an intent by exchange_order_id
      if (fill.exchangeOrderId) {
        const { rows } = await pool.query(
          `SELECT id FROM order_intents WHERE exchange_order_id = $1 AND user_id = $2 LIMIT 1`,
          [fill.exchangeOrderId, userId],
        );
        if (rows[0]) {
          fill.intentId = String(rows[0].id);
          matched++;
        } else {
          unmatched++;
        }
      } else {
        unmatched++;
      }
      await this.recordFill(fill);
    }

    return { matched, unmatched };
  }

  private async fetchBinanceFills(
    creds: { apiKey: string; apiSecret: string },
    userId: string,
    exchangeAccountId: string,
  ): Promise<FillRecord[]> {
    const ts = Date.now();
    const params = `timestamp=${ts}&recvWindow=10000&limit=100`;
    const signature = createHmac("sha256", creds.apiSecret).update(params).digest("hex");

    const res = await fetch(
      `https://fapi.binance.com/fapi/v1/userTrades?${params}&signature=${signature}`,
      { headers: { "X-MBX-APIKEY": creds.apiKey } },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as Array<Record<string, any>>;

    return data.map((t) => ({
      intentId: null,
      userId,
      exchangeAccountId,
      venue: "BINANCE",
      exchangeOrderId: String(t.orderId ?? ""),
      exchangeTradeId: String(t.id ?? ""),
      symbol: String(t.symbol ?? ""),
      side: String(t.side ?? ""),
      price: Number(t.price ?? 0),
      qty: Number(t.qty ?? 0),
      fee: Number(t.commission ?? 0),
      feeAsset: String(t.commissionAsset ?? "USDT"),
      realizedPnl: Number(t.realizedPnl ?? 0),
      filledAt: new Date(Number(t.time ?? Date.now())).toISOString(),
    }));
  }

  private async fetchGateFills(
    creds: { apiKey: string; apiSecret: string },
    userId: string,
    exchangeAccountId: string,
  ): Promise<FillRecord[]> {
    const path = "/api/v4/futures/usdt/my_trades";
    const ts = Math.floor(Date.now() / 1000);
    const query = "limit=100";

    const bodyHash = createHmac("sha512", "").update("").digest("hex");
    const signStr = `GET\n${path}\n${query}\n${bodyHash}\n${ts}`;
    const signature = createHmac("sha512", creds.apiSecret).update(signStr).digest("hex");

    const res = await fetch(`https://fx-api.gateio.ws${path}?${query}`, {
      headers: {
        KEY: creds.apiKey,
        SIGN: signature,
        Timestamp: String(ts),
      },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as Array<Record<string, any>>;

    return data.map((t) => ({
      intentId: null,
      userId,
      exchangeAccountId,
      venue: "GATEIO",
      exchangeOrderId: String(t.order_id ?? ""),
      exchangeTradeId: String(t.id ?? ""),
      symbol: String(t.contract ?? "").replace(/_/g, ""),
      side: Number(t.size ?? 0) >= 0 ? "BUY" : "SELL",
      price: Number(t.price ?? 0),
      qty: Math.abs(Number(t.size ?? 0)),
      fee: Number(t.fee ?? 0),
      feeAsset: "USDT",
      realizedPnl: Number(t.pnl ?? 0),
      filledAt: new Date(Number(t.create_time_ms ?? Date.now())).toISOString(),
    }));
  }
}
