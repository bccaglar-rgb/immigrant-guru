import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CryptoMarketTable } from "../components/CryptoMarketTable";
import { SourceChip } from "../components/SourceChip";
import { fetchCoinsPage } from "../hooks/useInfiniteCoins";
import { useMarketData, usePageSourceChip } from "../hooks/useMarketData";
import { MarketDataRouter } from "../data/MarketDataRouter";
import type { CoinRow, CryptoFilterKey, CryptoSortKey } from "../types";

const SCROLL_KEY = "crypto-market-scroll-y";
const FAVORITES_KEY = "crypto-market-favorites-v1";
const PAGE_SIZE = 100;

const chipClass = (active: boolean) =>
  `rounded-full border px-3 py-1 text-xs font-semibold transition ${
    active ? "border-[#F5C542]/70 bg-[#2b2417] text-[#F5C542]" : "border-white/15 bg-[#111215] text-[#BFC2C7] hover:bg-[#17191d]"
  }`;

export default function CryptoMarketPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<CryptoSortKey>("marketCapUsd");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filter, setFilter] = useState<CryptoFilterKey>("all");
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => new Set());
  const [items, setItems] = useState<CoinRow[]>([]);
  const [page, setPage] = useState(0);
  const [infiniteMode, setInfiniteMode] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const source = usePageSourceChip();
  useMarketData({
    symbol: "BTCUSDT",
    interval: "15m",
    lookback: 240,
  });

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FAVORITES_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as string[];
      setFavoriteIds(new Set(parsed));
    } catch {
      // ignore malformed storage
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(favoriteIds)));
  }, [favoriteIds]);

  useEffect(() => {
    setPage(0);
    setItems([]);
  }, [search, sortBy, sortDir, filter, favoriteIds]);

  useEffect(() => {
    setPage(0);
    setItems([]);
  }, [infiniteMode]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchCoinsPage(page, PAGE_SIZE, search, sortBy, sortDir, filter, favoriteIds);
        if (cancelled) return;
        setItems((prev) => {
          if (!infiniteMode || page === 0) return result.items;
          const merged = [...prev];
          const seen = new Set(prev.map((row) => row.id));
          result.items.forEach((row) => {
            if (!seen.has(row.id)) merged.push(row);
          });
          return merged;
        });
        setHasMore(result.hasMore);
      } catch {
        if (cancelled) return;
        setError("Unable to load market data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [favoriteIds, filter, page, search, sortBy, sortDir]);

  useEffect(() => {
    if (!infiniteMode) return;
    const target = sentinelRef.current;
    if (!target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (!first?.isIntersecting) return;
        if (loading || !hasMore) return;
        setPage((prev) => prev + 1);
      },
      { root: null, rootMargin: "180px 0px 180px 0px", threshold: 0.01 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, infiniteMode, loading]);

  const watchSymbols = useMemo(() => items.slice(0, 100).map((row) => `${row.symbol}USDT`), [items]);
  const liveTickers = MarketDataRouter.useStore((state) => state.tickers);
  const liveDerivatives = MarketDataRouter.useStore((state) => state.derivatives);

  useEffect(() => {
    watchSymbols.forEach((symbol) => MarketDataRouter.subscribe(symbol, "15m", 240));
    return () => {
      watchSymbols.forEach((symbol) => MarketDataRouter.unsubscribe(symbol, "15m"));
    };
  }, [watchSymbols]);

  const mergedItems = useMemo(
    () =>
      items.map((row) => {
        const symbol = `${row.symbol}USDT`;
        const ticker = liveTickers[symbol]?.payload;
        const deriv = liveDerivatives[symbol]?.payload;
        if (!ticker && !deriv) return row;
        return {
          ...row,
          price: ticker?.price ?? row.price,
          priceChange24hPct: ticker?.change24hPct ?? row.priceChange24hPct,
          volume24hUsd: ticker?.volume24h ?? row.volume24hUsd,
          fundingRatePct:
            typeof deriv?.fundingRate === "number" ? deriv.fundingRate * 100 : row.fundingRatePct,
          oiUsd: deriv?.oiValue ?? row.oiUsd,
          oiChange1hPct: deriv?.oiChange1h ?? row.oiChange1hPct,
          liquidation24hUsd: deriv?.liquidationUsd ?? row.liquidation24hUsd,
        };
      }),
    [items, liveDerivatives, liveTickers],
  );

  useEffect(() => {
    const saved = window.sessionStorage.getItem(SCROLL_KEY);
    if (saved) {
      window.scrollTo({ top: Number(saved), behavior: "auto" });
    }
    return () => {
      window.sessionStorage.setItem(SCROLL_KEY, String(window.scrollY));
    };
  }, []);

  const titleMeta = useMemo(
    () => `Showing ${items.length} coins · Page ${page + 1}`,
    [items.length, page],
  );

  const pageButtons = useMemo(() => {
    const nums = [Math.max(0, page - 1), page, page + 1];
    return nums.filter((v, idx, arr) => arr.indexOf(v) === idx);
  }, [page]);

  return (
    <main className="min-h-screen bg-[#0B0B0C] p-4 text-[#BFC2C7] md:p-6">
      <div className="mx-auto max-w-[1560px] space-y-4">
        <section className="rounded-2xl border border-white/10 bg-[#121316] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold text-white">Crypto Market</h1>
              <p className="text-xs text-[#6B6F76]">{titleMeta}</p>
            </div>
            <SourceChip sourceName={source.sourceName} />
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-[1fr_180px_auto]">
            <input
              className="rounded-lg border border-white/15 bg-[#0F1012] px-3 py-2 text-sm text-[#E7E9ED] outline-none placeholder:text-[#6B6F76] focus:border-[#F5C542]/50"
              placeholder="Search symbol or coin name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="rounded-lg border border-white/15 bg-[#0F1012] px-3 py-2 text-sm text-[#E7E9ED] outline-none focus:border-[#F5C542]/50"
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value as CryptoSortKey);
                setSortDir("desc");
              }}
            >
              <option value="marketCapUsd">Market Cap</option>
              <option value="volume24hUsd">Volume</option>
              <option value="priceChange24hPct">24h %</option>
              <option value="price">Price</option>
            </select>
            <div className="flex gap-2">
              <button type="button" className={chipClass(filter === "all")} onClick={() => setFilter("all")}>
                All
              </button>
              <button type="button" className={chipClass(filter === "gainers")} onClick={() => setFilter("gainers")}>
                Top Gainers
              </button>
              <button type="button" className={chipClass(filter === "losers")} onClick={() => setFilter("losers")}>
                Top Losers
              </button>
            </div>
          </div>
        </section>

        <CryptoMarketTable
          items={mergedItems}
          loading={loading}
          sortBy={sortBy}
          sortDir={sortDir}
          onSort={(key) => {
            if (key === sortBy) {
              setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
            } else {
              setSortBy(key);
              setSortDir("desc");
            }
          }}
          onToggleFavorite={(id) =>
            setFavoriteIds((prev) => {
              const next = new Set(prev);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            })
          }
          onRowClick={(row) => navigate(`/dashboard?symbol=${row.symbol}USDT`)}
        />

        {error ? (
          <div className="rounded-xl border border-[#704844] bg-[#271a19] p-3 text-sm text-[#d6b3af]">
            <p>{error}</p>
            <button
              type="button"
              onClick={async () => {
                setLoading(true);
                setError(null);
                try {
                  const result = await fetchCoinsPage(page, PAGE_SIZE, search, sortBy, sortDir, filter, favoriteIds);
                  setItems(result.items);
                  setHasMore(result.hasMore);
                } catch {
                  setError("Unable to load market data.");
                } finally {
                  setLoading(false);
                }
              }}
              className="mt-2 rounded border border-[#704844] px-2 py-1 text-xs"
            >
              Retry
            </button>
          </div>
        ) : null}

        <section className="rounded-xl border border-white/10 bg-[#121316] p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-[#8e95a3]">
              {loading
                ? "Loading page..."
                : infiniteMode
                  ? `${items.length} rows loaded${hasMore ? " · auto loading enabled" : " · end of list"}`
                  : `Page ${page + 1} · ${items.length} rows`}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setInfiniteMode((prev) => !prev)}
                className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${
                  infiniteMode
                    ? "border-[#F5C542]/60 bg-[#2b2417] text-[#F5C542]"
                    : "border-white/15 bg-[#0F1012] text-[#BFC2C7] hover:bg-[#17191d]"
                }`}
              >
                Infinite Scroll {infiniteMode ? "ON" : "OFF"}
              </button>
              <button
                type="button"
                disabled={infiniteMode || page === 0 || loading}
                onClick={() => setPage((prev) => Math.max(0, prev - 1))}
                className="rounded-md border border-white/15 bg-[#0F1012] px-3 py-1.5 text-xs text-[#BFC2C7] disabled:cursor-not-allowed disabled:opacity-45 hover:bg-[#17191d]"
              >
                Prev
              </button>
              {pageButtons.map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={infiniteMode || (p > page && !hasMore) || loading}
                  onClick={() => setPage(p)}
                  className={`rounded-md border px-2.5 py-1.5 text-xs ${
                    p === page
                      ? "border-[#F5C542]/60 bg-[#2b2417] text-[#F5C542]"
                      : "border-white/15 bg-[#0F1012] text-[#BFC2C7] hover:bg-[#17191d]"
                  } disabled:cursor-not-allowed disabled:opacity-45`}
                >
                  {p + 1}
                </button>
              ))}
              <button
                type="button"
                disabled={infiniteMode || !hasMore || loading}
                onClick={() => setPage((prev) => prev + 1)}
                className="rounded-md border border-white/15 bg-[#0F1012] px-3 py-1.5 text-xs text-[#BFC2C7] disabled:cursor-not-allowed disabled:opacity-45 hover:bg-[#17191d]"
              >
                Next
              </button>
            </div>
          </div>
        </section>
        <div ref={sentinelRef} className="h-2 w-full" />
      </div>
    </main>
  );
}
