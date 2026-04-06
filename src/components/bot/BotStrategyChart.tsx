import { useEffect, useRef, useState, useCallback } from "react";
import {
  createChart,
  ColorType,
  type IChartApi,
  type ISeriesApi,
} from "lightweight-charts";

/* ── EMA helper ── */

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

interface SignalMarker {
  time: number;
  type: "entry_long" | "entry_short" | "tp" | "sl";
  price: number;
  label?: string;
}

interface BotStrategyChartProps {
  defaultPair?: string;
  defaultTf?: string;
  indicators?: string[];
  signals?: SignalMarker[];
  accentColor?: string;
  className?: string;
}

/* ── Constants ── */

const PAIRS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT"];
const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h"];

const PAIR_LABELS: Record<string, string> = {
  BTCUSDT: "BTC/USDT",
  ETHUSDT: "ETH/USDT",
  SOLUSDT: "SOL/USDT",
  BNBUSDT: "BNB/USDT",
  XRPUSDT: "XRP/USDT",
  DOGEUSDT: "DOGE/USDT",
};

const SIGNAL_CONFIG: Record<
  SignalMarker["type"],
  { color: string; shape: "arrowUp" | "arrowDown" | "circle"; position: "belowBar" | "aboveBar" }
> = {
  entry_long: { color: "#2cc497", shape: "arrowUp", position: "belowBar" },
  entry_short: { color: "#f6465d", shape: "arrowDown", position: "aboveBar" },
  tp: { color: "#5B8DEF", shape: "circle", position: "aboveBar" },
  sl: { color: "#FF9F43", shape: "circle", position: "belowBar" },
};

const SIGNAL_LABELS: Record<SignalMarker["type"], string> = {
  entry_long: "LONG",
  entry_short: "SHORT",
  tp: "TP",
  sl: "SL",
};

/* ── Mock data generator ── */

const BASE_PRICES: Record<string, number> = {
  BTCUSDT: 68000,
  ETHUSDT: 3400,
  SOLUSDT: 145,
  BNBUSDT: 580,
  XRPUSDT: 0.62,
  DOGEUSDT: 0.15,
};

function generateMockCandles(pair: string, tf: string, count = 200) {
  const base = BASE_PRICES[pair] ?? 100;
  const volatility = base * 0.008;
  const tfMinutes: Record<string, number> = { "1m": 1, "5m": 5, "15m": 15, "1h": 60, "4h": 240 };
  const intervalSec = (tfMinutes[tf] ?? 5) * 60;
  const now = Math.floor(Date.now() / 1000);
  const startTime = now - count * intervalSec;

  const candles: Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }> = [];

  let price = base + (Math.random() - 0.5) * volatility * 10;

  for (let i = 0; i < count; i++) {
    const time = startTime + i * intervalSec;
    const open = price;
    const change = (Math.random() - 0.48) * volatility;
    const close = open + change;
    const wickUp = Math.abs(change) * (0.3 + Math.random() * 1.2);
    const wickDown = Math.abs(change) * (0.3 + Math.random() * 1.2);
    const high = Math.max(open, close) + wickUp;
    const low = Math.min(open, close) - wickDown;
    const volume = (50 + Math.random() * 200) * (base / 100);

    candles.push({ time, open, high, low, close, volume });
    price = close;
  }

  return candles;
}

function generateMockSignals(
  candles: Array<{ time: number; open: number; high: number; low: number; close: number }>,
): SignalMarker[] {
  const signals: SignalMarker[] = [];
  const count = 5 + Math.floor(Math.random() * 4); // 5-8 signals
  const step = Math.floor(candles.length / (count + 1));

  for (let i = 0; i < count; i++) {
    const idx = step * (i + 1) + Math.floor(Math.random() * Math.max(1, step / 2));
    if (idx >= candles.length) continue;
    const c = candles[idx];
    const types: SignalMarker["type"][] = ["entry_long", "entry_short", "tp", "sl"];
    const type = types[Math.floor(Math.random() * types.length)];
    const price =
      type === "entry_long" || type === "sl"
        ? c.low - (c.high - c.low) * 0.1
        : c.high + (c.high - c.low) * 0.1;

    signals.push({ time: c.time, type, price });
  }

  return signals;
}

/* ── Component ── */

export const BotStrategyChart = ({
  defaultPair = "BTCUSDT",
  defaultTf = "15m",
  indicators: _indicators,
  signals: externalSignals,
  accentColor = "#2cc497",
  className = "",
}: BotStrategyChartProps) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const overlaysRef = useRef<ISeriesApi<"Line">[]>([]);

  const [pair, setPair] = useState(defaultPair);
  const [tf, setTf] = useState(defaultTf);
  const [showSignals, setShowSignals] = useState(true);
  const [pairOpen, setPairOpen] = useState(false);

  /* ── Fetch or generate candle data ── */
  const fetchData = useCallback(async () => {
    let candles: Array<{
      time: number;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    }>;

    try {
      const res = await fetch(`/api/market/live?symbol=${pair}&interval=${tf}`);
      if (!res.ok) throw new Error("API error");
      const json = await res.json();
      if (!Array.isArray(json) || json.length < 20) throw new Error("Insufficient data");
      candles = json.map((d: number[]) => ({
        time: Math.floor(d[0] / 1000),
        open: d[1],
        high: d[2],
        low: d[3],
        close: d[4],
        volume: d[5],
      }));
    } catch {
      candles = generateMockCandles(pair, tf);
    }

    const signals = externalSignals ?? generateMockSignals(candles);
    return { candles, signals };
  }, [pair, tf, externalSignals]);

  /* ── Create chart instance ── */
  useEffect(() => {
    if (!rootRef.current) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      candleRef.current = null;
      volRef.current = null;
      overlaysRef.current = [];
    }

    const chart = createChart(rootRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#8e95a1",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.03)" },
        horzLines: { color: "rgba(255,255,255,0.03)" },
      },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.08)",
        scaleMargins: { top: 0.05, bottom: 0.18 },
      },
      timeScale: {
        borderColor: "rgba(255,255,255,0.08)",
        timeVisible: true,
        rightOffset: 3,
        barSpacing: 5,
      },
      crosshair: {
        vertLine: { color: "rgba(255,255,255,0.15)" },
        horzLine: { color: "rgba(255,255,255,0.15)" },
      },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#2cc497",
      downColor: "#f6465d",
      wickUpColor: "#2cc497",
      wickDownColor: "#f6465d",
      borderVisible: false,
    });

    const volSeries = chart.addHistogramSeries({
      color: "rgba(180,185,193,0.3)",
      priceFormat: { type: "volume" },
      priceScaleId: "",
    });
    volSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });

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
  }, []);

  /* ── Load data + overlays ── */
  useEffect(() => {
    let cancelled = false;

    fetchData().then(({ candles, signals }) => {
      if (cancelled) return;
      const chart = chartRef.current;
      const candleSeries = candleRef.current;
      if (!chart || !candleSeries || !candles.length) return;

      // Candle data
      candleSeries.setData(
        candles.map((d) => ({ time: d.time as number, open: d.open, high: d.high, low: d.low, close: d.close })) as any,
      );

      // Volume data
      if (volRef.current) {
        volRef.current.setData(
          candles.map((d) => ({
            time: d.time as number,
            value: d.volume,
            color: d.close >= d.open ? "rgba(43,196,138,0.25)" : "rgba(246,70,93,0.25)",
          })) as any,
        );
      }

      // Remove old overlays
      overlaysRef.current.forEach((s) => {
        try { chart.removeSeries(s); } catch { /* noop */ }
      });
      overlaysRef.current = [];

      // EMA overlays
      if (candles.length > 50) {
        const closes = candles.map((d) => d.close);
        const times = candles.map((d) => d.time);

        const addLine = (values: Array<number | null>, color: string) => {
          const s = chart.addLineSeries({
            color,
            lineWidth: 1,
            priceLineVisible: false,
            crosshairMarkerVisible: false,
          });
          const lineData = values
            .map((v, i) =>
              v == null || !Number.isFinite(v) ? null : { time: times[i], value: Number(v) },
            )
            .filter(Boolean);
          s.setData(lineData as any);
          overlaysRef.current.push(s);
        };

        addLine(ema(closes, 20), "#F5C542");
        addLine(ema(closes, 50), "#FF9F43");
      }

      // Signal markers
      if (showSignals && signals.length) {
        const markers = signals.map((s) => ({
          time: s.time as number,
          position: SIGNAL_CONFIG[s.type].position,
          color: SIGNAL_CONFIG[s.type].color,
          shape: SIGNAL_CONFIG[s.type].shape,
          text: s.label ?? SIGNAL_LABELS[s.type],
        }));
        candleSeries.setMarkers(markers.sort((a, b) => a.time - b.time) as any);

        // TP/SL price lines
        const tpSignals = signals.filter((s) => s.type === "tp");
        const slSignals = signals.filter((s) => s.type === "sl");

        for (const sig of tpSignals) {
          candleSeries.createPriceLine({
            price: sig.price,
            color: "rgba(91,141,239,0.4)",
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: "TP",
          });
        }
        for (const sig of slSignals) {
          candleSeries.createPriceLine({
            price: sig.price,
            color: "rgba(255,159,67,0.4)",
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: "SL",
          });
        }
      } else {
        candleSeries.setMarkers([]);
      }

      chart.timeScale().fitContent();
    });

    return () => {
      cancelled = true;
    };
  }, [pair, tf, showSignals, fetchData]);

  /* ── Render ── */
  return (
    <div className={`relative min-h-[400px] w-full ${className}`} style={{ background: "#0B0B0C" }}>
      {/* Controls overlay */}
      <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
        {/* Pair selector */}
        <div className="relative">
          <button
            onClick={() => setPairOpen((p) => !p)}
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/80 backdrop-blur-sm transition hover:bg-white/[0.08]"
          >
            {PAIR_LABELS[pair] ?? pair}
            <svg width="10" height="6" viewBox="0 0 10 6" fill="none" className="ml-1 opacity-50">
              <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          {pairOpen && (
            <div className="absolute right-0 top-full mt-1 w-36 rounded-lg border border-white/[0.08] bg-[#151518] py-1 shadow-xl">
              {PAIRS.map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    setPair(p);
                    setPairOpen(false);
                  }}
                  className={`block w-full px-3 py-1.5 text-left text-xs transition hover:bg-white/[0.06] ${
                    p === pair ? "text-white" : "text-white/50"
                  }`}
                >
                  {PAIR_LABELS[p]}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Timeframe selector */}
        <div className="flex overflow-hidden rounded-lg border border-white/[0.08]">
          {TIMEFRAMES.map((t) => (
            <button
              key={t}
              onClick={() => setTf(t)}
              className={`px-2.5 py-1.5 text-[10px] font-medium uppercase transition ${
                t === tf
                  ? "text-white"
                  : "text-white/40 hover:text-white/70"
              }`}
              style={t === tf ? { background: accentColor + "22" } : undefined}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Show signals toggle */}
        <button
          onClick={() => setShowSignals((v) => !v)}
          className={`rounded-lg border px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide transition ${
            showSignals
              ? "border-white/[0.12] bg-white/[0.06] text-white/90"
              : "border-white/[0.06] text-white/30 hover:text-white/50"
          }`}
        >
          Signals
        </button>
      </div>

      {/* Chart container */}
      <div ref={rootRef} className="h-full min-h-[400px] w-full" />
    </div>
  );
};

export default BotStrategyChart;
