import { useMemo } from "react";
import type { TFContext } from "./mockData";
import { sol15m, sol1h, sol4h, sol1d } from "./mockData";
import { LWChart } from "../shared/LWChart";

interface Props { contexts: TFContext[] }

const tc = (t: string) => t === "Bullish" ? "#2bc48a" : t === "Bearish" ? "#f6465d" : "#8A8F98";
const mc = (m: string) => m === "Strong" ? "#2bc48a" : m === "Building" ? "#5B8DEF" : m === "Fading" ? "#FF9F43" : "#8A8F98";
const sc = (s: string) => s === "Expanding" ? "#2bc48a" : s === "Compressed" ? "#F5C542" : "#8A8F98";

const biasLabel = (t: string) => t === "Bullish" ? "Bullish" : t === "Bearish" ? "Bearish" : "Neutral";
const biasBg = (t: string) => t === "Bullish" ? "rgba(43,196,138,0.12)" : t === "Bearish" ? "rgba(246,70,93,0.12)" : "rgba(138,143,152,0.10)";

const tfChartData: Record<string, typeof sol15m> = { "15m": sol15m, "1H": sol1h, "4H": sol4h, "1D": sol1d };

export const MultiTimeframePanel = ({ contexts }: Props) => (
  <div className="flex flex-col gap-1">
    <SectionHead icon={<svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12h4l3-9 6 18 3-9h4" /></svg>} label="Multi-Timeframe" color="#5B8DEF" />
    {contexts.map((c) => (
      <TFCard key={c.tf} context={c} />
    ))}
  </div>
);

const TFCard = ({ context: c }: { context: TFContext }) => {
  const data = useMemo(() => tfChartData[c.tf] ?? sol15m, [c.tf]);
  const trendColor = tc(c.trend);
  return (
    <div className="rounded-xl border border-white/[0.04] bg-white/[0.015] p-2 space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[var(--text)]">{c.tf}</span>
          <span className="rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wide" style={{ color: trendColor, background: biasBg(c.trend) }}>
            {biasLabel(c.trend)}
          </span>
        </div>
        <span className="font-mono text-[10px] text-[var(--textSubtle)]">${c.keyLevel.toFixed(2)}</span>
      </div>
      <div className="h-[180px] w-full rounded overflow-hidden">
        <LWChart data={data} compact showVolume={false} showIndicators={false} />
      </div>
      <div className="flex items-center gap-3">
        <ChipInline label="Struct" value={c.structure} color={tc(c.trend)} />
        <ChipInline label="Mom" value={c.momentum} color={mc(c.momentum)} />
        <ChipInline label="State" value={c.state} color={sc(c.state)} />
        <div className="flex-1"><BiasBar value={c.bias} /></div>
      </div>
    </div>
  );
};

const ChipInline = ({ label, value, color }: { label: string; value: string; color: string }) => (
  <div className="flex items-center gap-1">
    <span className="text-[10px] text-[var(--textSubtle)]">{label}</span>
    <span className="text-[10px] font-bold" style={{ color }}>{value}</span>
  </div>
);

const BiasBar = ({ value }: { value: number }) => (
  <div className="relative h-[3px] w-full rounded-full bg-white/[0.05]">
    <div className="absolute top-0 left-1/2 h-full w-px bg-white/10" />
    <div className="absolute top-0 h-full rounded-full transition-all duration-700"
      style={{ left: value >= 0 ? "50%" : `${((value + 100) / 200) * 100}%`, width: `${Math.abs(value) / 2}%`, background: value >= 0 ? "#2bc48a" : "#f6465d" }} />
  </div>
);

export const SectionHead = ({ icon, label, color, right }: { icon: React.ReactNode; label: string; color: string; right?: React.ReactNode }) => (
  <div className="flex items-center justify-between px-0.5">
    <div className="flex items-center gap-1.5" style={{ color }}>{icon}<span className="text-[10px] font-bold tracking-widest uppercase">{label}</span></div>
    {right}
  </div>
);
