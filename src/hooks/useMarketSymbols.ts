/**
 * useMarketSymbols — Fetches all available trading symbols from the market hub.
 *
 * Uses /api/market/symbols endpoint which returns all symbols from the
 * connected exchange (Binance futures hub or fallback).
 *
 * Returns sorted, deduplicated list of USDT pairs with display labels.
 */
import { useState, useEffect, useRef } from "react";
import { authHeaders } from "../services/exchangeApi";

export interface MarketSymbol {
  symbol: string;     // "BTCUSDT"
  label: string;      // "BTC/USDT"
  baseAsset: string;  // "BTC"
  quoteAsset: string; // "USDT"
}

interface UseMarketSymbolsResult {
  symbols: MarketSymbol[];
  loading: boolean;
  error: string | null;
}

// Cache to avoid refetching on every mount
let cachedSymbols: MarketSymbol[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function parseSymbol(raw: string): MarketSymbol | null {
  // Common quote assets
  const quotes = ["USDT", "USDC", "BUSD", "USD"];
  for (const q of quotes) {
    if (raw.endsWith(q) && raw.length > q.length) {
      const base = raw.slice(0, -q.length);
      return {
        symbol: raw,
        label: `${base}/${q}`,
        baseAsset: base,
        quoteAsset: q,
      };
    }
  }
  return null;
}

export function useMarketSymbols(exchange?: string): UseMarketSymbolsResult {
  const [symbols, setSymbols] = useState<MarketSymbol[]>(cachedSymbols ?? []);
  const [loading, setLoading] = useState(!cachedSymbols);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Use cache if fresh enough
    if (cachedSymbols && Date.now() - cacheTimestamp < CACHE_TTL) {
      setSymbols(cachedSymbols);
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (exchange) params.set("exchange", exchange);

    fetch(`/api/market/symbols?${params}`, {
      headers: { ...authHeaders() },
      signal: ctrl.signal,
    })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(body => {
        if (ctrl.signal.aborted) return;

        const rawSymbols: string[] = Array.isArray(body.symbols) ? body.symbols : [];

        const parsed = rawSymbols
          .map(parseSymbol)
          .filter((s): s is MarketSymbol => s !== null)
          // Only USDT pairs for now (most common)
          .filter(s => s.quoteAsset === "USDT")
          // Deduplicate
          .filter((s, i, arr) => arr.findIndex(x => x.symbol === s.symbol) === i)
          // Sort: major coins first, then alphabetical
          .sort((a, b) => {
            const priority = ["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "ADA", "AVAX", "LINK", "DOT"];
            const aIdx = priority.indexOf(a.baseAsset);
            const bIdx = priority.indexOf(b.baseAsset);
            if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
            if (aIdx !== -1) return -1;
            if (bIdx !== -1) return 1;
            return a.baseAsset.localeCompare(b.baseAsset);
          });

        cachedSymbols = parsed;
        cacheTimestamp = Date.now();
        setSymbols(parsed);
        setLoading(false);
      })
      .catch(err => {
        if (ctrl.signal.aborted) return;
        console.warn("[useMarketSymbols] Failed to fetch:", err);
        setError(err.message);
        setLoading(false);

        // Fallback: use hardcoded list if no cache
        if (!cachedSymbols) {
          const fallback: MarketSymbol[] = [
            { symbol: "BTCUSDT", label: "BTC/USDT", baseAsset: "BTC", quoteAsset: "USDT" },
            { symbol: "ETHUSDT", label: "ETH/USDT", baseAsset: "ETH", quoteAsset: "USDT" },
            { symbol: "SOLUSDT", label: "SOL/USDT", baseAsset: "SOL", quoteAsset: "USDT" },
            { symbol: "BNBUSDT", label: "BNB/USDT", baseAsset: "BNB", quoteAsset: "USDT" },
            { symbol: "XRPUSDT", label: "XRP/USDT", baseAsset: "XRP", quoteAsset: "USDT" },
            { symbol: "DOGEUSDT", label: "DOGE/USDT", baseAsset: "DOGE", quoteAsset: "USDT" },
            { symbol: "ADAUSDT", label: "ADA/USDT", baseAsset: "ADA", quoteAsset: "USDT" },
            { symbol: "AVAXUSDT", label: "AVAX/USDT", baseAsset: "AVAX", quoteAsset: "USDT" },
            { symbol: "LINKUSDT", label: "LINK/USDT", baseAsset: "LINK", quoteAsset: "USDT" },
            { symbol: "DOTUSDT", label: "DOT/USDT", baseAsset: "DOT", quoteAsset: "USDT" },
          ];
          setSymbols(fallback);
        }
      });

    return () => ctrl.abort();
  }, [exchange]);

  return { symbols, loading, error };
}
