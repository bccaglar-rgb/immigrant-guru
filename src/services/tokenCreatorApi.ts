import { getAuthToken } from "./authClient";

export interface TokenCreatorFeeConfig {
  baseFeeUsdt: number;
  networkReserveUsdt: number;
  decimalsSurchargeUsdt: number;
  supplyTierPrices: Record<"fixed" | "capped" | "unlimited", number>;
  accessTierPrices: Record<"none" | "ownable" | "role_based", number>;
  transferTypePrices: Record<"unstoppable" | "pausable", number>;
  featurePrices: {
    burnable: number;
    mintable: number;
    recoverable: number;
    verifiedSource: number;
    erc1363: number;
  };
  updatedAt: string;
}

export interface TokenCreatorOrderInput {
  name: string;
  symbol: string;
  decimals: number;
  initialSupply: number;
  totalSupply: number;
  supplyType: "fixed" | "capped" | "unlimited";
  accessType: "none" | "ownable" | "role_based";
  transferType: "unstoppable" | "pausable";
  burnable: boolean;
  mintable: boolean;
  verifiedSource: boolean;
  erc1363: boolean;
  recoverable: boolean;
}

const req = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json();
  if (!res.ok || !body.ok) throw new Error(body.error ?? body.message ?? "request_failed");
  return body as T;
};

export const getTokenCreatorConfig = () =>
  req<{ ok: true; config: TokenCreatorFeeConfig }>("/api/token-creator/config");

export const getTokenCreatorQuote = (input: TokenCreatorOrderInput) =>
  req<{ ok: true; quote: { subtotalUsdt: number; networkReserveUsdt: number; totalUsdt: number; breakdown: Array<{ label: string; amountUsdt: number }> } }>(
    "/api/token-creator/quote",
    { method: "POST", body: JSON.stringify(input) },
  );

export const createTokenCreatorOrder = (input: TokenCreatorOrderInput) =>
  req<{ ok: true; order: { id: string; status: string; invoiceId?: string }; invoice: { id: string } }>(
    "/api/token-creator/orders",
    { method: "POST", body: JSON.stringify(input) },
  );

export const listMyTokenCreatorOrders = () =>
  req<{ ok: true; orders: Array<any> }>("/api/token-creator/orders/me");

export const updateTokenCreatorConfig = (input: Partial<TokenCreatorFeeConfig>) =>
  req<{ ok: true; config: TokenCreatorFeeConfig }>("/api/admin/token-creator/config", {
    method: "POST",
    body: JSON.stringify(input),
  });

