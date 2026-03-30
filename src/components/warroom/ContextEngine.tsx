import type { TimeframeContext } from "./mockData";
import { sol15m, sol1h, sol4h, sol1d } from "./mockData";
import { LWChart } from "../shared/LWChart";

interface Props { contexts: TimeframeContext[] }
const tfChartData: Record<string, typeof sol15m> = { "15m": sol15m, "1H": sol1h, "4H": sol4h, "1D": sol1d };

const trendColor = (t: string) => t === "Bullish" ? "#2bc48a" : t === "Bearish" ? "#f6465d" : "#8A8F98";
const momentumColor = (m: string) => m === "Strong" ? "#2bc48a" : m === "Building" ? "#5B8DEF" : m === "Fading" ? "#FF9F43" : "#8A8F98";
const compressionColor = (c: string) => c === "Expanding" ? "#2bc48a" : c === "Compressed" ? "#F5C542" : "#8A8F98";

const BiasBar = ({ value }: { value: number }) => {
  const pct = ((value + 100) / 200) * 100;
  return (
    <div className="relative h-1 w-full rounded-full bg-white/[0.06]">
      <div className="absolute top-0 left-1/2 h-full w-px bg-white/10" />
      <div
        className="absolute top-0 h-full rounded-full transition-all duration-700"
        style={{
          left: value >= 0 ? "50%" : `${pct}%`,
          width: `${Math.abs(value) / 2}%`,
          background: value >= 0 ? "#2bc48a" : "#f6465d",
        }}
      />
    </div>
  );
};

export const ContextEngine = ({ contexts }: Props) => (
  <div className="flex flex-col gap-1.5">
    <div className="flex items-center gap-2 px-1 mb-0.5">
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-[#5B8DEF]" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12h4l3-9 6 18 3-9h4" /></svg>
      <span className="text-[10px] font-bold tracking-wider text-[#5B8DEF] uppercase">Context Engine</span>
    </div>
    {contexts.map((ctx) => (
      <div key={ctx.timeframe} className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-2.5 space-y-2">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[var(--text)]">{ctx.timeframe}</span>
            <span className="text-[10px] font-bold" style={{ color: trendColor(ctx.trend) }}>{ctx.trend}</span>
          </div>
          <span className="font-mono text-[9px] text-[var(--textSubtle)]">${ctx.keyLevel.toFixed(2)}</span>
        </div>

        {/* Mini Chart */}
        <div className="h-[60px] w-full rounded overflow-hidden">
          <LWChart data={tfChartData[ctx.timeframe] ?? sol15m} compact showVolume={false} showIndicators={false} />
        </div>

        {/* Metrics Row */}
        <div className="grid grid-cols-3 gap-1.5">
          <Metric label="Structure" value={ctx.structure} color={trendColor(ctx.trend)} />
          <Metric label="Momentum" value={ctx.momentum} color={momentumColor(ctx.momentum)} />
          <Metric label="State" value={ctx.compression} color={compressionColor(ctx.compression)} />
        </div>

        {/* Bias Bar */}
        <div className="space-y-0.5">
          <div className="flex justify-between">
            <span className="text-[9px] text-[#f6465d]">Bear</span>
            <span className="text-[9px] text-[var(--textSubtle)]">Bias: {ctx.bias > 0 ? "+" : ""}{ctx.bias}</span>
            <span className="text-[9px] text-[#2bc48a]">Bull</span>
          </div>
          <BiasBar value={ctx.bias} />
        </div>
      </div>
    ))}
  </div>
);

const Metric = ({ label, value, color }: { label: string; value: string; color: string }) => (
  <div className="space-y-0.5">
    <span className="text-[9px] text-[var(--textSubtle)]">{label}</span>
    <div className="text-[9px] font-bold" style={{ color }}>{value}</div>
  </div>
);
