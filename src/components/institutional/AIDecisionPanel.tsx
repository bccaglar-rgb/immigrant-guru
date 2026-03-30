import { SectionHead } from "./MultiTimeframePanel";
interface Props { data: typeof import("./mockData").aiDecision }

const bs = (b: string) => b === "Bullish" ? { c: "#2bc48a", bg: "#2bc48a12" } : b === "Bearish" ? { c: "#f6465d", bg: "#f6465d12" } : { c: "#F5C542", bg: "#F5C54212" };

export const AIDecisionPanel = ({ data }: Props) => {
  const s = bs(data.bias);
  return (
    <div className="rounded-2xl border border-white/[0.04] bg-white/[0.015] p-2.5 space-y-1.5">
      <SectionHead icon={<svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a7 7 0 017 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 01-2 2h-4a2 2 0 01-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 017-7z" /><path d="M10 21h4" /></svg>} label="AI Decision" color="#F5C542"
        right={<div className="flex items-center gap-1.5"><span className="rounded px-1.5 py-0.5 text-[9px] font-bold" style={{ color: s.c, background: s.bg }}>{data.bias}</span><span className="font-mono text-[9px] font-bold" style={{ color: s.c }}>{data.confidence}%</span></div>} />

      <div className="flex items-center gap-1.5 rounded-lg bg-black/20 px-2 py-1">
        <span className="text-[9px] text-[var(--textSubtle)]">Strategy:</span>
        <span className="rounded border border-[#5B8DEF]/20 bg-[#5B8DEF]/10 px-1.5 py-0.5 text-[9px] font-bold text-[#5B8DEF]">{data.strategy}</span>
        <span className="text-[9px] text-[var(--textSubtle)]">Quality:</span>
        <span className="font-mono text-[9px] font-bold text-[#F5C542]">{data.marketQuality}/100</span>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <div className="space-y-0.5">
          <span className="text-[9px] font-bold text-[#2bc48a] uppercase">Confirms</span>
          {data.confirms.map((c, i) => <Dot key={i} text={c} color="#2bc48a" />)}
        </div>
        <div className="space-y-0.5">
          <span className="text-[9px] font-bold text-[#f6465d] uppercase">Invalidates</span>
          {data.invalidates.map((c, i) => <Dot key={i} text={c} color="#f6465d" />)}
        </div>
      </div>

      <div className="rounded-lg border border-[#5B8DEF]/10 bg-[#5B8DEF]/[0.02] px-2 py-1">
        <span className="text-[9px] font-bold text-[#5B8DEF] uppercase">Ideal Entry</span>
        <p className="text-[9px] text-[var(--textMuted)]">{data.idealEntry}</p>
      </div>
      <div className="rounded-lg border border-[#FF9F43]/10 bg-[#FF9F43]/[0.02] px-2 py-1">
        <span className="text-[9px] font-bold text-[#FF9F43] uppercase">Risk</span>
        <p className="text-[9px] text-[var(--textMuted)]">{data.riskNote}</p>
      </div>
    </div>
  );
};

const Dot = ({ text, color }: { text: string; color: string }) => (
  <div className="flex gap-1"><span className="mt-[3px] h-1 w-1 flex-shrink-0 rounded-full" style={{ background: color }} /><span className="text-[9px] leading-tight text-[var(--textMuted)]">{text}</span></div>
);
