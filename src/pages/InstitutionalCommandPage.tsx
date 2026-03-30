import { MultiTimeframePanel } from "../components/institutional/MultiTimeframePanel";
import { HeroExecutionChart } from "../components/institutional/HeroExecutionChart";
import { SignalIntelligencePanel } from "../components/institutional/SignalIntelligencePanel";
import { TradeExecutionPanel } from "../components/institutional/TradeExecutionPanel";
import { AIDecisionPanel } from "../components/institutional/AIDecisionPanel";
import { BTCChart, MarketIntelFeed, StructureLevelsPanel, AlertMatrixPanel, BottomStrip } from "../components/institutional/RightPanels";
import {
  sol1m, btc1m, tfContexts, signals, aiDecision, levels,
  alerts, session, sentiment, execQuality, marketIntel,
} from "../components/institutional/mockData";

export default function InstitutionalCommandPage() {
  const price = sol1m[sol1m.length - 1]?.close ?? 147;
  const now = new Date();
  const utc = now.toLocaleTimeString("en-US", { timeZone: "UTC", hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const local = now.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <main className="min-h-screen bg-[var(--bg)] p-1.5 flex flex-col gap-1">
      {/* ═══ COMMAND BAR ═══ */}
      <header className="flex items-center justify-between rounded-xl border border-white/[0.05] bg-[var(--panel)] px-3.5 py-1.5">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-[#2bc48a] animate-pulse" />
            <span className="text-[10px] font-black tracking-[0.15em] text-[var(--text)]">INSTITUTIONAL COMMAND</span>
          </div>
          <Sep />
          <Pill l="Asset" v="SOL/USDT" c="#F5C542" />
          <Pill l="Session" v={`${session.name}`} c="var(--accent)" />
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
      </header>

      {/* ═══ MAIN 12-COL GRID ═══ */}
      <div className="flex-1 grid grid-cols-12 gap-1" style={{ height: "calc(100vh - 52px)" }}>

        {/* ── LEFT: Alerts + Session/Sentiment + Multi-Timeframe (4 cols) ── */}
        <div className="col-span-4 overflow-y-auto space-y-1 pr-0.5 scrollbar-thin">
          <AlertMatrixPanel alerts={alerts} />
          <BottomStrip session={session} sentiment={sentiment} execQuality={execQuality} />
          <MultiTimeframePanel contexts={tfContexts} />
        </div>

        {/* ── CENTER: Hero + Decision Stack (5 cols) ── */}
        <div className="col-span-5 flex flex-col gap-1 overflow-hidden">
          <div className="flex-[3] min-h-0">
            <HeroExecutionChart data={sol1m} symbol="SOL/USDT" />
          </div>
          <div className="flex-[4] overflow-y-auto space-y-1 scrollbar-thin">
            <AIDecisionPanel data={aiDecision} />
            <SignalIntelligencePanel data={signals} />
            <TradeExecutionPanel price={price} symbol="SOL/USDT" />
          </div>
        </div>

        {/* ── RIGHT: BTC + Intel + Structure (3 cols) ── */}
        <div className="col-span-3 overflow-y-auto space-y-1 pl-0.5 scrollbar-thin">
          <BTCChart data={btc1m} />
          <MarketIntelFeed intel={marketIntel} />
          <StructureLevelsPanel data={levels} />
        </div>
      </div>
    </main>
  );
}

const Sep = () => <span className="text-[9px] text-white/[0.08]">|</span>;
const Pill = ({ l, v, c }: { l: string; v: string; c: string }) => (
  <div className="flex items-center gap-1"><span className="text-[9px] text-[var(--textSubtle)]">{l}:</span><span className="text-[9px] font-bold" style={{ color: c }}>{v}</span></div>
);
