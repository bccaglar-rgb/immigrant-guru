import { useState } from "react";
import { ChartCard } from "../components/master/ChartCard";
import { MiniChartCard } from "../components/master/MiniChartCard";
import {
  CompactStrip,
  CapitalFlowPanel,
  InstitutionalFlowPanel,
  SectorDominance,
  RiskEngine,
  StrategyMode,
  TopAssets,
  TimeframeControl,
  MarketStructure,
  AutoModeSwitch,
  MicroSignalBar,
  QuickEntryPanel,
  DecisionBox,
  LiveOrderFlowMini,
  MomentumGauge,
  LiquidityMagnet,
} from "../components/master/MasterPanels";
import { useLiveMarketData } from "../hooks/useLiveMarketData";
import type { OHLCVData } from "../components/shared/LWChart";

/* ── Filter data ── */
const FILTER_KEYS = ["OI Increase", "OI Decrease", "Sniper", "Coin Universe"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

const filterCoins: Record<FilterKey, string[]> = {
  "OI Increase": ["SOLUSDT", "BTCUSDT", "ETHUSDT", "AVAXUSDT", "BNBUSDT", "LINKUSDT"],
  "OI Decrease": ["ARBUSDT", "DOGEUSDT", "LINKUSDT", "XRPUSDT", "DOTUSDT", "AAVEUSDT"],
  Sniper: ["SOLUSDT", "AVAXUSDT", "LINKUSDT", "BTCUSDT", "MATICUSDT", "ETHUSDT"],
  "Coin Universe": ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "AVAXUSDT"],
};

/* ── Loading skeleton ── */
const LoadingSkeleton = () => (
  <main className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
    <div className="flex flex-col items-center gap-2">
      <div className="h-8 w-8 rounded-full border-2 border-[#5B8DEF] border-t-transparent animate-spin" />
      <span className="text-[9px] text-[var(--textMuted)]">Loading live market data...</span>
    </div>
  </main>
);

export default function MasterPage() {
  const [activeFilter, setActiveFilter] = useState<FilterKey>("OI Increase");
  const [selectedSymbol, setSelectedSymbol] = useState("SOLUSDT");

  const mainLive = useLiveMarketData(selectedSymbol);
  const coins = filterCoins[activeFilter];
  const displaySymbol = selectedSymbol.replace("USDT", "/USDT");

  if (mainLive.loading) return <LoadingSkeleton />;

  return (
    <main className="min-h-screen bg-[var(--bg)] p-1.5 md:p-2 flex flex-col gap-1.5">

      {/* TOP BAR */}
      <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-[var(--panel)] px-3 py-1.5">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-[#2bc48a] animate-pulse" />
            <span className="text-lg font-bold tracking-wide text-[var(--text)]">MASTER CONTROL</span>
          </div>
          <span className="text-[9px] text-[var(--textSubtle)]">|</span>
          <span className="text-[9px] text-[var(--textMuted)]">Mode:</span>
          <span className="inline-flex items-center rounded-md border border-[#2bc48a]/20 bg-[#2bc48a]/15 px-1.5 py-0.5 text-[9px] font-bold text-[#2bc48a]">
            Aggressive
          </span>
        </div>
        <div className="flex items-center gap-3">
          <StatusPill label="AI Score" value="8.2/10" color="#2bc48a" />
          <StatusPill label="Data" value="Live" color="#2bc48a" />
          <StatusPill label="Risk" value="Elevated" color="#F5C542" />
          <span className="font-mono text-[9px] text-[var(--textSubtle)]">
            {new Date().toLocaleTimeString()}
          </span>
        </div>
      </div>

      {/* COMPACT STRIP */}
      <CompactStrip />

      {/* MAIN LAYOUT: 3-6-3 */}
      <div className="grid grid-cols-12 gap-1.5 flex-1 min-h-0" style={{ height: "calc(100vh - 200px)" }}>

        {/* ═══ LEFT COLUMN (3 cols) — Mini charts + filters ═══ */}
        <div className="col-span-3 flex flex-col gap-1 overflow-y-auto pr-0.5">
          {/* Filter buttons */}
          <div className="flex items-center gap-1 flex-wrap px-0.5 py-1">
            {FILTER_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setActiveFilter(key);
                  // Switch main chart to first coin of new filter
                  setSelectedSymbol(filterCoins[key][0]);
                }}
                className={`text-[9px] px-2 py-1 rounded-md font-semibold transition-all ${
                  activeFilter === key
                    ? "border border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]"
                    : "border border-white/[0.08] bg-white/[0.03] text-[var(--textMuted)] hover:bg-white/[0.05]"
                }`}
              >
                {key}
              </button>
            ))}
          </div>

          {/* 5 mini chart cards */}
          {coins.map((symbol) => (
            <MiniChartCard
              key={symbol}
              symbol={symbol}
              isActive={selectedSymbol === symbol}
              onClick={() => setSelectedSymbol(symbol)}
            />
          ))}
        </div>

        {/* ═══ CENTER COLUMN (6 cols) — Chart + signals + entry + decision ═══ */}
        <div className="col-span-6 flex flex-col gap-1.5 min-h-0">
          {/* Main chart */}
          <div className="flex-[0.7] min-h-0">
            <ChartCard
              symbol={displaySymbol}
              timeframe="1m"
              data={mainLive.candles1m as OHLCVData[]}
              className="h-full"
            />
          </div>
          {/* Micro Signal Bar */}
          <MicroSignalBar />
          {/* Quick Entry Panel */}
          <QuickEntryPanel />
          {/* Decision Box */}
          <DecisionBox />
        </div>

        {/* ═══ RIGHT COLUMN (3 cols) — All panels merged ═══ */}
        <div className="col-span-3 flex flex-col gap-1.5 overflow-y-auto pl-0.5">
          {/* Old left panels */}
          <CapitalFlowPanel />
          <InstitutionalFlowPanel />
          <SectorDominance />
          {/* Old right panels */}
          <RiskEngine />
          <StrategyMode />
          <TopAssets />
          <LiveOrderFlowMini />
          <MomentumGauge />
          <LiquidityMagnet />
        </div>
      </div>

      {/* BOTTOM STRIP */}
      <div className="grid grid-cols-3 gap-1.5">
        <TimeframeControl />
        <MarketStructure />
        <AutoModeSwitch />
      </div>
    </main>
  );
}

/* ── Status Pill ── */
const StatusPill = ({ label, value, color }: { label: string; value: string; color: string }) => (
  <div className="flex items-center gap-1">
    <span className="text-[8px] text-[var(--textSubtle)]">{label}:</span>
    <span className="text-[8px] font-semibold font-mono" style={{ color }}>{value}</span>
  </div>
);
