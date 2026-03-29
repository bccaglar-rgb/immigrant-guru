import { useEffect, useRef, useMemo } from "react";

interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number }
interface Props { data: Candle[]; symbol: string }

export const HeroChart = ({ data, symbol }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const latest = data[data.length - 1];
  const prev = data[data.length - 2];
  const pctChange = prev ? ((latest.close - prev.close) / prev.close) * 100 : 0;
  const isUp = pctChange >= 0;

  const { min, max } = useMemo(() => {
    let mn = Infinity, mx = -Infinity;
    for (const d of data) { if (d.low < mn) mn = d.low; if (d.high > mx) mx = d.high; }
    const pad = (mx - mn) * 0.06;
    return { min: mn - pad, max: mx + pad };
  }, [data]);

  const volMax = useMemo(() => { let m = 0; for (const d of data) if (d.volume > m) m = d.volume; return m || 1; }, [data]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = rect.width, h = rect.height;
    canvas.width = w * dpr; canvas.height = h * dpr;
    canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const chartH = h * 0.78, volH = h * 0.16, volY = chartH + h * 0.04;
    const range = max - min || 1;
    const cw = Math.max(1, (w - 8) / data.length), bw = Math.max(1, cw * 0.55);

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.03)"; ctx.lineWidth = 0.5;
    for (let i = 0; i <= 5; i++) { const y = (chartH / 5) * i; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

    // VWAP line
    let vwapSum = 0, volSum = 0;
    const vwapPts: { x: number; y: number }[] = [];
    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      const typical = (d.high + d.low + d.close) / 3;
      vwapSum += typical * d.volume; volSum += d.volume;
      const vwap = vwapSum / volSum;
      vwapPts.push({ x: 4 + i * cw + cw / 2, y: ((max - vwap) / range) * chartH });
    }
    ctx.strokeStyle = "rgba(91,141,239,0.45)"; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]);
    ctx.beginPath(); vwapPts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.stroke();
    ctx.setLineDash([]);

    // EMA 20
    let ema20 = data[0].close;
    const emaPts: { x: number; y: number }[] = [];
    for (let i = 0; i < data.length; i++) {
      ema20 = data[i].close * (2 / 21) + ema20 * (1 - 2 / 21);
      emaPts.push({ x: 4 + i * cw + cw / 2, y: ((max - ema20) / range) * chartH });
    }
    ctx.strokeStyle = "rgba(245,197,66,0.5)"; ctx.lineWidth = 1.2;
    ctx.beginPath(); emaPts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.stroke();

    // EMA 50
    let ema50 = data[0].close;
    const ema50Pts: { x: number; y: number }[] = [];
    for (let i = 0; i < data.length; i++) {
      ema50 = data[i].close * (2 / 51) + ema50 * (1 - 2 / 51);
      ema50Pts.push({ x: 4 + i * cw + cw / 2, y: ((max - ema50) / range) * chartH });
    }
    ctx.strokeStyle = "rgba(255,159,67,0.35)"; ctx.lineWidth = 1;
    ctx.beginPath(); ema50Pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.stroke();

    // Volume
    for (let i = 0; i < data.length; i++) {
      const d = data[i], x = 4 + i * cw + cw / 2;
      const barH = (d.volume / volMax) * volH;
      ctx.fillStyle = d.close >= d.open ? "rgba(43,196,138,0.2)" : "rgba(246,70,93,0.2)";
      ctx.fillRect(x - bw / 2, volY + volH - barH, bw, barH);
    }

    // Candles
    for (let i = 0; i < data.length; i++) {
      const d = data[i], x = 4 + i * cw + cw / 2;
      const yH = ((max - d.high) / range) * chartH, yL = ((max - d.low) / range) * chartH;
      const yO = ((max - d.open) / range) * chartH, yC = ((max - d.close) / range) * chartH;
      const color = d.close >= d.open ? "#2bc48a" : "#f6465d";
      ctx.strokeStyle = color; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, yH); ctx.lineTo(x, yL); ctx.stroke();
      ctx.fillStyle = color;
      ctx.fillRect(x - bw / 2, Math.min(yO, yC), bw, Math.max(1, Math.abs(yC - yO)));
    }

    // Current price dashed line
    if (latest) {
      const y = ((max - latest.close) / range) * chartH;
      ctx.strokeStyle = isUp ? "rgba(43,196,138,0.35)" : "rgba(246,70,93,0.35)";
      ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); ctx.setLineDash([]);
      // Price label
      ctx.fillStyle = isUp ? "#2bc48a" : "#f6465d";
      ctx.font = "bold 10px monospace";
      ctx.fillText(`$${latest.close.toFixed(2)}`, w - 60, y - 4);
    }
  }, [data, min, max, volMax, isUp, latest]);

  return (
    <div className="relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-[var(--panel)] h-full">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.05] px-3.5 py-2">
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-bold text-[var(--text)]">{symbol}</span>
          <span className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[9px] text-[var(--textMuted)]">1m</span>
          <span className="text-[9px] text-[var(--textSubtle)]">VWAP</span>
          <span className="text-[9px] text-[#F5C542]">EMA20</span>
          <span className="text-[9px] text-[#FF9F43]">EMA50</span>
        </div>
        <div className="flex items-center gap-3">
          <span className={`font-mono text-sm font-bold ${isUp ? "text-[#2bc48a]" : "text-[#f6465d]"}`}>
            ${latest?.close.toFixed(2)}
          </span>
          <span className={`rounded-full px-1.5 py-0.5 font-mono text-[9px] font-bold ${isUp ? "bg-[#2bc48a]/10 text-[#2bc48a]" : "bg-[#f6465d]/10 text-[#f6465d]"}`}>
            {isUp ? "+" : ""}{pctChange.toFixed(2)}%
          </span>
        </div>
      </div>
      {/* Overlay Metrics */}
      <div className="absolute top-10 left-3 flex flex-col gap-1 z-10">
        <MicroMetric label="VOL" value="Medium" color="#F5C542" />
        <MicroMetric label="MOM" value="+68" color="#2bc48a" />
        <MicroMetric label="FLOW" value="Buy" color="#5B8DEF" />
        <MicroMetric label="CONF" value="76%" color="#F5C542" />
        <MicroMetric label="REGIME" value="Trend" color="#2bc48a" />
      </div>
      <div ref={containerRef} className="relative flex-1 min-h-0">
        <canvas ref={canvasRef} className="absolute inset-0" />
      </div>
    </div>
  );
};

const MicroMetric = ({ label, value, color }: { label: string; value: string; color: string }) => (
  <div className="flex items-center gap-1.5 rounded bg-black/60 px-1.5 py-0.5 backdrop-blur-sm">
    <span className="text-[7px] font-bold text-[var(--textSubtle)]">{label}</span>
    <span className="text-[8px] font-bold" style={{ color }}>{value}</span>
  </div>
);
