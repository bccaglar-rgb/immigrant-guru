import type { ExchangeConnectionInput, ExchangeName } from "../types/exchange";
import type { BalanceItem, OpenOrderItem, OrderHistoryItem, PositionItem, TradeHistoryItem, TransactionHistoryItem } from "../types/exchange";
import { getAuthToken } from "./authClient";

interface ApiResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

const API_BASE = "";

/** Shared auth headers for all exchange API calls. */
export const authHeaders = (): Record<string, string> => {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const req = async <T>(path: string, init: RequestInit): Promise<ApiResult<T>> => {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
        ...(init.headers ?? {}),
      },
    });
    const data = (await res.json()) as T & { error?: string };
    if (!res.ok) return { ok: false, error: data.error ?? "Request failed" };
    return { ok: true, data };
  } catch {
    return { ok: false, error: "Backend unreachable" };
  }
};

export const testExchangeConnection = (payload: { baseUrl: string; apiKey: string; apiSecret: string }) =>
  req<{ ok: true; route?: string }>("/api/connections/health", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const saveExchangeConnection = (payload: ExchangeConnectionInput) =>
  req<{ ok: true; report?: unknown }>("/api/exchanges/connect", {
    method: "POST",
    body: JSON.stringify({
      exchangeId: String(payload.exchange ?? "").toLowerCase(),
      credentials: {
        apiKey: payload.apiKey,
        apiSecret: payload.apiSecret,
        ...(payload.passphrase ? { passphrase: payload.passphrase } : {}),
      },
      options: {
        accountMode: payload.accountMode,
        environment: payload.testnet ? "testnet" : "mainnet",
      },
    }),
  });

export const placeExchangeOrder = (payload: {
  exchange: ExchangeName;
  symbol: string;
  side: "BUY" | "SELL";
  orderType: "Limit" | "Market" | "Stop Limit";
  amount: number;
  price?: number;
  stopPrice?: number;
  accountMode: "Spot" | "Futures" | "Both";
  leverage?: number;
  marginMode?: "Cross" | "Isolated";
  positionAction?: "Open" | "Close";
  tif?: "GTC" | "IOC" | "FOK";
  reduceOnly?: boolean;
  postOnly?: boolean;
  tpSl?: {
    enabled: boolean;
    tpPrice?: number;
    slPrice?: number;
  };
}) =>
  req<{ orderId: string; status: string }>("/api/trade/place", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export interface ExchangeAccountSnapshot {
  exchange: string;
  source: "EXCHANGE";
  balances: BalanceItem[];
  positions: PositionItem[];
  openOrders: OpenOrderItem[];
  orderHistory: OrderHistoryItem[];
  tradeHistory: TradeHistoryItem[];
  transactionHistory: TransactionHistoryItem[];
  positionHistory: Array<Record<string, unknown>>;
  bots: Array<Record<string, unknown>>;
  assets: BalanceItem[];
  fetchedAt: string;
}

export const fetchExchangeAccountSnapshot = (exchangeId: string, symbol: string, accountName?: string) => {
  const query = new URLSearchParams({ symbol });
  if (accountName?.trim()) query.set("accountName", accountName.trim());
  return req<ExchangeAccountSnapshot>(`/api/exchanges/${encodeURIComponent(exchangeId)}/account?${query.toString()}`, {
    method: "GET",
  });
};
