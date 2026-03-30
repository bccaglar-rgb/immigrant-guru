import { LWChart, type OHLCVData } from "../shared/LWChart";

interface ChartCardProps {
  symbol: string;
  timeframe: string;
  data: OHLCVData[];
  compact?: boolean;
  className?: string;
}

export const ChartCard = ({ symbol, timeframe, data, compact = false, className = "" }: ChartCardProps) => {
  const latest = data[data.length - 1];
  const prev = data[data.length - 2];
  const pctChange = prev ? ((latest.close - prev.close) / prev.close) * 100 : 0;
  const isUp = pctChange >= 0;

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
      <div className="relative flex-1 min-h-0">
        <LWChart
          data={data}
          compact={compact}
          showVolume={!compact}
          showIndicators={!compact}
        />
      </div>
    </div>
  );
};
