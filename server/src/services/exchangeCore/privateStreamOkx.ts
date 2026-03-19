/**
 * OKX V5 private user data stream event parser.
 *
 * Channels:
 * - orders: order status changes
 * - positions: position changes
 * - account: balance changes
 */

export type OkxUserEvent =
  | { type: "order_update"; symbol: string; clientOrderId: string; side: "BUY" | "SELL"; orderType: string; orderStatus: string; orderId: string; filledQty: number; totalFilledQty: number; filledPrice: number; avgPrice: number; realizedPnl: number; fee: number; feeAsset: string; timestamp: number }
  | { type: "position_update"; symbol: string; side: string; size: number; entryPrice: number; unrealizedPnl: number; markPrice: number; leverage: number; liquidationPrice: number; marginType: string }
  | { type: "balance_update"; asset: string; walletBalance: number; crossWalletBalance: number; balanceChange: number }
  | { type: "unknown"; data: unknown };

// Convert OKX instId (BTC-USDT-SWAP) → internal symbol (BTCUSDT)
const okxToInternal = (instId: string): string =>
  instId.replace(/-SWAP$/, "").replace(/-/g, "");

export function parseOkxUserEvent(raw: unknown): OkxUserEvent[] {
  const events: OkxUserEvent[] = [];
  if (!raw || typeof raw !== "object") return [{ type: "unknown", data: raw }];

  const msg = raw as Record<string, any>;
  const channel = String(msg.arg?.channel ?? "");
  const items = Array.isArray(msg.data) ? msg.data : [];

  if (channel === "orders") {
    for (const o of items) {
      const side = String(o.side ?? "buy");
      const state = String(o.state ?? "");
      // Map OKX states: live, partially_filled, filled, canceled, mmp_canceled
      const stateMap: Record<string, string> = {
        live: "NEW", partially_filled: "PARTIALLY_FILLED", filled: "FILLED",
        canceled: "CANCELED", mmp_canceled: "CANCELED",
      };
      events.push({
        type: "order_update",
        symbol: okxToInternal(String(o.instId ?? "")),
        clientOrderId: String(o.clOrdId ?? ""),
        side: side === "sell" ? "SELL" : "BUY",
        orderType: String(o.ordType ?? "market").toUpperCase(),
        orderStatus: stateMap[state] ?? state.toUpperCase(),
        orderId: String(o.ordId ?? ""),
        filledQty: Number(o.fillSz ?? 0),
        totalFilledQty: Number(o.accFillSz ?? 0),
        filledPrice: Number(o.fillPx ?? 0),
        avgPrice: Number(o.avgPx ?? 0),
        realizedPnl: Number(o.pnl ?? 0),
        fee: Math.abs(Number(o.fee ?? 0)),
        feeAsset: String(o.feeCcy ?? "USDT"),
        timestamp: Number(o.uTime ?? Date.now()),
      });
    }
  } else if (channel === "positions") {
    for (const p of items) {
      const pos = Number(p.pos ?? 0);
      events.push({
        type: "position_update",
        symbol: okxToInternal(String(p.instId ?? "")),
        side: pos >= 0 ? "LONG" : "SHORT",
        size: Math.abs(pos),
        entryPrice: Number(p.avgPx ?? 0),
        unrealizedPnl: Number(p.upl ?? 0),
        markPrice: Number(p.markPx ?? 0),
        leverage: Number(p.lever ?? 1),
        liquidationPrice: Number(p.liqPx ?? 0),
        marginType: String(p.mgnMode ?? "cross"),
      });
    }
  } else if (channel === "account") {
    for (const a of items) {
      for (const detail of a.details ?? []) {
        events.push({
          type: "balance_update",
          asset: String(detail.ccy ?? ""),
          walletBalance: Number(detail.cashBal ?? 0),
          crossWalletBalance: Number(detail.availBal ?? detail.cashBal ?? 0),
          balanceChange: Number(detail.upl ?? 0),
        });
      }
    }
  } else {
    events.push({ type: "unknown", data: raw });
  }

  return events;
}
