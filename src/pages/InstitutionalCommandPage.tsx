import { MultiTimeframePanel } from "../components/institutional/MultiTimeframePanel";
import { HeroExecutionChart } from "../components/institutional/HeroExecutionChart";
import { BTCChart, MarketIntelFeed, StructureLevelsPanel, AlertMatrixPanel } from "../components/institutional/RightPanels";
import { SignalFeedPanels } from "../components/institutional/SignalFeedPanels";
import { getCoinData, session } from "../components/institutional/mockData";
import { useLiveMarketData } from "../hooks/useLiveMarketData";
import { useState, useRef, useEffect, useMemo } from "react";
import type { OHLCVData } from "../components/shared/LWChart";

const COINS = ["SOL/USDT", "BTC/USDT", "ETH/USDT", "BNB/USDT", "XRP/USDT", "DOGE/USDT", "ADA/USDT", "AVAX/USDT", "DOT/USDT", "LINK/USDT"];

/* ── Loading skeleton ── */
const LoadingSkeleton = () => (
  <main className="h-screen bg-[var(--bg)] flex items-center justify-center">
    <div className="flex flex-col items-center gap-3">
      <div className="h-8 w-8 rounded-full border-2 border-[#5B8DEF] border-t-transparent animate-spin" />
      <span className="text-xs text-[var(--textMuted)]">Loading live market data...</span>
    </div>
  </main>
);

export default function InstitutionalCommandPage() {
  const [selectedCoin, setSelectedCoin] = useState("SOL/USDT");
  const [coinDropOpen, setCoinDropOpen] = useState(false);
  const coinDropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (coinDropRef.current && !coinDropRef.current.contains(e.target as Node)) setCoinDropOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  /* ── Live market data for selected coin ── */
  const coinSymbol = selectedCoin.replace("/", "");
  const live = useLiveMarketData(coinSymbol);

  /* ── Live BTC data for BTC mini chart ── */
  const btcLive = useLiveMarketData("BTCUSDT");

  /* ── Mock analysis data (signals, AI, alerts) — uses mock logic but will reference real prices ── */
  const coinData = useMemo(() => getCoinData(selectedCoin), [selectedCoin]);
  const { tfContexts, signals, aiDecision, alerts: coinAlerts, biasLabel: coinBiasLabel, entry, entryLow, sl, tp1, tp2, invalidation } = coinData;

  /* ── Build chart data map for MultiTimeframePanel ── */
  const tfChartData = useMemo<Record<string, OHLCVData[]>>(() => ({
    "15m": live.candles15m as OHLCVData[],
    "1H": live.candles1h as OHLCVData[],
    "4H": live.candles4h as OHLCVData[],
    "1D": live.candles1d as OHLCVData[],
  }), [live.candles15m, live.candles1h, live.candles4h, live.candles1d]);

  const now = new Date();
  const utc = now.toLocaleTimeString("en-US", { timeZone: "UTC", hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const local = now.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });

  /* AI decision config */
  const biasColor = aiDecision.bias === "Bullish" ? "#2bc48a" : aiDecision.bias === "Bearish" ? "#f6465d" : "#8A8F98";
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

  /* Show loading skeleton while live data is loading */
  if (live.loading) return <LoadingSkeleton />;

  return (
    <main className="h-screen bg-[var(--bg)] p-1.5 flex flex-col gap-1 overflow-hidden">
      {/* TOP BAR */}
      <header className="flex-shrink-0 rounded-xl border border-white/[0.05] bg-[var(--panel)]">
        {/* Line 1: Command Bar */}
        <div className="flex items-center justify-between px-3.5 py-2">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-[#2bc48a] animate-pulse" />
              <span className="text-[10px] font-black tracking-[0.15em] text-[var(--text)]">INSTITUTIONAL COMMAND</span>
            </div>
            <Sep />
            {/* Coin Dropdown */}
            <div ref={coinDropRef} className="relative">
              <button
                onClick={() => setCoinDropOpen(!coinDropOpen)}
                className="flex items-center gap-1 rounded-lg border border-[#F5C542]/30 bg-[#F5C542]/10 px-2 py-0.5 text-[10px] font-bold text-[#F5C542] hover:bg-[#F5C542]/20 transition-colors"
              >
                <span className="text-[10px] text-[var(--textMuted)]">Asset</span>
                <span>{selectedCoin}</span>
                <svg className="h-3 w-3 opacity-60" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
              </button>
              {coinDropOpen && (
                <div className="absolute z-50 mt-1 w-40 rounded-xl border border-white/10 bg-[#1A1B1E] py-1 shadow-2xl max-h-60 overflow-y-auto">
                  {COINS.map((c) => (
                    <button
                      key={c}
                      onClick={() => { setSelectedCoin(c); setCoinDropOpen(false); }}
                      className={`w-full px-3 py-1.5 text-left text-[10px] font-medium hover:bg-white/5 transition-colors ${c === selectedCoin ? "text-[#F5C542] bg-[#F5C542]/10" : "text-[var(--text)]"}`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Pill l="Session" v={session.name} c="var(--accent)" />
            <Sep />
            <Pill l="Regime" v={signals.regime} c="#2bc48a" />
            <Pill l="AI" v="Active" c="#F5C542" />
            <Pill l="Risk" v="Neutral" c="#5B8DEF" />
          </div>
          <div className="flex items-center gap-2.5">
            {live.currentPrice > 0 && (
              <>
                <Pill l="Price" v={`$${live.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} c={live.priceChange24hPct >= 0 ? "#2bc48a" : "#f6465d"} />
                <Sep />
              </>
            )}
            <Pill l="Quality" v={`${aiDecision.marketQuality}/100`} c={aiDecision.marketQuality >= 70 ? "#2bc48a" : "#F5C542"} />
            <Sep />
            <span className="font-mono text-[10px] text-[var(--textSubtle)]">UTC {utc}</span>
            <span className="font-mono text-[10px] text-[var(--textMuted)]">{local}</span>
          </div>
        </div>
        {/* Line 2: System Health */}
        <div className="flex items-center gap-4 border-t border-white/[0.04] px-3.5 py-1">
          {healthItems.map((it) => (
            <div key={it.label} className="flex items-center gap-1">
              <span className="text-[10px] text-[var(--textMuted)]">{it.label}:</span>
              {it.value && <span className="text-[10px]">{it.value}</span>}
              {it.text && <span className="text-[10px] font-bold text-[var(--text)]">{it.text}</span>}
            </div>
          ))}
        </div>
      </header>

      {/* MAIN 12-COL GRID */}
      <div className="flex-1 grid grid-cols-12 gap-1 min-h-0">

        {/* LEFT: 3 cols */}
        <div className="col-span-3 overflow-y-auto space-y-1 pr-0.5 scrollbar-thin">
          <AlertMatrixPanel alerts={coinAlerts} />
          <MultiTimeframePanel contexts={tfContexts} chartData={tfChartData} />
        </div>

        {/* CENTER: 6 cols */}
        <div className="col-span-6 flex flex-col gap-1 overflow-hidden">
          <div style={{ height: "50%" }} className="min-h-0 flex-shrink-0">
            <HeroExecutionChart data={live.candles1m as OHLCVData[]} symbol={selectedCoin} aiOverlay={{ bias: coinBiasLabel, confidence: aiDecision.confidence, setup: aiDecision.strategy }} />
          </div>
          <QuickStatsPanel horizontal coinData={coinData} />
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin pr-0.5">
            <SignalFeedPanels />
          </div>
        </div>

        {/* RIGHT: 3 cols */}
        <div className="col-span-3 overflow-y-auto space-y-1 pl-0.5 scrollbar-thin">
          <BTCChart data={btcLive.candles1m as OHLCVData[]} />
          <MarketIntelFeed intel={coinData.marketIntel as any} />
          <StructureLevelsPanel data={coinData.levels as any} />
        </div>
      </div>

      {/* AI DECISION bottom bar */}
      <div
        className="flex-shrink-0 flex items-center gap-4 rounded-xl border-2 px-4 py-2 font-mono"
        style={{ background: biasBg, borderColor: biasBorder, maxHeight: 50 }}
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px]">{aiDecision.bias === "Bullish" ? "\u{1F7E2}" : aiDecision.bias === "Bearish" ? "\u{1F534}" : "\u26AA"}</span>
          <span className="text-sm font-black tracking-wider" style={{ color: biasColor }}>{coinBiasLabel}</span>
          <span className="text-xs font-bold text-[var(--textSubtle)]">({aiDecision.confidence}%)</span>
        </div>
        <BarSep />
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-[var(--textSubtle)]">Entry:</span>
          <span className="text-[11px] font-bold text-[var(--text)]">{entry}–{entryLow}</span>
        </div>
        <BarSep />
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-[var(--textSubtle)]">SL:</span>
          <span className="text-[11px] font-bold text-[#f6465d]">{sl}</span>
        </div>
        <BarSep />
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-[var(--textSubtle)]">TP1:</span>
            <span className="text-[11px] font-bold text-[#2bc48a]">{tp1}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-[var(--textSubtle)]">TP2:</span>
            <span className="text-[11px] font-bold text-[#2bc48a]">{tp2}</span>
          </div>
        </div>
        <BarSep />
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <span className="text-[10px] text-[var(--textSubtle)]">Why:</span>
          <span className="text-[10px] text-[var(--text)] truncate">{aiDecision.confirms[0]}</span>
        </div>
        <BarSep />
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-[10px] text-[var(--textSubtle)]">Invalid:</span>
          <span className="text-[10px] font-bold text-[#f6465d]">&lt;{invalidation}</span>
        </div>
      </div>
    </main>
  );
}

/* ── Quick Stats Mini Panel ── */
const QuickStatsPanel = ({ horizontal, coinData: cd }: { horizontal?: boolean; coinData?: ReturnType<typeof getCoinData> }) => {
  const bias = cd?.aiDecision.bias ?? "Bullish";
  const conf = cd?.aiDecision.confidence ?? 77;
  const mom = cd?.signals.momentumScore ?? 71;
  const biasC = bias === "Bullish" ? "#2bc48a" : bias === "Bearish" ? "#f6465d" : "#8A8F98";
  const stats = [
    { label: "Bias", value: bias, color: biasC },
    { label: "Mom", value: `+${mom}`, color: mom > 60 ? "#2bc48a" : "#F5C542" },
    { label: "Vol", value: conf > 65 ? "High" : "Medium", color: conf > 65 ? "#2bc48a" : "#F5C542" },
    { label: "Flow", value: bias === "Bearish" ? "Sell" : "Buy", color: biasC },
    { label: "Conf", value: `${conf}%`, color: conf > 70 ? "#2bc48a" : "#F5C542" },
    { label: "SPR", value: "0.03", color: "#8A8F98" },
    { label: "\u0394", value: "+142K", color: "#2bc48a" },
    { label: "RNG", value: "$2.32", color: "#8A8F98" },
  ];

  if (horizontal) {
    return (
      <div className="rounded-xl border border-white/[0.04] bg-white/[0.015] px-2.5 py-1.5 flex items-center gap-3">
        <div className="flex items-center gap-1">
          <svg viewBox="0 0 24 24" className="h-3 w-3 text-[#5B8DEF]" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 20V10M12 20V4M6 20v-6" /></svg>
          <span className="text-[10px] font-bold tracking-widest uppercase text-[#5B8DEF]">Stats</span>
        </div>
        {stats.map((s) => (
          <div key={s.label} className="flex items-center gap-1">
            <span className="text-[10px] text-[var(--textSubtle)]">{s.label}</span>
            <span className="text-[10px] font-bold" style={{ color: s.color }}>{s.value}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/[0.04] bg-white/[0.015] p-2.5 space-y-1">
      <div className="flex items-center gap-1.5 px-0.5">
        <svg viewBox="0 0 24 24" className="h-3 w-3 text-[#5B8DEF]" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 20V10M12 20V4M6 20v-6" /></svg>
        <span className="text-[10px] font-bold tracking-widest uppercase text-[#5B8DEF]">Quick Stats</span>
      </div>
      {stats.map((s) => (
        <div key={s.label} className="flex items-center justify-between gap-2 px-1">
          <span className="text-[10px] text-[var(--textSubtle)]">{s.label}</span>
          <span className="rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ color: s.color, background: `${s.color}15` }}>{s.value}</span>
        </div>
      ))}
    </div>
  );
};

/* ── Helpers ── */
const Sep = () => <span className="text-[10px] text-white/[0.08]">|</span>;
const BarSep = () => <span className="text-white/[0.08]">|</span>;
const Pill = ({ l, v, c }: { l: string; v: string; c: string }) => (
  <div className="flex items-center gap-1"><span className="text-[10px] text-[var(--textSubtle)]">{l}:</span><span className="text-[10px] font-bold" style={{ color: c }}>{v}</span></div>
);
