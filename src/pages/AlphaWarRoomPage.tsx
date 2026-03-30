import {
  TopTradesPanel,
  MarketHeatmap,
  SectorRotation,
  BreakoutScanner,
  SmartSignalGrid,
  OpportunityFeed,
  MoneyFlowPanel,
  LiveTape,
  BuySellPressure,
  WhaleActivityBoard,
  LiquidationMap,
  AIGlobalBias,
  CorrelationPanel,
  DangerZone,
  MarketCondition,
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
      <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-[var(--panel)] px-3 py-1">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-[#f6465d] animate-pulse" />
            <span className="text-xl font-bold tracking-wide text-[var(--text)]">ALPHA WAR ROOM</span>
          </div>
          <Divider />
          <CommandPill label="Market" value="Risk-On" color="#2bc48a" />
          <Divider />
          <CommandPill label="AI" value="Active" color="#F5C542" />
          <CommandPill label="Mode" value="Battle Station" color="#5B8DEF" />
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

      {/* ── ROW 1: TOP TRADES ── */}
      <TopTradesPanel />

      {/* ── ROW 2: HEATMAP | SECTORS | BREAKOUT ── */}
      <div className="grid grid-cols-3 gap-1.5">
        <MarketHeatmap />
        <SectorRotation />
        <BreakoutScanner />
      </div>

      {/* ── ROW 3: SMART SIGNAL GRID ── */}
      <SmartSignalGrid />

      {/* ── ROW 4: OPPORTUNITY FEED ── */}
      <OpportunityFeed />

      {/* ── ROW 5: MONEY FLOW | LIVE TAPE | BUY/SELL PRESSURE ── */}
      <div className="grid grid-cols-3 gap-1.5">
        <MoneyFlowPanel />
        <LiveTape />
        <BuySellPressure />
      </div>

      {/* ── ROW 6: WHALE | LIQUIDATION | AI BIAS ── */}
      <div className="grid grid-cols-3 gap-1.5">
        <WhaleActivityBoard />
        <LiquidationMap />
        <AIGlobalBias />
      </div>

      {/* ── ROW 7: CORRELATION | DANGER ZONE | MARKET CONDITION ── */}
      <div className="grid grid-cols-3 gap-1.5">
        <CorrelationPanel />
        <DangerZone />
        <MarketCondition />
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
