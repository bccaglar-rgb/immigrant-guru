/**
 * OrderReconciler — Resolves orders stuck in SENT/QUEUED state.
 *
 * Runs every 30s:
 * 1. SELECT order_intents WHERE state IN ('SENT','QUEUED') AND updated_at < NOW() - 60s
 * 2. Query exchange for each stale intent's order status
 * 3. Update intent state based on exchange response
 * 4. Log reconciliation events
 */
import { createHmac } from "node:crypto";
import { pool } from "../../db/pool.ts";
import { decryptSecret } from "../../security/crypto.ts";
import type { ConnectionService } from "../connectionService.ts";
import type { CoreIntentRecord } from "./types.ts";
import { ExchangeRateLimiter } from "./exchangeRateLimiter.ts";

const RECONCILE_INTERVAL_MS = 30_000;
const STALE_THRESHOLD_S = 60;
const MAX_RECONCILIATION_COUNT = 20; // stop trying after 20 attempts

interface DecryptedCreds {
  apiKey: string;
  apiSecret: string;
}

interface ReconcileResult {
  reconciled: number;
  errors: number;
  skipped: number;
}

const toGateSymbol = (symbol: string): string => {
  const upper = symbol.toUpperCase().replace(/[-_/]/g, "");
  if (upper.endsWith("USDT")) return `${upper.slice(0, -4)}_USDT`;
  return upper;
};

export class OrderReconciler {
  private readonly connections: ConnectionService;
  private readonly encryptionKey: Buffer;
  private readonly rateLimiter: ExchangeRateLimiter;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    connections: ConnectionService,
    encryptionKey: Buffer,
    rateLimiter: ExchangeRateLimiter,
  ) {
    this.connections = connections;
    this.encryptionKey = encryptionKey;
    this.rateLimiter = rateLimiter;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (!this.running) void this.tick();
    }, RECONCILE_INTERVAL_MS);
    console.log("[OrderReconciler] Started (30s interval)");
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tick(): Promise<ReconcileResult> {
    this.running = true;
    const result: ReconcileResult = { reconciled: 0, errors: 0, skipped: 0 };

    try {
      const { rows } = await pool.query(
        `SELECT * FROM order_intents
         WHERE state IN ('SENT', 'QUEUED')
           AND updated_at < NOW() - INTERVAL '${STALE_THRESHOLD_S} seconds'
           AND (reconciliation_count IS NULL OR reconciliation_count < $1)
         ORDER BY updated_at ASC
         LIMIT 50`,
        [MAX_RECONCILIATION_COUNT],
      );

      for (const row of rows) {
        try {
          const venue = String(row.venue);
          const exchangeAccountId = String(row.exchange_account_id);
          const userId = String(row.user_id);
          const intentId = String(row.id);
          const exchangeOrderId = row.exchange_order_id ? String(row.exchange_order_id) : null;
          const clientOrderId = String(row.client_order_id);

          // Rate limit respect
          const allowed = await this.rateLimiter.tryAcquire(venue as "BINANCE" | "GATEIO" | "BYBIT" | "OKX", 2);
          if (!allowed) { result.skipped++; continue; }

          // Decrypt credentials
          const creds = await this.decryptCredentials(userId, exchangeAccountId);
          if (!creds) { result.skipped++; continue; }

          // Query exchange
          let exchangeStatus: { status: string; filledQty: number; avgPrice: number } | null = null;

          if (venue === "BINANCE") {
            exchangeStatus = await this.queryBinanceOrder(creds, String(row.symbol_venue ?? row.symbol_internal), exchangeOrderId, clientOrderId);
          } else if (venue === "GATEIO") {
            exchangeStatus = await this.queryGateOrder(creds, String(row.symbol_venue ?? row.symbol_internal), exchangeOrderId);
          } else if (venue === "BYBIT") {
            exchangeStatus = await this.queryBybitOrder(creds, String(row.symbol_venue ?? row.symbol_internal), exchangeOrderId, clientOrderId);
          } else if (venue === "OKX") {
            exchangeStatus = await this.queryOkxOrder(creds, String(row.symbol_venue ?? row.symbol_internal), exchangeOrderId, clientOrderId);
          }

          if (!exchangeStatus) {
            // Can't determine status — increment counter and skip
            await pool.query(
              `UPDATE order_intents SET
                 reconciliation_count = COALESCE(reconciliation_count, 0) + 1,
                 last_reconciled_at = NOW(),
                 updated_at = NOW()
               WHERE id = $1`,
              [intentId],
            );
            result.skipped++;
            continue;
          }

          // Map exchange status to intent state
          const previousState = String(row.state);
          let newState: string;
          if (exchangeStatus.status === "FILLED" || exchangeStatus.status === "finished") {
            newState = "DONE";
          } else if (exchangeStatus.status === "CANCELED" || exchangeStatus.status === "CANCELLED" || exchangeStatus.status === "cancelled") {
            newState = "CANCELED";
          } else if (exchangeStatus.status === "EXPIRED") {
            newState = "CANCELED";
          } else if (exchangeStatus.status === "REJECTED") {
            newState = "REJECTED";
          } else if (exchangeStatus.status === "NEW" || exchangeStatus.status === "PARTIALLY_FILLED" || exchangeStatus.status === "open") {
            // Still active — just update counters
            await pool.query(
              `UPDATE order_intents SET
                 reconciliation_count = COALESCE(reconciliation_count, 0) + 1,
                 last_reconciled_at = NOW(),
                 fill_qty = COALESCE($2, fill_qty),
                 avg_fill_price = COALESCE($3, avg_fill_price),
                 updated_at = NOW()
               WHERE id = $1`,
              [intentId, exchangeStatus.filledQty || null, exchangeStatus.avgPrice || null],
            );
            result.skipped++;
            continue;
          } else {
            // Unknown status — increment counter
            await pool.query(
              `UPDATE order_intents SET
                 reconciliation_count = COALESCE(reconciliation_count, 0) + 1,
                 last_reconciled_at = NOW(),
                 updated_at = NOW()
               WHERE id = $1`,
              [intentId],
            );
            result.skipped++;
            continue;
          }

          // Update intent to resolved state
          await pool.query(
            `UPDATE order_intents SET
               state = $2,
               fill_qty = COALESCE($3, fill_qty),
               avg_fill_price = COALESCE($4, avg_fill_price),
               reconciliation_count = COALESCE(reconciliation_count, 0) + 1,
               last_reconciled_at = NOW(),
               updated_at = NOW()
             WHERE id = $1`,
            [intentId, newState, exchangeStatus.filledQty || null, exchangeStatus.avgPrice || null],
          );

          // Log reconciliation
          await pool.query(
            `INSERT INTO reconciliation_log
               (intent_id, venue, previous_state, new_state, exchange_status, filled_qty, avg_price, source)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'auto')`,
            [intentId, venue, previousState, newState, exchangeStatus.status,
             exchangeStatus.filledQty || null, exchangeStatus.avgPrice || null],
          );

          result.reconciled++;
          console.log(`[OrderReconciler] ${intentId}: ${previousState} → ${newState} (${exchangeStatus.status})`);
        } catch (err: any) {
          result.errors++;
          console.error(`[OrderReconciler] Error reconciling ${row.id}:`, err?.message);
        }
      }
    } catch (err: any) {
      console.error("[OrderReconciler] Tick failed:", err?.message);
    } finally {
      this.running = false;
    }

    if (result.reconciled > 0 || result.errors > 0) {
      console.log(`[OrderReconciler] Tick complete: ${result.reconciled} reconciled, ${result.errors} errors, ${result.skipped} skipped`);
    }
    return result;
  }

  // ── Exchange Queries ──────────────────────────────────────────

  private async queryBinanceOrder(
    creds: DecryptedCreds,
    symbolVenue: string,
    exchangeOrderId: string | null,
    clientOrderId: string,
  ): Promise<{ status: string; filledQty: number; avgPrice: number } | null> {
    try {
      const base = "https://fapi.binance.com";
      const ts = Date.now();
      const params: Record<string, string> = {
        symbol: symbolVenue,
        timestamp: String(ts),
        recvWindow: "10000",
      };
      if (exchangeOrderId) {
        params.orderId = exchangeOrderId;
      } else {
        params.origClientOrderId = clientOrderId;
      }

      const query = new URLSearchParams(params).toString();
      const signature = createHmac("sha256", creds.apiSecret).update(query).digest("hex");
      const url = `${base}/fapi/v1/order?${query}&signature=${signature}`;

      const res = await fetch(url, {
        headers: { "X-MBX-APIKEY": creds.apiKey },
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { status: string; executedQty: string; avgPrice: string };
      return {
        status: data.status,
        filledQty: Number(data.executedQty) || 0,
        avgPrice: Number(data.avgPrice) || 0,
      };
    } catch {
      return null;
    }
  }

  private async queryGateOrder(
    creds: DecryptedCreds,
    symbolVenue: string,
    exchangeOrderId: string | null,
  ): Promise<{ status: string; filledQty: number; avgPrice: number } | null> {
    if (!exchangeOrderId) return null;
    try {
      const base = "https://fx-api.gateio.ws";
      const gateSymbol = symbolVenue.includes("_") ? symbolVenue : toGateSymbol(symbolVenue);
      const path = `/api/v4/futures/usdt/orders/${exchangeOrderId}`;
      const ts = Math.floor(Date.now() / 1000);

      const bodyHash = createHmac("sha512", "").update("").digest("hex");
      const signStr = `GET\n${path}\n\n${bodyHash}\n${ts}`;
      const signature = createHmac("sha512", creds.apiSecret).update(signStr).digest("hex");

      const res = await fetch(`${base}${path}`, {
        headers: {
          KEY: creds.apiKey,
          SIGN: signature,
          Timestamp: String(ts),
        },
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { status: string; size: number; fill_price: string };
      return {
        status: data.status,
        filledQty: Math.abs(data.size) || 0,
        avgPrice: Number(data.fill_price) || 0,
      };
    } catch {
      return null;
    }
  }

  private async queryBybitOrder(
    creds: DecryptedCreds,
    symbolVenue: string,
    exchangeOrderId: string | null,
    clientOrderId: string,
  ): Promise<{ status: string; filledQty: number; avgPrice: number } | null> {
    try {
      const ts = String(Date.now());
      const recvWindow = "10000";
      const params: Record<string, string> = { category: "linear", symbol: symbolVenue };
      if (exchangeOrderId) params.orderId = exchangeOrderId;
      else params.orderLinkId = clientOrderId;

      const queryStr = new URLSearchParams(params).toString();
      const preSign = ts + creds.apiKey + recvWindow + queryStr;
      const signature = createHmac("sha256", creds.apiSecret).update(preSign).digest("hex");

      const res = await fetch(`https://api.bybit.com/v5/order/realtime?${queryStr}`, {
        headers: {
          "X-BAPI-API-KEY": creds.apiKey,
          "X-BAPI-SIGN": signature,
          "X-BAPI-TIMESTAMP": ts,
          "X-BAPI-RECV-WINDOW": recvWindow,
        },
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { result: { list: Array<{ orderStatus: string; cumExecQty: string; avgPrice: string }> } };
      const order = data.result?.list?.[0];
      if (!order) return null;
      const statusMap: Record<string, string> = { New: "NEW", PartiallyFilled: "PARTIALLY_FILLED", Filled: "FILLED", Cancelled: "CANCELED", Rejected: "REJECTED", Deactivated: "EXPIRED" };
      return {
        status: statusMap[order.orderStatus] ?? order.orderStatus,
        filledQty: Number(order.cumExecQty) || 0,
        avgPrice: Number(order.avgPrice) || 0,
      };
    } catch {
      return null;
    }
  }

  private async queryOkxOrder(
    creds: DecryptedCreds,
    symbolVenue: string,
    exchangeOrderId: string | null,
    clientOrderId: string,
  ): Promise<{ status: string; filledQty: number; avgPrice: number } | null> {
    try {
      const ts = new Date().toISOString();
      const params: Record<string, string> = { instId: symbolVenue };
      if (exchangeOrderId) params.ordId = exchangeOrderId;
      else params.clOrdId = clientOrderId.slice(0, 32);

      const queryStr = "?" + new URLSearchParams(params).toString();
      const path = "/api/v5/trade/order";
      const preSign = ts + "GET" + path + queryStr;
      const signature = createHmac("sha256", creds.apiSecret).update(preSign).digest("base64");

      const res = await fetch(`https://www.okx.com${path}${queryStr}`, {
        headers: {
          "OK-ACCESS-KEY": creds.apiKey,
          "OK-ACCESS-SIGN": signature,
          "OK-ACCESS-TIMESTAMP": ts,
          "OK-ACCESS-PASSPHRASE": (creds as any).passphrase ?? "",
        },
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { data: Array<{ state: string; accFillSz: string; avgPx: string }> };
      const order = data.data?.[0];
      if (!order) return null;
      const stateMap: Record<string, string> = { live: "NEW", partially_filled: "PARTIALLY_FILLED", filled: "FILLED", canceled: "CANCELED" };
      return {
        status: stateMap[order.state] ?? order.state.toUpperCase(),
        filledQty: Number(order.accFillSz) || 0,
        avgPrice: Number(order.avgPx) || 0,
      };
    } catch {
      return null;
    }
  }

  // ── Credential Decryption ─────────────────────────────────────

  private async decryptCredentials(userId: string, exchangeAccountId: string): Promise<DecryptedCreds | null> {
    try {
      const { rows } = await pool.query(
        `SELECT credentials_encrypted FROM exchange_connection_records WHERE id = $1 AND user_id = $2`,
        [exchangeAccountId, userId],
      );
      if (!rows[0]) return null;
      const encrypted = rows[0].credentials_encrypted as { apiKey: string; apiSecret: string };
      return {
        apiKey: decryptSecret(encrypted.apiKey, this.encryptionKey),
        apiSecret: decryptSecret(encrypted.apiSecret, this.encryptionKey),
      };
    } catch {
      return null;
    }
  }
}
