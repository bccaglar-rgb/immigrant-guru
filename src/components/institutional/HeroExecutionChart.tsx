import { useEffect, useRef, useMemo } from "react";
interface C { time: number; open: number; high: number; low: number; close: number; volume: number }
interface Props { data: C[]; symbol: string; spread?: string; sessionRange?: string; delta?: string }

export const HeroExecutionChart = ({ data, symbol, spread = "0.03", sessionRange = "$2.32", delta = "+142K" }: Props) => {
  const cvs = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const last = data[data.length - 1], prev = data[data.length - 2];
  const pct = prev ? ((last.close - prev.close) / prev.close) * 100 : 0;
  const up = pct >= 0;
  const { mn, mx } = useMemo(() => { let a = Infinity, b = -Infinity; for (const d of data) { if (d.low < a) a = d.low; if (d.high > b) b = d.high; } const p = (b - a) * 0.06; return { mn: a - p, mx: b + p }; }, [data]);
  const vm = useMemo(() => { let m = 0; for (const d of data) if (d.volume > m) m = d.volume; return m || 1; }, [data]);

  useEffect(() => {
    const c = cvs.current, b = box.current; if (!c || !b) return;
    const r = b.getBoundingClientRect(), dp = devicePixelRatio || 1, w = r.width, h = r.height;
    c.width = w * dp; c.height = h * dp; c.style.width = `${w}px`; c.style.height = `${h}px`;
    const x = c.getContext("2d"); if (!x) return; x.scale(dp, dp); x.clearRect(0, 0, w, h);
    const ch = h * 0.78, vh = h * 0.16, vy = ch + h * 0.04, rng = mx - mn || 1, cw = Math.max(1, (w - 6) / data.length), bw = Math.max(1, cw * 0.5);

    // Grid
    x.strokeStyle = "rgba(255,255,255,0.025)"; x.lineWidth = 0.5;
    for (let i = 0; i <= 6; i++) { const y = (ch / 6) * i; x.beginPath(); x.moveTo(0, y); x.lineTo(w, y); x.stroke(); }

    // VWAP
    let vs = 0, vl = 0; const vp: { px: number; py: number }[] = [];
    for (let i = 0; i < data.length; i++) { const d = data[i]; vs += ((d.high + d.low + d.close) / 3) * d.volume; vl += d.volume; vp.push({ px: 3 + i * cw + cw / 2, py: ((mx - vs / vl) / rng) * ch }); }
    x.strokeStyle = "rgba(91,141,239,0.4)"; x.lineWidth = 1.5; x.setLineDash([3, 3]);
    x.beginPath(); vp.forEach((p, i) => i === 0 ? x.moveTo(p.px, p.py) : x.lineTo(p.px, p.py)); x.stroke(); x.setLineDash([]);

    // EMA 20 + 50
    const drawEma = (period: number, color: string) => {
      let e = data[0].close; const pts: { px: number; py: number }[] = [];
      const k = 2 / (period + 1);
      for (let i = 0; i < data.length; i++) { e = data[i].close * k + e * (1 - k); pts.push({ px: 3 + i * cw + cw / 2, py: ((mx - e) / rng) * ch }); }
      x.strokeStyle = color; x.lineWidth = 1; x.beginPath(); pts.forEach((p, i) => i === 0 ? x.moveTo(p.px, p.py) : x.lineTo(p.px, p.py)); x.stroke();
    };
    drawEma(20, "rgba(245,197,66,0.45)");
    drawEma(50, "rgba(255,159,67,0.3)");

    // Volume
    for (let i = 0; i < data.length; i++) { const d = data[i], px = 3 + i * cw + cw / 2; x.fillStyle = d.close >= d.open ? "rgba(43,196,138,0.18)" : "rgba(246,70,93,0.18)"; x.fillRect(px - bw / 2, vy + vh - (d.volume / vm) * vh, bw, (d.volume / vm) * vh); }

    // Candles
    for (let i = 0; i < data.length; i++) {
      const d = data[i], px = 3 + i * cw + cw / 2;
      const yH = ((mx - d.high) / rng) * ch, yL = ((mx - d.low) / rng) * ch, yO = ((mx - d.open) / rng) * ch, yC = ((mx - d.close) / rng) * ch;
      const cl = d.close >= d.open ? "#2bc48a" : "#f6465d";
      x.strokeStyle = cl; x.lineWidth = 1; x.beginPath(); x.moveTo(px, yH); x.lineTo(px, yL); x.stroke();
      x.fillStyle = cl; x.fillRect(px - bw / 2, Math.min(yO, yC), bw, Math.max(1, Math.abs(yC - yO)));
    }

    // Price line
    if (last) { const y = ((mx - last.close) / rng) * ch; x.strokeStyle = up ? "rgba(43,196,138,0.3)" : "rgba(246,70,93,0.3)"; x.setLineDash([4, 4]); x.lineWidth = 1; x.beginPath(); x.moveTo(0, y); x.lineTo(w, y); x.stroke(); x.setLineDash([]); x.fillStyle = up ? "#2bc48a" : "#f6465d"; x.font = "bold 10px monospace"; x.fillText(`$${last.close.toFixed(2)}`, w - 62, y - 4); }
  }, [data, mn, mx, vm, up, last]);

  return (
    <div className="relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.05] bg-[var(--panel)] h-full">
      <div className="flex items-center justify-between border-b border-white/[0.04] px-3 py-1.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-[var(--text)]">{symbol}</span>
          <span className="rounded bg-white/[0.05] px-1.5 py-0.5 font-mono text-[8px] text-[var(--textMuted)]">1m</span>
          <span className="text-[8px] text-[#5B8DEF]">VWAP</span>
          <span className="text-[8px] text-[#F5C542]">EMA20</span>
          <span className="text-[8px] text-[#FF9F43]">EMA50</span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className={`font-mono text-sm font-bold ${up ? "text-[#2bc48a]" : "text-[#f6465d]"}`}>${last?.close.toFixed(2)}</span>
          <span className={`rounded-full px-1.5 py-0.5 font-mono text-[8px] font-bold ${up ? "bg-[#2bc48a]/10 text-[#2bc48a]" : "bg-[#f6465d]/10 text-[#f6465d]"}`}>{up ? "+" : ""}{pct.toFixed(2)}%</span>
        </div>
      </div>
      {/* Overlay Metrics */}
      <div className="absolute top-9 left-2.5 z-10 flex flex-col gap-0.5">
        {[["SPR", spread, "#8A8F98"], ["MOM", "+71", "#2bc48a"], ["VOL", "Medium", "#F5C542"], ["FLOW", "Buy", "#5B8DEF"], ["CONF", "77%", "#F5C542"], ["Δ", delta, "#2bc48a"], ["RNG", sessionRange, "#8A8F98"]].map(([l, v, c]) => (
          <div key={l as string} className="flex items-center gap-1 rounded bg-black/70 px-1 py-px backdrop-blur-sm">
            <span className="text-[6px] font-bold text-[var(--textSubtle)]">{l}</span>
            <span className="text-[7px] font-bold" style={{ color: c as string }}>{v}</span>
          </div>
        ))}
      </div>
      <div ref={box} className="relative flex-1 min-h-0"><canvas ref={cvs} className="absolute inset-0" /></div>
    </div>
  );
};
