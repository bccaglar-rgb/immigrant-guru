export type ConsensusBucketLabel =
  | "NO_TRADE"
  | "WAIT"
  | "WATCH"
  | "TRADE"
  | "STRONG_TRADE"
  | "SQUEEZE_EVENT";

export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const getConsensusBucketLabel = (scorePercent: number): ConsensusBucketLabel => {
  const score = clamp(Number(scorePercent), 0, 100);
  if (score <= 29) return "NO_TRADE";
  if (score <= 44) return "WAIT";
  if (score <= 59) return "WATCH";
  if (score <= 74) return "TRADE";
  if (score <= 89) return "STRONG_TRADE";
  return "SQUEEZE_EVENT";
};

export const isTradeIdeaEligibleBucket = (bucket: ConsensusBucketLabel): boolean =>
  bucket === "TRADE" || bucket === "STRONG_TRADE" || bucket === "SQUEEZE_EVENT";

