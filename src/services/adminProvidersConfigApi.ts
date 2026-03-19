import type { ProviderConfig } from "../types";
import { getAuthToken } from "./authClient";

export interface AdminProvidersFallbackPolicy {
  defaultExchange: "Binance" | "Bybit" | "OKX" | "Gate.io" | null;
  order: Array<"Binance" | "Bybit" | "OKX" | "Gate.io">;
}

export interface AdminProvidersConfigResponse {
  ok: boolean;
  providers: ProviderConfig[];
  fallbackPolicy: AdminProvidersFallbackPolicy;
  branding?: {
    logoDataUrl?: string;
    emblemDataUrl?: string;
  };
  fetchedAt?: string;
  savedAt?: string;
}

const parseError = async (res: Response): Promise<string> => {
  try {
    const body = (await res.json()) as { error?: string };
    return String(body?.error ?? `HTTP_${res.status}`);
  } catch {
    return `HTTP_${res.status}`;
  }
};

const authHeaders = (): Record<string, string> => {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const fetchAdminProvidersConfig = async (): Promise<AdminProvidersConfigResponse> => {
  const res = await fetch("/api/admin/providers/config", {
    method: "GET",
    headers: { ...authHeaders() },
  });
  if (!res.ok) {
    throw new Error(await parseError(res));
  }
  return (await res.json()) as AdminProvidersConfigResponse;
};

export const saveAdminProvidersConfig = async (providers: ProviderConfig[]): Promise<AdminProvidersConfigResponse> => {
  const res = await fetch("/api/admin/providers/config", {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({ providers }),
  });
  if (!res.ok) {
    throw new Error(await parseError(res));
  }
  return (await res.json()) as AdminProvidersConfigResponse;
};

export const saveAdminBrandingConfig = async (branding: {
  logoDataUrl?: string;
  emblemDataUrl?: string;
}): Promise<AdminProvidersConfigResponse> => {
  const res = await fetch("/api/admin/providers/config", {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({ branding }),
  });
  if (!res.ok) {
    throw new Error(await parseError(res));
  }
  return (await res.json()) as AdminProvidersConfigResponse;
};
