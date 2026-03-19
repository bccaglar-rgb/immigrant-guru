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

export interface CoinUniverseStats {
  ok: true;
  round: number;
  refreshedAt: string;
  stats: {
    totalScanned: number;
    hardFiltered: number;
    scored: number;
    selected: number;
    cooldown: number;
  };
  health: {
    engine: string;
    mode: string;
    klinesAvailable: boolean;
    klinesSource: string;
    dataQuality: number;
  };
  telemetry: Record<string, unknown>;
  scoreDistribution: {
    elite: number;
    strong: number;
    watchlist: number;
    below: number;
    total: number;
  };
}

export interface CoinUniverseSelected {
  ok: true;
  round: number;
  refreshedAt: string;
  count: number;
  coins: Array<Record<string, unknown>>;
  health: {
    engine: string;
    mode: string;
    klinesAvailable: boolean;
    klinesSource: string;
    dataQuality: number;
  };
}

export const fetchCoinUniverseStats = () =>
  req<CoinUniverseStats>("/api/coin-universe/stats");

export const fetchCoinUniverseSelected = () =>
  req<CoinUniverseSelected>("/api/coin-universe/selected");
