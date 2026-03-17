import { useEffect, useRef, useState } from "react";
import {
  ColorType,
  createChart,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type LineData,
  type UTCTimestamp,
} from "lightweight-charts";
import { calculateEma, calculateVwap } from "../data/liveConsensusEngine";
import { MarketDataRouter } from "../data/MarketDataRouter";
import { useLivePriceStore } from "../hooks/useLivePriceStore";
import type { Coin, IndicatorsState, KeyLevel, OhlcvPoint, Timeframe, TimeframeConfig, TradeIdea } from "../types";
import { CoinSelector } from "./CoinSelector";
import { TimeframeBar } from "./TimeframeBar";
import { TradeIdeasRow } from "./TradeIdeasRow";

interface OverlayConfig {
  ema: boolean;
  vwap: boolean;
  volume: boolean;
  keyLevels: boolean;
}

interface Props {
  selectedCoin: Coin;
  onCoinChange: (coin: Coin) => void;
  coinOptions: Coin[];
  coinsLoading?: boolean;
  coinErrorText?: string;
  coinSourceMode?: "BITRIUM_LABS" | "EXCHANGE";
  coinExchangeName?: string;
  symbol: string;
  timeframe: TimeframeConfig;
  data: OhlcvPoint[];
  keyLevels: KeyLevel[];
  overlays: OverlayConfig;
  tradeIdeas: TradeIdea[];
  aiSummary: string[];
  aiKeyReasons: string[];
  confidenceDrivers: {
    structure: number;
    liquidity: number;
    positioning: number;
    execution: number;
  };
  scenarioOutlook: {
    trendContinuation: number;
    rangeContinuation: number;
    breakoutMove: number;
  };
  selectedTradeIdea: TradeIdea | null;
  indicatorsMasterEnabled: boolean;
  indicatorsEnabledCount: number;
  indicatorsState: IndicatorsState;
  onTradeIdeaSelect: (id: string | null) => void;
  tradeIdeaScope: "SELECTED" | "ALL";
  onTradeIdeaScopeChange: (scope: "SELECTED" | "ALL") => void;
  onTradeIdeaCoinClick: (coin: string, ideaId: string) => void;
  onTradeIdeaView?: (coin: string, ideaId: string) => void;
  onTradeIdeaTrade?: (coin: string, ideaId: string) => void;
  onTimeframeChange: (next: Timeframe) => void;
  onLookbackChange: (bars: number) => void;
  onOverlayChange: (next: OverlayConfig) => void;
  onOpenIndicatorsPanel: () => void;
}

const lookbackOptions = [120, 240, 360, 500, 900];

const toCandles = (series: OhlcvPoint[]): CandlestickData[] =>
  series.map((d) => ({
    time: d.time as UTCTimestamp,
    open: d.open,
    high: d.high,
    low: d.low,
    close: d.close,
  }));

const toVolume = (series: OhlcvPoint[]): HistogramData[] =>
  series.map((d) => ({
    time: d.time as UTCTimestamp,
    value: d.volume,
    color: d.close >= d.open ? "rgba(210,214,220,0.35)" : "rgba(155,82,77,0.35)",
  }));

const toLine = (values: Array<{ time: number; value: number }>): LineData[] =>
  values.map((v) => ({ time: v.time as UTCTimestamp, value: v.value }));

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const formatPrice = (price: number) => {
  if (!Number.isFinite(price)) return "-";
  if (price >= 1000) return price.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (price >= 1) return price.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return price.toLocaleString(undefined, { maximumFractionDigits: 6 });
};

interface BandRect {
  top: number;
  height: number;
}

export const ChartPanel = ({
  selectedCoin,
  onCoinChange,
  coinOptions,
  coinsLoading = false,
  coinErrorText,
  coinSourceMode = "EXCHANGE",
  coinExchangeName = "Binance",
  symbol,
  timeframe,
  data,
  keyLevels,
  overlays,
  tradeIdeas,
  aiSummary,
  aiKeyReasons,
  confidenceDrivers,
  scenarioOutlook,
  selectedTradeIdea,
  indicatorsMasterEnabled,
  indicatorsEnabledCount,
  indicatorsState,
  onTradeIdeaSelect,
  tradeIdeaScope,
  onTradeIdeaScopeChange,
  onTradeIdeaCoinClick,
  onTradeIdeaView,
  onTradeIdeaTrade,
  onTimeframeChange,
  onLookbackChange,
  onOverlayChange,
  onOpenIndicatorsPanel,
}: Props) => {
  const chartElRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const emaSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const vwapSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const indicatorOverlaySeriesRef = useRef<ISeriesApi<"Line">[]>([]);
  const levelLinesRef = useRef<IPriceLine[]>([]);
  const tradeLinesRef = useRef<IPriceLine[]>([]);
  const livePriceLineRef = useRef<IPriceLine | null>(null);
  const shouldAutoFitRef = useRef(true);
  const closedCandlesRef = useRef<Set<number>>(new Set());
  const viewportContextRef = useRef("");
  const priceBadgeRef = useRef<HTMLDivElement | null>(null);
  const priceBadgeTextRef = useRef<HTMLParagraphElement | null>(null);
  const lastCandleRef = useRef<{ symbol: string; openTime: number; open: number; high: number; low: number; close: number } | null>(null);
  const [entryBand, setEntryBand] = useState<BandRect | null>(null);
  // ── Real-time candle update from WS kline stream ──
  const routerSymbol = symbol.replace("/", "").toUpperCase();
  const candleUpdateKey = `${routerSymbol}:${timeframe.primary}`;
  const liveCandleUpdate = MarketDataRouter.useStore((s) => s.candleUpdates[candleUpdateKey]);

  // NOTE: tickPrice is NOT subscribed via React hook — we use useLivePriceStore.subscribe()
  // below to bypass React re-renders and write directly to DOM + chart API.

  const featuredPlan = selectedTradeIdea ?? tradeIdeas[0] ?? null;
  // Kline-based close for initial render + key level calculations (low-frequency React path)
  const lastClose =
    liveCandleUpdate && liveCandleUpdate.close > 0
      ? liveCandleUpdate.close
      : data[data.length - 1]?.close ?? 0;
  const highLevel = Math.max(...keyLevels.map((level) => level.price), lastClose);
  const lowLevel = Math.min(...keyLevels.map((level) => level.price), lastClose);
  const pricePos = highLevel === lowLevel ? 50 : ((lastClose - lowLevel) / (highLevel - lowLevel)) * 100;

  useEffect(() => {
    if (!chartElRef.current) return;

    const chart = createChart(chartElRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#121316" },
        textColor: "#BFC2C7",
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.035)" },
        horzLines: { color: "rgba(255,255,255,0.035)" },
      },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.08)",
        autoScale: true,
        scaleMargins: { top: 0.1, bottom: 0.08 },
      },
      timeScale: {
        borderColor: "rgba(255,255,255,0.08)",
        rightOffset: 8,
        barSpacing: 6,
        minBarSpacing: 2,
      },
      crosshair: {
        vertLine: { color: "rgba(245,197,66,0.28)" },
        horzLine: { color: "rgba(245,197,66,0.28)" },
      },
    });

    const candles = chart.addCandlestickSeries({
      upColor: "#d6d8dd",
      borderUpColor: "#d6d8dd",
      wickUpColor: "#d6d8dd",
      downColor: "#9b524d",
      borderDownColor: "#9b524d",
      wickDownColor: "#9b524d",
    });

    chartRef.current = chart;
    candleSeriesRef.current = candles;

    return () => {
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      emaSeriesRef.current = null;
      vwapSeriesRef.current = null;
      indicatorOverlaySeriesRef.current = [];
      levelLinesRef.current = [];
      tradeLinesRef.current = [];
    };
  }, []);

  useEffect(() => {
    const nextContext = `${symbol}:${timeframe.primary}:${timeframe.lookbackBars}`;
    if (viewportContextRef.current !== nextContext) {
      viewportContextRef.current = nextContext;
      shouldAutoFitRef.current = true;
      closedCandlesRef.current = new Set(); // reset on symbol/timeframe change

      // ── Critical: clear stale candle ref to prevent phantom prices ──
      // Without this, old symbol's candle data would be updated with new symbol's
      // trade prices, creating candles at impossible price levels.
      lastCandleRef.current = null;

      // Remove stale price line (will be recreated by first tick/kline of new symbol)
      if (livePriceLineRef.current && candleSeriesRef.current) {
        try { candleSeriesRef.current.removePriceLine(livePriceLineRef.current); } catch { /* noop */ }
      }
      livePriceLineRef.current = null;
    }
  }, [symbol, timeframe.primary, timeframe.lookbackBars]);

  useEffect(() => {
    if (!candleSeriesRef.current || !chartRef.current) return;
    if (!data.length) {
      shouldAutoFitRef.current = true;
      return;
    }
    candleSeriesRef.current.setData(toCandles(data));
    if (shouldAutoFitRef.current) {
      // Show last ~120 candles with proper spacing (Binance-style zoom).
      // fitContent() shows ALL candles which makes charts unreadably compressed.
      const barsToShow = 120;
      const ts = chartRef.current.timeScale();
      if (data.length > barsToShow) {
        ts.setVisibleLogicalRange({
          from: data.length - barsToShow,
          to: data.length + 8,
        });
      } else {
        ts.fitContent();
      }
      shouldAutoFitRef.current = false;
    }
  }, [data]);

  // ═══════════════════════════════════════════════════════════════════
  // KLINE HANDLER — canonical role:
  //   • CLOSED candle → finalize with authoritative Binance OHLCV, mark immutable
  //   • FORMING candle → only seed open/structure on FIRST arrival;
  //     trade stream owns close/high/low for live candles (no oscillation)
  // ═══════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!candleSeriesRef.current) return;
    if (!liveCandleUpdate || liveCandleUpdate.openTime <= 0 || liveCandleUpdate.close <= 0) return;

    const ot = liveCandleUpdate.openTime;
    // Immutable guard: already finalized — skip
    if (closedCandlesRef.current.has(ot)) return;

    const prev = lastCandleRef.current;
    const sameCandle = prev && prev.symbol === routerSymbol && prev.openTime === ot;

    if (liveCandleUpdate.closed) {
      // ── CLOSED: kline is authoritative — finalize candle with Binance OHLCV ──
      const final = {
        symbol: routerSymbol,
        openTime: ot,
        open: liveCandleUpdate.open,
        high: liveCandleUpdate.high,
        low: liveCandleUpdate.low,
        close: liveCandleUpdate.close,
      };
      lastCandleRef.current = final;

      try {
        candleSeriesRef.current.update({
          time: ot as UTCTimestamp,
          open: final.open,
          high: final.high,
          low: final.low,
          close: final.close,
        });
      } catch { /* chart not ready */ }

      // Mark immutable — never update this candle again
      closedCandlesRef.current.add(ot);
      if (closedCandlesRef.current.size > 10) {
        const entries = [...closedCandlesRef.current].sort((a, b) => a - b);
        closedCandlesRef.current = new Set(entries.slice(-5));
      }
    } else if (!sameCandle) {
      // ── NEW forming candle (first kline for this openTime) ──
      // Seed with kline structure; trade will take over close/high/low immediately
      const lp = useLivePriceStore.getState().bySymbol[routerSymbol];
      const tradeClose = lp && lp.price > 0 && lp.ts > 0 ? lp.price : liveCandleUpdate.close;
      const seeded = {
        symbol: routerSymbol,
        openTime: ot,
        open: liveCandleUpdate.open,
        high: Math.max(liveCandleUpdate.high, tradeClose),
        low: Math.min(liveCandleUpdate.low, tradeClose),
        close: tradeClose,
      };
      lastCandleRef.current = seeded;

      try {
        candleSeriesRef.current.update({
          time: ot as UTCTimestamp,
          open: seeded.open,
          high: seeded.high,
          low: seeded.low,
          close: seeded.close,
        });
      } catch { /* chart not ready */ }
    }
    // else: forming candle already tracked — kline does NOT overwrite.
    // Trade subscribe handler (below) owns close/high/low for live candles.
  }, [liveCandleUpdate]);

  // ── React-driven price line: initial + kline-based (low-frequency fallback) ──
  useEffect(() => {
    if (!candleSeriesRef.current || !Number.isFinite(lastClose) || lastClose <= 0) return;
    if (livePriceLineRef.current) {
      livePriceLineRef.current.applyOptions({ price: lastClose });
    } else {
      livePriceLineRef.current = candleSeriesRef.current.createPriceLine({
        price: lastClose,
        color: "rgba(74, 186, 132, 0.95)",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "",
      });
    }
  }, [lastClose]);

  // ═══════════════════════════════════════════════════════════════════
  // HIGH-FREQUENCY PATH: Direct DOM + chart API (bypasses React entirely)
  // useLivePriceStore fires 15-40x/sec — React re-render would be too heavy.
  // Instead we subscribe directly and write to DOM refs + chart API.
  // ═══════════════════════════════════════════════════════════════════
  useEffect(() => {
    // Binance-style throttle: buffer latest price, flush to DOM at ~4 Hz.
    // Raw trades arrive 15-40x/sec — displaying every one looks jittery.
    // Binance UI updates ~3-4x/sec with a smooth, confident cadence.
    let pendingPrice = 0;
    let pendingIsUp = true;
    let rafScheduled = false;
    let lastFlushTs = 0;
    const THROTTLE_MS = 100; // 10 updates/sec — fast like Binance, shows latest price

    const flushToDOM = () => {
      rafScheduled = false;
      if (pendingPrice <= 0) return;
      lastFlushTs = performance.now();

      // 1. Price badge — direct DOM write
      if (priceBadgeTextRef.current) {
        priceBadgeTextRef.current.textContent = formatPrice(pendingPrice);
        priceBadgeTextRef.current.style.color = pendingIsUp ? "#7fe0b6" : "#f6465d";
      }

      // 2. Chart price line
      const lineColor = pendingIsUp ? "rgba(74, 186, 132, 0.95)" : "rgba(246, 70, 93, 0.95)";
      if (livePriceLineRef.current) {
        livePriceLineRef.current.applyOptions({ price: pendingPrice, color: lineColor });
      } else if (candleSeriesRef.current) {
        livePriceLineRef.current = candleSeriesRef.current.createPriceLine({
          price: pendingPrice, color: lineColor, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "",
        });
      }
    };

    const unsub = useLivePriceStore.subscribe((state) => {
      const lp = state.bySymbol[routerSymbol];
      if (!lp || !lp.price || lp.price <= 0) return;
      const price = lp.price;
      const isUp = lp.prevPrice != null && lp.prevPrice > 0 ? price >= lp.prevPrice : true;

      // Always buffer latest values (never lose the most recent trade)
      pendingPrice = price;
      pendingIsUp = isUp;

      // Throttle DOM writes to THROTTLE_MS intervals
      const now = performance.now();
      if (now - lastFlushTs >= THROTTLE_MS) {
        // Enough time passed — flush immediately on next frame
        if (!rafScheduled) {
          rafScheduled = true;
          requestAnimationFrame(flushToDOM);
        }
      } else if (!rafScheduled) {
        // Schedule flush after remaining throttle time
        const remaining = THROTTLE_MS - (now - lastFlushTs);
        rafScheduled = true;
        setTimeout(() => requestAnimationFrame(flushToDOM), remaining);
      }

      // 3. Last candle close — update from trade price (makes candle track trades)
      // Safety: only update if candle belongs to the SAME symbol (prevents phantom prices)
      const candle = lastCandleRef.current;
      if (
        candle &&
        candle.symbol === routerSymbol &&
        candleSeriesRef.current &&
        !closedCandlesRef.current.has(candle.openTime)
      ) {
        try {
          const newHigh = Math.max(candle.high, price);
          const newLow = Math.min(candle.low, price);
          candleSeriesRef.current.update({
            time: candle.openTime as UTCTimestamp,
            open: candle.open,
            high: newHigh,
            low: newLow,
            close: price,
          });
          lastCandleRef.current = { ...candle, close: price, high: newHigh, low: newLow };
        } catch { /* chart not ready */ }
      }
    });
    return unsub;
  }, [routerSymbol]);

  useEffect(() => {
    if (!chartRef.current) return;

    if (overlays.volume) {
      if (!volumeSeriesRef.current) {
        const volumeSeries = chartRef.current.addHistogramSeries({
          color: "rgba(180,185,193,0.35)",
          priceFormat: { type: "volume" },
          priceScaleId: "",
        });

        volumeSeries.priceScale().applyOptions({
          scaleMargins: {
            top: 0.83,
            bottom: 0,
          },
        });

        volumeSeriesRef.current = volumeSeries;
      }

      volumeSeriesRef.current.setData(toVolume(data));
    } else if (volumeSeriesRef.current) {
      chartRef.current.removeSeries(volumeSeriesRef.current);
      volumeSeriesRef.current = null;
    }
  }, [data, overlays.volume]);

  useEffect(() => {
    if (!chartRef.current) return;

    if (overlays.ema) {
      if (!emaSeriesRef.current) {
        emaSeriesRef.current = chartRef.current.addLineSeries({
          color: "#F5C542",
          lineWidth: 2,
        });
      }
      emaSeriesRef.current.setData(toLine(calculateEma(data, 20)));
    } else if (emaSeriesRef.current) {
      chartRef.current.removeSeries(emaSeriesRef.current);
      emaSeriesRef.current = null;
    }
  }, [data, overlays.ema]);

  useEffect(() => {
    if (!chartRef.current) return;

    if (overlays.vwap) {
      if (!vwapSeriesRef.current) {
        vwapSeriesRef.current = chartRef.current.addLineSeries({
          color: "#E8E8E6",
          lineWidth: 2,
          lineStyle: 2,
        });
      }
      vwapSeriesRef.current.setData(toLine(calculateVwap(data)));
    } else if (vwapSeriesRef.current) {
      chartRef.current.removeSeries(vwapSeriesRef.current);
      vwapSeriesRef.current = null;
    }
  }, [data, overlays.vwap]);

  useEffect(() => {
    if (!chartRef.current) return;
    indicatorOverlaySeriesRef.current.forEach((series) => {
      try {
        chartRef.current?.removeSeries(series);
      } catch {
        // noop
      }
    });
    indicatorOverlaySeriesRef.current = [];

    if (!indicatorsState?.masterEnabled || !data.length) return;

    const closes = data.map((d) => Number(d.close));
    const highs = data.map((d) => Number(d.high));
    const lows = data.map((d) => Number(d.low));
    const volumes = data.map((d) => Math.max(0, Number(d.volume)));
    const times = data.map((d) => d.time as UTCTimestamp);

    const mkLine = (color: string, width: 1 | 2 | 3 | 4 = 1) => {
      if (!chartRef.current) return null;
      const s = chartRef.current.addLineSeries({
        color,
        lineWidth: width,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
      });
      indicatorOverlaySeriesRef.current.push(s);
      return s;
    };

    const toLineData = (vals: Array<number | null>): LineData[] =>
      vals
        .map((v, i) => (v == null || !Number.isFinite(v) ? null : { time: times[i], value: Number(v) }))
        .filter(Boolean) as LineData[];

    const sma = (arr: number[], len: number): Array<number | null> =>
      arr.map((_, i) => {
        if (i + 1 < len) return null;
        const window = arr.slice(i - len + 1, i + 1);
        return window.reduce((sum, v) => sum + v, 0) / len;
      });

    const ema = (arr: number[], len: number): Array<number | null> => {
      if (!arr.length || len <= 1) return arr.map((v) => (Number.isFinite(v) ? v : null));
      const out: Array<number | null> = new Array(arr.length).fill(null);
      const k = 2 / (len + 1);
      let prev = arr[0];
      for (let i = 0; i < arr.length; i += 1) {
        prev = i === 0 ? arr[i] : arr[i] * k + prev * (1 - k);
        out[i] = prev;
      }
      return out;
    };

    const std = (arr: number[], len: number): Array<number | null> =>
      arr.map((_, i) => {
        if (i + 1 < len) return null;
        const slice = arr.slice(i - len + 1, i + 1);
        const mean = slice.reduce((sum, v) => sum + v, 0) / len;
        const variance = slice.reduce((sum, v) => sum + (v - mean) ** 2, 0) / len;
        return Math.sqrt(Math.max(variance, 0));
      });

    const atr = (high: number[], low: number[], close: number[], len: number): Array<number | null> => {
      const trs = high.map((h, i) => {
        const prevClose = i > 0 ? close[i - 1] : close[i];
        const tr = Math.max(h - low[i], Math.abs(h - prevClose), Math.abs(low[i] - prevClose));
        return Number.isFinite(tr) ? tr : 0;
      });
      return ema(trs, Math.max(2, len));
    };

    const st = indicatorsState.indicators;

    if (st.bbands?.enabled && st.bbands?.showOnChart) {
      const len = Math.max(2, Number(st.bbands.settings?.length ?? 20));
      const dev = Number(st.bbands.settings?.stdev ?? 2);
      const basis = sma(closes, len);
      const sigma = std(closes, len);
      const upper = basis.map((b, i) => (b == null || sigma[i] == null ? null : b + (sigma[i] as number) * dev));
      const lower = basis.map((b, i) => (b == null || sigma[i] == null ? null : b - (sigma[i] as number) * dev));
      mkLine("#8b93a7")?.setData(toLineData(upper));
      mkLine("#8b93a7")?.setData(toLineData(lower));
    }

    if (st.keltner?.enabled && st.keltner?.showOnChart) {
      const len = Math.max(2, Number(st.keltner.settings?.length ?? 20));
      const mult = Number(st.keltner.settings?.multiplier ?? 1.5);
      const basis = ema(closes, len);
      const atrVals = atr(highs, lows, closes, len);
      const upper = basis.map((b, i) => (b == null || atrVals[i] == null ? null : b + (atrVals[i] as number) * mult));
      const lower = basis.map((b, i) => (b == null || atrVals[i] == null ? null : b - (atrVals[i] as number) * mult));
      mkLine("#6f8ab8")?.setData(toLineData(upper));
      mkLine("#6f8ab8")?.setData(toLineData(lower));
    }

    if (st.donchian?.enabled && st.donchian?.showOnChart) {
      const len = Math.max(2, Number(st.donchian.settings?.length ?? 20));
      const upper = highs.map((_, i) => {
        if (i + 1 < len) return null;
        return Math.max(...highs.slice(i - len + 1, i + 1));
      });
      const lower = lows.map((_, i) => {
        if (i + 1 < len) return null;
        return Math.min(...lows.slice(i - len + 1, i + 1));
      });
      mkLine("#7f7f9f")?.setData(toLineData(upper));
      mkLine("#7f7f9f")?.setData(toLineData(lower));
    }

    if (st.supertrend?.enabled && st.supertrend?.showOnChart) {
      const len = Math.max(2, Number(st.supertrend.settings?.atrLength ?? 10));
      const mult = Number(st.supertrend.settings?.multiplier ?? 3);
      const atrVals = atr(highs, lows, closes, len);
      const mid = highs.map((h, i) => (h + lows[i]) / 2);
      const stLine = mid.map((m, i) => (atrVals[i] == null ? null : m - (atrVals[i] as number) * mult * 0.3));
      mkLine("#5ed69f")?.setData(toLineData(stLine));
    }

    if (st.ichimoku?.enabled && st.ichimoku?.showOnChart) {
      const convLen = Math.max(2, Number(st.ichimoku.settings?.conversion ?? 9));
      const baseLen = Math.max(2, Number(st.ichimoku.settings?.base ?? 26));
      const conv = highs.map((_, i) => {
        if (i + 1 < convLen) return null;
        const h = Math.max(...highs.slice(i - convLen + 1, i + 1));
        const l = Math.min(...lows.slice(i - convLen + 1, i + 1));
        return (h + l) / 2;
      });
      const base = highs.map((_, i) => {
        if (i + 1 < baseLen) return null;
        const h = Math.max(...highs.slice(i - baseLen + 1, i + 1));
        const l = Math.min(...lows.slice(i - baseLen + 1, i + 1));
        return (h + l) / 2;
      });
      mkLine("#c07cff")?.setData(toLineData(conv));
      mkLine("#8f6fe8")?.setData(toLineData(base));
    }

    if (st.vwma?.enabled && st.vwma?.showOnChart) {
      const len = Math.max(2, Number(st.vwma.settings?.length ?? 20));
      const vwmaVals = closes.map((_, i) => {
        if (i + 1 < len) return null;
        const cSlice = closes.slice(i - len + 1, i + 1);
        const vSlice = volumes.slice(i - len + 1, i + 1);
        const denom = vSlice.reduce((sum, v) => sum + v, 0);
        if (denom <= 0) return null;
        const num = cSlice.reduce((sum, c, idx) => sum + c * vSlice[idx], 0);
        return num / denom;
      });
      mkLine("#6fd6c8")?.setData(toLineData(vwmaVals));
    }

    if (st.atr?.enabled && st.atr?.showOnChart) {
      const len = Math.max(2, Number(st.atr.settings?.length ?? 14));
      const atrVals = atr(highs, lows, closes, len);
      const atrOnPrice = closes.map((c, i) => (atrVals[i] == null ? null : c - (atrVals[i] as number)));
      mkLine("#f5c542", 1)?.setData(toLineData(atrOnPrice));
    }
  }, [data, indicatorsState]);

  useEffect(() => {
    if (!candleSeriesRef.current) return;

    levelLinesRef.current.forEach((line) => candleSeriesRef.current?.removePriceLine(line));
    levelLinesRef.current = [];

    if (!overlays.keyLevels) return;

    levelLinesRef.current = keyLevels.map((level) =>
      candleSeriesRef.current!.createPriceLine({
        price: level.price,
        color: "rgba(245,197,66,0.38)",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "", // keep axis label only — chart-area titles obscure candles
      }),
    );
  }, [keyLevels, overlays.keyLevels]);

  useEffect(() => {
    if (!candleSeriesRef.current) return;

    tradeLinesRef.current.forEach((line) => candleSeriesRef.current?.removePriceLine(line));
    tradeLinesRef.current = [];
    setEntryBand(null);

    if (!selectedTradeIdea) return;

    const lineDefs: Array<{ price: number; color: string; title: string }> = [
      ...selectedTradeIdea.stops.map((stop, idx) => ({ price: stop.price, color: "rgba(155,82,77,0.8)", title: `SL${idx + 1}` })),
      ...selectedTradeIdea.targets.map((target, idx) => ({ price: target.price, color: "rgba(111,118,95,0.85)", title: `TP${idx + 1}` })),
      { price: selectedTradeIdea.entryLow, color: "rgba(245,197,66,0.85)", title: "ENTRY LOW" },
      { price: selectedTradeIdea.entryHigh, color: "rgba(245,197,66,0.85)", title: "ENTRY HIGH" },
    ];

    tradeLinesRef.current = lineDefs.map((line) =>
      candleSeriesRef.current!.createPriceLine({
        price: line.price,
        color: line.color,
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "", // keep axis label only — chart-area titles obscure candles
      }),
    );

    const y1 = candleSeriesRef.current.priceToCoordinate(selectedTradeIdea.entryHigh);
    const y2 = candleSeriesRef.current.priceToCoordinate(selectedTradeIdea.entryLow);
    if (typeof y1 === "number" && typeof y2 === "number") {
      const top = Math.min(y1, y2);
      const height = Math.max(Math.abs(y2 - y1), 2);
      setEntryBand({ top, height });
    }
  }, [selectedTradeIdea, data]);

  return (
    <section className="rounded-2xl border border-white/10 bg-[#121316] p-4 shadow-[0_20px_48px_rgba(0,0,0,0.35)]">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <h2 className="text-lg font-semibold text-white">
            <CoinSelector
              selectedCoin={selectedCoin}
              onChange={onCoinChange}
              coins={coinOptions}
              loading={coinsLoading}
              errorText={coinErrorText}
              sourceMode={coinSourceMode}
              exchangeName={coinExchangeName}
            />
          </h2>
          <p className="text-xs text-[#6B6F76]">Structure + execution overlays</p>
        </div>

        <div ref={priceBadgeRef} className="px-3 py-1.5 text-right">
          <p ref={priceBadgeTextRef} className="text-lg font-semibold leading-none text-[#7fe0b6]">{formatPrice(lastClose)}</p>
          <p className="text-[10px] text-[#6B6F76]">Live Price</p>
        </div>

        <select className="rounded-lg border border-white/15 bg-[#16181C] px-3 py-1.5 text-sm text-[#BFC2C7]" value={timeframe.lookbackBars} onChange={(e) => onLookbackChange(Number(e.target.value))}>
          {lookbackOptions.map((bars) => (
            <option key={bars} value={bars}>
              {bars} bars
            </option>
          ))}
        </select>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <TimeframeBar value={timeframe.primary} onChange={onTimeframeChange} />

        <div className="flex flex-wrap gap-2 text-xs">
          {([
            ["ema", "EMA"],
            ["vwap", "VWAP"],
            ["volume", "Volume"],
            ["keyLevels", "Key Levels"],
          ] as const).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 rounded-full border border-white/15 bg-[#0F1012] px-3 py-1.5 text-[#BFC2C7]">
              <input
                type="checkbox"
                checked={indicatorsMasterEnabled ? overlays[key] : false}
                disabled={!indicatorsMasterEnabled}
                onChange={(e) => onOverlayChange({ ...overlays, [key]: e.target.checked })}
                className="h-3.5 w-3.5 accent-[#F5C542]"
              />
              {label}
            </label>
          ))}
          <button
            type="button"
            onClick={onOpenIndicatorsPanel}
            className="rounded-full border border-white/15 bg-[#0F1012] px-3 py-1.5 text-[#BFC2C7] hover:bg-[#17191d]"
          >
            Indicators ({indicatorsEnabledCount})
          </button>
        </div>
      </div>

      <div className="relative">
        <div ref={chartElRef} className="h-[420px] w-full overflow-hidden rounded-xl border border-white/10 bg-[#0F1012]" />
        {entryBand ? (
          <div
            className="pointer-events-none absolute left-0 right-0 rounded-sm bg-[#F5C542]/12"
            style={{ top: `${entryBand.top}px`, height: `${entryBand.height}px` }}
          />
        ) : null}
        <div className="pointer-events-none absolute right-3 top-3 w-36 rounded-lg border border-white/10 bg-[#0F1012]/90 p-2">
          <p className="mb-1 text-[10px] uppercase tracking-wider text-[#6B6F76]">Structure</p>
          <div className="relative h-10 rounded border border-white/10 bg-[#121316]">
            <div className="absolute left-2 right-2 top-4 h-2 rounded bg-[#1d2026]" />
            <div className="absolute left-2 top-4 h-2 w-1/3 rounded bg-[#2b2417]" />
            <div className="absolute right-2 top-4 h-2 w-1/3 rounded bg-[#2b2417]" />
            <div className="absolute top-2 h-6 w-1 rounded bg-[#F5C542]" style={{ left: `calc(${clamp(pricePos, 0, 100)}% - 2px)` }} />
          </div>
          <div className="mt-1 flex items-center justify-between text-[10px] text-[#6B6F76]">
            <span>↘ liq</span>
            <span>price</span>
            <span>liq ↙</span>
          </div>
        </div>
      </div>

      <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-white/10 bg-[#0F1012] p-2 text-xs text-[#BFC2C7]">
          <p className="mb-1 text-[10px] uppercase tracking-wider text-[#6B6F76]">Key Levels</p>
          {keyLevels.map((level, idx) => {
            const tag = idx === 0 ? "R1" : idx === 1 ? "Pivot" : idx === keyLevels.length - 1 ? "S1" : `L${idx + 1}`;
            return (
              <p key={level.label}>
                {tag}: {level.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </p>
            );
          })}
        </div>
        <div className="rounded-lg border border-white/10 bg-[#0F1012] p-2 text-xs text-[#BFC2C7]">
          <p className="mb-1 text-[10px] uppercase tracking-wider text-[#6B6F76]">Featured Plan</p>
          {featuredPlan ? (
            (() => {
              const refPrice = Math.max(featuredPlan.entryLow, featuredPlan.entryHigh, 0.0001);
              const fd = refPrice >= 1000 ? 2 : refPrice >= 1 ? 4 : refPrice >= 0.01 ? 6 : 8;
              const fp = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: fd, maximumFractionDigits: fd });
              return (
                <>
                  <p>
                    Entry: {fp(featuredPlan.entryLow)} - {fp(featuredPlan.entryHigh)}
                  </p>
                  <p>
                    Stops: {featuredPlan.stops.map((s) => fp(s.price)).join(" / ")}
                  </p>
                  <p>
                    Targets: {featuredPlan.targets.map((t) => fp(t.price)).join(" / ")}
                  </p>
                  <p>Confidence: {featuredPlan.confidence.toFixed(2)}</p>
                </>
              );
            })()

          ) : (
            <p className="text-[#6B6F76]">No active plan.</p>
          )}
        </div>
        <div className="rounded-lg border border-white/10 bg-[#0F1012] p-2 text-xs text-[#BFC2C7]">
          <p className="mb-1 text-[10px] uppercase tracking-wider text-[#6B6F76]">Confidence Drivers</p>
          <p>Structure {confidenceDrivers.structure}%</p>
          <p>Liquidity {confidenceDrivers.liquidity}%</p>
          <p>Positioning {confidenceDrivers.positioning}%</p>
          <p>Execution {confidenceDrivers.execution}%</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-[#0F1012] p-2 text-xs text-[#BFC2C7]">
          <p className="mb-1 text-[10px] uppercase tracking-wider text-[#6B6F76]">Scenario Outlook</p>
          <p>Trend continuation {scenarioOutlook.trendContinuation}%</p>
          <p>Range continuation {scenarioOutlook.rangeContinuation}%</p>
          <p>Breakout move {scenarioOutlook.breakoutMove}%</p>
        </div>
      </div>

      <TradeIdeasRow
        ideas={tradeIdeas}
        selectedCoin={symbol.replace("/USDT", "")}
        scope={tradeIdeaScope}
        onScopeChange={onTradeIdeaScopeChange}
        selectedIdeaId={selectedTradeIdea?.id ?? null}
        onSelect={onTradeIdeaSelect}
        onIdeaCoinClick={onTradeIdeaCoinClick}
        onIdeaView={onTradeIdeaView}
        onIdeaTrade={onTradeIdeaTrade}
      />

      <div className="mt-3 grid gap-2 lg:grid-cols-2">
        <section className="rounded-lg border border-white/10 bg-[#0F1012] p-2">
          <h3 className="mb-2 text-xs uppercase tracking-widest text-[#6B6F76]">Summary</h3>
          <ul className="space-y-1.5 text-sm text-[#BFC2C7]">
            {aiSummary.slice(0, 5).map((line) => (
              <li key={line} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#F5C542]" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-lg border border-white/10 bg-[#0F1012] p-2">
          <h3 className="mb-2 text-xs uppercase tracking-widest text-[#6B6F76]">Key Reasons</h3>
          <ul className="grid gap-2 text-sm text-[#BFC2C7]">
            {aiKeyReasons.slice(0, 6).map((line) => (
              <li key={line} className="rounded-md border border-white/10 bg-[#121316] px-2 py-1.5">
                {line}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
};
