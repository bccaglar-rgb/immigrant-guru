import { getAuthToken } from "./authClient";

const reqJson = async <T,>(path: string): Promise<T> => {
  const res = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}),
    },
  });
  const body = await res.json();
  if (!res.ok || !body.ok) throw new Error(body.error ?? "request_failed");
  return body as T;
};

/* ── Prometheus Metrics (plain text) ────────────────────────────── */

export interface ParsedMetric {
  name: string;
  value: number;
  labels: Record<string, string>;
}

export async function fetchMetrics(): Promise<ParsedMetric[]> {
  const res = await fetch("/api/metrics", {
    headers: getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {},
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const metrics: ParsedMetric[] = [];
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^(\w+?)(\{(.+?)\})?\s+(.+)$/);
    if (!match) continue;
    const name = match[1];
    const labelsStr = match[3] ?? "";
    const value = parseFloat(match[4]);
    const labels: Record<string, string> = {};
    if (labelsStr) {
      for (const pair of labelsStr.split(",")) {
        const [k, v] = pair.split("=");
        if (k && v) labels[k] = v.replace(/"/g, "");
      }
    }
    metrics.push({ name, value, labels });
  }
  return metrics;
}

/* ── AI Engine V2 Health ────────────────────────────────────────── */

export interface AiEngineHealthResponse {
  ok: true;
  enabled: boolean;
  lastCycle: Record<string, unknown> | null;
  state: Record<string, unknown> | null;
}

export const fetchAiEngineHealth = () =>
  reqJson<AiEngineHealthResponse>("/api/ai-engine-v2/health");

/* ── Exchange Core ──────────────────────────────────────────────── */

export interface ExchangeCoreStateResponse {
  ok: true;
  metrics: Record<string, unknown>;
  ts: string;
}

export interface ExchangeCoreItemsResponse {
  ok: true;
  items: Array<Record<string, unknown>>;
  ts: string;
}

export const fetchExchangeCoreState = () =>
  reqJson<ExchangeCoreStateResponse>("/api/exchange-core/state");

export const fetchTradeIntents = () =>
  reqJson<ExchangeCoreItemsResponse>("/api/exchange-core/intents");

export const fetchTradeEvents = () =>
  reqJson<ExchangeCoreItemsResponse>("/api/exchange-core/events");
