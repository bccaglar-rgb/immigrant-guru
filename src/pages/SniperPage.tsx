import { useCallback, useEffect, useRef, useState } from "react";
import { TileCard } from "../components/TileCard";
import { TILE_DEFINITIONS } from "../data/tileDefinitions";
import type { TileState, FeedConfig } from "../types";
import { getAuthToken } from "../services/authClient";

/* ── Types ── */

interface CoinSignal {
  symbol: string;
  price: number;
  change24hPct: number;
  compositeScore: number;
  regime: string;
  tiles: TileState[];
  layerScores: Record<string, number>;
  loading: boolean;
  error: string | null;
}

/* ── Helpers ── */

const authHeaders = (): Record<string, string> => {
  const token = getAuthToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

const EMPTY_FEEDS: FeedConfig = {} as FeedConfig;

const scoreColor = (s: number) =>
  s >= 70 ? "text-emerald-400" : s >= 50 ? "text-[#F5C542]" : s >= 30 ? "text-orange-400" : "text-red-400";

const scoreBg = (s: number) =>
  s >= 70 ? "bg-emerald-500/10 border-emerald-500/30" : s >= 50 ? "bg-[#F5C542]/10 border-[#F5C542]/30" : s >= 30 ? "bg-orange-500/10 border-orange-500/30" : "bg-red-500/10 border-red-500/30";

const regimeColor = (r: string) =>
  r === "TREND" ? "text-emerald-400 bg-emerald-500/10" : r === "BREAKOUT" ? "text-[#F5C542] bg-[#F5C542]/10" : "text-zinc-400 bg-white/5";

/* ── Constants ── */

const POLL_INTERVAL = 30_000;
const MAX_COINS = 20;

/* ── Page ── */

export default function SniperPage() {
  const [coins, setCoins] = useState<CoinSignal[]>([]);
  const [live, setLive] = useState(true);
  const [loading, setLoading] = useState(false);
  const [expandedCoin, setExpandedCoin] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  const fetchCoins = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/coin-universe/snapshot", { headers: authHeaders() });
      const body = await res.json().catch(() => null);
      const activeCoins = (body?.activeCoins ?? [])
        .filter((c: any) => c.status !== "REJECTED")
        .sort((a: any, b: any) => (b.compositeScore ?? 0) - (a.compositeScore ?? 0))
        .slice(0, MAX_COINS);

      const signals: CoinSignal[] = activeCoins.map((c: any) => ({
        symbol: c.symbol,
        price: c.price ?? 0,
        change24hPct: c.change24hPct ?? 0,
        compositeScore: c.compositeScore ?? 0,
        regime: c.regime ?? "RANGE",
        tiles: [],
        layerScores: {},
        loading: true,
        error: null,
      }));

      setCoins(signals);

      // Fetch sniper tiles for each coin in parallel (batched)
      const results = await Promise.allSettled(
        activeCoins.map(async (c: any) => {
          const rawSymbol = c.symbol.replace("/", "").toUpperCase();
          const apiKey = (() => {
            try { return window.localStorage.getItem("market-data-api-key") || "4f8430d3a7a14b44a16bd10f3a4dd61d"; }
            catch { return "4f8430d3a7a14b44a16bd10f3a4dd61d"; }
          })();
          const qs = new URLSearchParams({
            symbol: rawSymbol, timeframe: "15m", horizon: "INTRADAY",
            exchange: "Binance", apiKey, source: "fallback",
            scoring_mode: "BALANCED", include_snapshot: "1",
          });
          const r = await fetch(`/api/market/trade-idea?${qs.toString()}`, { headers: authHeaders() });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const b = await r.json();
          const parsed: TileState[] = (b.snapshot_tiles ?? []).map((t: any) => {
            const def = (TILE_DEFINITIONS as Record<string, any>)[t.key];
            return {
              key: t.key,
              label: def?.label ?? t.key.replace(/-/g, " ").replace(/\b\w/g, (ch: string) => ch.toUpperCase()),
              category: def?.category ?? "Price Structure",
              state: t.state, value: t.value, unit: def?.unit, rawValue: t.rawValue,
              confidence: 0, updatedAt: new Date().toISOString(), advanced: false,
              dependsOnFeeds: def?.dependsOnFeeds ?? [],
            };
          });
          return { symbol: c.symbol, tiles: parsed, layerScores: b.ai_panel?.layerScores ?? {} };
        })
      );

      setCoins(prev => prev.map((coin, i) => {
        const r = results[i];
        if (r.status === "fulfilled") {
          return { ...coin, tiles: r.value.tiles, layerScores: r.value.layerScores, loading: false };
        }
        return { ...coin, loading: false, error: "Failed to load signals" };
      }));
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!live) {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      return;
    }
    fetchCoins();
    timerRef.current = window.setInterval(fetchCoins, POLL_INTERVAL);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [live, fetchCoins]);

  return (
    <main className="min-h-screen bg-[#0B0B0C] p-4 text-[#BFC2C7] md:p-6">
      <div className="mx-auto max-w-[1560px]">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-white">Sniper</h1>
            <span className="rounded-md bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-[#f6465d]">
              Signal Scanner
            </span>
            <span className="rounded bg-white/5 px-2 py-0.5 text-[11px] text-zinc-400">
              Top {coins.length} coins
            </span>
            {loading && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#f6465d] border-t-transparent" />
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setLive(!live)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-colors ${
                live ? "bg-emerald-900/30 text-emerald-400" : "bg-zinc-800 text-zinc-500"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${live ? "animate-pulse bg-emerald-400" : "bg-zinc-600"}`} />
              {live ? "LIVE" : "PAUSED"}
            </button>
          </div>
        </div>

        {/* Info */}
        <div className="mb-4 text-[11px] text-zinc-600">
          Source: Coin Universe + Quant Engine
          <span className="ml-2">{"\u00B7"}</span>
          <span className="ml-2">Refreshes every 30s</span>
          <span className="ml-2">{"\u00B7"}</span>
          <span className="ml-2">Click coin to expand signals</span>
        </div>

        {/* Coin List */}
        {coins.length === 0 && !loading && (
          <div className="flex min-h-[40vh] items-center justify-center text-zinc-600">
            Waiting for first scan...
          </div>
        )}

        <div className="space-y-3">
          {coins.map((coin) => {
            const isExpanded = expandedCoin === coin.symbol;
            const sym = coin.symbol.replace("USDT", "");

            // Group tiles by state for summary
            const bullish = coin.tiles.filter(t => t.state === "BULLISH" || t.state === "BUY").length;
            const bearish = coin.tiles.filter(t => t.state === "BEARISH" || t.state === "SELL").length;
            const neutral = coin.tiles.length - bullish - bearish;

            return (
              <div key={coin.symbol} className="rounded-xl border border-white/[0.06] bg-[#121316] overflow-hidden">
                {/* Coin Row */}
                <button
                  type="button"
                  onClick={() => setExpandedCoin(isExpanded ? null : coin.symbol)}
                  className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-white/[0.02]"
                >
                  {/* Symbol */}
                  <div className="w-[120px]">
                    <span className="text-sm font-bold text-white">{sym}</span>
                    <span className="ml-1 text-[10px] text-zinc-500">USDT</span>
                  </div>

                  {/* Price */}
                  <div className="w-[100px] text-right">
                    <span className="text-sm text-zinc-300">${coin.price < 1 ? coin.price.toFixed(4) : coin.price < 100 ? coin.price.toFixed(2) : coin.price.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  </div>

                  {/* 24h Change */}
                  <div className="w-[80px] text-right">
                    <span className={`text-xs font-medium ${coin.change24hPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {coin.change24hPct >= 0 ? "+" : ""}{coin.change24hPct.toFixed(2)}%
                    </span>
                  </div>

                  {/* Score */}
                  <div className="w-[70px] text-center">
                    <span className={`inline-block rounded-md border px-2 py-0.5 text-xs font-bold ${scoreBg(coin.compositeScore)} ${scoreColor(coin.compositeScore)}`}>
                      {Math.round(coin.compositeScore)}
                    </span>
                  </div>

                  {/* Regime */}
                  <div className="w-[90px] text-center">
                    <span className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-medium ${regimeColor(coin.regime)}`}>
                      {coin.regime}
                    </span>
                  </div>

                  {/* Signal Summary */}
                  <div className="flex flex-1 items-center gap-2">
                    {coin.loading ? (
                      <span className="h-3 w-3 animate-spin rounded-full border border-zinc-600 border-t-zinc-400" />
                    ) : coin.error ? (
                      <span className="text-[10px] text-red-400">{coin.error}</span>
                    ) : (
                      <>
                        <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">{bullish} Bull</span>
                        <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-400">{bearish} Bear</span>
                        <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">{neutral} Neutral</span>
                      </>
                    )}
                  </div>

                  {/* Expand Arrow */}
                  <svg
                    viewBox="0 0 24 24"
                    className={`h-4 w-4 text-zinc-600 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    fill="none" stroke="currentColor" strokeWidth="2"
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>

                {/* Expanded Tiles */}
                {isExpanded && !coin.loading && coin.tiles.length > 0 && (
                  <div className="border-t border-white/[0.06] bg-[#0e0f12] px-4 py-4">
                    {/* Layer Scores */}
                    {Object.keys(coin.layerScores).length > 0 && (
                      <div className="mb-4 flex flex-wrap gap-2">
                        {Object.entries(coin.layerScores).map(([layer, score]) => (
                          <div key={layer} className="rounded-lg border border-white/[0.06] bg-[#121316] px-3 py-1.5">
                            <span className="text-[10px] text-zinc-500">{layer}</span>
                            <span className={`ml-2 text-sm font-bold ${scoreColor(score as number)}`}>{Math.round(score as number)}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Tile Grid */}
                    <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                      {coin.tiles.map((tile) => (
                        <TileCard
                          key={tile.key}
                          tile={tile}
                          feeds={EMPTY_FEEDS}
                          indicatorsEnabled={false}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
