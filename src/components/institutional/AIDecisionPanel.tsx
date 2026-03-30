import { SectionHead } from "./MultiTimeframePanel";
interface Props { data: typeof import("./mockData").aiDecision }

const biasConfig = (b: string) =>
  b === "Bullish"
    ? { label: "LONG BIAS", emoji: "\u{1F7E2}", color: "#2bc48a", bg: "rgba(43,196,138,0.12)", border: "rgba(43,196,138,0.25)", glow: "0 0 20px rgba(43,196,138,0.15)" }
    : b === "Bearish"
    ? { label: "SHORT BIAS", emoji: "\u{1F534}", color: "#f6465d", bg: "rgba(246,70,93,0.12)", border: "rgba(246,70,93,0.25)", glow: "0 0 20px rgba(246,70,93,0.15)" }
    : { label: "NEUTRAL", emoji: "\u26AA", color: "#8A8F98", bg: "rgba(138,143,152,0.12)", border: "rgba(138,143,152,0.25)", glow: "none" };

export const AIDecisionPanel = ({ data }: Props) => {
  const cfg = biasConfig(data.bias);
  const confPct = Math.min(100, Math.max(0, data.confidence));

  return (
    <div className="rounded-2xl border-2 bg-white/[0.02] p-3 space-y-2.5" style={{ borderColor: cfg.border, boxShadow: cfg.glow }}>
      <SectionHead
        icon={<svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a7 7 0 017 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 01-2 2h-4a2 2 0 01-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 017-7z" /><path d="M10 21h4" /></svg>}
        label="AI Decision Engine"
        color={cfg.color}
      />

      {/* ── BIAS HEADLINE ── */}
      <div className="flex items-center justify-center gap-2 rounded-xl py-2.5 px-3" style={{ background: cfg.bg }}>
        <span className="text-xl">{cfg.emoji}</span>
        <span className="text-base font-black tracking-[0.12em] uppercase" style={{ color: cfg.color }}>{cfg.label}</span>
      </div>

      {/* ── CONFIDENCE BAR ── */}
      <div className="space-y-1">
        <div className="flex items-end justify-between px-0.5">
          <span className="text-[10px] font-bold uppercase text-[var(--textSubtle)]">Confidence</span>
          <span className="font-mono text-xl font-bold leading-none" style={{ color: cfg.color }}>{data.confidence}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-white/[0.06] overflow-hidden">
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${confPct}%`, background: `linear-gradient(90deg, ${cfg.color}88, ${cfg.color})` }} />
        </div>
      </div>

      {/* ── SETUP TYPE ── */}
      <div className="flex items-center gap-2">
        <span className="rounded-lg border px-2.5 py-1 text-[11px] font-black uppercase tracking-wider" style={{ color: "#5B8DEF", borderColor: "rgba(91,141,239,0.3)", background: "rgba(91,141,239,0.08)" }}>
          {data.strategy}
        </span>
        <span className="rounded-lg border px-2 py-1 text-[10px] font-bold" style={{ color: "#F5C542", borderColor: "rgba(245,197,66,0.25)", background: "rgba(245,197,66,0.06)" }}>
          Quality <span className="font-mono">{data.marketQuality}/100</span>
        </span>
      </div>

      {/* ── EXECUTION BLOCK ── */}
      <div className="rounded-xl border border-white/[0.08] bg-black/30 p-2.5 font-mono space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-[var(--textSubtle)]">ENTRY</span>
          <span className="text-[12px] font-black text-[var(--text)]">$148.5 &ndash; $147.0</span>
        </div>
        <div className="h-px bg-white/[0.06]" />
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-[#f6465d]">SL</span>
          <span className="text-[12px] font-black text-[#f6465d]">$145.4</span>
        </div>
        <div className="h-px bg-white/[0.06]" />
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-[#2bc48a]">TP1</span>
          <span className="text-[12px] font-black text-[#2bc48a]">$151.0</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-[#2bc48a]">TP2</span>
          <span className="text-[12px] font-black text-[#2bc48a]">$154.0</span>
        </div>
      </div>

      {/* ── CONFIRMS / INVALIDATES ── */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <span className="text-[10px] font-bold text-[#2bc48a] uppercase">Confirms</span>
          {data.confirms.map((c, i) => <Dot key={i} text={c} color="#2bc48a" />)}
        </div>
        <div className="space-y-1">
          <span className="text-[10px] font-bold text-[#f6465d] uppercase">Invalidates</span>
          {data.invalidates.map((c, i) => <Dot key={i} text={c} color="#f6465d" />)}
        </div>
      </div>

      {/* ── IDEAL ENTRY + RISK ── */}
      <div className="rounded-lg border border-[#5B8DEF]/15 bg-[#5B8DEF]/[0.03] px-2.5 py-1.5">
        <span className="text-[10px] font-bold text-[#5B8DEF] uppercase">Ideal Entry</span>
        <p className="text-[10px] text-[var(--textMuted)] mt-0.5">{data.idealEntry}</p>
      </div>
      <div className="rounded-lg border border-[#FF9F43]/15 bg-[#FF9F43]/[0.03] px-2.5 py-1.5">
        <span className="text-[10px] font-bold text-[#FF9F43] uppercase">Risk Note</span>
        <p className="text-[10px] text-[var(--textMuted)] mt-0.5">{data.riskNote}</p>
      </div>
    </div>
  );
};

const Dot = ({ text, color }: { text: string; color: string }) => (
  <div className="flex gap-1.5 items-start">
    <span className="mt-[4px] h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: color }} />
    <span className="text-[10px] leading-tight text-[var(--textMuted)]">{text}</span>
  </div>
);
