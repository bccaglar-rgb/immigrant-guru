import { useEffect, useRef, useMemo } from "react";

interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface ChartCardProps {
  symbol: string;
  timeframe: string;
  data: CandleData[];
  compact?: boolean;
  className?: string;
}

// Generate color from price action
const trendColor = (d: CandleData) => (d.close >= d.open ? "#2bc48a" : "#f6465d");

export const ChartCard = ({ symbol, timeframe, data, compact = false, className = "" }: ChartCardProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const latest = data[data.length - 1];
  const prev = data[data.length - 2];
  const pctChange = prev ? ((latest.close - prev.close) / prev.close) * 100 : 0;
  const isUp = pctChange >= 0;

  const priceRange = useMemo(() => {
    if (!data.length) return { min: 0, max: 1 };
    let min = Infinity, max = -Infinity;
    for (const d of data) {
      if (d.low < min) min = d.low;
      if (d.high > max) max = d.high;
    }
    const pad = (max - min) * 0.08;
    return { min: min - pad, max: max + pad };
  }, [data]);

  const volMax = useMemo(() => {
    let m = 0;
    for (const d of data) if (d.volume > m) m = d.volume;
    return m || 1;
  }, [data]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = rect.width;
    const h = rect.height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const chartH = h * 0.75;
    const volH = h * 0.2;
    const volY = chartH + h * 0.05;
    const { min, max } = priceRange;
    const range = max - min || 1;
    const candleCount = data.length;
    const candleW = Math.max(1, (w - 8) / candleCount);
    const bodyW = Math.max(1, candleW * 0.6);

    // Grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 4; i++) {
      const y = (chartH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Volume bars
    for (let i = 0; i < candleCount; i++) {
      const d = data[i];
      const x = 4 + i * candleW + candleW / 2;
      const barH = (d.volume / volMax) * volH;
      const color = d.close >= d.open ? "rgba(43,196,138,0.25)" : "rgba(246,70,93,0.25)";
      ctx.fillStyle = color;
      ctx.fillRect(x - bodyW / 2, volY + volH - barH, bodyW, barH);
    }

    // Candles
    for (let i = 0; i < candleCount; i++) {
      const d = data[i];
      const x = 4 + i * candleW + candleW / 2;
      const yHigh = ((max - d.high) / range) * chartH;
      const yLow = ((max - d.low) / range) * chartH;
      const yOpen = ((max - d.open) / range) * chartH;
      const yClose = ((max - d.close) / range) * chartH;
      const color = trendColor(d);

      // Wick
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, yHigh);
      ctx.lineTo(x, yLow);
      ctx.stroke();

      // Body
      ctx.fillStyle = color;
      const bodyTop = Math.min(yOpen, yClose);
      const bodyBot = Math.max(yOpen, yClose);
      const bodyHeight = Math.max(1, bodyBot - bodyTop);
      ctx.fillRect(x - bodyW / 2, bodyTop, bodyW, bodyHeight);
    }

    // EMA overlay (simple 20-period)
    if (data.length > 20) {
      const emaPoints: { x: number; y: number }[] = [];
      let ema = data[0].close;
      const k = 2 / (20 + 1);
      for (let i = 0; i < candleCount; i++) {
        ema = data[i].close * k + ema * (1 - k);
        const x = 4 + i * candleW + candleW / 2;
        const y = ((max - ema) / range) * chartH;
        emaPoints.push({ x, y });
      }
      ctx.strokeStyle = "rgba(245,197,66,0.5)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < emaPoints.length; i++) {
        const p = emaPoints[i];
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }

    // Current price line
    if (latest) {
      const y = ((max - latest.close) / range) * chartH;
      ctx.strokeStyle = isUp ? "rgba(43,196,138,0.4)" : "rgba(246,70,93,0.4)";
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [data, priceRange, volMax, isUp, latest]);

  return (
    <div className={`relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-[var(--panel)] ${className}`}>
      {/* Header */}
      <div className={`flex items-center justify-between border-b border-white/[0.06] ${compact ? "px-2.5 py-1.5" : "px-3.5 py-2"}`}>
        <div className="flex items-center gap-2">
          <span className={`font-semibold text-[var(--text)] ${compact ? "text-[11px]" : "text-xs"}`}>{symbol}</span>
          <span className={`rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-mono ${compact ? "text-[9px]" : "text-[10px]"} text-[var(--textMuted)]`}>{timeframe}</span>
        </div>
        <div className="flex items-center gap-2">
          {latest && (
            <span className={`font-mono font-semibold ${compact ? "text-[11px]" : "text-xs"} ${isUp ? "text-[#2bc48a]" : "text-[#f6465d]"}`}>
              ${latest.close.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          )}
          <span className={`rounded-full px-1.5 py-0.5 font-mono text-[9px] font-bold ${isUp ? "bg-[#2bc48a]/15 text-[#2bc48a]" : "bg-[#f6465d]/15 text-[#f6465d]"}`}>
            {isUp ? "+" : ""}{pctChange.toFixed(2)}%
          </span>
        </div>
      </div>

      {/* Chart */}
      <div ref={containerRef} className="relative flex-1 min-h-0">
        <canvas ref={canvasRef} className="absolute inset-0" />
      </div>
    </div>
  );
};
