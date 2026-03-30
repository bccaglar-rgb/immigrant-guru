import {
  TopTradesPanel,
  OpportunityFeed,
  MarketHeatmap,
  SectorRotation,
  BreakoutScanner,
  WhaleActivityBoard,
  LongShortPanel,
  LiquidationMap,
  AIGlobalBias,
  KeyLevelsDashboard,
  NarrativeEngine,
} from "../components/warroom/WarRoomPanels";

const sessions: Record<string, string> = { Asia: "\uD83C\uDF0F", London: "\uD83C\uDDEC\uD83C\uDDE7", "New York": "\uD83C\uDDFA\uD83C\uDDF8" };

function getActiveSession(): string {
  const utcH = new Date().getUTCHours();
  if (utcH >= 0 && utcH < 8) return "Asia";
  if (utcH >= 8 && utcH < 14) return "London";
  return "New York";
}

export default function AlphaWarRoomPage() {
  const now = new Date();
  const utc = now.toLocaleTimeString("en-US", { timeZone: "UTC", hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const local = now.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const activeSession = getActiveSession();

  return (
    <main className="min-h-screen bg-[var(--bg)] p-1.5 md:p-2 flex flex-col gap-1.5">
      {/* ── COMMAND BAR ── */}
      <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-[var(--panel)] px-4 py-1.5">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-[#f6465d] animate-pulse" />
            <span className="text-2xl font-bold tracking-wide text-[var(--text)]">ALPHA WAR ROOM</span>
          </div>
          <Divider />
          <CommandPill label="Market" value="Risk-On" color="#2bc48a" />
          <Divider />
          <CommandPill label="AI" value="Active" color="#F5C542" />
          <CommandPill label="Mode" value="Opportunity Radar" color="#5B8DEF" />
        </div>
        <div className="flex items-center gap-3">
          <CommandPill label="Session" value={`${sessions[activeSession] ?? ""} ${activeSession}`} color="var(--accent)" />
          <Divider />
          <div className="flex items-center gap-2">
            <span className="font-mono text-[9px] text-[var(--textSubtle)]">UTC {utc}</span>
            <span className="font-mono text-[9px] text-[var(--textMuted)]">Local {local}</span>
          </div>
        </div>
      </div>

      {/* ── TOP TRADES (full width) ── */}
      <TopTradesPanel />

      {/* ── MAIN GRID — 12 columns ── */}
      <div className="flex-1 grid grid-cols-12 gap-1.5" style={{ minHeight: "calc(100vh - 200px)" }}>

        {/* LEFT: 3 cols — Heatmap, Sector, Breakout */}
        <div className="col-span-3 flex flex-col gap-1.5 overflow-y-auto pr-0.5">
          <MarketHeatmap />
          <SectorRotation />
          <BreakoutScanner />
        </div>

        {/* CENTER: 6 cols — Opportunity Feed */}
        <div className="col-span-6 flex flex-col gap-1.5 overflow-hidden">
          <OpportunityFeed />
        </div>

        {/* RIGHT: 3 cols — Whale, Long/Short, Liquidation, AI Bias */}
        <div className="col-span-3 flex flex-col gap-1.5 overflow-y-auto pl-0.5">
          <WhaleActivityBoard />
          <LongShortPanel />
          <LiquidationMap />
          <AIGlobalBias />
        </div>
      </div>

      {/* ── BOTTOM STRIP ── */}
      <div className="grid grid-cols-2 gap-1.5">
        <KeyLevelsDashboard />
        <NarrativeEngine />
      </div>
    </main>
  );
}

const Divider = () => <span className="text-[10px] text-white/10">|</span>;

const CommandPill = ({ label, value, color }: { label: string; value: string; color: string }) => (
  <div className="flex items-center gap-1.5">
    <span className="text-[9px] text-[var(--textSubtle)]">{label}:</span>
    <span className="text-[9px] font-bold" style={{ color }}>{value}</span>
  </div>
);
