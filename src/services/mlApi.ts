import { getAuthToken } from "./authClient";

const req = async <T,>(path: string): Promise<T> => {
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

export interface TrainingDataResponse {
  ok: true;
  symbols: string[];
  interval: string;
  startTime: string;
  endTime: string;
  count: number;
  data: Array<Record<string, unknown>>;
}

export interface FeaturesResponse {
  ok: true;
  symbol: string;
  hours: number;
  count: number;
  data: Array<Record<string, unknown>>;
}

export function fetchTrainingData(params: {
  symbols: string;
  start: string;
  end: string;
  interval?: string;
  exchange?: string;
  limit?: number;
}) {
  const q = new URLSearchParams({
    symbols: params.symbols,
    start: params.start,
    end: params.end,
  });
  if (params.interval) q.set("interval", params.interval);
  if (params.exchange) q.set("exchange", params.exchange);
  if (params.limit) q.set("limit", String(params.limit));
  return req<TrainingDataResponse>(`/api/ml/training-data?${q.toString()}`);
}

export function fetchFeatures(params: {
  symbol: string;
  hours?: number;
  limit?: number;
}) {
  const q = new URLSearchParams({ symbol: params.symbol });
  if (params.hours) q.set("hours", String(params.hours));
  if (params.limit) q.set("limit", String(params.limit));
  return req<FeaturesResponse>(`/api/ml/features?${q.toString()}`);
}
