/**
 * Binance private user data stream event parser.
 *
 * Events:
 * - ORDER_TRADE_UPDATE: fill, cancel, new order, etc.
 * - ACCOUNT_UPDATE: balance and position changes
 * - MARGIN_CALL: margin warning
 */

export interface BinanceOrderUpdate {
  type: "order_update";
  symbol: string;
  clientOrderId: string;
  side: "BUY" | "SELL";
  orderType: string;
  orderStatus: string;
  orderId: string;
  filledQty: number;
  totalFilledQty: number;
  filledPrice: number;
  avgPrice: number;
  realizedPnl: number;
  fee: number;
  feeAsset: string;
  tradeId: string;
  reduceOnly: boolean;
  positionSide: string;
  timestamp: number;
}

export interface BinancePositionUpdate {
  type: "position_update";
  symbol: string;
  side: string;
  size: number;
  entryPrice: number;
  unrealizedPnl: number;
  marginType: string;
}

export interface BinanceBalanceUpdate {
  type: "balance_update";
  asset: string;
  walletBalance: number;
  crossWalletBalance: number;
  balanceChange: number;
}

export type BinanceUserEvent =
  | BinanceOrderUpdate
  | BinancePositionUpdate
  | BinanceBalanceUpdate
  | { type: "margin_call"; data: Record<string, unknown> }
  | { type: "unknown"; data: unknown };

export function parseBinanceUserEvent(raw: unknown): BinanceUserEvent[] {
  const events: BinanceUserEvent[] = [];
  if (!raw || typeof raw !== "object") return [{ type: "unknown", data: raw }];

  const msg = raw as Record<string, any>;
  const eventType = String(msg.e ?? "");

  if (eventType === "ORDER_TRADE_UPDATE") {
    const o = msg.o ?? {};
    events.push({
      type: "order_update",
      symbol: String(o.s ?? ""),
      clientOrderId: String(o.c ?? ""),
      side: String(o.S ?? "BUY") as "BUY" | "SELL",
      orderType: String(o.o ?? ""),
      orderStatus: String(o.X ?? ""),
      orderId: String(o.i ?? ""),
      filledQty: Number(o.l ?? 0),
      totalFilledQty: Number(o.z ?? 0),
      filledPrice: Number(o.L ?? 0),
      avgPrice: Number(o.ap ?? 0),
      realizedPnl: Number(o.rp ?? 0),
      fee: Number(o.n ?? 0),
      feeAsset: String(o.N ?? "USDT"),
      tradeId: String(o.t ?? ""),
      reduceOnly: Boolean(o.R),
      positionSide: String(o.ps ?? "BOTH"),
      timestamp: Number(o.T ?? msg.T ?? Date.now()),
    });
  } else if (eventType === "ACCOUNT_UPDATE") {
    const a = msg.a ?? {};

    // Balance updates
    for (const b of a.B ?? []) {
      events.push({
        type: "balance_update",
        asset: String(b.a ?? ""),
        walletBalance: Number(b.wb ?? 0),
        crossWalletBalance: Number(b.cw ?? 0),
        balanceChange: Number(b.bc ?? 0),
      });
    }

    // Position updates
    for (const p of a.P ?? []) {
      events.push({
        type: "position_update",
        symbol: String(p.s ?? ""),
        side: Number(p.pa ?? 0) >= 0 ? "LONG" : "SHORT",
        size: Math.abs(Number(p.pa ?? 0)),
        entryPrice: Number(p.ep ?? 0),
        unrealizedPnl: Number(p.up ?? 0),
        marginType: String(p.mt ?? "cross"),
      });
    }
  } else if (eventType === "MARGIN_CALL") {
    events.push({ type: "margin_call", data: msg });
  } else {
    events.push({ type: "unknown", data: raw });
  }

  return events;
}
