import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CoinIcon } from "../components/CoinIcon";
import { MarketDataRouter } from "../data/MarketDataRouter";
import { useMarketListStore } from "../hooks/useMarketListStore";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SRLevel {
  price: number;
  type: "support" | "resistance";
  strength: "STRONG" | "MID" | "WEAK";
  touchCount: number;
}

interface UniverseScoreDetail {
  raw: number;
  penalty: number;
  final: number;
  liquidity: { total: number; volumeScore: number; depthScore: number; spreadScore: number };
  structure: { total: number; srProximity: number; regimeScore: number; trendScore: number };
  momentum: { total: number; priceChange: number; rsiScore: number; volumeSpikeScore: number };
  positioning: { total: number; fundingScore: number; oiScore: number; flowScore: number };
  execution: { total: number; spreadQuality: number; depthQuality: number; imbalanceScore: number };
  falsePenalty: { total: number; fakeBreakout: number; signalConflict: number; trapProbability: number; cascadeRisk: number; newsRisk: number };
}

type MarketRegime = "TREND" | "RANGE" | "BREAKOUT" | "UNKNOWN";

interface UniverseCoinRow {
  symbol: string;
  baseAsset: string;
  price: number;
  change24hPct: number;
  volume24hUsd: number;
  fundingRate: number | null;
  spreadBps: number | null;
  atrPct: number | null;
  rsi14: number | null;
  srDistPct: number | null;
  nearestSR: SRLevel | null;
  regime: MarketRegime;
  trendStrength: number;
  volumeSpike: boolean;
  oiChange: number | null;
  aggressorFlow: "BUY" | "SELL" | "NEUTRAL";
  universeScore: UniverseScoreDetail;
  compositeScore: number;
  selected: boolean;
  rejectedReason: string | null;
  status: "ACTIVE" | "COOLDOWN" | "NEW" | "REJECTED";
  cooldownRoundsLeft: number | null;
  scanner_selected: boolean;
  // Legacy compat
  tier1Score?: number;
  tier2Score?: number | null;
}

interface UniverseEngineResponse {
  ok: boolean;
  round: number;
  refreshedAt: string;
  activeCoins: UniverseCoinRow[];
  cooldownCoins: UniverseCoinRow[];
  stats?: { totalScanned: number; hardFiltered: number; scored: number; selected: number; cooldown: number };
  error?: string;
}

/* ------------------------------------------------------------------ */
/*  Sort                                                               */
/* ------------------------------------------------------------------ */

type SortKey =
  | "compositeScore"
  | "price"
  | "change24hPct"
  | "volume24hUsd"
  | "fundingRate"
  | "spreadBps"
  | "atrPct"
  | "srDistPct"
  | "rsi14"
  | "trendStrength"
  | "oiChange";

type SortDir = "asc" | "desc";

const numVal = (v: number | null | undefined): number =>
  v != null && Number.isFinite(v) ? v : -Infinity;

function sortCoins(coins: UniverseCoinRow[], key: SortKey, dir: SortDir): UniverseCoinRow[] {
  const m = dir === "desc" ? -1 : 1;
  return [...coins].sort((a, b) => {
    const va = numVal(a[key] as number | null);
    const vb = numVal(b[key] as number | null);
    if (va === vb) return 0;
    return va < vb ? -1 * m : 1 * m;
  });
}

/* ------------------------------------------------------------------ */
/*  Formatters                                                         */
/* ------------------------------------------------------------------ */

const compactUsd = (v: number) => {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
};

const fmtPrice = (v: number) => {
  if (v >= 1000) return `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (v >= 1) return `$${v.toLocaleString(undefined, { maximumFractionDigits: 4 })}`;
  if (v >= 0.01) return `$${v.toLocaleString(undefined, { maximumFractionDigits: 5 })}`;
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 8 })}`;
};

const pctColor = (v: number) => {
  if (v > 0) return "text-[#8fc9ab]";
  if (v < 0) return "text-[#d49f9a]";
  return "text-[#BFC2C7]";
};

const scoreChipCls = (v: number) => {
  if (v >= 80) return "bg-[#0d2818] text-[#4ade80] border border-[#4ade80]/30";
  if (v >= 70) return "bg-[#162016] text-[#4ade80]";
  if (v >= 60) return "bg-[#1c1a10] text-[#F5C542]";
  if (v >= 40) return "bg-[#1A1B1F] text-[#8f95a3]";
  return "bg-[#1A1B1F] text-[#6B6F76]";
};

const regimeChipCls = (r: MarketRegime) => {
  switch (r) {
    case "TREND": return "bg-[#162016] text-[#4ade80]";
    case "BREAKOUT": return "bg-[#1c1a10] text-[#F5C542]";
    case "RANGE": return "bg-[#1a1520] text-[#c084fc]";
    default: return "bg-[#1A1B1F] text-[#6B6F76]";
  }
};

const atrChipCls = (v: number) => {
  if (v > 1.5) return "text-[#f87171]";
  if (v > 0.8) return "text-[#F5C542]";
  return "text-[#60a5fa]";
};

const srDistCls = (v: number) => {
  if (v < 1) return "text-[#4ade80] font-semibold";
  if (v < 3) return "text-[#8fc9ab]";
  return "text-[#6B6F76]";
};

const rsiCls = (v: number) => {
  if (v < 30) return "text-[#4ade80]";
  if (v > 70) return "text-[#f87171]";
  return "text-[#8f95a3]";
};

const spreadCls = (v: number) => {
  if (v <= 2) return "text-[#4ade80]";
  if (v <= 5) return "text-[#F5C542]";
  return "text-[#f87171]";
};

const penaltyCls = (v: number) => {
  if (v === 0) return "text-[#4ade80]";
  if (v <= 3) return "text-[#F5C542]";
  return "text-[#f87171]";
};

/* Engine refresh: server refreshes every 60s, poll every 30s for safety */
const ENGINE_REFRESH_MS = 30_000;

/* ------------------------------------------------------------------ */
/*  Hook: Engine data (V2 endpoint with fallback to V1)                */
/* ------------------------------------------------------------------ */

function useCoinUniverseEngine() {
  const [activeCoins, setActiveCoins] = useState<UniverseCoinRow[]>([]);
  const [cooldownCoins, setCooldownCoins] = useState<UniverseCoinRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const [stats, setStats] = useState<UniverseEngineResponse["stats"] | null>(null);

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    try {
      // Try V2 endpoint first
      let res = await fetch("/api/coin-universe/snapshot", { signal });
      if (!res.ok) {
        // Fallback to V1
        res = await fetch("/api/market/universe-engine", { signal });
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as UniverseEngineResponse;
      if (!body.ok && body.error) throw new Error(body.error);

      setActiveCoins(body.activeCoins ?? []);
      setCooldownCoins(body.cooldownCoins ?? []);
      setRefreshedAt(body.refreshedAt ?? new Date().toISOString());
      setRound(body.round ?? 0);
      setStats(body.stats ?? null);
      setError(null);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    void fetchData(ctrl.signal);
    const timer = setInterval(() => void fetchData(ctrl.signal), ENGINE_REFRESH_MS);
    return () => {
      ctrl.abort();
      clearInterval(timer);
    };
  }, [fetchData]);

  return { activeCoins, cooldownCoins, loading, error, refreshedAt, round, stats };
}

/* ------------------------------------------------------------------ */
/*  Skeleton                                                           */
/* ------------------------------------------------------------------ */

const SkeletonRows = () => (
  <>
    {Array.from({ length: 16 }).map((_, i) => (
      <div key={`sk-${i}`} className="flex items-center gap-3 border-b border-white/5 px-4 py-3">
        <div className="h-3 w-6 animate-pulse rounded bg-white/8" />
        <div className="h-7 w-7 animate-pulse rounded-full bg-white/8" />
        <div className="h-3 w-20 animate-pulse rounded bg-white/8" />
        <div className="ml-auto h-3 w-16 animate-pulse rounded bg-white/8" />
        <div className="h-3 w-14 animate-pulse rounded bg-white/8" />
        <div className="h-3 w-20 animate-pulse rounded bg-white/8" />
      </div>
    ))}
  </>
);

/* ------------------------------------------------------------------ */
/*  Sortable Header                                                    */
/* ------------------------------------------------------------------ */

function SortHeader({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const isActive = sortKey === activeKey;
  const arrow = isActive ? (dir === "desc" ? " \u25BC" : " \u25B2") : "";
  return (
    <span
      className={`cursor-pointer select-none transition-colors hover:text-[#BFC2C7] ${isActive ? "text-[#E7E9ED]" : ""} ${className ?? ""}`}
      onClick={() => onSort(sortKey)}
    >
      {label}{arrow}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Score Tooltip (hover popover)                                      */
/* ------------------------------------------------------------------ */

function ScoreBreakdown({ score }: { score: UniverseScoreDetail }) {
  return (
    <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-white/15 bg-[#1A1B1F] p-3 text-[10px] text-[#BFC2C7] shadow-xl">
      <div className="mb-2 text-[11px] font-semibold text-white">Score Breakdown</div>
      <div className="space-y-1">
        <div className="flex justify-between"><span>Liquidity</span><span className="text-[#4ade80]">{score.liquidity.total.toFixed(1)}/25</span></div>
        <div className="flex justify-between"><span>Structure</span><span className="text-[#4ade80]">{score.structure.total.toFixed(1)}/25</span></div>
        <div className="flex justify-between"><span>Momentum</span><span className="text-[#F5C542]">{score.momentum.total.toFixed(1)}/20</span></div>
        <div className="flex justify-between"><span>Positioning</span><span className="text-[#60a5fa]">{score.positioning.total.toFixed(1)}/15</span></div>
        <div className="flex justify-between"><span>Execution</span><span className="text-[#c084fc]">{score.execution.total.toFixed(1)}/15</span></div>
        <div className="mt-1 border-t border-white/10 pt-1 flex justify-between font-semibold">
          <span>Raw Total</span><span className="text-white">{score.raw.toFixed(1)}/100</span>
        </div>
        {score.penalty > 0 && (
          <div className="flex justify-between text-[#f87171]">
            <span>False Penalty</span><span>-{score.penalty.toFixed(1)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-white">
          <span>Final</span><span>{score.final.toFixed(1)}</span>
        </div>
      </div>
      {score.penalty > 0 && (
        <div className="mt-2 border-t border-white/10 pt-2 space-y-0.5">
          <div className="text-[9px] font-semibold text-[#f87171]">Penalties</div>
          {score.falsePenalty.fakeBreakout > 0 && <div className="flex justify-between"><span>Fake Breakout</span><span>-{score.falsePenalty.fakeBreakout}</span></div>}
          {score.falsePenalty.signalConflict > 0 && <div className="flex justify-between"><span>Signal Conflict</span><span>-{score.falsePenalty.signalConflict}</span></div>}
          {score.falsePenalty.trapProbability > 0 && <div className="flex justify-between"><span>Trap Prob.</span><span>-{score.falsePenalty.trapProbability}</span></div>}
          {score.falsePenalty.cascadeRisk > 0 && <div className="flex justify-between"><span>Cascade Risk</span><span>-{score.falsePenalty.cascadeRisk}</span></div>}
          {score.falsePenalty.newsRisk > 0 && <div className="flex justify-between"><span>News Risk</span><span>-{score.falsePenalty.newsRisk}</span></div>}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Coin Row (V2 with new columns)                                     */
/* ------------------------------------------------------------------ */

function CoinRow({ c, idx, onClick }: { c: UniverseCoinRow; idx: number; onClick: () => void }) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const hasV2 = !!c.universeScore;

  return (
    <div
      className={`flex cursor-pointer items-center border-b border-white/5 px-4 py-2 text-sm transition hover:bg-[#17191d] ${c.selected ? "bg-[#0d1a0d]/30" : ""}`}
      onClick={onClick}
    >
      {/* # */}
      <span className="w-8 text-center text-xs text-[#6B6F76]">{idx + 1}</span>

      {/* Icon */}
      <span className="w-9 flex-shrink-0">
        <CoinIcon symbol={c.symbol} className="h-7 w-7" />
      </span>

      {/* Coin name + badges */}
      <div className="w-28 min-w-0">
        <div className="flex items-center gap-1">
          <span className="font-semibold text-white">{c.baseAsset}</span>
          <span className="text-[11px] text-[#6B6F76]">/USDT</span>
          {c.selected && (
            <span className="inline-flex items-center rounded-full bg-[#4ade80]/15 px-1 py-px text-[8px] font-bold text-[#4ade80] border border-[#4ade80]/30 leading-tight">
              TOP
            </span>
          )}
          {c.scanner_selected && (
            <span className="inline-flex items-center rounded-full bg-[#F5C542]/15 px-1 py-px text-[8px] font-bold text-[#F5C542] border border-[#F5C542]/30 leading-tight">
              SCAN
            </span>
          )}
          {c.status === "NEW" && (
            <span className="inline-flex items-center rounded-full bg-[#60a5fa]/15 px-1 py-px text-[8px] font-bold text-[#60a5fa] border border-[#60a5fa]/30 leading-tight">
              NEW
            </span>
          )}
        </div>
      </div>

      {/* Universe Score (with hover breakdown) */}
      <span
        className="relative hidden w-14 text-right text-xs xl:block"
        onMouseEnter={() => setShowBreakdown(true)}
        onMouseLeave={() => setShowBreakdown(false)}
      >
        <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold ${scoreChipCls(c.compositeScore)}`}>
          {c.compositeScore}
        </span>
        {showBreakdown && hasV2 && <ScoreBreakdown score={c.universeScore} />}
      </span>

      {/* Price */}
      <span className="ml-auto w-24 text-right font-medium text-white">
        {fmtPrice(c.price)}
      </span>

      {/* 24h Change */}
      <span className={`w-20 text-right text-[11px] font-semibold ${pctColor(c.change24hPct)}`}>
        {c.change24hPct >= 0 ? "+" : ""}{c.change24hPct.toFixed(2)}%
      </span>

      {/* Volume */}
      <span className="w-24 text-right text-[#BFC2C7]">
        {compactUsd(c.volume24hUsd)}
      </span>

      {/* Trend Strength */}
      <span className={`hidden w-12 text-right text-xs lg:block ${
        c.trendStrength >= 60 ? "text-[#4ade80]" : c.trendStrength >= 30 ? "text-[#F5C542]" : "text-[#6B6F76]"
      }`}>
        {c.trendStrength ?? "---"}
      </span>

      {/* Regime */}
      <span className="hidden w-16 text-right text-xs xl:block">
        {c.regime ? (
          <span className={`inline-flex rounded px-1 py-px text-[9px] font-semibold ${regimeChipCls(c.regime)}`}>
            {c.regime}
          </span>
        ) : "---"}
      </span>

      {/* OI Change */}
      <span className={`hidden w-14 text-right text-xs xl:block ${
        c.oiChange != null
          ? c.oiChange > 0 ? "text-[#8fc9ab]" : c.oiChange < 0 ? "text-[#d49f9a]" : "text-[#6B6F76]"
          : "text-[#6B6F76]"
      }`}>
        {c.oiChange != null ? `${c.oiChange > 0 ? "+" : ""}${c.oiChange.toFixed(1)}%` : "---"}
      </span>

      {/* Volume Spike */}
      <span className="hidden w-10 text-center text-xs xl:block">
        {c.volumeSpike ? (
          <span className="inline-flex rounded bg-[#F5C542]/15 px-1 py-px text-[9px] font-bold text-[#F5C542]">
            SPIKE
          </span>
        ) : (
          <span className="text-[#6B6F76]">-</span>
        )}
      </span>

      {/* Funding */}
      <span
        className={`hidden w-20 text-right text-xs md:block ${
          c.fundingRate != null
            ? c.fundingRate > 0 ? "text-[#8fc9ab]" : c.fundingRate < 0 ? "text-[#d49f9a]" : "text-[#8f95a3]"
            : "text-[#6B6F76]"
        }`}
      >
        {c.fundingRate != null
          ? `${c.fundingRate >= 0 ? "+" : ""}${(c.fundingRate * 100).toFixed(4)}%`
          : "---"}
      </span>

      {/* Spread */}
      <span className={`hidden w-14 text-right text-xs lg:block ${c.spreadBps != null ? spreadCls(c.spreadBps) : "text-[#6B6F76]"}`}>
        {c.spreadBps != null ? `${c.spreadBps.toFixed(1)}` : "---"}
      </span>

      {/* Entry Quality (Execution score) */}
      {hasV2 && (
        <span className={`hidden w-12 text-right text-xs xl:block ${
          c.universeScore.execution.total >= 10 ? "text-[#4ade80]"
            : c.universeScore.execution.total >= 6 ? "text-[#F5C542]"
            : "text-[#6B6F76]"
        }`}>
          {c.universeScore.execution.total.toFixed(1)}
        </span>
      )}

      {/* Fake Breakout Risk */}
      {hasV2 && (
        <span className={`hidden w-10 text-right text-xs 2xl:block ${penaltyCls(c.universeScore.falsePenalty.fakeBreakout)}`}>
          {c.universeScore.falsePenalty.fakeBreakout}
        </span>
      )}

      {/* Signal Conflict */}
      {hasV2 && (
        <span className={`hidden w-10 text-right text-xs 2xl:block ${penaltyCls(c.universeScore.falsePenalty.signalConflict)}`}>
          {c.universeScore.falsePenalty.signalConflict}
        </span>
      )}

      {/* Trap Probability */}
      {hasV2 && (
        <span className={`hidden w-10 text-right text-xs 2xl:block ${penaltyCls(c.universeScore.falsePenalty.trapProbability)}`}>
          {c.universeScore.falsePenalty.trapProbability}
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Cooldown Row                                                       */
/* ------------------------------------------------------------------ */

function CooldownRow({ c }: { c: UniverseCoinRow }) {
  return (
    <div className="flex items-center border-b border-white/5 px-4 py-1.5 text-xs text-[#6B6F76]">
      <span className="w-9 flex-shrink-0">
        <CoinIcon symbol={c.symbol} className="h-5 w-5 opacity-60" />
      </span>
      <span className="w-24 font-medium text-[#8f95a3]">{c.baseAsset}/USDT</span>
      <span className="w-12 text-right">
        <span className={`inline-flex rounded px-1 py-px text-[9px] font-semibold ${scoreChipCls(c.compositeScore)}`}>
          {c.compositeScore}
        </span>
      </span>
      <span className="ml-auto text-[11px] text-[#6B6F76]">
        {c.cooldownRoundsLeft != null
          ? `${c.cooldownRoundsLeft} round${c.cooldownRoundsLeft > 1 ? "s" : ""} left`
          : "cooling"}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Stats Bar                                                          */
/* ------------------------------------------------------------------ */

function StatsBar({ stats }: { stats: UniverseEngineResponse["stats"] | null }) {
  if (!stats) return null;
  return (
    <div className="flex flex-wrap gap-4 text-[11px] text-[#6B6F76]">
      <span>Scanned: <span className="text-[#BFC2C7] font-medium">{stats.totalScanned}</span></span>
      <span>Hard Filtered: <span className="text-[#d49f9a] font-medium">{stats.hardFiltered}</span></span>
      <span>Scored: <span className="text-[#BFC2C7] font-medium">{stats.scored}</span></span>
      <span>Selected (Top 10%): <span className="text-[#4ade80] font-medium">{stats.selected}</span></span>
      <span>Cooldown: <span className="text-[#F5C542] font-medium">{stats.cooldown}</span></span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function CoinUniversePage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("compositeScore");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const { activeCoins, cooldownCoins, loading, error, refreshedAt, round, stats } = useCoinUniverseEngine();

  // Pipeline 6: real-time price/change/volume overlay
  const liveRows = useMarketListStore((s) => s.rows);
  const lastPatchAt = useMarketListStore((s) => s.lastPatchAt);

  useEffect(() => {
    MarketDataRouter.subscribeMarketList();
    return () => MarketDataRouter.unsubscribeMarketList();
  }, []);

  const handleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "desc" ? "asc" : "desc"));
        return prev;
      }
      setSortDir("desc");
      return key;
    });
  }, []);

  // Merge engine scores with Pipeline 6 live prices
  const merged = useMemo(() => {
    if (!activeCoins.length) return activeCoins;
    if (!liveRows.size) return activeCoins;

    return activeCoins.map((coin) => {
      const live = liveRows.get(coin.symbol);
      if (!live) return coin;
      return {
        ...coin,
        price: live.price > 0 ? live.price : coin.price,
        change24hPct: Number.isFinite(live.change24hPct) ? live.change24hPct : coin.change24hPct,
        volume24hUsd: live.volume24hUsd > 0 ? live.volume24hUsd : coin.volume24hUsd,
        fundingRate: live.fundingRate ?? coin.fundingRate,
        spreadBps: live.spreadBps ?? coin.spreadBps,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCoins, liveRows, lastPatchAt]);

  const filtered = useMemo(() => {
    let list = merged;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (c) => c.symbol.toLowerCase().includes(q) || c.baseAsset.toLowerCase().includes(q),
      );
    }
    return sortCoins(list, sortKey, sortDir);
  }, [merged, search, sortKey, sortDir]);

  const hasV2 = activeCoins.length > 0 && !!activeCoins[0]?.universeScore;

  return (
    <main className="min-h-screen bg-[#0B0B0C] p-4 text-[#BFC2C7] md:p-6">
      <div className="mx-auto max-w-[1800px] space-y-4">
        {/* Header */}
        <section className="rounded-2xl border border-white/10 bg-[#121316] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold text-white">Coin Universe</h1>
              <p className="text-xs text-[#6B6F76]">
                Binance Futures &middot;{" "}
                {loading && !activeCoins.length
                  ? "Loading..."
                  : `${filtered.length} active coins`}
                {round > 0 ? ` \u00b7 Round ${round}` : ""}
                {refreshedAt ? ` \u00b7 ${new Date(refreshedAt).toLocaleTimeString()}` : ""}
                {cooldownCoins.length > 0 ? ` \u00b7 ${cooldownCoins.length} cooling down` : ""}
                {liveRows.size > 0 ? " \u00b7 Live" : ""}
                {hasV2 ? " \u00b7 V2" : ""}
              </p>
              {stats && <StatsBar stats={stats} />}
            </div>
          </div>
          <div className="mt-3">
            <input
              className="w-full max-w-md rounded-lg border border-white/15 bg-[#0F1012] px-3 py-2 text-sm text-[#E7E9ED] outline-none placeholder:text-[#6B6F76] focus:border-[#F5C542]/50"
              placeholder="Search symbol..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </section>

        {/* Error */}
        {error ? (
          <div className="rounded-xl border border-[#704844] bg-[#271a19] p-3 text-sm text-[#d6b3af]">
            {error}
          </div>
        ) : null}

        {/* Active Coin list */}
        <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#121316]">
          {/* Sticky header — sortable */}
          <div className="sticky top-0 z-10 flex items-center border-b border-white/10 bg-[#0F1012] px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-[#6B6F76]">
            <span className="w-8 text-center">#</span>
            <span className="w-9" />
            <span className="w-28">Coin</span>
            <SortHeader label="Score" sortKey="compositeScore" activeKey={sortKey} dir={sortDir} onSort={handleSort} className="hidden w-14 text-right xl:block" />
            <SortHeader label="Price" sortKey="price" activeKey={sortKey} dir={sortDir} onSort={handleSort} className="ml-auto w-24 text-right" />
            <SortHeader label="24h" sortKey="change24hPct" activeKey={sortKey} dir={sortDir} onSort={handleSort} className="w-20 text-right" />
            <SortHeader label="Volume" sortKey="volume24hUsd" activeKey={sortKey} dir={sortDir} onSort={handleSort} className="w-24 text-right" />
            <SortHeader label="Trend" sortKey="trendStrength" activeKey={sortKey} dir={sortDir} onSort={handleSort} className="hidden w-12 text-right lg:block" />
            <span className="hidden w-16 text-right xl:block">Regime</span>
            <SortHeader label="OI%" sortKey="oiChange" activeKey={sortKey} dir={sortDir} onSort={handleSort} className="hidden w-14 text-right xl:block" />
            <span className="hidden w-10 text-center xl:block">Vol Spike</span>
            <SortHeader label="Funding" sortKey="fundingRate" activeKey={sortKey} dir={sortDir} onSort={handleSort} className="hidden w-20 text-right md:block" />
            <SortHeader label="Spread" sortKey="spreadBps" activeKey={sortKey} dir={sortDir} onSort={handleSort} className="hidden w-14 text-right lg:block" />
            {hasV2 && <span className="hidden w-12 text-right xl:block">Entry</span>}
            {hasV2 && <span className="hidden w-10 text-right 2xl:block">Fake</span>}
            {hasV2 && <span className="hidden w-10 text-right 2xl:block">Confl</span>}
            {hasV2 && <span className="hidden w-10 text-right 2xl:block">Trap</span>}
          </div>

          {/* Scrollable rows */}
          <div className="max-h-[calc(100vh-340px)] overflow-y-auto">
            {loading && !activeCoins.length ? (
              <SkeletonRows />
            ) : (
              filtered.map((c, idx) => (
                <CoinRow
                  key={c.symbol}
                  c={c}
                  idx={idx}
                  onClick={() => navigate(`/quant-engine?symbol=${c.symbol}`)}
                />
              ))
            )}
            {!loading && filtered.length === 0 && activeCoins.length > 0 ? (
              <div className="px-4 py-8 text-center text-sm text-[#6B6F76]">
                No coins match your search.
              </div>
            ) : null}
          </div>
        </section>

        {/* Cooldown section */}
        {cooldownCoins.length > 0 && (
          <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#121316]">
            <div className="flex items-center border-b border-white/10 bg-[#0F1012] px-4 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6B6F76]">
                Cooldown
              </span>
              <span className="ml-2 inline-flex rounded-full bg-[#F5C542]/10 px-1.5 py-px text-[9px] font-bold text-[#F5C542]">
                {cooldownCoins.length}
              </span>
            </div>
            <div className="max-h-48 overflow-y-auto">
              {cooldownCoins.map((c) => (
                <CooldownRow key={c.symbol} c={c} />
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
