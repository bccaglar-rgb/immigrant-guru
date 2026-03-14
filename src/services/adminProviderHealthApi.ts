import type { ProviderConfig } from "../types";

export interface ProviderHealthResult {
  id: string;
  name: string;
  status: "OK" | "WARN" | "FAIL" | "SKIP";
  dataOk: boolean;
  httpOk: boolean;
  wsOk: boolean;
  latencyMs: number;
  checkedUrl?: string;
  detail: string;
}

export interface ProviderHealthResponse {
  ok: boolean;
  checkedAt: string;
  summary: {
    total: number;
    ok: number;
    warn: number;
    fail: number;
    skip: number;
  };
  items: ProviderHealthResult[];
}

export const checkProvidersHealth = async (providers: ProviderConfig[]): Promise<ProviderHealthResponse> => {
  const res = await fetch("/api/admin/providers/health", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      providers: providers.map((provider) => ({
        id: provider.id,
        name: provider.name,
        type: provider.type,
        enabled: provider.enabled,
        baseUrl: provider.baseUrl,
        wsUrl: provider.wsUrl,
        discoveryEndpoint: provider.discoveryEndpoint,
        extraPaths: provider.extraPaths,
        apiKey: provider.apiKey,
      })),
    }),
  });
  if (!res.ok) {
    let message = `HTTP_${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // noop
    }
    throw new Error(message);
  }
  return (await res.json()) as ProviderHealthResponse;
};
