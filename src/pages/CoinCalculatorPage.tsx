import { useEffect, useMemo, useState } from "react";
import { useExchangeTerminalStore } from "../hooks/useExchangeTerminalStore";
import { useMarketDashboardSource } from "../hooks/useMarketDashboardSource";
import {
  fetchCoinCalculatorSymbols,
  fetchCoinCalculatorTickers,
  fetchCoinConversion,
  type ConvertResponse,
} from "../services/coinCalculatorApi";

const FIAT_ASSETS = ["USD", "EUR", "TRY"] as const;

const cardClass = "rounded-xl border border-white/10 bg-[#121316] p-4";
const numberFmt = (value: number, digits = 6) =>
  Number.isFinite(value)
    ? value.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: digits,
      })
    : "0";

export default function CoinCalculatorPage() {
  const selectedExchange = useExchangeTerminalStore((state) => state.selectedExchange);
  const sourceMode = useMarketDashboardSource((state) => state.sourceMode);

  const [symbols, setSymbols] = useState<string[]>([]);
  const [tickers, setTickers] = useState<Array<{ symbol: string; price: number; change24hPct: number }>>([]);
  const [amount, setAmount] = useState<number>(1);
  const [fromAsset, setFromAsset] = useState("BTC");
  const [toAsset, setToAsset] = useState("USDT");
  const [search, setSearch] = useState("");
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [loadingConvert, setLoadingConvert] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ConvertResponse | null>(null);

  const effectiveSource = sourceMode === "EXCHANGE" ? "exchange" : "fallback";

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setLoadingAssets(true);
        setError("");
        const [symbolRes, tickerRes] = await Promise.all([
          fetchCoinCalculatorSymbols(selectedExchange, effectiveSource),
          fetchCoinCalculatorTickers(selectedExchange, effectiveSource),
        ]);
        if (cancelled) return;
        const merged = Array.from(new Set([...(symbolRes.symbols ?? []), ...FIAT_ASSETS, "USDT"]));
        setSymbols(merged);
        setTickers(tickerRes.items ?? []);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load assets");
      } finally {
        if (!cancelled) setLoadingAssets(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [selectedExchange, effectiveSource]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!amount || amount <= 0) {
        setResult(null);
        return;
      }
      if (!fromAsset || !toAsset) return;
      try {
        setLoadingConvert(true);
        setError("");
        const res = await fetchCoinConversion({
          exchange: selectedExchange,
          sourceMode: effectiveSource,
          from: fromAsset,
          to: toAsset,
          amount,
        });
        if (!cancelled) setResult(res);
      } catch (e: any) {
        if (!cancelled) {
          setResult(null);
          setError(e?.message ?? "Conversion failed");
        }
      } finally {
        if (!cancelled) setLoadingConvert(false);
      }
    };
    const timer = window.setTimeout(() => void run(), 260);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [amount, fromAsset, toAsset, selectedExchange, effectiveSource]);

  const filteredSymbols = useMemo(() => {
    const q = search.trim().toUpperCase();
    if (!q) return symbols.slice(0, 300);
    return symbols.filter((s) => s.includes(q)).slice(0, 300);
  }, [search, symbols]);

  const tickerMap = useMemo(() => {
    const map = new Map<string, { price: number; change24hPct: number }>();
    tickers.forEach((t) => map.set(t.symbol, { price: t.price, change24hPct: t.change24hPct }));
    return map;
  }, [tickers]);

  const fromTicker = tickerMap.get(fromAsset);
  const toTicker = tickerMap.get(toAsset);
  const sourceLabel = result?.sourceUsed === "FALLBACK_API" ? "Bitrium Labs API" : selectedExchange;

  const usdEquivalent = result ? result.pricing.converted * result.pricing.toUsdPrice : 0;
  const eurEquivalent = result ? usdEquivalent * result.fx.EUR : 0;
  const tryEquivalent = result ? usdEquivalent * result.fx.TRY : 0;

  return (
    <main className="min-h-screen bg-[#0B0B0C] p-4 text-[#BFC2C7] md:p-6">
      <div className="mx-auto max-w-[1560px] space-y-4">
        <section className={cardClass}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-white">Coin Calculator</h1>
              <p className="text-xs text-[#6B6F76]">Convert crypto-to-crypto and crypto-to-fiat with live market pricing.</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-[#0F1012] px-3 py-2 text-xs">
              <span className="text-[#8d95a5]">Source: </span>
              <span className="text-white">{sourceLabel}</span>
            </div>
          </div>
        </section>

        <section className={`${cardClass} grid gap-4 xl:grid-cols-[1.2fr_1fr]`}>
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr]">
              <label className="space-y-1">
                <span className="text-xs text-[#8e95a3]">From</span>
                <select
                  value={fromAsset}
                  onChange={(e) => setFromAsset(e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-[#0F1012] px-3 py-2 text-sm text-[#E7E9ED] outline-none focus:border-[#F5C542]/50"
                >
                  {filteredSymbols.map((sym) => (
                    <option key={`from-${sym}`} value={sym}>
                      {sym}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={() => {
                  setFromAsset(toAsset);
                  setToAsset(fromAsset);
                }}
                className="mt-6 h-10 rounded-lg border border-white/15 bg-[#0F1012] px-3 text-sm text-white hover:bg-[#17191d]"
              >
                ⇄
              </button>

              <label className="space-y-1">
                <span className="text-xs text-[#8e95a3]">To</span>
                <select
                  value={toAsset}
                  onChange={(e) => setToAsset(e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-[#0F1012] px-3 py-2 text-sm text-[#E7E9ED] outline-none focus:border-[#F5C542]/50"
                >
                  {filteredSymbols.map((sym) => (
                    <option key={`to-${sym}`} value={sym}>
                      {sym}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_1fr]">
              <label className="space-y-1">
                <span className="text-xs text-[#8e95a3]">Amount</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={Number.isFinite(amount) ? amount : 0}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="w-full rounded-lg border border-white/15 bg-[#0F1012] px-3 py-2 text-sm text-white outline-none focus:border-[#F5C542]/50"
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs text-[#8e95a3]">Asset Search</span>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="BTC, ETH, SOL, USD..."
                  className="w-full rounded-lg border border-white/15 bg-[#0F1012] px-3 py-2 text-sm text-white outline-none placeholder:text-[#6B6F76] focus:border-[#F5C542]/50"
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              {["BTC", "ETH", "SOL", "BNB", "XRP", "USDT", "USD", "EUR", "TRY"].map((asset) => (
                <button
                  key={asset}
                  type="button"
                  onClick={() => setFromAsset(asset)}
                  className={`rounded-md border px-2.5 py-1 text-xs ${
                    fromAsset === asset
                      ? "border-[#F5C542]/70 bg-[#2b2417] text-[#F5C542]"
                      : "border-white/15 bg-[#111215] text-[#BFC2C7] hover:bg-[#17191d]"
                  }`}
                >
                  {asset}
                </button>
              ))}
            </div>

            {error ? (
              <div className="rounded-lg border border-[#704844] bg-[#271a19] px-3 py-2 text-xs text-[#d6b3af]">{error}</div>
            ) : null}
          </div>

          <div className="rounded-xl border border-white/10 bg-[#0F1012] p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-[#8f97a5]">Result</p>
            <div className="mt-2 text-3xl font-semibold text-white">
              {loadingConvert ? "..." : numberFmt(result?.pricing.converted ?? 0, 8)}{" "}
              <span className="text-lg text-[#F5C542]">{toAsset}</span>
            </div>
            <p className="mt-1 text-xs text-[#8f97a5]">
              1 {fromAsset} = {numberFmt(result?.pricing.rate ?? 0, 8)} {toAsset}
            </p>
            <p className="text-xs text-[#8f97a5]">
              1 {toAsset} = {numberFmt(result?.pricing.inverseRate ?? 0, 8)} {fromAsset}
            </p>

            <div className="mt-4 grid gap-2 text-sm">
              <div className="rounded-lg border border-white/10 bg-[#121316] px-3 py-2">
                <p className="text-xs text-[#8f97a5]">USD Equivalent</p>
                <p className="font-semibold text-white">${numberFmt(usdEquivalent, 2)}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-[#121316] px-3 py-2">
                <p className="text-xs text-[#8f97a5]">EUR Equivalent</p>
                <p className="font-semibold text-white">€{numberFmt(eurEquivalent, 2)}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-[#121316] px-3 py-2">
                <p className="text-xs text-[#8f97a5]">TRY Equivalent</p>
                <p className="font-semibold text-white">₺{numberFmt(tryEquivalent, 2)}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <article className={cardClass}>
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8f97a5]">Live Asset Snapshot</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-white/10 bg-[#0F1012] p-3">
                <p className="text-xs text-[#8f97a5]">{fromAsset} / USDT</p>
                <p className="mt-1 text-lg font-semibold text-white">
                  {fromTicker ? numberFmt(fromTicker.price, 8) : "N/A"}
                </p>
                <p className={`text-xs ${fromTicker && fromTicker.change24hPct >= 0 ? "text-[#43d19e]" : "text-[#de7575]"}`}>
                  {fromTicker ? `${numberFmt(fromTicker.change24hPct, 2)}%` : "-"}
                </p>
              </div>
              <div className="rounded-lg border border-white/10 bg-[#0F1012] p-3">
                <p className="text-xs text-[#8f97a5]">{toAsset} / USDT</p>
                <p className="mt-1 text-lg font-semibold text-white">
                  {toTicker ? numberFmt(toTicker.price, 8) : FIAT_ASSETS.includes(toAsset as any) || toAsset === "USD" ? "FX" : "N/A"}
                </p>
                <p className={`text-xs ${toTicker && toTicker.change24hPct >= 0 ? "text-[#43d19e]" : "text-[#de7575]"}`}>
                  {toTicker ? `${numberFmt(toTicker.change24hPct, 2)}%` : "-"}
                </p>
              </div>
            </div>
          </article>

          <article className={cardClass}>
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8f97a5]">FX Rates (USD Base)</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg border border-white/10 bg-[#0F1012] p-3">
                <p className="text-xs text-[#8f97a5]">USD</p>
                <p className="text-base font-semibold text-white">{numberFmt(result?.fx.USD ?? 1, 4)}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-[#0F1012] p-3">
                <p className="text-xs text-[#8f97a5]">EUR</p>
                <p className="text-base font-semibold text-white">{numberFmt(result?.fx.EUR ?? 0, 4)}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-[#0F1012] p-3">
                <p className="text-xs text-[#8f97a5]">TRY</p>
                <p className="text-base font-semibold text-white">{numberFmt(result?.fx.TRY ?? 0, 4)}</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-[#6B6F76]">
              {loadingAssets ? "Loading assets..." : `Loaded assets: ${symbols.length}`}
              {result ? ` · Updated: ${new Date(result.fetchedAt).toLocaleTimeString()}` : ""}
            </p>
          </article>
        </section>
      </div>
    </main>
  );
}

