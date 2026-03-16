import { useEffect, useMemo, useRef, useState } from "react";
import {
  ColorType,
  createChart,
  type CandlestickData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  LineStyle,
  type LineData,
  type UTCTimestamp,
} from "lightweight-charts";
import { useExchangeTerminalStore } from "../../hooks/useExchangeTerminalStore";
import { useLivePriceStore } from "../../hooks/useLivePriceStore";
import type { ExchangeTradeSignal } from "../../types/exchange";
import type { IndicatorGroupKey, IndicatorKey, IndicatorsState } from "../../types";
import { IndicatorsDropdown } from "./IndicatorsDropdown";

const timeframes = ["1m", "15m", "1H", "4H", "1D", "1W"] as const;
type ChartTf = (typeof timeframes)[number];
type MarketTab = "FAVORITES" | "USDM" | "COINM";
type SortKey = "symbol" | "price" | "change";
type SortDir = "asc" | "desc";

/** Canonical live candle update from exchange kline stream */
interface LiveCandleUpdate {
  interval: string;
  openTime: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closed: boolean;
  ts: number;
}

interface Props {
  heightClass?: string;
  liveCandles?: CandlestickData[];
  /** Incremental candle update — applied via series.update() for performance */
  liveCandleUpdate?: LiveCandleUpdate | null;
  blockedMessage?: string | null;
  onAddExchange?: () => void;
  tradingViewSymbol?: string | null;
  chartSourceLabel?: string;
  activeSignal?: ExchangeTradeSignal | null;
  indicatorsState?: IndicatorsState;
  liveOhlcv?: Array<{ time: number; close: number; volume: number }>;
  selectedTimeframe?: ChartTf;
  onTimeframeChange?: (timeframe: ChartTf) => void;
  indicatorsEnabledCount?: number;
  setMasterIndicators?: (enabled: boolean) => void;
  setIndicatorGroup?: (group: IndicatorGroupKey, enabled: boolean) => void;
  setIndicatorEnabled?: (indicator: IndicatorKey, enabled: boolean) => void;
  setIndicatorSetting?: (indicator: IndicatorKey, key: string, value: number | string | boolean | string[]) => void;
  resetIndicator?: (indicator: IndicatorKey) => void;
}

export const ChartPanel = ({
  heightClass = "h-[370px]",
  liveCandles = [],
  liveCandleUpdate = null,
  blockedMessage = null,
  onAddExchange,
  tradingViewSymbol = null,
  chartSourceLabel,
  activeSignal = null,
  indicatorsState,
  liveOhlcv = [],
  selectedTimeframe = "15m",
  onTimeframeChange,
  indicatorsEnabledCount = 0,
  setMasterIndicators,
  setIndicatorGroup,
  setIndicatorEnabled,
  setIndicatorSetting,
  resetIndicator,
}: Props) => {
  const FAV_KEY = "exchange-terminal-favorites-v1";
  const ref = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const signalPriceLinesRef = useRef<IPriceLine[]>([]);
  const overlaySeriesRef = useRef<ISeriesApi<"Line">[]>([]);
  const hasUserInteractedRef = useRef(false);
  const autoFitPendingRef = useRef(true);
  const livePriceLineRef = useRef<IPriceLine | null>(null);
  const closedCandlesRef = useRef<Set<number>>(new Set());
  const lastSetDataSigRef = useRef("");
  const coinMenuRef = useRef<HTMLDivElement | null>(null);
  const [coinMenuOpen, setCoinMenuOpen] = useState(false);
  const [coinQuery, setCoinQuery] = useState("");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [marketTab, setMarketTab] = useState<MarketTab>("USDM");
  const [sortKey, setSortKey] = useState<SortKey>("symbol");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const { selectedSymbol, tickers, accountMode, setSelectedSymbol } = useExchangeTerminalStore();
  const rawSymbol = useMemo(() => selectedSymbol.replace("/", "").toUpperCase(), [selectedSymbol]);
  const normalizeSymbolForFilter = (symbol: string) => symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const isUsdmSymbol = (symbol: string) => normalizeSymbolForFilter(symbol).endsWith("USDT");
  const isCoinmSymbol = (symbol: string) => {
    const s = normalizeSymbolForFilter(symbol);
    return s.endsWith("USD") && !s.endsWith("USDT");
  };
  const ticker = useMemo(() => tickers.find((t) => t.symbol === selectedSymbol) ?? tickers[0], [selectedSymbol, tickers]);
  const filteredTickers = useMemo(() => {
    const query = coinQuery.trim().toLowerCase();
    if (!query) return tickers;
    return tickers.filter((item) => item.symbol.toLowerCase().includes(query));
  }, [coinQuery, tickers]);
  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);
  const favoriteTickers = useMemo(
    () => filteredTickers.filter((item) => favoriteSet.has(item.symbol)),
    [filteredTickers, favoriteSet],
  );
  const otherTickers = useMemo(
    () => filteredTickers.filter((item) => !favoriteSet.has(item.symbol)),
    [filteredTickers, favoriteSet],
  );
  const marketFilteredTickers = useMemo(() => {
    if (marketTab === "FAVORITES") return favoriteTickers;
    if (marketTab === "USDM") {
      return [...favoriteTickers, ...otherTickers].filter((item) => isUsdmSymbol(item.symbol));
    }
    return [...favoriteTickers, ...otherTickers].filter((item) => isCoinmSymbol(item.symbol));
  }, [favoriteTickers, marketTab, otherTickers]);
  const displayedTickers = useMemo(() => {
    const rows = [...marketFilteredTickers];
    rows.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "symbol") cmp = a.symbol.localeCompare(b.symbol);
      else if (sortKey === "price") cmp = (a.lastPrice ?? 0) - (b.lastPrice ?? 0);
      else cmp = (a.change24hPct ?? 0) - (b.change24hPct ?? 0);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [marketFilteredTickers, sortDir, sortKey]);
  const fundingCountdown = useMemo(() => {
    const total = ticker?.fundingCountdownSec ?? 0;
    const mm = Math.floor(total / 60);
    const ss = total % 60;
    return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  }, [ticker?.fundingCountdownSec]);

  const formatNumber = (value?: number, digits = 2) =>
    typeof value === "number" && Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: digits }) : "-";

  const formatPercent = (value?: number, digits = 2) =>
    typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(digits)}%` : "-";

  const MetricChip = ({
    label,
    value,
    tone = "neutral",
    className = "",
    valueClassName = "",
  }: {
    label: string;
    value: string;
    tone?: "neutral" | "up" | "down";
    className?: string;
    valueClassName?: string;
  }) => (
    <div className={`rounded-md border border-white/10 bg-[#101317] px-2 py-1 ${className}`}>
      <p className="text-[10px] uppercase tracking-wide text-[#6B6F76]">{label}</p>
      <p
        className={`mt-0.5 text-xs font-medium ${
          tone === "up" ? "text-[#8fc9ab]" : tone === "down" ? "text-[#d49f9a]" : "text-[#D3D7DE]"
        } ${valueClassName}`}
      >
        {value}
      </p>
    </div>
  );

  useEffect(() => {
    if (blockedMessage) {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        seriesRef.current = null;
        livePriceLineRef.current = null;
      }
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
      hasUserInteractedRef.current = false;
      autoFitPendingRef.current = true;
      closedCandlesRef.current = new Set();
      return;
    }
    if (!ref.current || chartRef.current) return;

    const width = Math.max(320, ref.current.clientWidth || 0);
    const height = Math.max(220, ref.current.clientHeight || 0);
    const chart = createChart(ref.current, {
      width,
      height,
      layout: { background: { type: ColorType.Solid, color: "#121316" }, textColor: "#BFC2C7" },
      grid: { vertLines: { color: "rgba(255,255,255,0.035)" }, horzLines: { color: "rgba(255,255,255,0.035)" } },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
      timeScale: { borderColor: "rgba(255,255,255,0.08)" },
    });
    const series = chart.addCandlestickSeries({
      upColor: "#2bc48a",
      downColor: "#f6465d",
      wickUpColor: "#2bc48a",
      wickDownColor: "#f6465d",
      borderVisible: false,
    });
    chartRef.current = chart;
    seriesRef.current = series;
    series.setData([]);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || !chartRef.current) return;
      const nextWidth = Math.max(320, Math.floor(entry.contentRect.width));
      const nextHeight = Math.max(220, Math.floor(entry.contentRect.height));
      chartRef.current.applyOptions({ width: nextWidth, height: nextHeight });
    });
    observer.observe(ref.current);
    resizeObserverRef.current = observer;

    const markInteracted = () => {
      hasUserInteractedRef.current = true;
    };
    ref.current.addEventListener("wheel", markInteracted, { passive: true });
    ref.current.addEventListener("pointerdown", markInteracted, { passive: true });
    ref.current.addEventListener("touchstart", markInteracted, { passive: true });

    return () => {
      if (ref.current) {
        ref.current.removeEventListener("wheel", markInteracted as EventListener);
        ref.current.removeEventListener("pointerdown", markInteracted as EventListener);
        ref.current.removeEventListener("touchstart", markInteracted as EventListener);
      }
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        seriesRef.current = null;
        livePriceLineRef.current = null;
      }
    };
  }, [blockedMessage]);

  // ── Base candle load: setData() only when bar structure changes ──
  // Dedup guard: skip if candle count and time boundaries haven't changed.
  // This prevents accidental setData from any source that creates new array references.
  useEffect(() => {
    if (blockedMessage) return;
    if (!seriesRef.current || !chartRef.current) return;

    const len = liveCandles.length;
    const sig = len > 0
      ? `${len}:${liveCandles[0].time}:${liveCandles[len - 1].time}`
      : "";
    if (sig === lastSetDataSigRef.current && len > 0) return;
    lastSetDataSigRef.current = sig;

    try {
      seriesRef.current.setData(liveCandles);
      if (liveCandles.length && autoFitPendingRef.current && !hasUserInteractedRef.current) {
        chartRef.current.timeScale().fitContent();
        autoFitPendingRef.current = false;
      }
    } catch {
      // Prevent page crash on malformed/unsorted candle payloads.
      seriesRef.current.setData([]);
    }
  }, [blockedMessage, liveCandles]);

  // ── Live candle incremental update: series.update() for real-time kline events ──
  // This uses series.update() instead of setData() for performance —
  // no flicker, no full re-render, instant chart refresh (~250ms Binance kline rate).
  // Closed candle immutable guard: once a candle is marked closed, it is never updated again.
  useEffect(() => {
    if (blockedMessage) return;
    if (!seriesRef.current) return;
    if (!liveCandleUpdate || liveCandleUpdate.openTime <= 0 || liveCandleUpdate.close <= 0) return;

    const ot = liveCandleUpdate.openTime;
    // Immutable guard: skip updates for candles already marked as closed
    if (closedCandlesRef.current.has(ot)) return;

    try {
      seriesRef.current.update({
        time: ot as UTCTimestamp,
        open: liveCandleUpdate.open,
        high: liveCandleUpdate.high,
        low: liveCandleUpdate.low,
        close: liveCandleUpdate.close,
      });
    } catch {
      // noop — chart may not be ready yet
    }

    // Mark candle as immutable once closed
    if (liveCandleUpdate.closed) {
      closedCandlesRef.current.add(ot);
      // Prune set to avoid unbounded growth: keep only last 5 entries
      if (closedCandlesRef.current.size > 10) {
        const entries = [...closedCandlesRef.current].sort((a, b) => a - b);
        closedCandlesRef.current = new Set(entries.slice(-5));
      }
    }
  }, [blockedMessage, liveCandleUpdate]);

  // ── Live price line overlay: tick-derived micro price (ghost close) ──
  // Uses imperative zustand subscribe() to bypass React render cycle entirely.
  // This prevents ~30 component re-renders/sec from tick updates.
  // Updates the lightweight-charts price line directly via its API.
  useEffect(() => {
    if (blockedMessage) {
      livePriceLineRef.current = null;
      return;
    }

    const updatePriceLine = (state: { bySymbol: Record<string, { price: number; ts: number; side?: "BUY" | "SELL"; prevPrice?: number }> }) => {
      const series = seriesRef.current;
      if (!series) return;

      const lp = state.bySymbol[rawSymbol];
      if (!lp?.price || !Number.isFinite(lp.price)) {
        if (livePriceLineRef.current) {
          try { series.removePriceLine(livePriceLineRef.current); } catch { /* noop */ }
          livePriceLineRef.current = null;
        }
        return;
      }

      const color = lp.prevPrice != null && lp.prevPrice > 0
        ? (lp.price >= lp.prevPrice ? "#2bc48a" : "#f6465d")
        : "#F5C542";

      if (livePriceLineRef.current) {
        livePriceLineRef.current.applyOptions({ price: lp.price, color });
      } else {
        livePriceLineRef.current = series.createPriceLine({
          price: lp.price,
          color,
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: "",
        });
      }
    };

    // Apply current state immediately
    updatePriceLine(useLivePriceStore.getState());

    // Subscribe to future changes — bypasses React render cycle
    const unsub = useLivePriceStore.subscribe(updatePriceLine);
    return unsub;
  }, [blockedMessage, rawSymbol]);

  useEffect(() => {
    if (!chartRef.current) return;
    overlaySeriesRef.current.forEach((s) => {
      try {
        chartRef.current?.removeSeries(s);
      } catch {
        // noop
      }
    });
    overlaySeriesRef.current = [];

    const st = indicatorsState;
    if (!st || !st.masterEnabled || !liveCandles.length) return;
    const closes = liveCandles.map((c) => Number(c.close));
    const times = liveCandles.map((c) => c.time);
    const volRows = liveOhlcv.length ? liveOhlcv : liveCandles.map((c) => ({ time: Number(c.time), close: Number(c.close), volume: 1 }));

    const mkLine = (color: string) => {
      if (!chartRef.current) return null;
      const s = chartRef.current.addLineSeries({
        color,
        lineWidth: 1,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
      });
      overlaySeriesRef.current.push(s);
      return s;
    };
    const toLineData = (vals: Array<number | null>): LineData[] =>
      vals
        .map((v, i) => (v == null || !Number.isFinite(v) ? null : { time: times[i], value: Number(v) }))
        .filter(Boolean) as LineData[];
    const sma = (arr: number[], len: number): Array<number | null> =>
      arr.map((_, i) => {
        if (i + 1 < len) return null;
        const slice = arr.slice(i - len + 1, i + 1);
        const avg = slice.reduce((a, b) => a + b, 0) / len;
        return avg;
      });
    const ema = (arr: number[], len: number): Array<number | null> => {
      const out: Array<number | null> = new Array(arr.length).fill(null);
      if (!arr.length || len <= 1) return arr.map((v) => (Number.isFinite(v) ? v : null));
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
        const mean = slice.reduce((a, b) => a + b, 0) / len;
        const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / len;
        return Math.sqrt(variance);
      });

    if (st.indicators.ema?.enabled && st.indicators.ema?.showOnChart) {
      const periodsRaw = st.indicators.ema.settings?.periods;
      const periods = Array.isArray(periodsRaw) ? periodsRaw.map((p) => Number(p)).filter((n) => Number.isFinite(n) && n > 1) : [20, 50, 200];
      const colors = ["#F5C542", "#d24fb5", "#7a6ff0"];
      periods.slice(0, 3).forEach((p, idx) => {
        const s = mkLine(colors[idx] ?? "#F5C542");
        if (!s) return;
        s.setData(toLineData(ema(closes, p)));
      });
    }

    if (st.indicators.vwap?.enabled && st.indicators.vwap?.showOnChart) {
      const s = mkLine("#6fd6c8");
      if (s) {
        let cumPV = 0;
        let cumV = 0;
        const vals = volRows.map((r) => {
          const c = Number(r.close);
          const v = Math.max(1e-9, Number(r.volume));
          cumPV += c * v;
          cumV += v;
          return cumPV / cumV;
        });
        s.setData(
          vals.map((v, i) => ({
            time: times[i],
            value: v,
          })),
        );
      }
    }

    if (st.indicators.bbands?.enabled && st.indicators.bbands?.showOnChart) {
      const len = Number(st.indicators.bbands.settings?.length ?? 20);
      const dev = Number(st.indicators.bbands.settings?.stdev ?? 2);
      const basis = sma(closes, Number.isFinite(len) && len > 1 ? len : 20);
      const sigma = std(closes, Number.isFinite(len) && len > 1 ? len : 20);
      const upper = basis.map((b, i) => (b == null || sigma[i] == null ? null : b + (sigma[i] as number) * dev));
      const lower = basis.map((b, i) => (b == null || sigma[i] == null ? null : b - (sigma[i] as number) * dev));
      const su = mkLine("#8a8f98");
      const sl = mkLine("#8a8f98");
      su?.setData(toLineData(upper));
      sl?.setData(toLineData(lower));
    }
  }, [indicatorsState, liveCandles, liveOhlcv]);

  useEffect(() => {
    if (!seriesRef.current) return;
    signalPriceLinesRef.current.forEach((line) => {
      try {
        seriesRef.current?.removePriceLine(line);
      } catch {
        // noop
      }
    });
    signalPriceLinesRef.current = [];
    if (!activeSignal) return;

    const mkLine = (price: number, title: string, color: string, style: LineStyle = LineStyle.Solid) => {
      if (!Number.isFinite(price) || price <= 0 || !seriesRef.current) return;
      const line = seriesRef.current.createPriceLine({
        price,
        color,
        lineWidth: 1,
        lineStyle: style,
        axisLabelVisible: true,
        title,
      });
      signalPriceLinesRef.current.push(line);
    };

    mkLine(activeSignal.entryLow, "ENTRY L", "#F5C542", LineStyle.Dashed);
    mkLine(activeSignal.entryHigh, "ENTRY H", "#F5C542", LineStyle.Dashed);
    mkLine(activeSignal.stops[0], "SL1", "#f6465d");
    mkLine(activeSignal.stops[1], "SL2", "#f08a98");
    mkLine(activeSignal.targets[0], "TP1", "#2bc48a");
    mkLine(activeSignal.targets[1], "TP2", "#6ad9ab");
  }, [activeSignal]);

  useEffect(() => {
    // On symbol change, allow one initial autofit again and reset pipeline state.
    hasUserInteractedRef.current = false;
    autoFitPendingRef.current = true;
    closedCandlesRef.current = new Set();
    livePriceLineRef.current = null;
    lastSetDataSigRef.current = ""; // force setData on next candle load
  }, [selectedSymbol]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FAV_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) setFavorites(parsed.filter((x) => typeof x === "string"));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(FAV_KEY, JSON.stringify(favorites));
    } catch {
      // ignore
    }
  }, [favorites]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "symbol" ? "asc" : "desc");
  };

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (!coinMenuRef.current) return;
      if (!coinMenuRef.current.contains(event.target as Node)) setCoinMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <section className={`${heightClass} flex min-h-0 flex-col rounded-xl border border-white/10 bg-[#121316]`}>
      <div className="border-b border-white/10 px-3 py-1.5">
        <div className="relative min-w-0 overflow-visible">
          <div className="flex flex-wrap items-center gap-2 text-xs">
              <div ref={coinMenuRef} className="relative">
                <button
                  type="button"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => setCoinMenuOpen((v) => !v)}
                  className="inline-flex items-center gap-1 rounded border border-white/15 bg-[#0F1012] px-2 py-1 font-semibold text-white"
                >
                  {selectedSymbol}
                  {accountMode === "Futures" ? <span className="rounded bg-[#1b1d22] px-1.5 py-0.5 text-[10px] text-[#BFC2C7]">Perp</span> : null}
                  <span className="text-[10px] text-[#8A8F98]">▾</span>
                </button>
                {coinMenuOpen ? (
                  <div className="absolute left-0 top-full z-30 mt-2 w-[min(520px,92vw)] max-h-[calc(100vh-120px)] overflow-y-auto rounded-xl border border-white/10 bg-[var(--panelAlt2)] p-2 shadow-2xl">
                    <input
                      value={coinQuery}
                      onChange={(e) => setCoinQuery(e.target.value)}
                      placeholder="Search"
                      className="mb-2 w-full rounded-md border border-white/15 bg-[#0F1012] px-3 py-2 text-sm text-[#E7E9ED] outline-none placeholder:text-[#6B6F76]"
                    />
                    <div className="mb-2 flex items-center gap-4 px-1 text-xs">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMarketTab("FAVORITES");
                        }}
                        className={marketTab === "FAVORITES" ? "border-b border-[#F5C542] pb-0.5 text-[#F5C542]" : "text-[#8A8F98]"}
                      >
                        Favorites
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMarketTab("USDM");
                        }}
                        className={marketTab === "USDM" ? "border-b border-[#F5C542] pb-0.5 text-[#F5C542]" : "text-[#8A8F98]"}
                      >
                        USDⓈ-M
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMarketTab("COINM");
                        }}
                        className={marketTab === "COINM" ? "border-b border-[#F5C542] pb-0.5 text-[#F5C542]" : "text-[#8A8F98]"}
                      >
                        COIN-M
                      </button>
                      <span className="ml-auto text-[#8A8F98]">All ▾</span>
                    </div>
                    <div className="grid grid-cols-[1.6fr_1fr_1fr] px-2 py-1 text-[10px] uppercase tracking-wider text-[#6B6F76]">
                      <button type="button" onClick={(e) => { e.stopPropagation(); toggleSort("symbol"); }} className="flex items-center gap-1 text-left">
                        Symbols
                        <span className="text-[9px]">{sortKey === "symbol" ? (sortDir === "asc" ? "▴" : "▾") : "↕"}</span>
                      </button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); toggleSort("price"); }} className="flex items-center justify-end gap-1 text-right">
                        Last Price
                        <span className="text-[9px]">{sortKey === "price" ? (sortDir === "asc" ? "▴" : "▾") : "↕"}</span>
                      </button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); toggleSort("change"); }} className="flex items-center justify-end gap-1 text-right">
                        24h Chg
                        <span className="text-[9px]">{sortKey === "change" ? (sortDir === "asc" ? "▴" : "▾") : "↕"}</span>
                      </button>
                    </div>
                    <div className="max-h-[calc(100vh-280px)] min-h-[120px] overflow-y-auto">
                      {displayedTickers.map((item) => (
                        <div
                          key={item.symbol}
                          className={`grid w-full grid-cols-[1.6fr_1fr_1fr] items-center px-2 py-1.5 text-sm ${
                            item.symbol === selectedSymbol
                              ? "bg-[color-mix(in_srgb,var(--accent)_10%,var(--panel))]"
                              : "hover:bg-[color-mix(in_srgb,var(--panelAlt2)_80%,var(--border)_20%)]"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedSymbol(item.symbol);
                              setCoinMenuOpen(false);
                            }}
                            className="flex min-w-0 items-center gap-2 text-left"
                          >
                            <span className="truncate text-[#E7E9ED]">{item.symbol.replace("/", "")}</span>
                            <span className="rounded bg-[#1b1d22] px-1.5 py-0.5 text-[10px] text-[#BFC2C7]">Perp</span>
                          </button>
                          <span className="text-right text-[#E7E9ED]">{formatNumber(item.lastPrice, 5)}</span>
                          <div className="flex items-center justify-end gap-2">
                            <span className={`${(item.change24hPct ?? 0) >= 0 ? "text-[#8fc9ab]" : "text-[#d49f9a]"}`}>
                              {formatPercent(item.change24hPct, 2)}
                            </span>
                            <button
                              type="button"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                setFavorites((prev) =>
                                  prev.includes(item.symbol)
                                    ? prev.filter((s) => s !== item.symbol)
                                    : [item.symbol, ...prev],
                                );
                              }}
                              className="text-[#F5C542]"
                              title="Toggle favorite"
                            >
                              {favoriteSet.has(item.symbol) ? "★" : "☆"}
                            </button>
                          </div>
                        </div>
                      ))}
                      {!displayedTickers.length ? (
                        <div className="px-2 py-3 text-xs text-[#6B6F76]">
                          No symbols in this tab.
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
              <span className="text-base font-semibold text-[#d49f9a]">{formatNumber(ticker?.lastPrice)}</span>
              <span className={typeof ticker?.change24hPct === "number" && ticker.change24hPct >= 0 ? "text-[#8fc9ab]" : "text-[#d49f9a]"}>
                {formatPercent(ticker?.change24hPct)}
              </span>
          </div>
          <div className={`mt-1 grid gap-1.5 ${accountMode === "Futures" ? "grid-cols-2 md:grid-cols-4 xl:grid-cols-8" : "grid-cols-2 md:grid-cols-3"}`}>
            <MetricChip label="24h Vol(BTC)" value={formatNumber(ticker?.volume24h, 2)} />
            {accountMode === "Futures" ? (
              <>
                <MetricChip label="Mark" value={formatNumber(ticker?.markPrice, 2)} />
                <MetricChip label="Index" value={formatNumber(ticker?.indexPrice, 2)} />
                <MetricChip
                  label="Funding (8h)"
                  value={`${(ticker?.fundingRate8h ?? 0).toFixed(5)}% / ${fundingCountdown}`}
                  tone={(ticker?.fundingRate8h ?? 0) >= 0 ? "up" : "down"}
                  className="md:col-span-1 xl:col-span-1 min-w-[136px]"
                  valueClassName="whitespace-nowrap"
                />
                <MetricChip label="24h High" value={formatNumber(ticker?.high24h, 2)} />
                <MetricChip label="24h Low" value={formatNumber(ticker?.low24h, 2)} />
                <MetricChip
                  label="Open Interest(USDT)"
                  value={formatNumber(ticker?.openInterestUsd, 2)}
                  className="md:col-span-2 xl:col-span-2 min-w-[186px]"
                />
              </>
            ) : null}
          </div>
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[11px]">
            <span className="border-b border-[#F5C542] pb-0.5 text-[#F5C542]">Chart</span>
            <span className="text-[#6B6F76]">Info</span>
            <span className="text-[#6B6F76]">Trading Data</span>
            <span className="text-[#6B6F76]">Trading Analysis</span>
            <span className="text-[#6B6F76]">Square</span>
            {chartSourceLabel ? (
              <span className="ml-2 rounded border border-white/10 bg-[#111418] px-1.5 py-0.5 text-[10px] text-[#8A8F98]">
                Chart source: {chartSourceLabel}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            {timeframes.map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => onTimeframeChange?.(tf)}
                className={`rounded px-1.5 py-0.5 ${tf === selectedTimeframe ? "bg-[#0F1012] text-white" : "text-[#6B6F76]"}`}
              >
                {tf}
              </button>
            ))}
            {indicatorsState && setMasterIndicators && setIndicatorGroup && setIndicatorEnabled && setIndicatorSetting && resetIndicator ? (
              <IndicatorsDropdown
                state={indicatorsState}
                enabledCount={indicatorsEnabledCount}
                setMaster={setMasterIndicators}
                setGroup={setIndicatorGroup}
                setIndicatorEnabled={setIndicatorEnabled}
                setIndicatorSetting={setIndicatorSetting}
                resetIndicator={resetIndicator}
              />
            ) : null}
          </div>
        </div>
      </div>
      {blockedMessage ? (
        <div className="flex min-h-0 flex-1 w-full items-center justify-center px-6">
          {tradingViewSymbol ? (
            <div className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-[#7a6840] bg-[#0f1012]">
              <div className="flex items-center justify-between border-b border-[#7a6840]/40 px-3 py-2 text-xs">
                <span className="text-[#F5C542]">Primary feed unavailable. TradingView fallback active.</span>
                <span className="text-[#BFC2C7]">{tradingViewSymbol}</span>
              </div>
              <iframe
                title="TradingView Fallback Chart"
                src={`https://s.tradingview.com/widgetembed/?symbol=${encodeURIComponent(
                  tradingViewSymbol,
                )}&interval=15&hidesidetoolbar=1&theme=dark&style=1&timezone=Etc%2FUTC&withdateranges=1&hide_top_toolbar=0&hide_legend=0&saveimage=0&studies=[]`}
                className="h-full w-full"
              />
            </div>
          ) : (
            <div className="w-full max-w-xl rounded-xl border border-[#7a6840] bg-[#2a2418] p-6 text-center">
              <p className="text-base font-semibold text-[#F5C542]">{blockedMessage}</p>
              <p className="mt-1 text-xs text-[#d7c9a1]">Connect an exchange API in Settings/Admin to load live chart data.</p>
              {onAddExchange ? (
                <button
                  type="button"
                  onClick={onAddExchange}
                  className="mt-3 rounded-lg border border-[#7a6840] bg-[#1d1a14] px-3 py-1.5 text-xs font-semibold text-[#F5C542]"
                >
                  + Add exchange
                </button>
              ) : null}
            </div>
          )}
        </div>
      ) : (
        <div ref={ref} className="min-h-0 flex-1 w-full" />
      )}
    </section>
  );
};
