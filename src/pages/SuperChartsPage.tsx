import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { CandlestickData, HistogramData, UTCTimestamp } from "lightweight-charts";
import { useMarketData } from "../hooks/useMarketData";
import { useTradeIdeasStream } from "../hooks/useTradeIdeasStream";
import { useAdminConfig } from "../hooks/useAdminConfig";
import { useExchangeTerminalStore } from "../hooks/useExchangeTerminalStore";
import { useIndicatorsStore } from "../hooks/useIndicatorsStore";
import { FallbackApiAdapter, type FallbackLivePayload } from "../data/FallbackApiAdapter";
import { ChartMetricsPanel } from "../components/ChartMetricsPanel";
import { MiniChartEnhanced } from "../components/supercharts/MiniChartEnhanced";
import { CoinSelectorMini } from "../components/supercharts/CoinSelectorMini";
import { IndicatorsDropdown } from "../components/exchange/IndicatorsDropdown";
import { TILE_DEFINITIONS } from "../data/tileDefinitions";
import type { TileState, TradePlan } from "../types";
import type { ExchangeTradeSignal } from "../types/exchange";

type GroupKey = "TOP10" | "MEME" | "AI" | "FAVORITE";
type Tf = "1m" | "5m" | "15m" | "1h" | "4h" | "1d" | "1w";

const GROUP_LABELS: Record<GroupKey, string> = {
  TOP10: "Top 10 Coins",
  MEME: "Meme Coins",
  AI: "AI Coins",
  FAVORITE: "Favorite",
};

const GROUPS: Record<Exclude<GroupKey, "FAVORITE">, string[]> = {
  TOP10: ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT", "ADA/USDT", "DOGE/USDT", "AVAX/USDT", "LINK/USDT", "TRX/USDT"],
  MEME: ["DOGE/USDT", "SHIB/USDT", "PEPE/USDT", "WIF/USDT", "FLOKI/USDT", "BONK/USDT", "BOME/USDT", "MEME/USDT", "TURBO/USDT", "MOG/USDT"],
  AI: ["FET/USDT", "AGIX/USDT", "OCEAN/USDT", "RNDR/USDT", "TAO/USDT", "WLD/USDT", "ARKM/USDT", "NMR/USDT", "GRT/USDT", "AI16Z/USDT"],
};

const TF_BUTTONS: Tf[] = ["1m", "5m", "15m", "1h", "4h", "1d", "1w"];
const FAVORITE_KEY = "super-charts-favorites-v1";

const toRaw = (symbol: string) => symbol.replace("/", "");
const mapTfForApi = (tf: Tf): "1m" | "5m" | "15m" | "1h" | "4h" | "1d" | "1w" => tf;

const toSignal = (plan: TradePlan): ExchangeTradeSignal => ({
  direction: plan.direction,
  horizon: plan.horizon,
  confidence: plan.confidence,
  tradeValidity: plan.tradeValidity,
  entryWindow: plan.entryWindow,
  slippageRisk: plan.slippageRisk,
  timeframe: plan.timeframe,
  validBars: plan.validUntilBars,
  timestampUtc: plan.timestampUtc,
  validUntilUtc: plan.validUntilUtc,
  setup: plan.setup,
  entryLow: plan.entry.low,
  entryHigh: plan.entry.high,
  stops: [plan.stops[0]?.price ?? plan.entry.low, plan.stops[1]?.price ?? plan.stops[0]?.price ?? plan.entry.low],
  targets: [plan.targets[0]?.price ?? plan.entry.high, plan.targets[1]?.price ?? plan.targets[0]?.price ?? plan.entry.high],
});

const fmt = (v?: number | null, d = 2) => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(d) : "-");
const pct = (v?: number | null) => (typeof v === "number" && Number.isFinite(v) ? `${v >= 0 ? "+" : ""}${v.toFixed(2)}%` : "-");
const fmtCompact = (v: number) => {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return Math.round(v).toLocaleString();
};

/* ── Per-slot override types ── */
interface SlotOverride { tf?: Tf; symbol?: string }
interface SnapshotData { tiles: TileState[]; layerScores?: Record<string, number> }

/* ── CoinChartRow ── */

interface CoinChartRowProps {
  symbol: string;
  tf: Tf;
  index: number;
  idea: TradePlan | null;
  favorite: boolean;
  indicatorsState: ReturnType<typeof useIndicatorsStore>["state"];
  indicatorsEnabledCount: number;
  indSetMaster: (e: boolean) => void;
  indSetGroup: (...a: Parameters<ReturnType<typeof useIndicatorsStore>["setGroup"]>) => void;
  indSetEnabled: (...a: Parameters<ReturnType<typeof useIndicatorsStore>["setIndicatorEnabled"]>) => void;
  indSetSetting: (...a: Parameters<ReturnType<typeof useIndicatorsStore>["setIndicatorSetting"]>) => void;
  indReset: (...a: Parameters<ReturnType<typeof useIndicatorsStore>["resetIndicator"]>) => void;
  onToggleFavorite: (symbol: string) => void;
  onTrade: (symbol: string, idea: TradePlan | null) => void;
  onTfChange: (index: number, tf: Tf) => void;
  onSymbolChange: (index: number, symbol: string) => void;
}

const CoinChartRow = ({
  symbol, tf, index, idea, favorite,
  indicatorsState, indicatorsEnabledCount,
  indSetMaster, indSetGroup, indSetEnabled, indSetSetting, indReset,
  onToggleFavorite, onTrade, onTfChange, onSymbolChange,
}: CoinChartRowProps) => {
  const rawSymbol = toRaw(symbol);
  const market = useMarketData({
    symbol: rawSymbol,
    interval: mapTfForApi(tf),
    lookback: 280,
    publicSourceOverride: "FALLBACK_API",
    overrideKey: `super-charts-${rawSymbol}-${tf}`,
  });
  const [direct, setDirect] = useState<FallbackLivePayload | null>(null);

  /* ── Metrics Panel state ── */
  const [panelOpen, setPanelOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<SnapshotData | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const snapshotAbortRef = useRef<AbortController | null>(null);

  const fetchSnapshot = useCallback(async () => {
    snapshotAbortRef.current?.abort();
    const ac = new AbortController();
    snapshotAbortRef.current = ac;
    setSnapshotLoading(true);
    setSnapshotError(null);
    try {
      const apiKey = (() => {
        try { return window.localStorage.getItem("market-data-api-key") || "4f8430d3a7a14b44a16bd10f3a4dd61d"; }
        catch { return "4f8430d3a7a14b44a16bd10f3a4dd61d"; }
      })();
      const qs = new URLSearchParams({
        symbol: rawSymbol, timeframe: tf, horizon: "INTRADAY",
        exchange: "Binance", apiKey, source: "fallback",
        scoring_mode: "BALANCED", include_snapshot: "1",
      });
      const res = await fetch(`/api/market/trade-idea?${qs.toString()}`, { signal: ac.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      if (ac.signal.aborted) return;
      const tiles: TileState[] = (body.snapshot_tiles ?? []).map((t: any) => {
        const def = TILE_DEFINITIONS[t.key];
        return {
          key: t.key,
          label: def?.label ?? t.key.replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
          category: def?.category ?? ("Price Structure" as const),
          state: t.state, value: t.value, unit: def?.unit, rawValue: t.rawValue,
          confidence: 0, updatedAt: new Date().toISOString(), advanced: false,
          dependsOnFeeds: def?.dependsOnFeeds ?? [],
        };
      });
      setSnapshot({ tiles, layerScores: body.ai_panel?.layerScores ?? undefined });
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      setSnapshotError(err?.message ?? "Failed");
    } finally {
      if (!ac.signal.aborted) setSnapshotLoading(false);
    }
  }, [rawSymbol, tf]);

  useEffect(() => {
    if (!panelOpen) return;
    void fetchSnapshot();
    const timer = window.setInterval(() => void fetchSnapshot(), 30_000);
    return () => { window.clearInterval(timer); snapshotAbortRef.current?.abort(); };
  }, [panelOpen, fetchSnapshot]);

  /* Live data fetch */
  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    const run = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const byFallback = await FallbackApiAdapter.fetchLive({ symbol: rawSymbol, interval: mapTfForApi(tf), lookback: 280, exchangeHint: "BINANCE", sourceMode: "fallback" });
        if (!cancelled && (byFallback.ohlcv?.length ?? 0) > 0) { setDirect(byFallback); inFlight = false; return; }
      } catch { /* fallback failed */ }
      try {
        const byBinance = await FallbackApiAdapter.fetchLive({ symbol: rawSymbol, interval: mapTfForApi(tf), lookback: 280, exchangeHint: "BINANCE", sourceMode: "exchange" });
        if (!cancelled && (byBinance.ohlcv?.length ?? 0) > 0) setDirect(byBinance);
      } catch { /* keep previous */ } finally { inFlight = false; }
    };
    void run();
    const timer = window.setInterval(() => void run(), 2500);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [rawSymbol, tf]);

  /* Candle + volume data */
  const ohlcvRows = useMemo(() => market.candles ?? direct?.ohlcv ?? [], [direct?.ohlcv, market.candles]);

  const candles = useMemo<CandlestickData[]>(() =>
    ohlcvRows.map((c) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close })),
  [ohlcvRows]);

  const volumeData = useMemo<HistogramData[]>(() =>
    ohlcvRows.map((c) => ({
      time: c.time as UTCTimestamp,
      value: c.volume,
      color: c.close >= c.open ? "rgba(44,196,151,0.25)" : "rgba(246,70,93,0.25)",
    })),
  [ohlcvRows]);

  const ohlcvForIndicators = useMemo(() =>
    ohlcvRows.map((c) => ({ time: Number(c.time), close: c.close, volume: c.volume })),
  [ohlcvRows]);

  const price = market.ticker?.price ?? direct?.orderbook?.midPrice ?? direct?.ohlcv?.[direct.ohlcv.length - 1]?.close ?? 0;
  const change = market.ticker?.change24hPct ?? 0;
  const volume = market.ticker?.volume24h ?? 0;
  const funding = (market.derivatives?.fundingRate ?? direct?.derivatives?.fundingRate ?? 0) * 100;
  const oi = market.derivatives?.oiValue ?? direct?.derivatives?.oiValue ?? 0;

  return (
    <article className="rounded-xl border border-white/[0.06] bg-[#11131a] p-2.5">
      <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_220px]">
        {/* ── Left: Chart area ── */}
        <div className="min-w-0">
          {/* Chart header: fav, coin selector, TF buttons, indicators, price */}
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onToggleFavorite(symbol)}
                className={`rounded border px-1 py-0.5 text-[10px] ${favorite ? "border-[#7a6840] bg-[#2a2418] text-[#F5C542]" : "border-white/10 bg-[#0F1012] text-[#8A8F98]"}`}
                title="Toggle favorite"
              >
                {favorite ? "\u2605" : "\u2606"}
              </button>
              <CoinSelectorMini currentSymbol={symbol} onSelect={(s) => onSymbolChange(index, s)} />
              <div className="flex items-center gap-0.5">
                {TF_BUTTONS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => onTfChange(index, t)}
                    className={`rounded px-1.5 py-0.5 text-[10px] ${t === tf ? "bg-[#1d2130] text-white" : "text-[#6B6F76] hover:text-[#9CA3AF]"}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <IndicatorsDropdown
                state={indicatorsState}
                enabledCount={indicatorsEnabledCount}
                setMaster={indSetMaster}
                setGroup={indSetGroup}
                setIndicatorEnabled={indSetEnabled}
                setIndicatorSetting={indSetSetting}
                resetIndicator={indReset}
              />
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-semibold text-white">{fmt(price, price > 100 ? 2 : 5)}</p>
              <p className={`text-[10px] ${change >= 0 ? "text-[#2cc497]" : "text-[#f6465d]"}`}>{pct(change)}</p>
            </div>
          </div>

          {/* Chart with floating badges */}
          <div className="relative">
            {candles.length ? (
              <MiniChartEnhanced
                candles={candles}
                volumeData={volumeData}
                ohlcvRows={ohlcvForIndicators}
                indicatorsState={indicatorsState}
              />
            ) : (
              <div className="grid h-[280px] place-items-center rounded-lg border border-white/[0.04] bg-[#0F1012] text-xs text-[#555]">
                No chart data
              </div>
            )}
            {/* Floating metric badges */}
            <div className="absolute top-1.5 right-1.5 z-10 flex flex-col gap-0.5 pointer-events-none">
              <div className="rounded bg-[#0F1012]/75 backdrop-blur-sm px-1.5 py-0.5 text-[9px]">
                <span className="text-[#555]">Vol </span>
                <span className="text-[#9CA3AF]">{fmtCompact(volume)}</span>
              </div>
              <div className="rounded bg-[#0F1012]/75 backdrop-blur-sm px-1.5 py-0.5 text-[9px]">
                <span className="text-[#555]">OI </span>
                <span className="text-[#9CA3AF]">{fmtCompact(oi)}</span>
              </div>
              <div className="rounded bg-[#0F1012]/75 backdrop-blur-sm px-1.5 py-0.5 text-[9px]">
                <span className="text-[#555]">Fund </span>
                <span className={funding >= 0 ? "text-[#2cc497]" : "text-[#f6465d]"}>{funding.toFixed(4)}%</span>
              </div>
              {idea && (
                <div className="rounded bg-[#0F1012]/75 backdrop-blur-sm px-1.5 py-0.5 text-[9px]">
                  <span className="text-[#555]">Idea </span>
                  <span className="text-[#F5C542]">{Math.round(idea.confidence * 100)}%</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Right: Idea + Trade Controls ── */}
        <div className="rounded-lg border border-white/[0.04] bg-[#0F1012] p-2 flex flex-col gap-2">
          {idea ? (
            <div className="space-y-1.5 rounded border border-[#7a6840]/40 bg-[#15140f] p-2 text-[11px]">
              <p className="line-clamp-1 font-semibold text-[#F5C542]">{idea.setup}</p>
              <div className="grid grid-cols-2 gap-1">
                <span className="rounded border border-[#7a6840]/50 bg-[#2a2418] px-1.5 py-0.5 text-[10px] text-[#e7d9b3]">
                  Entry {fmt(idea.entry.low)} - {fmt(idea.entry.high)}
                </span>
                <span className="rounded border border-[#6f765f]/50 bg-[#1f251b] px-1.5 py-0.5 text-[10px] text-[#d8decf]">
                  TP {fmt(idea.targets[0]?.price)} / {fmt(idea.targets[1]?.price)}
                </span>
                <span className="rounded border border-[#704844]/50 bg-[#271a19] px-1.5 py-0.5 text-[10px] text-[#d6b3af]">
                  SL {fmt(idea.stops[0]?.price)} / {fmt(idea.stops[1]?.price)}
                </span>
                <span className="rounded border border-white/[0.06] bg-[#11141a] px-1.5 py-0.5 text-[10px] text-[#BFC2C7]">
                  {idea.direction} · {idea.tradeValidity}
                </span>
              </div>
            </div>
          ) : (
            <div className="rounded border border-white/[0.04] bg-[#11141a] p-2 text-[10px] text-[#555]">
              No active trade idea for this coin.
            </div>
          )}

          {/* ── Quick Trade Controls ── */}
          <div className="space-y-1.5">
            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <label className="block text-[9px] uppercase tracking-wider text-[#555] mb-0.5">Margin</label>
                <input
                  type="number"
                  defaultValue={10}
                  min={1}
                  className="w-full rounded border border-white/10 bg-[#11141a] px-2 py-1 text-[11px] text-white outline-none focus:border-[#F5C542]/40"
                  placeholder="10"
                />
              </div>
              <div>
                <label className="block text-[9px] uppercase tracking-wider text-[#555] mb-0.5">Leverage</label>
                <input
                  type="number"
                  defaultValue={5}
                  min={1}
                  max={125}
                  className="w-full rounded border border-white/10 bg-[#11141a] px-2 py-1 text-[11px] text-white outline-none focus:border-[#F5C542]/40"
                  placeholder="5x"
                />
              </div>
            </div>
            <div>
              <label className="block text-[9px] uppercase tracking-wider text-[#555] mb-0.5">Entry Price</label>
              <input
                type="number"
                defaultValue={idea ? Number(((idea.entry.low + idea.entry.high) / 2).toFixed(5)) : undefined}
                step="any"
                className="w-full rounded border border-white/10 bg-[#11141a] px-2 py-1 text-[11px] text-white outline-none focus:border-[#F5C542]/40"
                placeholder={price ? fmt(price, price > 100 ? 2 : 5) : "Market"}
              />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => onTrade(symbol, idea)}
                className="rounded bg-[#1c3028] border border-[#2bc48a]/30 px-2 py-1.5 text-[11px] font-semibold text-[#2bc48a] hover:bg-[#1c3028]/80 transition"
              >
                Open Long
              </button>
              <button
                type="button"
                onClick={() => onTrade(symbol, idea)}
                className="rounded bg-[#2d1a1a] border border-[#f6465d]/30 px-2 py-1.5 text-[11px] font-semibold text-[#f6465d] hover:bg-[#2d1a1a]/80 transition"
              >
                Open Short
              </button>
            </div>
          </div>

          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => onTrade(symbol, idea)}
              className="flex-1 rounded border border-[#7a6840] bg-[#2a2418] px-2 py-1.5 text-xs font-semibold text-[#F5C542] hover:bg-[#332b1e]"
            >
              Trade
            </button>
            <button
              type="button"
              onClick={() => setPanelOpen((prev) => !prev)}
              className={`rounded border px-2 py-1.5 text-[10px] font-semibold transition ${
                panelOpen
                  ? "border-[#5e7d9a] bg-[#18222d] text-[#c8d8e9]"
                  : "border-white/10 bg-[#0F1012] text-[#6B6F76] hover:border-white/20"
              }`}
              title={panelOpen ? "Hide Metrics" : "Show Metrics"}
            >
              {panelOpen ? "\u25B2" : "\u25BC"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Metrics Panel ── */}
      {panelOpen && (
        <ChartMetricsPanel
          tiles={snapshot?.tiles ?? []}
          layerScores={snapshot?.layerScores}
          loading={snapshotLoading}
          error={snapshotError}
        />
      )}
    </article>
  );
};

/* ── Page ── */

export default function SuperChartsPage() {
  const navigate = useNavigate();
  const { config } = useAdminConfig();
  const { messages } = useTradeIdeasStream(config.tradeIdeas.minConfidence, "Bitrium Labs");
  const setSelectedSymbol = useExchangeTerminalStore((state) => state.setSelectedSymbol);
  const setActiveSignal = useExchangeTerminalStore((state) => state.setActiveSignal);

  /* Shared indicators state */
  const {
    state: indicatorsState,
    enabledCount: indicatorsEnabledCount,
    setMaster: indSetMaster,
    setGroup: indSetGroup,
    setIndicatorEnabled: indSetEnabled,
    setIndicatorSetting: indSetSetting,
    resetIndicator: indReset,
  } = useIndicatorsStore();

  const [group, setGroup] = useState<GroupKey>("TOP10");
  const [timeframe, setTimeframe] = useState<Tf>("1h");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [slotOverrides, setSlotOverrides] = useState<Record<number, SlotOverride>>({});

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FAVORITE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) setFavorites(parsed.filter((s) => typeof s === "string").slice(0, 10));
    } catch { /* noop */ }
  }, []);

  useEffect(() => {
    try { window.localStorage.setItem(FAVORITE_KEY, JSON.stringify(favorites.slice(0, 10))); } catch { /* noop */ }
  }, [favorites]);

  /* Base rows from group */
  const baseRows = useMemo(() => {
    const list = group === "FAVORITE" ? favorites : GROUPS[group];
    if (list.length >= 10) return list.slice(0, 10);
    const filler = GROUPS.TOP10.filter((s) => !list.includes(s));
    return [...list, ...filler].slice(0, 10);
  }, [favorites, group]);

  /* Effective rows with per-slot overrides */
  const effectiveRows = useMemo(() =>
    baseRows.map((defaultSymbol, index) => ({
      symbol: slotOverrides[index]?.symbol ?? defaultSymbol,
      tf: slotOverrides[index]?.tf ?? timeframe,
      index,
    })),
  [baseRows, timeframe, slotOverrides]);

  const latestIdeaBySymbol = useMemo(() => {
    const map = new Map<string, TradePlan>();
    for (const m of messages) {
      const ui = m.symbol.toUpperCase().endsWith("USDT")
        ? `${m.symbol.toUpperCase().replace("/", "").replace("-", "").replace("_", "").slice(0, -4)}/USDT`
        : m.symbol.toUpperCase();
      if (!map.has(ui)) map.set(ui, m);
    }
    return map;
  }, [messages]);

  const toggleFavorite = (symbol: string) => {
    setFavorites((prev) => {
      if (prev.includes(symbol)) return prev.filter((s) => s !== symbol);
      return [symbol, ...prev].slice(0, 10);
    });
  };

  const openTrade = (symbol: string, idea: TradePlan | null) => {
    setSelectedSymbol(symbol);
    if (idea) setActiveSignal(toSignal(idea));
    navigate("/exchange-terminal");
  };

  const handleGroupChange = (g: GroupKey) => {
    setGroup(g);
    // Clear symbol overrides on group change, keep TF overrides
    setSlotOverrides((prev) => {
      const next: Record<number, SlotOverride> = {};
      for (const [k, v] of Object.entries(prev)) {
        if (v.tf) next[Number(k)] = { tf: v.tf };
      }
      return next;
    });
  };

  const handleGlobalTf = (tf: Tf) => {
    setTimeframe(tf);
    // Clear all per-chart TF overrides
    setSlotOverrides((prev) => {
      const next: Record<number, SlotOverride> = {};
      for (const [k, v] of Object.entries(prev)) {
        if (v.symbol) next[Number(k)] = { symbol: v.symbol };
      }
      return next;
    });
  };

  const handleSlotTf = (index: number, tf: Tf) => {
    setSlotOverrides((prev) => ({ ...prev, [index]: { ...prev[index], tf } }));
  };

  const handleSlotSymbol = (index: number, symbol: string) => {
    setSlotOverrides((prev) => ({ ...prev, [index]: { ...prev[index], symbol } }));
  };

  return (
    <main className="min-h-screen bg-[#0B0B0C] p-3 text-[#BFC2C7] md:p-4">
      <div className="mx-auto max-w-[1680px] space-y-3">
        <header className="rounded-xl border border-white/[0.06] bg-[#11131a] p-3">
          <div>
            <h1 className="text-lg font-semibold text-white">Super Charts</h1>
            <p className="text-xs text-[#555]">10-chart stack with coin-level trade context and fast trade routing.</p>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {(Object.keys(GROUP_LABELS) as GroupKey[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => handleGroupChange(k)}
                className={`rounded border px-2.5 py-1 text-xs ${group === k ? "border-[#7a6840] bg-[#2a2418] text-[#F5C542]" : "border-white/10 bg-[#0F1012] text-[#BFC2C7]"}`}
              >
                {GROUP_LABELS[k]}
              </button>
            ))}
            <span className="mx-1 h-4 w-px bg-white/10" />
            {TF_BUTTONS.map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => handleGlobalTf(tf)}
                className={`rounded px-2 py-1 text-xs ${tf === timeframe ? "bg-[#1d2130] text-white" : "text-[#8e95a1]"}`}
                title="Apply to all charts"
              >
                {tf}
              </button>
            ))}
            <span className="mx-1 h-4 w-px bg-white/10" />
            <IndicatorsDropdown
              state={indicatorsState}
              enabledCount={indicatorsEnabledCount}
              setMaster={indSetMaster}
              setGroup={indSetGroup}
              setIndicatorEnabled={indSetEnabled}
              setIndicatorSetting={indSetSetting}
              resetIndicator={indReset}
            />
          </div>
        </header>

        <section className="space-y-2">
          {effectiveRows.map((row) => (
            <CoinChartRow
              key={`${row.index}-${row.symbol}-${group}`}
              symbol={row.symbol}
              tf={row.tf}
              index={row.index}
              idea={latestIdeaBySymbol.get(row.symbol) ?? null}
              favorite={favorites.includes(row.symbol)}
              indicatorsState={indicatorsState}
              indicatorsEnabledCount={indicatorsEnabledCount}
              indSetMaster={indSetMaster}
              indSetGroup={indSetGroup}
              indSetEnabled={indSetEnabled}
              indSetSetting={indSetSetting}
              indReset={indReset}
              onToggleFavorite={toggleFavorite}
              onTrade={openTrade}
              onTfChange={handleSlotTf}
              onSymbolChange={handleSlotSymbol}
            />
          ))}
        </section>
      </div>
    </main>
  );
}
