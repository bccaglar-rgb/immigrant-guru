import type { FuturesMarketRow, FuturesSortKey } from "../types";
import { useState } from "react";

interface Props {
  items: FuturesMarketRow[];
  loading: boolean;
  sortBy: FuturesSortKey;
  sortDir: "asc" | "desc";
  onSort: (key: FuturesSortKey) => void;
  onToggleFavorite: (symbol: string) => void;
  onRowClick?: (row: FuturesMarketRow) => void;
  favoriteSymbols: Set<string>;
}

const compactUsd = (value: number) => {
  if (value >= 1_000_000_000_000) return `$${(value / 1_000_000_000_000).toFixed(2)}T`;
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
};

const fmtPrice = (value: number) => {
  if (value >= 1000) return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (value >= 1) return `$${value.toLocaleString(undefined, { maximumFractionDigits: 4 })}`;
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 6 })}`;
};

const pctColor = (value: number) => {
  if (value > 0) return "text-[#8fc9ab]";
  if (value < 0) return "text-[#d49f9a]";
  return "text-[#BFC2C7]";
};

const fundingTone = (value: number) => (value > 0 ? "text-[#8fc9ab]" : value < 0 ? "text-[#d49f9a]" : "text-[#BFC2C7]");

const fallbackLogoUrl = (symbol: string) => {
  const base = symbol.toLowerCase().replace(/[0-9]/g, "");
  return `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/${base}.png`;
};

const CoinLogo = ({ baseAsset }: { baseAsset: string }) => {
  const src = fallbackLogoUrl(baseAsset);
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <div className="grid h-5 w-5 place-items-center rounded-full bg-[#1A1B1F] text-[10px] text-[#BFC2C7]">{baseAsset.slice(0, 1)}</div>;
  }

  return (
    <img
      src={src}
      alt={baseAsset}
      className="h-5 w-5 rounded-full object-cover"
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => {
        setFailed(true);
      }}
    />
  );
};

interface Head {
  label: string;
  key?: FuturesSortKey;
  align?: "left" | "right" | "center";
}

const headers: Head[] = [
  { label: "", align: "center" },
  { label: "Symbol", key: "symbol" },
  { label: "Price", key: "price" },
  { label: "24h %", key: "change24hPct" },
  { label: "Volume (24h)", key: "volume24hUsd" },
  { label: "Funding Rate", key: "fundingRate" },
  { label: "Mark Price", key: "markPrice" },
  { label: "Spread (bps)", key: "spreadBps" },
  { label: "Depth", key: "depthUsd" },
  { label: "Imbalance", key: "imbalance" },
];

export const CryptoMarketTable = ({ items, loading, sortBy, sortDir, onSort, onToggleFavorite, onRowClick, favoriteSymbols }: Props) => (
  <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#121316]">
    <div className="overflow-x-auto">
      <table className="min-w-[1100px] border-collapse">
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-white/10 bg-[#0F1012]">
            {headers.map((head, idx) => (
              <th
                key={`${head.label}-${idx}`}
                className={`px-3 py-2 text-xs font-semibold tracking-wider text-[#6B6F76] ${head.align === "right" ? "text-right" : head.align === "center" ? "text-center" : "text-left"}`}
              >
                {head.key ? (
                  <button type="button" className="inline-flex items-center gap-1 uppercase" onClick={() => onSort(head.key!)}>
                    {head.label}
                    <span className={sortBy === head.key ? "text-[#F5C542]" : "text-[#5f6673]"}>
                      {sortBy === head.key ? (sortDir === "asc" ? "\u25B2" : "\u25BC") : "\u2195"}
                    </span>
                  </button>
                ) : (
                  <span className="uppercase">{head.label}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((row) => {
            const isFav = favoriteSymbols.has(row.symbol);
            const fundingPct = row.fundingRate != null ? row.fundingRate * 100 : null;
            return (
              <tr
                key={row.symbol}
                className="border-b border-white/5 text-sm text-[#E7E9ED] transition hover:bg-[#17191d] cursor-pointer"
                onClick={() => onRowClick?.(row)}
              >
                <td className="px-3 py-2 text-center">
                  <button
                    type="button"
                    className={`text-base ${isFav ? "text-[#F5C542]" : "text-[#6B6F76] hover:text-[#BFC2C7]"}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleFavorite(row.symbol);
                    }}
                    aria-label="Toggle favorite"
                  >
                    {isFav ? "\u2605" : "\u2606"}
                  </button>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <CoinLogo baseAsset={row.baseAsset} />
                    <span className="font-semibold text-white">{row.baseAsset}</span>
                    <span className="text-xs text-[#6B6F76]">{row.symbol.replace("USDT", "")}/USDT</span>
                  </div>
                </td>
                <td className="px-3 py-2">{fmtPrice(row.price)}</td>
                <td className={`px-3 py-2 text-sm font-semibold ${pctColor(row.change24hPct)}`}>
                  {row.change24hPct >= 0 ? "+" : ""}{row.change24hPct.toFixed(2)}%
                </td>
                <td className="px-3 py-2">{compactUsd(row.volume24hUsd)}</td>
                <td className={`px-3 py-2 font-semibold ${fundingPct != null ? fundingTone(fundingPct) : "text-[#6B6F76]"}`}>
                  {fundingPct != null ? `${fundingPct >= 0 ? "+" : ""}${fundingPct.toFixed(4)}%` : "\u2014"}
                </td>
                <td className="px-3 py-2 text-[#BFC2C7]">
                  {row.markPrice != null ? fmtPrice(row.markPrice) : "\u2014"}
                </td>
                <td className="px-3 py-2 text-[#BFC2C7]">
                  {row.spreadBps != null ? `${row.spreadBps.toFixed(2)}` : "\u2014"}
                </td>
                <td className="px-3 py-2 text-[#BFC2C7]">
                  {row.depthUsd != null ? compactUsd(row.depthUsd) : "\u2014"}
                </td>
                <td className="px-3 py-2">
                  {row.imbalance != null ? (
                    <span className={row.imbalance > 0 ? "text-[#8fc9ab]" : row.imbalance < 0 ? "text-[#d49f9a]" : "text-[#BFC2C7]"}>
                      {row.imbalance >= 0 ? "+" : ""}{(row.imbalance * 100).toFixed(1)}%
                    </span>
                  ) : "\u2014"}
                </td>
              </tr>
            );
          })}

          {loading
            ? Array.from({ length: 8 }).map((_, idx) => (
                <tr key={`sk-${idx}`} className="border-b border-white/5">
                  {Array.from({ length: 10 }).map((__, cIdx) => (
                    <td key={`sk-${idx}-${cIdx}`} className="px-3 py-3">
                      <div className="h-3 animate-pulse rounded bg-white/10" />
                    </td>
                  ))}
                </tr>
              ))
            : null}
        </tbody>
      </table>
    </div>
  </section>
);
