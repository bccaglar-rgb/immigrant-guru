import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CoinIcon } from "../components/CoinIcon";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface UniverseCandidate {
  rank: number;
  symbol: string;
  baseAsset: string;
  icon_url: string;
  quoteAsset?: string;
  group: string;
  opportunity_score: number;
  price: number;
  change24hPct: number;
  volume24hUsd: number;
  marketCapRank?: number | null;
  spreadBps?: number | null;
  markPrice?: number | null;
  fundingRate?: number | null;
  oi_value?: number | null;
  oi_change_1h_pct?: number | null;
  oi_priority?: "OI_INCREASE_TOP5" | "OI_DECREASE_TOP5" | null;
}

interface UniverseApiResponse {
  ok: boolean;
  universe?: {
    input_total?: number;
    filtered_total?: number;
    candidates_total?: number;
    min_volume_usd?: number;
    top_n?: number;
  };
  ranked_candidates: UniverseCandidate[];
  fetchedAt?: string;
  error?: string;
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

const REFRESH_MS = 30_000;

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

function useCoinUniverse() {
  const [candidates, setCandidates] = useState<UniverseCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [filteredTotal, setFilteredTotal] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    try {
      const qs = new URLSearchParams({
        exchange: "Binance",
        min_volume_usd: "5000000",
        top: "300",
      });
      const res = await fetch(`/api/market/universe?${qs}`, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as UniverseApiResponse;
      if (!body.ok && body.error) throw new Error(body.error);

      // Sort by volume descending
      const sorted = [...(body.ranked_candidates ?? [])].sort(
        (a, b) => b.volume24hUsd - a.volume24hUsd,
      );
      setCandidates(sorted);
      setFetchedAt(body.fetchedAt ?? new Date().toISOString());
      setFilteredTotal(body.universe?.filtered_total ?? sorted.length);
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

  return { candidates, loading, error, fetchedAt, filteredTotal };
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
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function CoinUniversePage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const { candidates, loading, error, fetchedAt, filteredTotal } = useCoinUniverse();

  const filtered = useMemo(() => {
    if (!search.trim()) return candidates;
    const q = search.trim().toLowerCase();
    return candidates.filter(
      (c) => c.symbol.toLowerCase().includes(q) || c.baseAsset.toLowerCase().includes(q),
    );
  }, [candidates, search]);

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
                {loading && !candidates.length
                  ? "Loading..."
                  : `${filtered.length} coins${filteredTotal ? ` of ${filteredTotal} above $5M vol` : ""}`}
                {fetchedAt ? ` \u00b7 ${new Date(fetchedAt).toLocaleTimeString()}` : ""}
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

        {/* Coin list */}
        <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#121316]">
          {/* Sticky header */}
          <div className="sticky top-0 z-10 flex items-center border-b border-white/10 bg-[#0F1012] px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-[#6B6F76]">
            <span className="w-8 text-center">#</span>
            <span className="w-9" />
            <span className="w-28">Coin</span>
            <span className="ml-auto w-24 text-right">Price</span>
            <span className="w-20 text-right">24h</span>
            <span className="w-28 text-right">Volume</span>
            <span className="hidden w-20 text-right md:block">Funding</span>
            <span className="hidden w-24 text-right pr-1 lg:block">OI</span>
          </div>

          {/* Scrollable rows */}
          <div className="max-h-[calc(100vh-260px)] overflow-y-auto">
            {loading && !candidates.length ? (
              <SkeletonRows />
            ) : (
              filtered.map((c, idx) => (
                <div
                  key={c.symbol}
                  className="flex cursor-pointer items-center border-b border-white/5 px-4 py-2 text-sm transition hover:bg-[#17191d]"
                  onClick={() => navigate(`/quant-engine?symbol=${c.symbol}`)}
                >
                  <span className="w-8 text-center text-xs text-[#6B6F76]">{idx + 1}</span>
                  <span className="w-9 flex-shrink-0">
                    <CoinIcon symbol={c.symbol} className="h-7 w-7" />
                  </span>
                  <div className="w-28 min-w-0">
                    <span className="font-semibold text-white">{c.baseAsset}</span>
                    <span className="ml-0.5 text-[11px] text-[#6B6F76]">
                      /{c.quoteAsset ?? "USDT"}
                    </span>
                  </div>
                  <span className="ml-auto w-24 text-right font-medium text-white">
                    {fmtPrice(c.price)}
                  </span>
                  <span className="w-20 text-right">
                    <span
                      className={`inline-flex rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${pctChipCls(c.change24hPct)}`}
                    >
                      {c.change24hPct >= 0 ? "+" : ""}
                      {c.change24hPct.toFixed(2)}%
                    </span>
                  </span>
                  <span className="w-28 text-right text-[#BFC2C7]">
                    {compactUsd(c.volume24hUsd)}
                  </span>
                  <span
                    className={`hidden w-20 text-right text-xs md:block ${
                      c.fundingRate != null
                        ? c.fundingRate > 0
                          ? "text-[#8fc9ab]"
                          : c.fundingRate < 0
                            ? "text-[#d49f9a]"
                            : "text-[#8f95a3]"
                        : "text-[#6B6F76]"
                    }`}
                  >
                    {c.fundingRate != null
                      ? `${c.fundingRate >= 0 ? "+" : ""}${(c.fundingRate * 100).toFixed(4)}%`
                      : "---"}
                  </span>
                  <span className="hidden w-24 text-right text-xs text-[#BFC2C7] pr-1 lg:block">
                    {c.oi_value != null ? compactUsd(c.oi_value) : "---"}
                  </span>
                </div>
              ))
            )}
            {!loading && filtered.length === 0 && candidates.length > 0 ? (
              <div className="px-4 py-8 text-center text-sm text-[#6B6F76]">
                No coins match your search.
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
