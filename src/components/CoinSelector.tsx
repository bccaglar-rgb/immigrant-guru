import { useEffect, useMemo, useRef, useState } from "react";
import type { Coin } from "../types";

type SortKey = "symbol" | "price" | "change";
type SortDir = "asc" | "desc";

interface Props {
  selectedCoin: Coin;
  onChange: (coin: Coin) => void;
  coins: Coin[];
  loading?: boolean;
  errorText?: string;
  sourceMode?: "BITRIUM_LABS" | "EXCHANGE";
  exchangeName?: string;
}

const FAVORITES_KEY = "dashboard-coin-favorites-v1";

const formatPrice = (price?: number) => {
  if (!Number.isFinite(price ?? NaN)) return "-";
  const value = Number(price);
  if (value >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (value >= 1) return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return value.toLocaleString(undefined, { maximumFractionDigits: 6 });
};

const formatPct = (value?: number) => {
  if (!Number.isFinite(value ?? NaN)) return "-";
  const n = Number(value);
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
};

export const CoinSelector = ({
  selectedCoin,
  onChange,
  coins,
  loading = false,
  errorText,
  sourceMode = "BITRIUM_LABS",
  exchangeName = "Binance",
}: Props) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState<Coin[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("symbol");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [tickerMap, setTickerMap] = useState<Record<string, { price: number; change24hPct: number }>>({});
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FAVORITES_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as string[];
      if (Array.isArray(parsed)) {
        setFavorites(parsed.map((item) => String(item).toUpperCase()));
      }
    } catch {
      setFavorites([]);
    }
  }, []);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) setOpen(false);
    };

    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      try {
        const qs = new URLSearchParams({
          source: sourceMode === "BITRIUM_LABS" ? "fallback" : "exchange",
          exchange: exchangeName,
        });
        const res = await fetch(`/api/market/tickers?${qs.toString()}`);
        if (!res.ok) return;
        const body = (await res.json()) as { items?: Array<{ symbol: string; price: number; change24hPct: number }> };
        const items = body.items ?? [];
        if (cancelled) return;
        setTickerMap((prev) => {
          const next = { ...prev };
          for (const item of items) {
            next[String(item.symbol).toUpperCase()] = {
              price: Number(item.price),
              change24hPct: Number(item.change24hPct),
            };
          }
          return next;
        });
      } catch {
        // noop
      }
    };
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [open, sourceMode, exchangeName]);

  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);
  const normalizedCoins = useMemo(
    () =>
      [...new Set([selectedCoin, ...coins].map((coin) => String(coin).toUpperCase().trim()).filter(Boolean))],
    [coins, selectedCoin],
  );

  const displayedCoins = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = normalizedCoins.filter((coin) => !q || coin.toLowerCase().includes(q));
    const sorted = filtered.slice().sort((a, b) => {
      if (sortKey === "price") {
        const av = Number(tickerMap[a]?.price ?? Number.NEGATIVE_INFINITY);
        const bv = Number(tickerMap[b]?.price ?? Number.NEGATIVE_INFINITY);
        if (av !== bv) return sortDir === "asc" ? av - bv : bv - av;
        return a.localeCompare(b);
      }
      if (sortKey === "change") {
        const av = Number(tickerMap[a]?.change24hPct ?? Number.NEGATIVE_INFINITY);
        const bv = Number(tickerMap[b]?.change24hPct ?? Number.NEGATIVE_INFINITY);
        if (av !== bv) return sortDir === "asc" ? av - bv : bv - av;
        return a.localeCompare(b);
      }
      return sortDir === "asc" ? a.localeCompare(b) : b.localeCompare(a);
    });
    return sorted.sort((a, b) => {
      const af = favoriteSet.has(a) ? 1 : 0;
      const bf = favoriteSet.has(b) ? 1 : 0;
      if (af !== bf) return bf - af;
      return 0;
    });
  }, [favoriteSet, normalizedCoins, query, sortDir, sortKey, tickerMap]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "symbol" ? "asc" : "desc");
  };

  const toggleFavorite = (coin: Coin) => {
    setFavorites((prev) => {
      const next = prev.includes(coin) ? prev.filter((item) => item !== coin) : [coin, ...prev].slice(0, 20);
      try {
        window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      } catch {
        // noop
      }
      return next;
    });
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => {
          if (!loading || normalizedCoins.length) setOpen((prev) => !prev);
        }}
        className="inline-flex items-center gap-1 rounded border border-white/15 bg-[#0F1012] px-2 py-1 text-sm font-semibold text-white"
      >
        {selectedCoin}
        <span className="rounded bg-[#1b1d22] px-1.5 py-0.5 text-[10px] text-[#BFC2C7]">Perp</span>
        <span className="text-[10px] text-[#8A8F98]">▾</span>
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-40 w-[min(520px,92vw)] max-h-[calc(100vh-120px)] overflow-y-auto rounded-xl border border-white/10 bg-[#121316] p-2 shadow-[0_20px_48px_rgba(0,0,0,0.45)]">
          {normalizedCoins.length ? (
            <>
              <div className="mb-2">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search"
                  className="w-full rounded-md border border-white/15 bg-[#0F1012] px-3 py-2 text-sm text-[#E7E9ED] outline-none placeholder:text-[#6B6F76]"
                />
              </div>
              <div className="grid grid-cols-[1.6fr_1fr_1fr] px-2 py-1 text-[10px] uppercase tracking-wider text-[#6B6F76]">
                <button type="button" onClick={() => toggleSort("symbol")} className="flex items-center gap-1 text-left">
                  Symbols
                  <span className="text-[9px]">{sortKey === "symbol" ? (sortDir === "asc" ? "▴" : "▾") : "↕"}</span>
                </button>
                <button type="button" onClick={() => toggleSort("price")} className="flex items-center justify-end gap-1 text-right">
                  Last Price
                  <span className="text-[9px]">{sortKey === "price" ? (sortDir === "asc" ? "▴" : "▾") : "↕"}</span>
                </button>
                <button type="button" onClick={() => toggleSort("change")} className="flex items-center justify-end gap-1 text-right">
                  24h Chg
                  <span className="text-[9px]">{sortKey === "change" ? (sortDir === "asc" ? "▴" : "▾") : "↕"}</span>
                </button>
              </div>
              <div className="max-h-[calc(100vh-280px)] min-h-[120px] overflow-y-auto">
                {displayedCoins.map((coin) => {
                  const ticker = tickerMap[coin];
                  const change = Number(ticker?.change24hPct ?? Number.NaN);
                  return (
                  <div
                    key={coin}
                    className={`grid w-full grid-cols-[1.6fr_1fr_1fr] items-center px-2 py-1.5 text-sm ${
                      selectedCoin === coin
                        ? "bg-[color-mix(in_srgb,#F5C542_10%,#121316)]"
                        : "hover:bg-[#17191d]"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onChange(coin);
                        setOpen(false);
                        setQuery("");
                      }}
                      className="flex min-w-0 items-center gap-2 text-left"
                    >
                      <span className="truncate text-[#E7E9ED]">{coin}USDT</span>
                      <span className="rounded bg-[#1b1d22] px-1.5 py-0.5 text-[10px] text-[#BFC2C7]">Perp</span>
                    </button>
                    <span className="text-right text-[#E7E9ED]">{formatPrice(ticker?.price)}</span>
                    <div className="flex items-center justify-end gap-2">
                      <span
                        className={`${
                          Number.isFinite(change) ? (change >= 0 ? "text-[#8fc9ab]" : "text-[#d49f9a]") : "text-[#6B6F76]"
                        }`}
                      >
                        {formatPct(change)}
                      </span>
                      <button
                        type="button"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          toggleFavorite(coin);
                        }}
                        className="text-[#F5C542]"
                        aria-pressed={favoriteSet.has(coin)}
                        aria-label={`${favoriteSet.has(coin) ? "Remove from favorites" : "Add to favorites"} ${coin}`}
                        title="Toggle favorite"
                      >
                        {favoriteSet.has(coin) ? "★" : "☆"}
                      </button>
                    </div>
                  </div>
                );})}
                {!displayedCoins.length ? (
                  <div className="px-2 py-3 text-xs text-[#6B6F76]">No symbols in this tab.</div>
                ) : null}
              </div>
            </>
          ) : (
            <div className="px-2 py-2 text-xs text-[#8d93a0]">{loading ? "Loading symbols..." : (errorText || "No symbols from source")}</div>
          )}
        </div>
      )}
    </div>
  );
};
