interface Alert { type: "breakout" | "volume" | "regime" | "btc" | "liquidity"; text: string; time: string; severity: "high" | "medium" | "low" }
interface Props { alerts: Alert[] }

const severityStyles: Record<string, { dot: string; border: string }> = {
  high: { dot: "bg-[#f6465d] animate-pulse", border: "border-l-[#f6465d]" },
  medium: { dot: "bg-[#F5C542]", border: "border-l-[#F5C542]" },
  low: { dot: "bg-[#5B8DEF]", border: "border-l-[#5B8DEF]" },
};

const typeIcon: Record<string, string> = {
  breakout: "B", volume: "V", regime: "R", btc: "₿", liquidity: "L",
};

export const AlertMatrix = ({ alerts }: Props) => (
  <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-3 space-y-2">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-[#f6465d]" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
        <span className="text-[10px] font-bold tracking-wider text-[#f6465d] uppercase">Alert Matrix</span>
      </div>
      <span className="rounded-full bg-[#f6465d]/10 px-1.5 py-0.5 text-[8px] font-bold text-[#f6465d]">{alerts.filter(a => a.severity === "high").length} HIGH</span>
    </div>
    <div className="space-y-1">
      {alerts.map((a, i) => {
        const s = severityStyles[a.severity];
        return (
          <div key={i} className={`flex items-start gap-2 rounded-lg border-l-2 bg-black/20 px-2.5 py-1.5 ${s.border}`}>
            <span className={`mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${s.dot}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="rounded bg-white/[0.06] px-1 py-px text-[7px] font-bold text-[var(--textSubtle)]">{typeIcon[a.type]}</span>
                <span className="text-[9px] text-[var(--text)] truncate">{a.text}</span>
              </div>
            </div>
            <span className="flex-shrink-0 text-[8px] text-[var(--textSubtle)]">{a.time}</span>
          </div>
        );
      })}
    </div>
  </div>
);
