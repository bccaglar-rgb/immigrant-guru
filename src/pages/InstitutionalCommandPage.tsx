import { MultiTimeframePanel } from "../components/institutional/MultiTimeframePanel";
import { HeroExecutionChart } from "../components/institutional/HeroExecutionChart";
import { BTCChart, MarketIntelFeed, StructureLevelsPanel, AlertMatrixPanel } from "../components/institutional/RightPanels";
import {
  sol1m, btc1m, tfContexts, signals, aiDecision, levels,
  alerts, session, marketIntel,
} from "../components/institutional/mockData";

export default function InstitutionalCommandPage() {
  const now = new Date();
  const utc = now.toLocaleTimeString("en-US", { timeZone: "UTC", hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const local = now.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });

  /* AI decision config */
  const biasColor = aiDecision.bias === "Bullish" ? "#2bc48a" : aiDecision.bias === "Bearish" ? "#f6465d" : "#8A8F98";
  const biasLabel = aiDecision.bias === "Bullish" ? "LONG" : aiDecision.bias === "Bearish" ? "SHORT" : "NEUTRAL";
  const biasBg = aiDecision.bias === "Bullish"
    ? "rgba(43,196,138,0.08)"
    : aiDecision.bias === "Bearish"
    ? "rgba(246,70,93,0.08)"
    : "rgba(138,143,152,0.08)";
  const biasBorder = aiDecision.bias === "Bullish"
    ? "rgba(43,196,138,0.25)"
    : aiDecision.bias === "Bearish"
    ? "rgba(246,70,93,0.25)"
    : "rgba(138,143,152,0.25)";

  /* System health items */
  const healthItems = [
    { label: "WS", value: "\u{1F7E2}", text: "" },
    { label: "Depth", value: "\u{1F7E2}", text: "" },
    { label: "Recovery", value: "", text: "Idle" },
    { label: "Latency", value: "", text: "12ms" },
    { label: "Weight", value: "", text: "50/800" },
  ];

  return (
    <main className="h-screen bg-[var(--bg)] p-1.5 flex flex-col gap-1 overflow-hidden">
      {/* ═══ TOP BAR — Two lines: Command + System Health ═══ */}
      <header className="flex-shrink-0 rounded-xl border border-white/[0.05] bg-[var(--panel)]">
        {/* Line 1: Command Bar */}
        <div className="flex items-center justify-between px-3.5 py-1">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-[#2bc48a] animate-pulse" />
              <span className="text-[10px] font-black tracking-[0.15em] text-[var(--text)]">INSTITUTIONAL COMMAND</span>
            </div>
            <Sep />
            <Pill l="Asset" v="SOL/USDT" c="#F5C542" />
            <Pill l="Session" v={session.name} c="var(--accent)" />
            <Sep />
            <Pill l="Regime" v={signals.regime} c="#2bc48a" />
            <Pill l="AI" v="Active" c="#F5C542" />
            <Pill l="Risk" v="Neutral" c="#5B8DEF" />
          </div>
          <div className="flex items-center gap-2.5">
            <Pill l="Quality" v={`${aiDecision.marketQuality}/100`} c={aiDecision.marketQuality >= 70 ? "#2bc48a" : "#F5C542"} />
            <Sep />
            <span className="font-mono text-[9px] text-[var(--textSubtle)]">UTC {utc}</span>
            <span className="font-mono text-[9px] text-[var(--textMuted)]">{local}</span>
          </div>
        </div>
        {/* Line 2: System Health */}
        <div className="flex items-center gap-4 border-t border-white/[0.04] px-3.5 py-0.5">
          {healthItems.map((it) => (
            <div key={it.label} className="flex items-center gap-1">
              <span className="text-[9px] text-[var(--textMuted)]">{it.label}:</span>
              {it.value && <span className="text-[9px]">{it.value}</span>}
              {it.text && <span className="text-[9px] font-bold text-[var(--text)]">{it.text}</span>}
            </div>
          ))}
        </div>
      </header>

      {/* ═══ MAIN 12-COL GRID ═══ */}
      <div className="flex-1 grid grid-cols-12 gap-1 min-h-0">

        {/* ── LEFT: 3 cols — Alerts + MultiTF + Quick Stats ── */}
        <div className="col-span-3 overflow-y-auto space-y-1 pr-0.5 scrollbar-thin">
          <AlertMatrixPanel alerts={alerts} />
          <MultiTimeframePanel contexts={tfContexts} />
          <QuickStatsPanel />
        </div>

        {/* ── CENTER: 6 cols — Chart dominant ── */}
        <div className="col-span-6 flex flex-col gap-1 overflow-hidden">
          <div className="flex-1 min-h-0">
            <HeroExecutionChart data={sol1m} symbol="SOL/USDT" aiOverlay={{ bias: biasLabel, confidence: aiDecision.confidence, setup: aiDecision.strategy }} />
          </div>
        </div>

        {/* ── RIGHT: 3 cols — BTC + Intelligence + Structure ── */}
        <div className="col-span-3 overflow-y-auto space-y-1 pl-0.5 scrollbar-thin">
          <BTCChart data={btc1m} />
          <MarketIntelFeed intel={marketIntel} />
          <StructureLevelsPanel data={levels} />
        </div>
      </div>

      {/* ═══ AI DECISION — Bottom full-width bar ═══ */}
      <div
        className="flex-shrink-0 flex items-center gap-4 rounded-xl border-2 px-4 py-2 font-mono"
        style={{ background: biasBg, borderColor: biasBorder, maxHeight: 50 }}
      >
        {/* Bias + Confidence */}
        <div className="flex items-center gap-2">
          <span className="text-[9px]">{aiDecision.bias === "Bullish" ? "\u{1F7E2}" : aiDecision.bias === "Bearish" ? "\u{1F534}" : "\u26AA"}</span>
          <span className="text-sm font-black tracking-wider" style={{ color: biasColor }}>{biasLabel}</span>
          <span className="text-xs font-bold text-[var(--textSubtle)]">({aiDecision.confidence}%)</span>
        </div>
        <BarSep />

        {/* Entry */}
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-[var(--textSubtle)]">Entry:</span>
          <span className="text-[11px] font-bold text-[var(--text)]">148.5–147.0</span>
        </div>
        <BarSep />

        {/* SL */}
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-[var(--textSubtle)]">SL:</span>
          <span className="text-[11px] font-bold text-[#f6465d]">145.4</span>
        </div>
        <BarSep />

        {/* TPs */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-[var(--textSubtle)]">TP1:</span>
            <span className="text-[11px] font-bold text-[#2bc48a]">151.0</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-[var(--textSubtle)]">TP2:</span>
            <span className="text-[11px] font-bold text-[#2bc48a]">154.0</span>
          </div>
        </div>
        <BarSep />

        {/* Why */}
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <span className="text-[9px] text-[var(--textSubtle)]">Why:</span>
          <span className="text-[10px] text-[var(--text)] truncate">HH/HL + Vol expanding</span>
        </div>
        <BarSep />

        {/* Invalidation */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-[9px] text-[var(--textSubtle)]">Invalid:</span>
          <span className="text-[10px] font-bold text-[#f6465d]">&lt;145</span>
        </div>
      </div>
    </main>
  );
}

/* ── Quick Stats Mini Panel ── */
const QuickStatsPanel = () => {
  const stats = [
    { label: "Bias", value: "Bullish", color: "#2bc48a" },
    { label: "Momentum", value: 71, color: "#2bc48a", bar: true },
    { label: "Volatility", value: "Medium", color: "#F5C542" },
    { label: "Flow", value: "Buy", color: "#2bc48a" },
  ];

  return (
    <div className="rounded-2xl border border-white/[0.04] bg-white/[0.015] p-2.5 space-y-1">
      <div className="flex items-center gap-1.5 px-0.5">
        <svg viewBox="0 0 24 24" className="h-3 w-3 text-[#5B8DEF]" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 20V10M12 20V4M6 20v-6" /></svg>
        <span className="text-[10px] font-bold tracking-widest uppercase text-[#5B8DEF]">Quick Stats</span>
      </div>
      {stats.map((s) => (
        <div key={s.label} className="flex items-center justify-between gap-2 px-1">
          <span className="text-[10px] text-[var(--textSubtle)]">{s.label}</span>
          {s.bar && typeof s.value === "number" ? (
            <div className="flex items-center gap-1.5 flex-1 justify-end">
              <div className="h-[4px] w-16 rounded-full bg-white/[0.06] overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${s.value}%`, background: s.color }} />
              </div>
              <span className="font-mono text-[10px] font-bold" style={{ color: s.color }}>{s.value}</span>
            </div>
          ) : (
            <span className="rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ color: s.color, background: `${s.color}15` }}>{s.value}</span>
          )}
        </div>
      ))}
    </div>
  );
};

/* ── Helpers ── */
const Sep = () => <span className="text-[9px] text-white/[0.08]">|</span>;
const BarSep = () => <span className="text-white/[0.08]">|</span>;
const Pill = ({ l, v, c }: { l: string; v: string; c: string }) => (
  <div className="flex items-center gap-1"><span className="text-[9px] text-[var(--textSubtle)]">{l}:</span><span className="text-[9px] font-bold" style={{ color: c }}>{v}</span></div>
);

