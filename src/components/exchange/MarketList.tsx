import { useMemo, useState } from "react";
import { useExchangeTerminalStore } from "../../hooks/useExchangeTerminalStore";

const compact = (v: number) => (v > 1_000_000_000 ? `${(v / 1_000_000_000).toFixed(2)}B` : `${(v / 1_000_000).toFixed(2)}M`);

export const MarketList = () => {
  const { tickers, selectedSymbol, setSelectedSymbol } = useExchangeTerminalStore();
  const [search, setSearch] = useState("");
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});

  const rows = useMemo(() => tickers.filter((t) => t.symbol.toLowerCase().includes(search.toLowerCase())), [tickers, search]);

  return (
    <section className="rounded-xl border border-white/10 bg-[#121316]">
      <div className="border-b border-white/10 p-2">
        <input
          className="w-full rounded border border-white/15 bg-[#0F1012] px-2 py-1.5 text-xs text-[#E7E9ED]"
          placeholder="Search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="max-h-[300px] overflow-auto">
        <table className="min-w-full">
          <thead className="sticky top-0 bg-[#0F1012]">
            <tr className="text-[10px] uppercase tracking-wider text-[#6B6F76]">
              <th className="px-2 py-1 text-left">Pair</th>
              <th className="px-2 py-1 text-right">Last Price / 24h Chg</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.symbol}
                className={`cursor-pointer border-b border-white/5 text-xs hover:bg-[#17191d] ${selectedSymbol === row.symbol ? "bg-[#17191d]" : ""}`}
                onClick={() => setSelectedSymbol(row.symbol)}
              >
                <td className="px-2 py-1.5">
                  <button
                    type="button"
                    className={`mr-1 ${favorites[row.symbol] ? "text-[#F5C542]" : "text-[#6B6F76]"}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setFavorites((prev) => ({ ...prev, [row.symbol]: !prev[row.symbol] }));
                    }}
                  >
                    {favorites[row.symbol] ? "★" : "☆"}
                  </button>
                  {row.symbol}
                </td>
                <td className="px-2 py-1.5 text-right">
                  <div className="text-[#E7E9ED]">{row.lastPrice.toLocaleString()}</div>
                  <div className={row.change24hPct >= 0 ? "text-[#8fc9ab]" : "text-[#d49f9a]"}>{row.change24hPct.toFixed(2)}%</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-white/10 px-2 py-1 text-[10px] text-[#6B6F76]">24h vol snapshot: {compact(rows.reduce((s, r) => s + r.volume24h, 0))}</div>
    </section>
  );
};

