import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CoinIcon } from "../components/CoinIcon";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SRLevel {
  price: number;
  type: "support" | "resistance";
  strength: "STRONG" | "MID" | "WEAK";
  touchCount: number;
}

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
  tier1Score: number;
  tier2Score: number | null;
  compositeScore: number;
  status: "ACTIVE" | "COOLDOWN" | "NEW";
  cooldownRoundsLeft: number | null;
  scanner_selected: boolean;
}

interface UniverseEngineResponse {
  ok: boolean;
  round: number;
  refreshedAt: string;
  activeCoins: UniverseCoinRow[];
  cooldownCoins: UniverseCoinRow[];
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
  | "rsi14";

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

const pctChipCls = (v: number) => {
  if (v > 0) return "bg-[#162016] text-[#4ade80] border-[#2a4a2a]";
  if (v < 0) return "bg-[#201414] text-[#f87171] border-[#4a2a2a]";
  return "bg-[#1A1B1F] text-[#8f95a3] border-white/10";
};

const scoreChipCls = (v: number) => {
  if (v >= 70) return "bg-[#162016] text-[#4ade80]";
  if (v >= 40) return "bg-[#1c1a10] text-[#F5C542]";
  return "bg-[#1A1B1F] text-[#6B6F76]";
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
  if (v <= 2) return "text-[#4ade80]";   // Tight
  if (v <= 5) return "text-[#F5C542]";   // Moderate
  return "text-[#f87171]";               // Wide
};

const REFRESH_MS = 15_000;

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

function useCoinUniverseEngine() {
  const [activeCoins, setActiveCoins] = useState<UniverseCoinRow[]>([]);
  const [cooldownCoins, setCooldownCoins] = useState<UniverseCoinRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/market/universe-engine", { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as UniverseEngineResponse;
      if (!body.ok && body.error) throw new Error(body.error);

      setActiveCoins(body.activeCoins ?? []);
      setCooldownCoins(body.cooldownCoins ?? []);
      setRefreshedAt(body.refreshedAt ?? new Date().toISOString());
      setRound(body.round ?? 0);
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
    abortRef.current = ctrl;
    void fetchData(ctrl.signal);
    const timer = setInterval(() => void fetchData(ctrl.signal), REFRESH_MS);
    return () => {
      ctrl.abort();
      clearInterval(timer);
    };
  }, [fetchData]);

  return { activeCoins, cooldownCoins, loading, error, refreshedAt, round };
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
  const arrow = isActive ? (dir === "desc" ? " ▼" : " ▲") : "";
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
/*  Coin Row                                                           */
/* ------------------------------------------------------------------ */

function CoinRow({ c, idx, onClick }: { c: UniverseCoinRow; idx: number; onClick: () => void }) {
  return (
    <div
      className="flex cursor-pointer items-center border-b border-white/5 px-4 py-2 text-sm transition hover:bg-[#17191d]"
      onClick={onClick}
    >
      <span className="w-8 text-center text-xs text-[#6B6F76]">{idx + 1}</span>
      <span className="w-9 flex-shrink-0">
        <CoinIcon symbol={c.symbol} className="h-7 w-7" />
      </span>
      <div className="w-28 min-w-0">
        <div className="flex items-center gap-1">
          <span className="font-semibold text-white">{c.baseAsset}</span>
          <span className="text-[11px] text-[#6B6F76]">/USDT</span>
          {c.scanner_selected && (
            <span className="inline-flex items-center rounded-full bg-[#F5C542]/15 px-1 py-px text-[8px] font-bold text-[#F5C542] border border-[#F5C542]/30 leading-tight">
              SCAN
            </span>
          )}
          {c.status === "NEW" && (
            <span className="inline-flex items-center rounded-full bg-[#4ade80]/15 px-1 py-px text-[8px] font-bold text-[#4ade80] border border-[#4ade80]/30 leading-tight">
              NEW
            </span>
          )}
        </div>
      </div>
      <span className="hidden w-14 text-right text-xs xl:block">
        <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold ${scoreChipCls(c.compositeScore)}`}>
          {c.compositeScore}
        </span>
      </span>
      <span className="ml-auto w-24 text-right font-medium text-white">
        {fmtPrice(c.price)}
      </span>
      <span className="w-20 text-right">
        <span className={`inline-flex rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${pctChipCls(c.change24hPct)}`}>
          {c.change24hPct >= 0 ? "+" : ""}{c.change24hPct.toFixed(2)}%
        </span>
      </span>
      <span className="w-24 text-right text-[#BFC2C7]">
        {compactUsd(c.volume24hUsd)}
      </span>
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
      <span className={`hidden w-14 text-right text-xs lg:block ${c.spreadBps != null ? spreadCls(c.spreadBps) : "text-[#6B6F76]"}`}>
        {c.spreadBps != null ? `${c.spreadBps.toFixed(1)}` : "---"}
      </span>
      <span className={`hidden w-16 text-right text-xs lg:block ${c.atrPct != null ? atrChipCls(c.atrPct) : "text-[#6B6F76]"}`}>
        {c.atrPct != null ? `${c.atrPct.toFixed(2)}%` : "---"}
      </span>
      <span className={`hidden w-20 text-right text-xs xl:block ${c.srDistPct != null ? srDistCls(c.srDistPct) : "text-[#6B6F76]"}`}>
        {c.srDistPct != null && c.nearestSR
          ? `${c.srDistPct.toFixed(1)}% ${c.nearestSR.type === "support" ? "↑S" : "↓R"}`
          : "---"}
      </span>
      <span className={`hidden w-12 text-right text-xs xl:block ${c.rsi14 != null ? rsiCls(c.rsi14) : "text-[#6B6F76]"}`}>
        {c.rsi14 != null ? c.rsi14.toFixed(0) : "---"}
      </span>
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
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function CoinUniversePage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("compositeScore");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const { activeCoins, cooldownCoins, loading, error, refreshedAt, round } = useCoinUniverseEngine();

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

  const filtered = useMemo(() => {
    let list = activeCoins;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (c) => c.symbol.toLowerCase().includes(q) || c.baseAsset.toLowerCase().includes(q),
      );
    }
    return sortCoins(list, sortKey, sortDir);
  }, [activeCoins, search, sortKey, sortDir]);

  return (
    <main className="min-h-screen bg-[#0B0B0C] p-4 text-[#BFC2C7] md:p-6">
      <div className="mx-auto max-w-[1560px] space-y-4">
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
              </p>
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
            <SortHeader label="Funding" sortKey="fundingRate" activeKey={sortKey} dir={sortDir} onSort={handleSort} className="hidden w-20 text-right md:block" />
            <SortHeader label="Spread" sortKey="spreadBps" activeKey={sortKey} dir={sortDir} onSort={handleSort} className="hidden w-14 text-right lg:block" />
            <SortHeader label="ATR%" sortKey="atrPct" activeKey={sortKey} dir={sortDir} onSort={handleSort} className="hidden w-16 text-right lg:block" />
            <SortHeader label="S/R Dist" sortKey="srDistPct" activeKey={sortKey} dir={sortDir} onSort={handleSort} className="hidden w-20 text-right xl:block" />
            <SortHeader label="RSI" sortKey="rsi14" activeKey={sortKey} dir={sortDir} onSort={handleSort} className="hidden w-12 text-right xl:block" />
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
