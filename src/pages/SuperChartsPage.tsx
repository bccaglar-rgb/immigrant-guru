import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ColorType,
  createChart,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { SourceChip } from "../components/SourceChip";
import { useMarketData, usePageSourceChip } from "../hooks/useMarketData";
import { useTradeIdeasStream } from "../hooks/useTradeIdeasStream";
import { useAdminConfig } from "../hooks/useAdminConfig";
import { useExchangeTerminalStore } from "../hooks/useExchangeTerminalStore";
import { FallbackApiAdapter, type FallbackLivePayload } from "../data/FallbackApiAdapter";
import type { TradePlan } from "../types";
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

const MiniChart = ({ candles }: { candles: CandlestickData[] }) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  useEffect(() => {
    if (!rootRef.current || chartRef.current) return;
    const chart = createChart(rootRef.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "#10131a" }, textColor: "#8e95a1" },
      grid: { vertLines: { color: "rgba(255,255,255,0.04)" }, horzLines: { color: "rgba(255,255,255,0.04)" } },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.12)" },
      timeScale: { borderColor: "rgba(255,255,255,0.12)", timeVisible: true },
      crosshair: { vertLine: { color: "rgba(255,255,255,0.18)" }, horzLine: { color: "rgba(255,255,255,0.18)" } },
    });
    const series = chart.addCandlestickSeries({
      upColor: "#2cc497",
      downColor: "#f6465d",
      wickUpColor: "#2cc497",
      wickDownColor: "#f6465d",
      borderVisible: false,
    });
    chartRef.current = chart;
    seriesRef.current = series;
    series.setData(candles);
    chart.timeScale().fitContent();
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!seriesRef.current) return;
    seriesRef.current.setData(candles);
    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  return <div ref={rootRef} className="h-[210px] w-full" />;
};

const CoinChartRow = ({
  symbol,
  tf,
  idea,
  favorite,
  onToggleFavorite,
  onTrade,
}: {
  symbol: string;
  tf: Tf;
  idea: TradePlan | null;
  favorite: boolean;
  onToggleFavorite: (symbol: string) => void;
  onTrade: (symbol: string, idea: TradePlan | null) => void;
}) => {
  const rawSymbol = toRaw(symbol);
  const market = useMarketData({
    symbol: rawSymbol,
    interval: mapTfForApi(tf),
    lookback: 280,
    publicSourceOverride: "FALLBACK_API",
    overrideKey: `super-charts-${rawSymbol}`,
  });
  const [direct, setDirect] = useState<FallbackLivePayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    const run = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const byFallback = await FallbackApiAdapter.fetchLive({
          symbol: rawSymbol,
          interval: mapTfForApi(tf),
          lookback: 280,
          exchangeHint: "BINANCE",
          sourceMode: "fallback",
        });
        if (!cancelled && (byFallback.ohlcv?.length ?? 0) > 0) {
          setDirect(byFallback);
          inFlight = false;
          return;
        }
      } catch {
        // try binance direct below
      }
      try {
        const byBinance = await FallbackApiAdapter.fetchLive({
          symbol: rawSymbol,
          interval: mapTfForApi(tf),
          lookback: 280,
          exchangeHint: "BINANCE",
          sourceMode: "exchange",
        });
        if (!cancelled && (byBinance.ohlcv?.length ?? 0) > 0) setDirect(byBinance);
      } catch {
        // keep previous
      } finally {
        inFlight = false;
      }
    };
    void run();
    const timer = window.setInterval(() => void run(), 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [rawSymbol, tf]);

  const candles = useMemo<CandlestickData[]>(() => {
    const rows = market.candles ?? direct?.ohlcv ?? [];
    return rows.map((c) => ({
      time: c.time as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
  }, [direct?.ohlcv, market.candles]);

  const price =
    market.ticker?.price ??
    direct?.orderbook?.midPrice ??
    direct?.ohlcv?.[direct.ohlcv.length - 1]?.close ??
    0;
  const change = market.ticker?.change24hPct ?? 0;
  const volume = market.ticker?.volume24h ?? 0;
  const funding = (market.derivatives?.fundingRate ?? direct?.derivatives?.fundingRate ?? 0) * 100;
  const oi = market.derivatives?.oiValue ?? direct?.derivatives?.oiValue ?? 0;

  return (
    <article className="rounded-xl border border-white/10 bg-[#11131a] p-2.5">
      <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onToggleFavorite(symbol)}
                className={`rounded border px-1.5 py-0.5 text-[11px] ${favorite ? "border-[#7a6840] bg-[#2a2418] text-[#F5C542]" : "border-white/15 bg-[#0F1012] text-[#8A8F98]"}`}
                title="Toggle favorite"
              >
                {favorite ? "★" : "☆"}
              </button>
              <span className="text-sm font-semibold text-white">{symbol}</span>
              <span className="rounded border border-white/10 bg-[#0F1012] px-1.5 py-0.5 text-[10px] text-[#8A8F98]">{tf}</span>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-white">{fmt(price, price > 100 ? 2 : 5)}</p>
              <p className={`text-xs ${change >= 0 ? "text-[#2cc497]" : "text-[#f6465d]"}`}>{pct(change)}</p>
            </div>
          </div>
          {candles.length ? (
            <MiniChart candles={candles} />
          ) : (
            <div className="grid h-[210px] place-items-center rounded-lg border border-white/10 bg-[#0F1012] text-xs text-[#6B6F76]">
              No chart data
            </div>
          )}
        </div>

        <div className="rounded-lg border border-white/10 bg-[#0F1012] p-2">
          <div className="mb-1 grid grid-cols-2 gap-1 text-[11px]">
            <div className="rounded border border-white/10 bg-[#11141a] px-2 py-1">
              <p className="text-[10px] uppercase tracking-wide text-[#6B6F76]">Volume</p>
              <p className="text-[#BFC2C7]">{Math.round(volume).toLocaleString()}</p>
            </div>
            <div className="rounded border border-white/10 bg-[#11141a] px-2 py-1">
              <p className="text-[10px] uppercase tracking-wide text-[#6B6F76]">Open Interest</p>
              <p className="text-[#BFC2C7]">{Math.round(oi).toLocaleString()}</p>
            </div>
            <div className="rounded border border-white/10 bg-[#11141a] px-2 py-1">
              <p className="text-[10px] uppercase tracking-wide text-[#6B6F76]">Funding</p>
              <p className={funding >= 0 ? "text-[#2cc497]" : "text-[#f6465d]"}>{funding.toFixed(4)}%</p>
            </div>
            <div className="rounded border border-white/10 bg-[#11141a] px-2 py-1">
              <p className="text-[10px] uppercase tracking-wide text-[#6B6F76]">Idea</p>
              <p className={idea ? "text-[#F5C542]" : "text-[#6B6F76]"}>{idea ? `${Math.round(idea.confidence * 100)}%` : "None"}</p>
            </div>
          </div>

          {idea ? (
            <div className="space-y-1.5 rounded border border-[#7a6840]/50 bg-[#15140f] p-2 text-[11px]">
              <p className="line-clamp-1 font-semibold text-[#F5C542]">{idea.setup}</p>
              <div className="grid grid-cols-2 gap-1">
                <span className="rounded border border-[#7a6840]/70 bg-[#2a2418] px-1.5 py-0.5 text-[#e7d9b3]">
                  Entry {fmt(idea.entry.low)} - {fmt(idea.entry.high)}
                </span>
                <span className="rounded border border-[#6f765f]/70 bg-[#1f251b] px-1.5 py-0.5 text-[#d8decf]">
                  TP {fmt(idea.targets[0]?.price)} / {fmt(idea.targets[1]?.price)}
                </span>
                <span className="rounded border border-[#704844]/70 bg-[#271a19] px-1.5 py-0.5 text-[#d6b3af]">
                  SL {fmt(idea.stops[0]?.price)} / {fmt(idea.stops[1]?.price)}
                </span>
                <span className="rounded border border-white/15 bg-[#11141a] px-1.5 py-0.5 text-[#BFC2C7]">
                  {idea.direction} · {idea.tradeValidity}
                </span>
              </div>
            </div>
          ) : (
            <div className="rounded border border-white/10 bg-[#11141a] p-2 text-[11px] text-[#6B6F76]">
              No active trade idea for this coin.
            </div>
          )}

          <button
            type="button"
            onClick={() => onTrade(symbol, idea)}
            className="mt-2 w-full rounded border border-[#7a6840] bg-[#2a2418] px-2 py-1.5 text-xs font-semibold text-[#F5C542] hover:bg-[#332b1e]"
          >
            Trade
          </button>
        </div>
      </div>
    </article>
  );
};

export default function SuperChartsPage() {
  const navigate = useNavigate();
  const source = usePageSourceChip();
  const { config } = useAdminConfig();
  const { messages } = useTradeIdeasStream(config.tradeIdeas.minConfidence, "Bitrium Labs");
  const setSelectedSymbol = useExchangeTerminalStore((state) => state.setSelectedSymbol);
  const setActiveSignal = useExchangeTerminalStore((state) => state.setActiveSignal);

  const [group, setGroup] = useState<GroupKey>("TOP10");
  const [timeframe, setTimeframe] = useState<Tf>("1h");
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FAVORITE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) setFavorites(parsed.filter((s) => typeof s === "string").slice(0, 10));
    } catch {
      // noop
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(FAVORITE_KEY, JSON.stringify(favorites.slice(0, 10)));
    } catch {
      // noop
    }
  }, [favorites]);

  const rows = useMemo(() => {
    const list = group === "FAVORITE" ? favorites : GROUPS[group];
    if (list.length >= 10) return list.slice(0, 10);
    const filler = GROUPS.TOP10.filter((s) => !list.includes(s));
    return [...list, ...filler].slice(0, 10);
  }, [favorites, group]);

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

  return (
    <main className="min-h-screen bg-[#0B0B0C] p-3 text-[#BFC2C7] md:p-4">
      <div className="mx-auto max-w-[1680px] space-y-3">
        <header className="rounded-xl border border-white/10 bg-[#11131a] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h1 className="text-lg font-semibold text-white">Super Charts</h1>
              <p className="text-xs text-[#6B6F76]">10-chart stack with coin-level trade context and fast trade routing.</p>
            </div>
            <SourceChip sourceName={source.sourceName} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {(Object.keys(GROUP_LABELS) as GroupKey[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setGroup(k)}
                className={`rounded border px-2.5 py-1 text-xs ${group === k ? "border-[#7a6840] bg-[#2a2418] text-[#F5C542]" : "border-white/15 bg-[#0F1012] text-[#BFC2C7]"}`}
              >
                {GROUP_LABELS[k]}
              </button>
            ))}
            <span className="mx-1 h-4 w-px bg-white/10" />
            {TF_BUTTONS.map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                className={`rounded px-2 py-1 text-xs ${tf === timeframe ? "bg-[#1d2130] text-white" : "text-[#8e95a1]"}`}
              >
                {tf}
              </button>
            ))}
          </div>
        </header>

        <section className="space-y-2">
          {rows.map((symbol) => (
            <CoinChartRow
              key={`${symbol}-${group}`}
              symbol={symbol}
              tf={timeframe}
              idea={latestIdeaBySymbol.get(symbol) ?? null}
              favorite={favorites.includes(symbol)}
              onToggleFavorite={toggleFavorite}
              onTrade={openTrade}
            />
          ))}
        </section>
      </div>
    </main>
  );
}
