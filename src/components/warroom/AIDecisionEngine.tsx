interface Props {
  data: {
    bias: "Bullish" | "Bearish" | "Neutral";
    confidence: number;
    bestStrategy: string;
    confirms: string[];
    invalidates: string[];
    optimalConditions: string;
    riskWarning: string;
  };
}

const biasStyle = (b: string) => b === "Bullish" ? { color: "#2bc48a", bg: "#2bc48a15" } : b === "Bearish" ? { color: "#f6465d", bg: "#f6465d15" } : { color: "#F5C542", bg: "#F5C54215" };

export const AIDecisionEngine = ({ data }: Props) => {
  const bs = biasStyle(data.bias);
  return (
    <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-[#F5C542]" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z" /><path d="M10 21h4" /></svg>
          <span className="text-[10px] font-bold tracking-wider text-[#F5C542] uppercase">AI Decision Engine</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded px-1.5 py-0.5 text-[9px] font-bold" style={{ color: bs.color, background: bs.bg }}>{data.bias}</span>
          <span className="font-mono text-[10px] font-bold" style={{ color: bs.color }}>{data.confidence}%</span>
        </div>
      </div>

      {/* Strategy */}
      <div className="flex items-center gap-2 rounded-lg bg-black/20 px-2.5 py-1.5">
        <span className="text-[9px] text-[var(--textSubtle)]">Best Strategy:</span>
        <span className="rounded border border-[#5B8DEF]/20 bg-[#5B8DEF]/10 px-2 py-0.5 text-[9px] font-bold text-[#5B8DEF]">{data.bestStrategy}</span>
      </div>

      {/* Confirms / Invalidates */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <span className="text-[9px] font-bold text-[#2bc48a] uppercase">Confirms</span>
          {data.confirms.map((c, i) => (
            <div key={i} className="flex gap-1.5">
              <span className="mt-0.5 h-1 w-1 flex-shrink-0 rounded-full bg-[#2bc48a]" />
              <span className="text-[9px] leading-tight text-[var(--textMuted)]">{c}</span>
            </div>
          ))}
        </div>
        <div className="space-y-1">
          <span className="text-[9px] font-bold text-[#f6465d] uppercase">Invalidates</span>
          {data.invalidates.map((c, i) => (
            <div key={i} className="flex gap-1.5">
              <span className="mt-0.5 h-1 w-1 flex-shrink-0 rounded-full bg-[#f6465d]" />
              <span className="text-[9px] leading-tight text-[var(--textMuted)]">{c}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Optimal + Risk */}
      <div className="rounded-lg border border-[#5B8DEF]/10 bg-[#5B8DEF]/[0.03] px-2.5 py-1.5">
        <span className="text-[9px] font-bold text-[#5B8DEF] uppercase">Optimal Entry</span>
        <p className="mt-0.5 text-[9px] text-[var(--textMuted)]">{data.optimalConditions}</p>
      </div>
      <div className="rounded-lg border border-[#FF9F43]/10 bg-[#FF9F43]/[0.03] px-2.5 py-1.5">
        <span className="text-[9px] font-bold text-[#FF9F43] uppercase">Risk Warning</span>
        <p className="mt-0.5 text-[9px] text-[var(--textMuted)]">{data.riskWarning}</p>
      </div>
    </div>
  );
};
