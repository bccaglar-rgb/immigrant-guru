import { useEffect, useMemo, useState } from "react";
import type { Coin, OhlcvPoint, Timeframe, TradeIdea } from "../types";

interface Params {
  coin: Coin;
  timeframe: Timeframe;
  ohlcv: OhlcvPoint[];
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const buildIdea = ({ coin, timeframe, ohlcv }: Params): TradeIdea => {
  const last = ohlcv[ohlcv.length - 1]?.close ?? 0;
  const volatility = ohlcv.length > 20
    ? Math.abs((ohlcv[ohlcv.length - 1].high - ohlcv[ohlcv.length - 1].low) / Math.max(last, 1))
    : 0.003;

  const entrySpread = Math.max(last * clamp(volatility * 0.85, 0.0012, 0.006), 4);
  const entryMid = last * (1 + (Math.random() - 0.5) * 0.0025);
  const entryLow = entryMid - entrySpread / 2;
  const entryHigh = entryMid + entrySpread / 2;

  const sl1 = entryLow - Math.max(last * clamp(volatility * 0.7, 0.001, 0.005), 5);
  const sl2 = entryLow - Math.max(last * clamp(volatility * 1.35, 0.002, 0.01), 10);

  const tp1 = entryHigh + Math.max(last * clamp(volatility * 0.9, 0.0015, 0.007), 8);
  const tp2 = entryHigh + Math.max(last * clamp(volatility * 1.8, 0.003, 0.014), 15);

  return {
    id: `${coin}-${timeframe}-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
    coin,
    quote: "USDT",
    timeframe,
    confidence: Number((0.55 + Math.random() * 0.33).toFixed(2)),
    entryLow: Number(entryLow.toFixed(2)),
    entryHigh: Number(entryHigh.toFixed(2)),
    stops: [
      { price: Number(sl1.toFixed(2)), weightPct: 50 },
      { price: Number(sl2.toFixed(2)), weightPct: 50 },
    ],
    targets: [
      { price: Number(tp1.toFixed(2)), weightPct: 50 },
      { price: Number(tp2.toFixed(2)), weightPct: 50 },
    ],
    createdAt: new Date().toISOString(),
  };
};

export const useTradeIdeasMock = ({ coin, timeframe, ohlcv }: Params) => {
  const [ideas, setIdeas] = useState<TradeIdea[]>([]);
  const latestTime = ohlcv[ohlcv.length - 1]?.time ?? 0;

  useEffect(() => {
    if (!ohlcv.length) return;

    const seed = Array.from({ length: 5 }).map(() => buildIdea({ coin, timeframe, ohlcv }));
    setIdeas(seed);
  }, [coin, timeframe]);

  useEffect(() => {
    if (!ohlcv.length) return;

    const timer = window.setInterval(() => {
      setIdeas((prev) => {
        const next = buildIdea({ coin, timeframe, ohlcv });
        return [next, ...prev].slice(0, 20);
      });
    }, 18000);

    return () => window.clearInterval(timer);
  }, [coin, timeframe, latestTime]);

  return useMemo(() => ideas, [ideas]);
};
