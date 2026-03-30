import { useState } from "react";
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
import { LWChart } from "../components/shared/LWChart";
import { useLiveMarketData } from "../hooks/useLiveMarketData";

const COINS = [
  { label: "SOL", symbol: "SOLUSDT" },
  { label: "BTC", symbol: "BTCUSDT" },
  { label: "ETH", symbol: "ETHUSDT" },
  { label: "AVAX", symbol: "AVAXUSDT" },
  { label: "BNB", symbol: "BNBUSDT" },
  { label: "LINK", symbol: "LINKUSDT" },
  { label: "ARB", symbol: "ARBUSDT" },
  { label: "DOGE", symbol: "DOGEUSDT" },
];

const sessions: Record<string, string> = { Asia: "\uD83C\uDF0F", London: "\uD83C\uDDEC\uD83C\uDDE7", "New York": "\uD83C\uDDFA\uD83C\uDDF8" };

function getActiveSession(): string {
  const utcH = new Date().getUTCHours();
  if (utcH >= 0 && utcH < 8) return "Asia";
  if (utcH >= 8 && utcH < 14) return "London";
  return "New York";
}

export default function AlphaWarRoomPage() {
  const [selectedSymbol, setSelectedSymbol] = useState("SOLUSDT");
  const marketData = useLiveMarketData(selectedSymbol);
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

      {/* ── ROW 2: MAIN CHART ── */}
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
        {/* Coin selector */}
        <div className="flex items-center gap-1.5 mb-2">
          {COINS.map((c) => (
            <button
              key={c.symbol}
              onClick={() => setSelectedSymbol(c.symbol)}
              className={`px-3 py-1 text-[10px] font-bold rounded-md transition-colors ${
                selectedSymbol === c.symbol
                  ? "border border-[var(--accent)] bg-white/[0.06] text-[var(--text)]"
                  : "border border-white/[0.06] bg-white/[0.02] text-[var(--textSubtle)] hover:bg-white/[0.04]"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Price + 24h change */}
        <div className="flex items-center gap-3 mb-1.5 px-1">
          <span className="text-xl font-mono font-bold text-[var(--text)]">
            {marketData.currentPrice
              ? marketData.currentPrice.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: marketData.currentPrice < 1 ? 6 : 2,
                })
              : "—"}
          </span>
          <span
            className={`text-xs font-mono font-bold ${
              marketData.priceChange24hPct >= 0 ? "text-[#2bc48a]" : "text-[#f6465d]"
            }`}
          >
            {marketData.priceChange24hPct >= 0 ? "+" : ""}
            {marketData.priceChange24hPct.toFixed(2)}%
          </span>
          <span className="text-[9px] text-[var(--textMuted)] font-mono">
            {selectedSymbol.replace("USDT", "/USDT")} · 1m
          </span>
        </div>

        {/* Chart */}
        <div className="h-[380px]">
          <LWChart
            data={marketData.candles1m}
            showVolume={true}
            showIndicators={true}
          />
        </div>
      </div>

      {/* ── ROW 3: HEATMAP | SECTORS | BREAKOUT ── */}
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
