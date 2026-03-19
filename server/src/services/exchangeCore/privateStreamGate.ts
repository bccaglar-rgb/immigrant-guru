/**
 * Gate.io private WebSocket event parser.
 *
 * Channels:
 * - futures.orders: order status changes
 * - futures.usertrades: trade fills
 * - futures.positions: position changes
 * - futures.balances: balance changes
 */

export interface GateOrderUpdate {
  type: "order_update";
  symbol: string;
  orderId: string;
  clientOrderId: string;
  status: string;
  size: number;
  fillPrice: number;
  side: "BUY" | "SELL";
  timestamp: number;
}

export interface GatePositionUpdate {
  type: "position_update";
  symbol: string;
  side: string;
  size: number;
  entryPrice: number;
  unrealizedPnl: number;
  leverage: number;
}

export interface GateBalanceUpdate {
  type: "balance_update";
  asset: string;
  available: number;
  total: number;
  change: number;
}

export type GateUserEvent =
  | GateOrderUpdate
  | GatePositionUpdate
  | GateBalanceUpdate
  | { type: "unknown"; data: unknown };

export function parseGateUserEvent(raw: unknown): GateUserEvent[] {
  const events: GateUserEvent[] = [];
  if (!raw || typeof raw !== "object") return [{ type: "unknown", data: raw }];

  const msg = raw as Record<string, any>;
  const channel = String(msg.channel ?? "");
  const result = msg.result;

  if (!result) return [{ type: "unknown", data: raw }];

  // result can be an array or single object
  const items = Array.isArray(result) ? result : [result];

  if (channel === "futures.orders") {
    for (const item of items) {
      const size = Number(item.size ?? 0);
      events.push({
        type: "order_update",
        symbol: String(item.contract ?? "").replace(/_/g, ""),
        orderId: String(item.id ?? ""),
        clientOrderId: String(item.text ?? ""),
        status: String(item.status ?? ""),
        size: Math.abs(size),
        fillPrice: Number(item.fill_price ?? 0),
        side: size >= 0 ? "BUY" : "SELL",
        timestamp: Number(item.create_time_ms ?? Date.now()),
      });
    }
  } else if (channel === "futures.positions") {
    for (const item of items) {
      const size = Number(item.size ?? 0);
      events.push({
        type: "position_update",
        symbol: String(item.contract ?? "").replace(/_/g, ""),
        side: size >= 0 ? "LONG" : "SHORT",
        size: Math.abs(size),
        entryPrice: Number(item.entry_price ?? 0),
        unrealizedPnl: Number(item.unrealised_pnl ?? 0),
        leverage: Number(item.leverage ?? 1),
      });
    }
  } else if (channel === "futures.balances") {
    for (const item of items) {
      events.push({
        type: "balance_update",
        asset: "USDT",
        available: Number(item.available ?? 0),
        total: Number(item.balance ?? 0),
        change: Number(item.change ?? 0),
      });
    }
  } else {
    events.push({ type: "unknown", data: raw });
  }

  return events;
}
