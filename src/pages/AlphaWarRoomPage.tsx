import { ContextEngine } from "../components/warroom/ContextEngine";
import { HeroChart } from "../components/warroom/HeroChart";
import { SignalMatrix } from "../components/warroom/SignalMatrix";
import { ExecutionEngine } from "../components/warroom/ExecutionEngine";
import { AIDecisionEngine } from "../components/warroom/AIDecisionEngine";
import { StructurePanel } from "../components/warroom/StructurePanel";
import { AlertMatrix } from "../components/warroom/AlertMatrix";
import { SessionPanel } from "../components/warroom/SessionPanel";
import { MarketIntelligence } from "../components/warroom/MarketIntelligence";
import {
  sol1m, btc1m, timeframeContexts, signalMatrix,
  aiDecision, structureLevels, alerts, sentiment,
  sessionData, marketIntel,
} from "../components/warroom/mockData";

const sessions: Record<string, string> = { Asia: "🌏", London: "🇬🇧", "New York": "🇺🇸" };

export default function AlphaWarRoomPage() {
  const solPrice = sol1m[sol1m.length - 1]?.close ?? 146;
  const now = new Date();
  const utc = now.toLocaleTimeString("en-US", { timeZone: "UTC", hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const local = now.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <main className="min-h-screen bg-[var(--bg)] p-1.5 md:p-2 flex flex-col gap-1.5">
      {/* ═══ COMMAND BAR ═══ */}
      <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-[var(--panel)] px-4 py-1.5">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-[#f6465d] animate-pulse" />
            <span className="text-[11px] font-black tracking-wider text-[var(--text)]">ALPHA WAR ROOM</span>
          </div>
          <Divider />
          <CommandPill label="Asset" value="SOL/USDT" color="#F5C542" />
          <Divider />
          <CommandPill label="State" value="Trending" color="#2bc48a" />
          <CommandPill label="AI" value="Active" color="#F5C542" />
          <CommandPill label="Risk" value="Neutral" color="#5B8DEF" />
        </div>
        <div className="flex items-center gap-3">
          <CommandPill label="Session" value={`${sessions[sessionData.current] ?? ""} ${sessionData.current}`} color="var(--accent)" />
          <Divider />
          <div className="flex items-center gap-2">
            <span className="font-mono text-[9px] text-[var(--textSubtle)]">UTC {utc}</span>
            <span className="font-mono text-[9px] text-[var(--textMuted)]">Local {local}</span>
          </div>
        </div>
      </div>

      {/* ═══ MAIN GRID — 12 columns ═══ */}
      <div className="flex-1 grid grid-cols-12 gap-1.5" style={{ height: "calc(100vh - 56px)" }}>

        {/* ── LEFT: Context Engine (4 cols) ── */}
        <div className="col-span-4 flex flex-col gap-1.5 overflow-y-auto pr-0.5">
          <ContextEngine contexts={timeframeContexts} />
          <AlertMatrix alerts={alerts} />
          <SessionPanel sentiment={sentiment} session={sessionData} />
        </div>

        {/* ── CENTER: Execution Core (5 cols) ── */}
        <div className="col-span-5 flex flex-col gap-1.5 overflow-hidden">
          {/* Hero Chart */}
          <div className="flex-[3] min-h-0">
            <HeroChart data={sol1m} symbol="SOL/USDT" />
          </div>
          {/* Decision Stack */}
          <div className="flex-[4] overflow-y-auto space-y-1.5">
            <AIDecisionEngine data={aiDecision} />
            <SignalMatrix data={signalMatrix} />
            <ExecutionEngine currentPrice={solPrice} symbol="SOL/USDT" />
          </div>
        </div>

        {/* ── RIGHT: Market Intelligence (3 cols) ── */}
        <div className="col-span-3 flex flex-col gap-1.5 overflow-y-auto pl-0.5">
          <MarketIntelligence btcData={btc1m} intel={marketIntel} />
          <StructurePanel data={structureLevels} />
        </div>
      </div>
    </main>
  );
}

const Divider = () => <span className="text-[10px] text-white/10">|</span>;

const CommandPill = ({ label, value, color }: { label: string; value: string; color: string }) => (
  <div className="flex items-center gap-1.5">
    <span className="text-[8px] text-[var(--textSubtle)]">{label}:</span>
    <span className="text-[9px] font-bold" style={{ color }}>{value}</span>
  </div>
);
