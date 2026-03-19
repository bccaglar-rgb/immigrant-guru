/**
 * Bybit V5 private user data stream event parser.
 *
 * Topics:
 * - order: order status changes (new, filled, cancelled, etc.)
 * - execution: trade execution details
 * - position: position changes
 * - wallet: balance changes
 */

export type BybitUserEvent =
  | { type: "order_update"; symbol: string; clientOrderId: string; side: "BUY" | "SELL"; orderType: string; orderStatus: string; orderId: string; filledQty: number; totalFilledQty: number; filledPrice: number; avgPrice: number; realizedPnl: number; fee: number; feeAsset: string; reduceOnly: boolean; timestamp: number }
  | { type: "position_update"; symbol: string; side: string; size: number; entryPrice: number; unrealizedPnl: number; markPrice: number; leverage: number; liquidationPrice: number }
  | { type: "balance_update"; asset: string; walletBalance: number; crossWalletBalance: number; balanceChange: number }
  | { type: "unknown"; data: unknown };

export function parseBybitUserEvent(raw: unknown): BybitUserEvent[] {
  const events: BybitUserEvent[] = [];
  if (!raw || typeof raw !== "object") return [{ type: "unknown", data: raw }];

  const msg = raw as Record<string, any>;
  const topic = String(msg.topic ?? "");
  const items = Array.isArray(msg.data) ? msg.data : [];

  if (topic === "order") {
    for (const o of items) {
      const side = String(o.side ?? "Buy");
      const status = String(o.orderStatus ?? "");
      // Map Bybit statuses: New, PartiallyFilled, Filled, Cancelled, Rejected, Deactivated
      const statusMap: Record<string, string> = {
        New: "NEW", PartiallyFilled: "PARTIALLY_FILLED", Filled: "FILLED",
        Cancelled: "CANCELED", Rejected: "REJECTED", Deactivated: "EXPIRED",
      };
      events.push({
        type: "order_update",
        symbol: String(o.symbol ?? ""),
        clientOrderId: String(o.orderLinkId ?? ""),
        side: side === "Sell" ? "SELL" : "BUY",
        orderType: String(o.orderType ?? "Market").toUpperCase(),
        orderStatus: statusMap[status] ?? status,
        orderId: String(o.orderId ?? ""),
        filledQty: Number(o.execQty ?? 0),
        totalFilledQty: Number(o.cumExecQty ?? 0),
        filledPrice: Number(o.lastExecPrice ?? 0),
        avgPrice: Number(o.avgPrice ?? 0),
        realizedPnl: Number(o.cumExecFee ?? 0),
        fee: Number(o.cumExecFee ?? 0),
        feeAsset: "USDT",
        reduceOnly: Boolean(o.reduceOnly),
        timestamp: Number(o.updatedTime ?? msg.ts ?? Date.now()),
      });
    }
  } else if (topic === "position") {
    for (const p of items) {
      const size = Number(p.size ?? 0);
      events.push({
        type: "position_update",
        symbol: String(p.symbol ?? ""),
        side: String(p.side ?? (size >= 0 ? "Buy" : "Sell")),
        size: Math.abs(size),
        entryPrice: Number(p.entryPrice ?? 0),
        unrealizedPnl: Number(p.unrealisedPnl ?? 0),
        markPrice: Number(p.markPrice ?? 0),
        leverage: Number(p.leverage ?? 1),
        liquidationPrice: Number(p.liqPrice ?? 0),
      });
    }
  } else if (topic === "wallet") {
    for (const w of items) {
      for (const coin of w.coin ?? []) {
        events.push({
          type: "balance_update",
          asset: String(coin.coin ?? ""),
          walletBalance: Number(coin.walletBalance ?? 0),
          crossWalletBalance: Number(coin.availableToWithdraw ?? coin.walletBalance ?? 0),
          balanceChange: Number(coin.unrealisedPnl ?? 0),
        });
      }
    }
  } else {
    events.push({ type: "unknown", data: raw });
  }

  return events;
}
