import { ChartCard } from "../components/master/ChartCard";
import {
  MarketModePanel,
  AIMasterScore,
  CapitalFlowPanel,
  InstitutionalFlowPanel,
  SectorDominance,
  RiskEngine,
  StrategyMode,
  TopAssets,
  TimeframeControl,
  MarketStructure,
  AutoModeSwitch,
} from "../components/master/MasterPanels";
import { useLiveMarketData } from "../hooks/useLiveMarketData";
import type { OHLCVData } from "../components/shared/LWChart";

/* ── Loading skeleton ── */
const LoadingSkeleton = () => (
  <main className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
    <div className="flex flex-col items-center gap-3">
      <div className="h-8 w-8 rounded-full border-2 border-[#5B8DEF] border-t-transparent animate-spin" />
      <span className="text-xs text-[var(--textMuted)]">Loading live market data...</span>
    </div>
  </main>
);

export default function MasterPage() {
  const solLive = useLiveMarketData("SOLUSDT");

  if (solLive.loading) return <LoadingSkeleton />;

  return (
    <main className="min-h-screen bg-[var(--bg)] p-2 md:p-3 flex flex-col gap-2">

      {/* ═══ TOP BAR ═══ */}
      <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-[var(--panel)] px-4 py-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-[#2bc48a] animate-pulse" />
            <span className="text-[11px] font-bold text-[var(--text)]">MASTER CONTROL</span>
          </div>
          <span className="text-[10px] text-[var(--textSubtle)]">|</span>
          <span className="text-[10px] text-[var(--textMuted)]">Mode:</span>
          <span className="inline-flex items-center rounded-md border border-[#2bc48a]/20 bg-[#2bc48a]/15 px-2 py-0.5 text-[10px] font-bold text-[#2bc48a]">
            Aggressive
          </span>
        </div>
        <div className="flex items-center gap-4">
          <StatusPill label="AI Score" value="8.2/10" color="#2bc48a" />
          <StatusPill label="Data" value="Live" color="#2bc48a" />
          <StatusPill label="Risk" value="Elevated" color="#F5C542" />
          <span className="font-mono text-[10px] text-[var(--textSubtle)]">
            {new Date().toLocaleTimeString()}
          </span>
        </div>
      </div>

      {/* ═══ ROW 1: Market Mode + AI Score (2 cols full width) ═══ */}
      <div className="grid grid-cols-2 gap-2">
        <MarketModePanel />
        <AIMasterScore />
      </div>

      {/* ═══ ROW 2: 3-6-3 layout ═══ */}
      <div className="grid grid-cols-12 gap-2 flex-1 min-h-0" style={{ height: "calc(100vh - 290px)" }}>

        {/* LEFT COLUMN (3 cols) */}
        <div className="col-span-3 flex flex-col gap-2 overflow-y-auto pr-0.5">
          <CapitalFlowPanel />
          <InstitutionalFlowPanel />
          <SectorDominance />
        </div>

        {/* CENTER COLUMN (6 cols) — Main Chart + multi-TF strip */}
        <div className="col-span-6 flex flex-col gap-2 min-h-0">
          {/* Main SOL 1m chart */}
          <div className="flex-1 min-h-0">
            <ChartCard
              symbol="SOL/USDT"
              timeframe="1m"
              data={solLive.candles1m as OHLCVData[]}
              className="h-full"
            />
          </div>
          {/* Multi-TF strip */}
          <div className="grid grid-cols-4 gap-1.5" style={{ height: "80px" }}>
            <ChartCard symbol="SOL" timeframe="15m" data={solLive.candles15m as OHLCVData[]} compact className="h-full" />
            <ChartCard symbol="SOL" timeframe="1H" data={solLive.candles1h as OHLCVData[]} compact className="h-full" />
            <ChartCard symbol="SOL" timeframe="4H" data={solLive.candles4h as OHLCVData[]} compact className="h-full" />
            <ChartCard symbol="SOL" timeframe="1D" data={solLive.candles1d as OHLCVData[]} compact className="h-full" />
          </div>
        </div>

        {/* RIGHT COLUMN (3 cols) */}
        <div className="col-span-3 flex flex-col gap-2 overflow-y-auto pl-0.5">
          <RiskEngine />
          <StrategyMode />
          <TopAssets />
        </div>
      </div>

      {/* ═══ BOTTOM STRIP ═══ */}
      <div className="grid grid-cols-3 gap-2">
        <TimeframeControl />
        <MarketStructure />
        <AutoModeSwitch />
      </div>
    </main>
  );
}

/* ── Status Pill ── */
const StatusPill = ({ label, value, color }: { label: string; value: string; color: string }) => (
  <div className="flex items-center gap-1.5">
    <span className="text-[9px] text-[var(--textSubtle)]">{label}:</span>
    <span className="text-[9px] font-semibold" style={{ color }}>{value}</span>
  </div>
);
