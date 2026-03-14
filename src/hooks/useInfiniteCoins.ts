import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CoinRow, CryptoFilterKey, CryptoSortKey } from "../types";

interface FetchResult {
  items: CoinRow[];
  hasMore: boolean;
}

interface UseInfiniteCoinsArgs {
  search: string;
  sortBy: CryptoSortKey;
  sortDir: "asc" | "desc";
  filter: CryptoFilterKey;
  favoriteIds: Set<string>;
  pageSize?: number;
}

const TOTAL_COINS = 1200;

const SYMBOLS = [
  "BTC", "ETH", "SOL", "BNB", "XRP", "ADA", "DOGE", "AVAX", "DOT", "LINK",
  "MATIC", "TRX", "LTC", "ATOM", "NEAR", "ARB", "OP", "APT", "SUI", "FIL",
  "INJ", "ETC", "UNI", "AAVE", "XLM", "ALGO", "VET", "HBAR", "MKR", "PEPE",
];

const NAMES = [
  "Bitcoin", "Ethereum", "Solana", "BNB", "XRP", "Cardano", "Dogecoin", "Avalanche", "Polkadot", "Chainlink",
  "Polygon", "TRON", "Litecoin", "Cosmos", "NEAR Protocol", "Arbitrum", "Optimism", "Aptos", "Sui", "Filecoin",
  "Injective", "Ethereum Classic", "Uniswap", "Aave", "Stellar", "Algorand", "VeChain", "Hedera", "Maker", "Pepe",
];

const iconUrlForSymbol = (symbol: string) => {
  const base = symbol.toLowerCase().replace(/[0-9]/g, "");
  // Primary: cryptoicons API. Secondary fallback is handled in table image onError.
  return `https://cryptoicons.org/api/icon/${base}/64`;
};

const rng = (seed: number) => {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

const generateCoin = (rank: number): Omit<CoinRow, "isFavorite"> => {
  const idx = (rank - 1) % SYMBOLS.length;
  const cycle = Math.floor((rank - 1) / SYMBOLS.length);
  const symbol = cycle > 0 ? `${SYMBOLS[idx]}${cycle}` : SYMBOLS[idx];
  const name = cycle > 0 ? `${NAMES[idx]} ${cycle}` : NAMES[idx];

  const marketCapBase = 1_270_000_000_000 / Math.pow(rank, 0.9);
  const marketCapUsd = Math.max(5_000_000, marketCapBase * (0.84 + rng(rank) * 0.3));
  const volume24hUsd = marketCapUsd * (0.016 + rng(rank + 1000) * 0.2);
  const price = Math.max(0.00004, (marketCapUsd / (10_000_000 + rank * 82_000)) * (0.55 + rng(rank + 2000) * 1.15));
  const priceChange24hPct = (rng(rank + 3000) - 0.5) * 18;
  const fundingRatePct = (rng(rank + 4000) - 0.5) * 0.04;
  const volumeChange24hPct = (rng(rank + 5000) - 0.42) * 90;
  const oiUsd = marketCapUsd * (0.02 + rng(rank + 6000) * 0.06);
  const oiChange1hPct = (rng(rank + 7000) - 0.5) * 5;
  const oiChange24hPct = (rng(rank + 8000) - 0.5) * 14;
  const liquidation24hUsd = volume24hUsd * (0.0015 + rng(rank + 9000) * 0.025);

  return {
    id: `${symbol}-${rank}`,
    rank,
    symbol,
    name,
    logoUrl: iconUrlForSymbol(symbol),
    price,
    priceChange24hPct,
    fundingRatePct,
    volume24hUsd,
    volumeChange24hPct,
    marketCapUsd,
    oiUsd,
    oiChange1hPct,
    oiChange24hPct,
    liquidation24hUsd,
  };
};

const allCoinsBase = Array.from({ length: TOTAL_COINS }, (_, i) => generateCoin(i + 1));

export const fetchCoinsPage = async (
  page: number,
  pageSize = 50,
  search = "",
  sortBy: CryptoSortKey = "marketCapUsd",
  sortDir: "asc" | "desc" = "desc",
  filter: CryptoFilterKey = "all",
  favoriteIds?: Set<string>,
): Promise<FetchResult> => {
  await new Promise((resolve) => window.setTimeout(resolve, 320));

  let filtered = allCoinsBase;
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    filtered = filtered.filter((coin) => coin.symbol.toLowerCase().includes(q) || coin.name?.toLowerCase().includes(q));
  }
  if (filter === "gainers") filtered = filtered.filter((coin) => coin.priceChange24hPct > 0);
  if (filter === "losers") filtered = filtered.filter((coin) => coin.priceChange24hPct < 0);

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortBy === "symbol") {
      cmp = a.symbol.localeCompare(b.symbol);
    } else {
      cmp = a[sortBy] - b[sortBy];
    }
    return sortDir === "asc" ? cmp : -cmp;
  });
  const start = page * pageSize;
  const end = start + pageSize;
  const items = sorted.slice(start, end).map((item) => ({
    ...item,
    isFavorite: Boolean(favoriteIds?.has(item.id)),
  }));

  return {
    items,
    hasMore: end < sorted.length,
  };
};

export const useInfiniteCoins = ({ search, sortBy, sortDir, filter, favoriteIds, pageSize = 50 }: UseInfiniteCoinsArgs) => {
  const [items, setItems] = useState<CoinRow[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lockRef = useRef(false);
  const reqIdRef = useRef(0);
  const hasMoreRef = useRef(true);

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  const loadPage = useCallback(
    async (nextPage: number, replace = false) => {
      if (lockRef.current) return;
      if (!hasMoreRef.current && !replace) return;

      lockRef.current = true;
      setLoading(true);
      setError(null);
      reqIdRef.current += 1;
      const reqId = reqIdRef.current;

      try {
        const result = await fetchCoinsPage(nextPage, pageSize, search, sortBy, sortDir, filter, favoriteIds);
        if (reqId !== reqIdRef.current) return;
        setItems((prev) => (replace ? result.items : [...prev, ...result.items]));
        setHasMore(result.hasMore);
        setPage(nextPage);
      } catch {
        if (reqId !== reqIdRef.current) return;
        setError("Unable to load market data.");
      } finally {
        if (reqId === reqIdRef.current) {
          setLoading(false);
          lockRef.current = false;
        }
      }
    },
    [favoriteIds, filter, pageSize, search, sortBy, sortDir],
  );

  useEffect(() => {
    setItems([]);
    setPage(0);
    setHasMore(true);
    setError(null);
    void loadPage(0, true);
  }, [search, sortBy, sortDir, filter, favoriteIds, loadPage]);

  const fetchNext = useCallback(() => {
    if (loading || !hasMore || error) return;
    void loadPage(page + 1);
  }, [error, hasMore, loadPage, loading, page]);

  const retry = useCallback(() => {
    if (loading) return;
    void loadPage(items.length ? page + 1 : 0, !items.length);
  }, [items.length, loadPage, loading, page]);

  return useMemo(
    () => ({
      items,
      loading,
      error,
      hasMore,
      fetchNext,
      retry,
    }),
    [items, loading, error, hasMore, fetchNext, retry],
  );
};
