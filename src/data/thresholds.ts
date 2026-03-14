export const CORE_FEEDS = [
  "priceOhlcv",
  "orderbook",
  "trades",
] as const;

export const STALE_THRESHOLD_SEC = 10;
export const CONFIDENCE_CAP_PERCENT = 65;

export const LIQUIDITY_DISTANCE_THRESHOLDS = {
  lowMax: 0.8,
  midMax: 1.6,
} as const;

export const liquidityDistanceToDensity = (distancePct: number): "LOW" | "MID" | "HIGH" => {
  if (distancePct < LIQUIDITY_DISTANCE_THRESHOLDS.lowMax) return "LOW";
  if (distancePct < LIQUIDITY_DISTANCE_THRESHOLDS.midMax) return "MID";
  return "HIGH";
};
