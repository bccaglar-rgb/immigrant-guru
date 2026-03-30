import { ChartCard } from "../components/master/ChartCard";
import { SignalPanel } from "../components/master/SignalPanel";
import { TradePanel } from "../components/master/TradePanel";
import { MarketInsightPanel } from "../components/master/MarketInsightPanel";
import { signalData, marketInsightData } from "../components/master/mockData";
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
  /* ── Live data for SOL and BTC ── */
  const solLive = useLiveMarketData("SOLUSDT");
  const btcLive = useLiveMarketData("BTCUSDT");

  const solPrice = solLive.currentPrice || solLive.candles1m[solLive.candles1m.length - 1]?.close || 0;

  if (solLive.loading) return <LoadingSkeleton />;

  return (
    <main className="min-h-screen bg-[var(--bg)] p-2 md:p-3">
      {/* Top Status Bar */}
      <div className="mb-2 flex items-center justify-between rounded-xl border border-white/[0.06] bg-[var(--panel)] px-4 py-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-[#2bc48a] animate-pulse" />
            <span className="text-[11px] font-bold text-[var(--text)]">MASTER TERMINAL</span>
          </div>
          <span className="text-[10px] text-[var(--textSubtle)]">|</span>
          <span className="text-[10px] text-[var(--textMuted)]">SOL/USDT</span>
          <span className="text-[10px] text-[var(--textSubtle)]">|</span>
          <span className="text-[10px] text-[var(--textMuted)]">BTC/USDT</span>
        </div>
        <div className="flex items-center gap-4">
          <StatusPill label="Data" value="Live" color="#2bc48a" />
          <StatusPill label="AI Engine" value="Active" color="#F5C542" />
          <StatusPill label="Signals" value="8 Active" color="#5B8DEF" />
          <span className="font-mono text-[10px] text-[var(--textSubtle)]">
            {new Date().toLocaleTimeString()}
          </span>
        </div>
      </div>

      {/* Main Grid -- 12 column layout */}
      <div className="grid h-[calc(100vh-80px)] grid-cols-12 grid-rows-[1fr_1fr] gap-2">

        {/* TOP ROW */}

        {/* SOL 15m -- cols 1-3 */}
        <div className="col-span-3 row-span-1">
          <ChartCard symbol="SOL/USDT" timeframe="15m" data={solLive.candles15m as OHLCVData[]} className="h-full" />
        </div>

        {/* SOL 1m (MAIN) -- cols 4-8 */}
        <div className="col-span-5 row-span-1">
          <ChartCard symbol="SOL/USDT" timeframe="1m" data={solLive.candles1m as OHLCVData[]} className="h-full" />
        </div>

        {/* BTC 1m -- cols 9-12 */}
        <div className="col-span-4 row-span-1 flex flex-col gap-2">
          <ChartCard symbol="BTC/USDT" timeframe="1m" data={btcLive.candles1m as OHLCVData[]} className="flex-[2]" />
        </div>

        {/* BOTTOM ROW */}

        {/* SOL Timeframe Stack -- cols 1-3 */}
        <div className="col-span-3 row-span-1 flex flex-col gap-2">
          <ChartCard symbol="SOL/USDT" timeframe="1H" data={solLive.candles1h as OHLCVData[]} compact className="flex-1" />
          <ChartCard symbol="SOL/USDT" timeframe="4H" data={solLive.candles4h as OHLCVData[]} compact className="flex-1" />
          <ChartCard symbol="SOL/USDT" timeframe="24H" data={solLive.candles1d as OHLCVData[]} compact className="flex-1" />
        </div>

        {/* Signal + Trade Panels -- cols 4-8 */}
        <div className="col-span-5 row-span-1 flex flex-col gap-2 overflow-y-auto">
          <SignalPanel data={signalData} />
          <TradePanel currentPrice={solPrice} symbol="SOL/USDT" />
        </div>

        {/* Market Intelligence -- cols 9-12 */}
        <div className="col-span-4 row-span-1 overflow-y-auto">
          <MarketInsightPanel data={marketInsightData} />
        </div>
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
