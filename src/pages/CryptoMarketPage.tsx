import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CryptoMarketTable } from "../components/CryptoMarketTable";
import { MarketDataRouter } from "../data/MarketDataRouter";
import { useMarketListStore, useMarketListReady } from "../hooks/useMarketListStore";
import type { FuturesSortKey, CryptoFilterKey } from "../types";

const FAVORITES_KEY = "crypto-market-favorites-v1";

const chipClass = (active: boolean) =>
  `rounded-full border px-3 py-1 text-xs font-semibold transition ${
    active ? "border-[#F5C542]/70 bg-[#2b2417] text-[#F5C542]" : "border-white/15 bg-[#111215] text-[#BFC2C7] hover:bg-[#17191d]"
  }`;

export default function CryptoMarketPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<FuturesSortKey>("volume24hUsd");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filter, setFilter] = useState<CryptoFilterKey>("all");
  const [favoriteSymbols, setFavoriteSymbols] = useState<Set<string>>(() => new Set());
  const [visibleCount, setVisibleCount] = useState(100);

  const ready = useMarketListReady();
  const allRows = useMarketListStore((s) => s.rows);
  const lastPatchAt = useMarketListStore((s) => s.lastPatchAt);

  // Subscribe to market list on mount
  useEffect(() => {
    MarketDataRouter.subscribeMarketList();
    return () => MarketDataRouter.unsubscribeMarketList();
  }, []);

  // Load favorites from localStorage
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FAVORITES_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as string[];
      setFavoriteSymbols(new Set(parsed));
    } catch {
      // ignore malformed storage
    }
  }, []);

  // Persist favorites
  useEffect(() => {
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(favoriteSymbols)));
  }, [favoriteSymbols]);

  // Derive filtered, sorted rows from the store
  const displayRows = useMemo(() => {
    let rows = [...allRows.values()];

    // Search filter
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          r.symbol.toLowerCase().includes(q) ||
          r.baseAsset.toLowerCase().includes(q),
      );
    }

    // Gainers/losers filter
    if (filter === "gainers") rows = rows.filter((r) => r.change24hPct > 0);
    if (filter === "losers") rows = rows.filter((r) => r.change24hPct < 0);

    // Sort
    rows.sort((a, b) => {
      // Favorites first
      const aFav = favoriteSymbols.has(a.symbol) ? 1 : 0;
      const bFav = favoriteSymbols.has(b.symbol) ? 1 : 0;
      if (aFav !== bFav) return bFav - aFav;

      if (sortBy === "symbol") {
        const cmp = a.symbol.localeCompare(b.symbol);
        return sortDir === "asc" ? cmp : -cmp;
      }
      const aVal = (a as unknown as Record<string, unknown>)[sortBy];
      const bVal = (b as unknown as Record<string, unknown>)[sortBy];
      const aNum = typeof aVal === "number" && Number.isFinite(aVal) ? aVal : 0;
      const bNum = typeof bVal === "number" && Number.isFinite(bVal) ? bVal : 0;
      return sortDir === "asc" ? aNum - bNum : bNum - aNum;
    });

    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows, search, filter, sortBy, sortDir, favoriteSymbols, lastPatchAt]);

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(100);
  }, [search, filter, sortBy, sortDir]);

  const visibleRows = useMemo(() => displayRows.slice(0, visibleCount), [displayRows, visibleCount]);
  const hasMore = displayRows.length > visibleCount;

  const titleMeta = ready
    ? `${visibleRows.length} of ${displayRows.length} Binance Futures symbols \u00B7 Live`
    : "Connecting to Binance Futures...";

  return (
    <main className="min-h-screen bg-[#0B0B0C] p-4 text-[#BFC2C7] md:p-6">
      <div className="mx-auto max-w-[1560px] space-y-4">
        <section className="rounded-2xl border border-white/10 bg-[#121316] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold text-white">Crypto Market</h1>
              <p className="text-xs text-[#6B6F76]">{titleMeta}</p>
            </div>
            {ready && (
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#4caf50] animate-pulse" />
                <span className="text-xs text-[#6B6F76]">Real-time</span>
              </div>
            )}
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
                setSortBy(e.target.value as FuturesSortKey);
                setSortDir("desc");
              }}
            >
              <option value="volume24hUsd">Volume</option>
              <option value="change24hPct">24h %</option>
              <option value="price">Price</option>
              <option value="fundingRate">Funding Rate</option>
              <option value="spreadBps">Spread</option>
              <option value="depthUsd">Depth</option>
              <option value="imbalance">Imbalance</option>
            </select>
            <div className="flex gap-2">
              <button type="button" className={chipClass(filter === "all")} onClick={() => setFilter("all")}>
                All
              </button>
              <button type="button" className={chipClass(filter === "gainers")} onClick={() => setFilter("gainers")}>
                Gainers
              </button>
              <button type="button" className={chipClass(filter === "losers")} onClick={() => setFilter("losers")}>
                Losers
              </button>
            </div>
          </div>
        </section>

        <CryptoMarketTable
          items={visibleRows}
          loading={!ready}
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
          onToggleFavorite={(symbol) =>
            setFavoriteSymbols((prev) => {
              const next = new Set(prev);
              if (next.has(symbol)) next.delete(symbol);
              else next.add(symbol);
              return next;
            })
          }
          onRowClick={(row) => navigate(`/quant-engine?symbol=${row.symbol}`)}
          favoriteSymbols={favoriteSymbols}
        />

        {hasMore && (
          <div className="flex items-center justify-center gap-3 py-3">
            <button
              type="button"
              onClick={() => setVisibleCount((prev) => prev + 100)}
              className="rounded-lg border border-[#F5C542]/50 bg-[#2b2417] px-5 py-2 text-sm font-semibold text-[#F5C542] transition hover:bg-[#3a3020]"
            >
              Show more ({displayRows.length - visibleCount} remaining)
            </button>
            <button
              type="button"
              onClick={() => setVisibleCount(displayRows.length)}
              className="rounded-lg border border-white/15 bg-[#111215] px-5 py-2 text-sm font-semibold text-[#BFC2C7] transition hover:bg-[#17191d]"
            >
              Show all
            </button>
          </div>
        )}

        {!ready && (
          <div className="flex items-center justify-center gap-2 py-8">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#F5C542] border-t-transparent" />
            <span className="text-sm text-[#6B6F76]">Loading Binance Futures data...</span>
          </div>
        )}
      </div>
    </main>
  );
}
