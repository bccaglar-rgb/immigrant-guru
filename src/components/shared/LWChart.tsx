import { useEffect, useRef } from "react";
import {
  ColorType,
  createChart,
  type IChartApi,
  type ISeriesApi,
} from "lightweight-charts";

/* ── Indicator math ── */

const ema = (arr: number[], len: number): Array<number | null> => {
  const out: Array<number | null> = new Array(arr.length).fill(null);
  if (!arr.length || len <= 1) return arr.map((v) => (Number.isFinite(v) ? v : null));
  const k = 2 / (len + 1);
  let prev = arr[0];
  for (let i = 0; i < arr.length; i++) {
    prev = i === 0 ? arr[i] : arr[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
};

/* ── Types ── */

export interface OHLCVData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface LWChartProps {
  data: OHLCVData[];
  compact?: boolean;
  showVolume?: boolean;
  showIndicators?: boolean;
  className?: string;
}

/* ── Component ── */

export const LWChart = ({
  data,
  compact = false,
  showVolume = true,
  showIndicators = false,
  className = "",
}: LWChartProps) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const overlaysRef = useRef<ISeriesApi<"Line">[]>([]);

  /* ── Create chart ── */
  useEffect(() => {
    if (!rootRef.current) return;
    // Destroy previous chart if any
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      candleRef.current = null;
      volRef.current = null;
      overlaysRef.current = [];
    }

    const fontSize = compact ? 9 : 10;
    const chart = createChart(rootRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#10131a" },
        textColor: "#8e95a1",
        fontSize,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.03)" },
        horzLines: { color: "rgba(255,255,255,0.03)" },
      },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.08)",
        scaleMargins: { top: 0.05, bottom: showVolume ? 0.18 : 0.05 },
      },
      timeScale: {
        borderColor: "rgba(255,255,255,0.08)",
        timeVisible: true,
        rightOffset: compact ? 1 : 3,
        barSpacing: compact ? 3 : 5,
      },
      crosshair: {
        vertLine: { color: "rgba(255,255,255,0.15)" },
        horzLine: { color: "rgba(255,255,255,0.15)" },
      },
    });

    /* Candlestick series */
    const candleSeries = chart.addCandlestickSeries({
      upColor: "#2cc497",
      downColor: "#f6465d",
      wickUpColor: "#2cc497",
      wickDownColor: "#f6465d",
      borderVisible: false,
    });

    /* Volume histogram */
    let volSeries: ISeriesApi<"Histogram"> | null = null;
    if (showVolume) {
      volSeries = chart.addHistogramSeries({
        color: "rgba(180,185,193,0.3)",
        priceFormat: { type: "volume" },
        priceScaleId: "",
      });
      volSeries.priceScale().applyOptions({
        scaleMargins: { top: 0.82, bottom: 0 },
      });
    }

    chartRef.current = chart;
    candleRef.current = candleSeries;
    volRef.current = volSeries;

    return () => {
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volRef.current = null;
      overlaysRef.current = [];
    };
  }, [compact, showVolume]);

  /* ── Update data + overlays ── */
  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleRef.current;
    if (!chart || !candleSeries || !data.length) return;

    // Set candle data
    const candles = data.map((d) => ({
      time: d.time as number,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));
    candleSeries.setData(candles as any);

    // Set volume data
    if (volRef.current) {
      const volData = data.map((d) => ({
        time: d.time as number,
        value: d.volume,
        color: d.close >= d.open ? "rgba(43,196,138,0.25)" : "rgba(246,70,93,0.25)",
      }));
      volRef.current.setData(volData as any);
    }

    // Remove old overlays
    overlaysRef.current.forEach((s) => {
      try { chart.removeSeries(s); } catch { /* noop */ }
    });
    overlaysRef.current = [];

    // Add indicator overlays
    if (showIndicators && data.length > 20) {
      const closes = data.map((d) => d.close);
      const times = data.map((d) => d.time);

      const mkLine = (color: string, width: 1 | 2 | 3 | 4 = 1) => {
        const s = chart.addLineSeries({
          color,
          lineWidth: width,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
        });
        overlaysRef.current.push(s);
        return s;
      };

      const toLineData = (vals: Array<number | null>) =>
        vals
          .map((v, i) => (v == null || !Number.isFinite(v) ? null : { time: times[i], value: Number(v) }))
          .filter(Boolean);

      // EMA 20
      mkLine("#F5C542", 1).setData(toLineData(ema(closes, 20)) as any);

      // EMA 50
      mkLine("#FF9F43", 1).setData(toLineData(ema(closes, 50)) as any);

      // VWAP
      let cumPV = 0;
      let cumV = 0;
      const vwapVals = data.map((d) => {
        const typical = (d.high + d.low + d.close) / 3;
        cumPV += typical * d.volume;
        cumV += d.volume;
        return cumPV / cumV;
      });
      mkLine("#5B8DEF", 1).setData(
        vwapVals.map((v, i) => ({ time: times[i], value: v })) as any
      );
    }

    chart.timeScale().fitContent();
  }, [data, showIndicators]);

  return (
    <div
      ref={rootRef}
      className={`h-full w-full ${compact ? "min-h-[80px]" : "min-h-[200px]"} ${className}`}
    />
  );
};
