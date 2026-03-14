import type { TradeIdeaDirection, TradeIdeaLevelType } from "./tradeIdeaTypes.ts";

export interface LevelCandidate {
  index: number;
  price: number;
}

export interface LevelHit {
  type: TradeIdeaLevelType;
  index: number;
  price: number;
}

const toBounds = (a: number, b: number) => (a <= b ? [a, b] : [b, a]);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export const sanitizeLevels = (levels: number[]): LevelCandidate[] =>
  levels
    .map((price, idx) => ({ price, index: idx + 1 }))
    .filter((row) => isFiniteNumber(row.price));

export const orderedTpLevels = (direction: TradeIdeaDirection, levels: number[]): LevelCandidate[] => {
  const rows = sanitizeLevels(levels);
  if (direction === "LONG") return rows.sort((a, b) => a.price - b.price);
  return rows.sort((a, b) => b.price - a.price);
};

export const orderedSlLevels = (direction: TradeIdeaDirection, levels: number[]): LevelCandidate[] => {
  const rows = sanitizeLevels(levels);
  if (direction === "LONG") return rows.sort((a, b) => b.price - a.price);
  return rows.sort((a, b) => a.price - b.price);
};

export const isEntryTouched = (
  prevPrice: number | null,
  currentPrice: number,
  entryLow: number,
  entryHigh: number,
): boolean => {
  if (!isFiniteNumber(currentPrice) || !isFiniteNumber(entryLow) || !isFiniteNumber(entryHigh)) return false;
  const [low, high] = toBounds(entryLow, entryHigh);
  if (currentPrice >= low && currentPrice <= high) return true;
  if (!isFiniteNumber(prevPrice)) return false;
  return (prevPrice < low && currentPrice > high) || (prevPrice > high && currentPrice < low);
};

export const isEntryMissed = (
  direction: TradeIdeaDirection,
  prevPrice: number | null,
  currentPrice: number,
  entryLow: number,
  entryHigh: number,
): boolean => {
  if (!isFiniteNumber(currentPrice) || !isFiniteNumber(entryLow) || !isFiniteNumber(entryHigh)) return false;
  if (isEntryTouched(prevPrice, currentPrice, entryLow, entryHigh)) return false;
  const [low, high] = toBounds(entryLow, entryHigh);
  const entryRange = Math.max(Math.abs(high - low), high * 0.0005);
  const missLevel = direction === "LONG" ? high + entryRange : low - entryRange;
  if (direction === "LONG") {
    if (currentPrice >= missLevel) return true;
    return isFiniteNumber(prevPrice) && prevPrice < missLevel && currentPrice > missLevel;
  }
  if (currentPrice <= missLevel) return true;
  return isFiniteNumber(prevPrice) && prevPrice > missLevel && currentPrice < missLevel;
};

const levelTouched = (
  direction: TradeIdeaDirection,
  levelType: TradeIdeaLevelType,
  levelPrice: number,
  prevPrice: number | null,
  currentPrice: number,
): boolean => {
  if (!isFiniteNumber(levelPrice) || !isFiniteNumber(currentPrice)) return false;
  if (levelType === "TP") {
    if (direction === "LONG") {
      if (currentPrice >= levelPrice) return true;
      return isFiniteNumber(prevPrice) && prevPrice < levelPrice && currentPrice > levelPrice;
    }
    if (currentPrice <= levelPrice) return true;
    return isFiniteNumber(prevPrice) && prevPrice > levelPrice && currentPrice < levelPrice;
  }
  if (direction === "LONG") {
    if (currentPrice <= levelPrice) return true;
    return isFiniteNumber(prevPrice) && prevPrice > levelPrice && currentPrice < levelPrice;
  }
  if (currentPrice >= levelPrice) return true;
  return isFiniteNumber(prevPrice) && prevPrice < levelPrice && currentPrice > levelPrice;
};

const firstTouched = (
  direction: TradeIdeaDirection,
  levelType: TradeIdeaLevelType,
  levels: number[],
  prevPrice: number | null,
  currentPrice: number,
): LevelHit | null => {
  const candidates = levelType === "TP" ? orderedTpLevels(direction, levels) : orderedSlLevels(direction, levels);
  for (const candidate of candidates) {
    if (levelTouched(direction, levelType, candidate.price, prevPrice, currentPrice)) {
      return { type: levelType, index: candidate.index, price: candidate.price };
    }
  }
  return null;
};

const levelTouchedByRange = (
  direction: TradeIdeaDirection,
  levelType: TradeIdeaLevelType,
  levelPrice: number,
  candleLow: number,
  candleHigh: number,
): boolean => {
  if (!isFiniteNumber(levelPrice) || !isFiniteNumber(candleLow) || !isFiniteNumber(candleHigh)) return false;
  if (levelType === "TP") {
    if (direction === "LONG") return candleHigh >= levelPrice;
    return candleLow <= levelPrice;
  }
  if (direction === "LONG") return candleLow <= levelPrice;
  return candleHigh >= levelPrice;
};

const firstTouchedByRange = (
  direction: TradeIdeaDirection,
  levelType: TradeIdeaLevelType,
  levels: number[],
  candleLow: number,
  candleHigh: number,
): LevelHit | null => {
  const candidates = levelType === "TP" ? orderedTpLevels(direction, levels) : orderedSlLevels(direction, levels);
  for (const candidate of candidates) {
    if (levelTouchedByRange(direction, levelType, candidate.price, candleLow, candleHigh)) {
      return { type: levelType, index: candidate.index, price: candidate.price };
    }
  }
  return null;
};

export const resolveFirstHit = (
  direction: TradeIdeaDirection,
  tpLevels: number[],
  slLevels: number[],
  prevPrice: number | null,
  currentPrice: number,
): LevelHit | null => {
  const tpHit = firstTouched(direction, "TP", tpLevels, prevPrice, currentPrice);
  const slHit = firstTouched(direction, "SL", slLevels, prevPrice, currentPrice);
  if (!tpHit && !slHit) return null;
  if (tpHit && !slHit) return tpHit;
  if (slHit && !tpHit) return slHit;
  if (!isFiniteNumber(prevPrice)) return slHit;
  const tpDistance = Math.abs(tpHit!.price - prevPrice);
  const slDistance = Math.abs(slHit!.price - prevPrice);
  if (tpDistance < slDistance) return tpHit;
  return slHit;
};

export const resolveFirstHitFromRange = (
  direction: TradeIdeaDirection,
  tpLevels: number[],
  slLevels: number[],
  prevPrice: number | null,
  candleLow: number,
  candleHigh: number,
  fallbackPrice: number | null = null,
): LevelHit | null => {
  const tpHit = firstTouchedByRange(direction, "TP", tpLevels, candleLow, candleHigh);
  const slHit = firstTouchedByRange(direction, "SL", slLevels, candleLow, candleHigh);
  if (!tpHit && !slHit) return null;
  if (tpHit && !slHit) return tpHit;
  if (slHit && !tpHit) return slHit;
  const refPrice = isFiniteNumber(prevPrice) ? prevPrice : isFiniteNumber(fallbackPrice) ? fallbackPrice : null;
  if (!isFiniteNumber(refPrice)) return slHit;
  const tpDistance = Math.abs(tpHit!.price - refPrice);
  const slDistance = Math.abs(slHit!.price - refPrice);
  if (tpDistance < slDistance) return tpHit;
  return slHit;
};

export const minutesBetween = (fromIso: string, toIso: string): number | null => {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return null;
  return Number(((to - from) / 60000).toFixed(2));
};
