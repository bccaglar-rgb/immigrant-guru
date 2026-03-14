import type { CoinRow, CryptoSortKey } from "../types";
import { useState } from "react";

interface Props {
  items: CoinRow[];
  loading: boolean;
  sortBy: CryptoSortKey;
  sortDir: "asc" | "desc";
  onSort: (key: CryptoSortKey) => void;
  onToggleFavorite: (id: string) => void;
  onRowClick?: (row: CoinRow) => void;
}

const compactUsd = (value: number) => {
  if (value >= 1_000_000_000_000) return `$${(value / 1_000_000_000_000).toFixed(2)}T`;
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
};

const fmtPrice = (value: number) => {
  if (value >= 1000) return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (value >= 1) return `$${value.toLocaleString(undefined, { maximumFractionDigits: 4 })}`;
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 6 })}`;
};

const pctChip = (value: number) => {
  if (value > 0) return "bg-[#1f251b] text-white border-[#6f765f]";
  if (value < 0) return "bg-[#271a19] text-white border-[#704844]";
  return "bg-[#1A1B1F] text-white border-white/10";
};

const fundingTone = (value: number) => (value > 0 ? "text-[#8fc9ab]" : value < 0 ? "text-[#d49f9a]" : "text-[#BFC2C7]");

const fallbackLogoUrl = (symbol: string) => {
  const base = symbol.toLowerCase().replace(/[0-9]/g, "");
  return `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/${base}.png`;
};

const CoinLogo = ({ symbol, logoUrl }: { symbol: string; logoUrl?: string }) => {
  const [src, setSrc] = useState<string | undefined>(logoUrl);
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return <div className="grid h-5 w-5 place-items-center rounded-full bg-[#1A1B1F] text-[10px] text-[#BFC2C7]">{symbol.slice(0, 1)}</div>;
  }

  return (
    <img
      src={src}
      alt={symbol}
      className="h-5 w-5 rounded-full object-cover"
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => {
        const fallback = fallbackLogoUrl(symbol);
        if (src !== fallback) {
          setSrc(fallback);
          return;
        }
        setFailed(true);
      }}
    />
  );
};

interface Head {
  label: string;
  key?: CryptoSortKey;
  align?: "left" | "right" | "center";
}

const headers: Head[] = [
  { label: "", align: "center" },
  { label: "Ranking", key: "rank" },
  { label: "Symbol", key: "symbol" },
  { label: "Price", key: "price" },
  { label: "Price (24h%)", key: "priceChange24hPct" },
  { label: "Funding Rate", key: "fundingRatePct" },
  { label: "Volume (24h)", key: "volume24hUsd" },
  { label: "Volume (24h%)", key: "volumeChange24hPct" },
  { label: "Market Cap", key: "marketCapUsd" },
  { label: "OI", key: "oiUsd" },
  { label: "OI (1h%)", key: "oiChange1hPct" },
  { label: "OI (24h%)", key: "oiChange24hPct" },
  { label: "Liquidation (24h)", key: "liquidation24hUsd" },
];

export const CryptoMarketTable = ({ items, loading, sortBy, sortDir, onSort, onToggleFavorite, onRowClick }: Props) => (
  <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#121316]">
    <div className="overflow-x-auto">
      <table className="min-w-[1340px] border-collapse">
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
                      {sortBy === head.key ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
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
          {items.map((row) => (
            <tr
              key={row.id}
              className="border-b border-white/5 text-sm text-[#E7E9ED] transition hover:bg-[#17191d]"
              onClick={() => onRowClick?.(row)}
            >
              <td className="px-3 py-2 text-center">
                <button
                  type="button"
                  className={`text-base ${row.isFavorite ? "text-[#F5C542]" : "text-[#6B6F76] hover:text-[#BFC2C7]"}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavorite(row.id);
                  }}
                  aria-label="Toggle favorite"
                >
                  {row.isFavorite ? "★" : "☆"}
                </button>
              </td>
              <td className="px-3 py-2 text-[#BFC2C7]">{row.rank}</td>
              <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                  <CoinLogo symbol={row.symbol} logoUrl={row.logoUrl} />
                  <span className="font-semibold text-white">{row.symbol}</span>
                </div>
              </td>
              <td className="px-3 py-2">{fmtPrice(row.price)}</td>
              <td className="px-3 py-2">
                <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${pctChip(row.priceChange24hPct)}`}>
                  {row.priceChange24hPct >= 0 ? "+" : ""}
                  {row.priceChange24hPct.toFixed(2)}%
                </span>
              </td>
              <td className={`px-3 py-2 font-semibold ${fundingTone(row.fundingRatePct)}`}>
                {row.fundingRatePct >= 0 ? "+" : ""}
                {row.fundingRatePct.toFixed(4)}%
              </td>
              <td className="px-3 py-2">{compactUsd(row.volume24hUsd)}</td>
              <td className="px-3 py-2">
                <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${pctChip(row.volumeChange24hPct)}`}>
                  {row.volumeChange24hPct >= 0 ? "+" : ""}
                  {row.volumeChange24hPct.toFixed(2)}%
                </span>
              </td>
              <td className="px-3 py-2">{compactUsd(row.marketCapUsd)}</td>
              <td className="px-3 py-2">{compactUsd(row.oiUsd)}</td>
              <td className="px-3 py-2">
                <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${pctChip(row.oiChange1hPct)}`}>
                  {row.oiChange1hPct >= 0 ? "+" : ""}
                  {row.oiChange1hPct.toFixed(2)}%
                </span>
              </td>
              <td className="px-3 py-2">
                <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${pctChip(row.oiChange24hPct)}`}>
                  {row.oiChange24hPct >= 0 ? "+" : ""}
                  {row.oiChange24hPct.toFixed(2)}%
                </span>
              </td>
              <td className="px-3 py-2">{compactUsd(row.liquidation24hUsd)}</td>
            </tr>
          ))}

          {loading
            ? Array.from({ length: 8 }).map((_, idx) => (
                <tr key={`sk-${idx}`} className="border-b border-white/5">
                  {Array.from({ length: 13 }).map((__, cIdx) => (
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
