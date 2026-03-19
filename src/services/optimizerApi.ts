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

export interface OptimizerHealthResponse {
  ok: true;
  modules: {
    p1: { active: boolean; throttled: string[] };
    p2: { active: boolean; trades: number; wins: number; losses: number };
    p3: { active: boolean; lastOpt: number | null; params: number };
    p4: { active: boolean; regime: string; memory: number };
    p5: { active: boolean };
    p6: { active: boolean; calibrated: boolean };
    p7: { active: boolean; throttle: number; boost: number; disabled: string[] };
    p9: { active: boolean; weights: number; lastTuned: number | null };
    p10: { active: boolean };
  };
  ts: string;
}

export interface ModePerformanceStat {
  mode: string;
  winRate: number;
  totalTrades: number;
  wins: number;
  losses: number;
  throttled: boolean;
  [key: string]: unknown;
}

export interface ModePerformanceResponse {
  ok: true;
  modes: ModePerformanceStat[];
  ts: string;
}

export interface AttributionResponse {
  ok: true;
  total: number;
  wins: number;
  losses: number;
  hours: number;
  ts: string;
  [key: string]: unknown;
}

export interface SlTpParam {
  regime: string;
  slDistance: number;
  tpDistance: number;
  [key: string]: unknown;
}

export interface SlTpResponse {
  ok: true;
  params: SlTpParam[];
  lastOptimized: number | null;
  ts: string;
}

export interface RegimeResponse {
  ok: true;
  currentRegime: string;
  memorySize: number;
  ts: string;
  [key: string]: unknown;
}

export interface CalibrationBand {
  range: string;
  predicted: number;
  actual: number;
  count: number;
  [key: string]: unknown;
}

export interface CalibrationResponse {
  ok: true;
  bands: CalibrationBand[];
  wellCalibrated: boolean;
  lastCalibrated: number | null;
  ts: string;
}

export interface ThrottleResponse {
  ok: true;
  globalThrottle: number;
  scoreBoost: number;
  disabledModes: string[];
  ts: string;
  [key: string]: unknown;
}

export interface FeatureWeight {
  feature: string;
  weight: number;
  [key: string]: unknown;
}

export interface FeatureWeightsResponse {
  ok: true;
  weights: FeatureWeight[];
  lastTuned: number | null;
  ts: string;
}

export const fetchOptimizerHealth = (hours = 24) =>
  req<OptimizerHealthResponse>(`/api/optimizer/health?hours=${hours}`);

export const fetchModePerformance = () =>
  req<ModePerformanceResponse>("/api/optimizer/mode-performance");

export const fetchAttributionSummary = (hours = 24) =>
  req<AttributionResponse>(`/api/optimizer/attribution-summary?hours=${hours}`);

export const fetchSlTpParams = () =>
  req<SlTpResponse>("/api/optimizer/sl-tp-params");

export const fetchRegime = () =>
  req<RegimeResponse>("/api/optimizer/regime");

export const fetchCalibration = () =>
  req<CalibrationResponse>("/api/optimizer/calibration");

export const fetchThrottle = () =>
  req<ThrottleResponse>("/api/optimizer/throttle");

export const fetchFeatureWeights = () =>
  req<FeatureWeightsResponse>("/api/optimizer/feature-weights");
