import { useEffect, useRef, useMemo } from "react";

interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number }
interface Props {
  btcData: Candle[];
  intel: {
    btcTrend: string; btcDominance: string; crossAssetPressure: string; regime: string;
    aiNarrative: string; riskOnOff: string; liquidity: string; macroTone: string;
  };
}

export const MarketIntelligence = ({ btcData, intel }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const latest = btcData[btcData.length - 1];
  const prev = btcData[btcData.length - 2];
  const pct = prev ? ((latest.close - prev.close) / prev.close) * 100 : 0;
  const isUp = pct >= 0;

  const { min, max } = useMemo(() => {
    let mn = Infinity, mx = -Infinity;
    for (const d of btcData) { if (d.low < mn) mn = d.low; if (d.high > mx) mx = d.high; }
    const pad = (mx - mn) * 0.08;
    return { min: mn - pad, max: mx + pad };
  }, [btcData]);

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
    ctx.scale(dpr, dpr); ctx.clearRect(0, 0, w, h);
    const range = max - min || 1;
    const cw = Math.max(1, (w - 4) / btcData.length), bw = Math.max(1, cw * 0.5);
    for (let i = 0; i < btcData.length; i++) {
      const d = btcData[i], x = 2 + i * cw + cw / 2;
      const yH = ((max - d.high) / range) * h, yL = ((max - d.low) / range) * h;
      const yO = ((max - d.open) / range) * h, yC = ((max - d.close) / range) * h;
      const color = d.close >= d.open ? "#2bc48a" : "#f6465d";
      ctx.strokeStyle = color; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, yH); ctx.lineTo(x, yL); ctx.stroke();
      ctx.fillStyle = color;
      ctx.fillRect(x - bw / 2, Math.min(yO, yC), bw, Math.max(1, Math.abs(yC - yO)));
    }
  }, [btcData, min, max]);

  const riskColor = intel.riskOnOff === "Risk-On" ? "#2bc48a" : "#f6465d";
  const trendColor = intel.btcTrend === "Bullish" ? "#2bc48a" : intel.btcTrend === "Bearish" ? "#f6465d" : "#F5C542";

  return (
    <div className="flex flex-col gap-2 h-full overflow-y-auto">
      {/* BTC Mini Chart */}
      <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] overflow-hidden">
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.04]">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-[var(--text)]">BTC/USDT</span>
            <span className="rounded border border-white/10 bg-white/[0.04] px-1 py-px font-mono text-[8px] text-[var(--textMuted)]">1m</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`font-mono text-[10px] font-bold ${isUp ? "text-[#2bc48a]" : "text-[#f6465d]"}`}>${latest?.close.toLocaleString()}</span>
            <span className={`rounded-full px-1 py-px font-mono text-[8px] font-bold ${isUp ? "bg-[#2bc48a]/10 text-[#2bc48a]" : "bg-[#f6465d]/10 text-[#f6465d]"}`}>
              {isUp ? "+" : ""}{pct.toFixed(2)}%
            </span>
          </div>
        </div>
        <div ref={containerRef} className="h-24">
          <canvas ref={canvasRef} className="h-full w-full" />
        </div>
      </div>

      {/* Intelligence Feed */}
      <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-3 space-y-2">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-[#FF9F43]" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
          <span className="text-[10px] font-bold tracking-wider text-[#FF9F43] uppercase">Market Intelligence</span>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <IntelRow label="BTC Trend" value={intel.btcTrend} color={trendColor} />
          <IntelRow label="Risk Mode" value={intel.riskOnOff} color={riskColor} />
          <IntelRow label="Dominance" value={intel.btcDominance} />
          <IntelRow label="Regime" value={intel.regime.split("—")[0].trim()} />
        </div>

        <IntelBlock label="Cross-Asset" text={intel.crossAssetPressure} />
        <IntelBlock label="Liquidity" text={intel.liquidity} />
        <IntelBlock label="Macro Tone" text={intel.macroTone} />

        {/* AI Narrative */}
        <div className="rounded-lg border border-[#F5C542]/10 bg-[#F5C542]/[0.03] px-2.5 py-2">
          <span className="text-[7px] font-bold text-[#F5C542] uppercase tracking-wider">AI Narrative</span>
          <p className="mt-0.5 text-[9px] leading-relaxed text-[var(--textMuted)]">{intel.aiNarrative}</p>
        </div>
      </div>
    </div>
  );
};

const IntelRow = ({ label, value, color }: { label: string; value: string; color?: string }) => (
  <div className="rounded-lg bg-black/20 px-2 py-1">
    <div className="text-[7px] text-[var(--textSubtle)]">{label}</div>
    <div className="text-[9px] font-bold" style={{ color: color ?? "var(--text)" }}>{value}</div>
  </div>
);

const IntelBlock = ({ label, text }: { label: string; text: string }) => (
  <div className="rounded-lg bg-black/20 px-2 py-1.5">
    <span className="text-[7px] font-bold text-[var(--textSubtle)] uppercase">{label}</span>
    <p className="mt-0.5 text-[9px] text-[var(--textMuted)]">{text}</p>
  </div>
);
