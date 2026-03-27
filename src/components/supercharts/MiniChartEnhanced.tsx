import { useEffect, useRef } from "react";
import {
  ColorType,
  createChart,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  type LineData,
} from "lightweight-charts";
import type { IndicatorsState } from "../../types";

/* ── Indicator math (ported from exchange/ChartPanel) ── */

const sma = (arr: number[], len: number): Array<number | null> =>
  arr.map((_, i) => {
    if (i + 1 < len) return null;
    const slice = arr.slice(i - len + 1, i + 1);
    return slice.reduce((a, b) => a + b, 0) / len;
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

/* ── Component ── */

interface Props {
  candles: CandlestickData[];
  volumeData: HistogramData[];
  ohlcvRows: Array<{ time: number; close: number; volume: number }>;
  indicatorsState?: IndicatorsState;
}

export const MiniChartEnhanced = ({ candles, volumeData, ohlcvRows, indicatorsState }: Props) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const overlaySeriesRef = useRef<ISeriesApi<"Line">[]>([]);

  /* ── Init chart ── */
  useEffect(() => {
    if (!rootRef.current || chartRef.current) return;
    const chart = createChart(rootRef.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "#10131a" }, textColor: "#8e95a1", fontSize: 10 },
      grid: { vertLines: { color: "rgba(255,255,255,0.03)" }, horzLines: { color: "rgba(255,255,255,0.03)" } },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.08)", scaleMargins: { top: 0.05, bottom: 0.18 } },
      timeScale: { borderColor: "rgba(255,255,255,0.08)", timeVisible: true, rightOffset: 3, barSpacing: 5 },
      crosshair: { vertLine: { color: "rgba(255,255,255,0.15)" }, horzLine: { color: "rgba(255,255,255,0.15)" } },
    });
    const series = chart.addCandlestickSeries({
      upColor: "#2cc497",
      downColor: "#f6465d",
      wickUpColor: "#2cc497",
      wickDownColor: "#f6465d",
      borderVisible: false,
    });

    /* Volume histogram */
    const volSeries = chart.addHistogramSeries({
      color: "rgba(180,185,193,0.3)",
      priceFormat: { type: "volume" },
      priceScaleId: "",
    });
    volSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });

    chartRef.current = chart;
    seriesRef.current = series;
    volumeSeriesRef.current = volSeries;

    series.setData(candles);
    volSeries.setData(volumeData);
    chart.timeScale().fitContent();

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      volumeSeriesRef.current = null;
      overlaySeriesRef.current = [];
    };
  }, []);

  /* ── Update candle + volume data ── */
  useEffect(() => {
    seriesRef.current?.setData(candles);
    volumeSeriesRef.current?.setData(volumeData);
    chartRef.current?.timeScale().fitContent();
  }, [candles, volumeData]);

  /* ── Indicator overlays ── */
  useEffect(() => {
    if (!chartRef.current) return;
    overlaySeriesRef.current.forEach((s) => {
      try { chartRef.current?.removeSeries(s); } catch { /* noop */ }
    });
    overlaySeriesRef.current = [];

    const st = indicatorsState;
    if (!st?.masterEnabled || !candles.length) return;

    const closes = candles.map((c) => Number(c.close));
    const times = candles.map((c) => c.time);
    const volRows = ohlcvRows.length
      ? ohlcvRows
      : candles.map((c) => ({ time: Number(c.time), close: Number(c.close), volume: 1 }));

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

    /* EMA */
    if (st.indicators.ema?.enabled && st.indicators.ema?.showOnChart) {
      const periodsRaw = st.indicators.ema.settings?.periods;
      const periods = Array.isArray(periodsRaw)
        ? periodsRaw.map((p) => Number(p)).filter((n) => Number.isFinite(n) && n > 1)
        : [20, 50, 200];
      const colors = ["#F5C542", "#d24fb5", "#7a6ff0"];
      periods.slice(0, 3).forEach((p, idx) => {
        const s = mkLine(colors[idx] ?? "#F5C542");
        if (!s) return;
        s.setData(toLineData(ema(closes, p)));
      });
    }

    /* VWAP */
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
        s.setData(vals.map((v, i) => ({ time: times[i], value: v })));
      }
    }

    /* Bollinger Bands */
    if (st.indicators.bbands?.enabled && st.indicators.bbands?.showOnChart) {
      const len = Number(st.indicators.bbands.settings?.length ?? 20);
      const dev = Number(st.indicators.bbands.settings?.stdev ?? 2);
      const safelen = Number.isFinite(len) && len > 1 ? len : 20;
      const basis = sma(closes, safelen);
      const sigma = std(closes, safelen);
      const upper = basis.map((b, i) => (b == null || sigma[i] == null ? null : b + (sigma[i] as number) * dev));
      const lower = basis.map((b, i) => (b == null || sigma[i] == null ? null : b - (sigma[i] as number) * dev));
      mkLine("#8a8f98")?.setData(toLineData(upper));
      mkLine("#8a8f98")?.setData(toLineData(lower));
    }
  }, [indicatorsState, candles, ohlcvRows]);

  return <div ref={rootRef} className="h-full min-h-[280px] w-full" />;
};
