import { LWChart, type OHLCVData } from "../shared/LWChart";

interface Props { data: OHLCVData[]; symbol: string }

export const HeroChart = ({ data, symbol }: Props) => {
  const latest = data[data.length - 1];
  const prev = data[data.length - 2];
  const pctChange = prev ? ((latest.close - prev.close) / prev.close) * 100 : 0;
  const isUp = pctChange >= 0;

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
      <div className="relative flex-1 min-h-0">
        <LWChart data={data} showVolume showIndicators />
      </div>
    </div>
  );
};

const MicroMetric = ({ label, value, color }: { label: string; value: string; color: string }) => (
  <div className="flex items-center gap-1.5 rounded bg-black/60 px-1.5 py-0.5 backdrop-blur-sm">
    <span className="text-[9px] font-bold text-[var(--textSubtle)]">{label}</span>
    <span className="text-[9px] font-bold" style={{ color }}>{value}</span>
  </div>
);
