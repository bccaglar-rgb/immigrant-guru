import type { TFContext } from "./mockData";
interface Props { contexts: TFContext[] }

const tc = (t: string) => t === "Bullish" ? "#2bc48a" : t === "Bearish" ? "#f6465d" : "#8A8F98";
const mc = (m: string) => m === "Strong" ? "#2bc48a" : m === "Building" ? "#5B8DEF" : m === "Fading" ? "#FF9F43" : "#8A8F98";
const sc = (s: string) => s === "Expanding" ? "#2bc48a" : s === "Compressed" ? "#F5C542" : "#8A8F98";

export const MultiTimeframePanel = ({ contexts }: Props) => (
  <div className="flex flex-col gap-1">
    <SectionHead icon={<svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12h4l3-9 6 18 3-9h4" /></svg>} label="Multi-Timeframe" color="#5B8DEF" />
    {contexts.map((c) => (
      <div key={c.tf} className="rounded-xl border border-white/[0.04] bg-white/[0.015] p-2 space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[9px] font-bold text-[var(--text)]">{c.tf}</span>
            <span className="text-[9px] font-bold" style={{ color: tc(c.trend) }}>{c.trend}</span>
          </div>
          <span className="font-mono text-[8px] text-[var(--textSubtle)]">${c.keyLevel.toFixed(2)}</span>
        </div>
        <div className="grid grid-cols-3 gap-1">
          <Chip label="Struct" value={c.structure} color={tc(c.trend)} />
          <Chip label="Mom" value={c.momentum} color={mc(c.momentum)} />
          <Chip label="State" value={c.state} color={sc(c.state)} />
        </div>
        <BiasBar value={c.bias} />
      </div>
    ))}
  </div>
);

const Chip = ({ label, value, color }: { label: string; value: string; color: string }) => (
  <div><div className="text-[7px] text-[var(--textSubtle)]">{label}</div><div className="text-[8px] font-bold" style={{ color }}>{value}</div></div>
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
    <div className="flex items-center gap-1.5" style={{ color }}>{icon}<span className="text-[9px] font-bold tracking-widest uppercase">{label}</span></div>
    {right}
  </div>
);
