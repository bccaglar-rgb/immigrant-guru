export type AiProviderId = "CHATGPT" | "QWEN" | "QWEN2";

export interface AiProviderConfigDto {
  id: AiProviderId;
  enabled: boolean;
  baseUrl: string;
  apiKey?: string;
  apiKeyMasked?: string;
  model: string;
  intervalSec: number;
  timeoutMs: number;
  temperature: number;
  maxTokens: number;
}

interface AdminAiProvidersConfigResponse {
  ok: boolean;
  providers: AiProviderConfigDto[];
  fetchedAt?: string;
  savedAt?: string;
}

const parseError = async (res: Response): Promise<string> => {
  try {
    const body = (await res.json()) as { error?: string; detail?: string };
    return String(body?.detail ?? body?.error ?? `HTTP_${res.status}`);
  } catch {
    return `HTTP_${res.status}`;
  }
};

export const fetchAdminAiProvidersConfig = async (): Promise<AdminAiProvidersConfigResponse> => {
  const res = await fetch("/api/admin/ai-providers/config", { method: "GET" });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as AdminAiProvidersConfigResponse;
};

export const saveAdminAiProvidersConfig = async (
  providers: AiProviderConfigDto[],
): Promise<AdminAiProvidersConfigResponse> => {
  const res = await fetch("/api/admin/ai-providers/config", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ providers }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as AdminAiProvidersConfigResponse;
};

export interface AiEvaluateOverride {
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AiScanRowDto {
  module: AiProviderId;
  symbol: string;
  tf: string;
  profile?: string;
  contract?: string;
  scorePct: number;
  reason: string;
  ok: boolean;
  decision: string;
  side: "LONG" | "SHORT" | "NO_TRADE" | "WAIT" | "UNKNOWN";
  scannedAt: string;
  setup?: string;
  bias?: string;
  edgePct?: number;
  breakProbPct?: number;
  structureFlags?: { vwapConfluence?: boolean; htfAlignment?: boolean };
  sr?: {
    resistance?: Array<{ p: number; st?: string; d_pct?: number }>;
    support?: Array<{ p: number; st?: string; d_pct?: number }>;
    range?: { high?: number; low?: number };
  };
  liquidity?: { sweep_zone?: number[]; next_liq_below?: number };
  entry?: { type?: string; zone?: number[]; stop?: number; sl?: number[]; tp?: number[]; rr?: number };
  risk?: { slippage?: string; fill_prob?: number; risk_adj_edge_r?: number };
  notes?: { one_liner?: string; risk_note?: string; what_to_watch?: string };
  triggers?: string[];
  blockers?: string[];
  activateIf?: string[];
  watchZones?: { upper_reclaim?: number; lower_break?: number };
}

export interface AiTradeIdeasStateResponse {
  ok: boolean;
  ts?: string;
  intervalSec?: number;
  inFlight?: boolean;
  updatedAt?: string;
  universeCount?: number;
  modules?: Array<{
    id: AiProviderId;
    enabled: boolean;
    running: boolean;
    lastRunAt: string;
    error: string;
    updatedAt: string;
    scanned: number;
  }>;
  scansByModule?: Record<AiProviderId, AiScanRowDto[]>;
}

export const evaluateAiTradeIdeas = async (
  payload: unknown,
  modules: AiProviderId[],
  overrides?: Partial<Record<AiProviderId, AiEvaluateOverride>>,
) => {
  const res = await fetch("/api/ai-trade-ideas/evaluate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ payload, modules, overrides }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as {
    ok: boolean;
    providersCalled: number;
    ts?: string;
    responses?: Array<{
      ok: boolean;
      provider: AiProviderId;
      parsed?: unknown;
      raw?: string;
      error?: string;
      detail?: string;
    }>;
    note?: string;
  };
};

export const fetchAiTradeIdeasState = async (): Promise<AiTradeIdeasStateResponse> => {
  const res = await fetch("/api/ai-trade-ideas/state", { method: "GET" });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as AiTradeIdeasStateResponse;
};
