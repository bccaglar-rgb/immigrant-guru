import { useEffect, useRef, useState } from "react";

const ALL_COINS = [
  "BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT",
  "ADA/USDT", "DOGE/USDT", "AVAX/USDT", "LINK/USDT", "TRX/USDT",
  "DOT/USDT", "MATIC/USDT", "SHIB/USDT", "LTC/USDT", "UNI/USDT",
  "ATOM/USDT", "FIL/USDT", "APT/USDT", "ARB/USDT", "OP/USDT",
  "NEAR/USDT", "SUI/USDT", "SEI/USDT", "INJ/USDT", "TIA/USDT",
  "PEPE/USDT", "WIF/USDT", "FLOKI/USDT", "BONK/USDT", "BOME/USDT",
  "MEME/USDT", "TURBO/USDT", "MOG/USDT",
  "FET/USDT", "AGIX/USDT", "OCEAN/USDT", "RNDR/USDT", "TAO/USDT",
  "WLD/USDT", "ARKM/USDT", "NMR/USDT", "GRT/USDT", "AI16Z/USDT",
  "AAVE/USDT", "MKR/USDT", "CRV/USDT", "COMP/USDT", "SNX/USDT",
  "RUNE/USDT", "IMX/USDT", "SAND/USDT", "MANA/USDT", "AXS/USDT",
  "GALA/USDT", "ENS/USDT", "LDO/USDT", "RPL/USDT", "SSV/USDT",
  "STX/USDT", "ORDI/USDT", "SATS/USDT", "1000SATS/USDT",
  "JTO/USDT", "JUP/USDT", "PYTH/USDT", "W/USDT", "STRK/USDT",
  "PENDLE/USDT", "ENA/USDT", "ETHFI/USDT", "ONDO/USDT",
];

const unique = [...new Set(ALL_COINS)];

interface Props {
  currentSymbol: string;
  onSelect: (symbol: string) => void;
}

export const CoinSelectorMini = ({ currentSymbol, onSelect }: Props) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const filtered = search
    ? unique.filter((s) => s.toLowerCase().includes(search.toLowerCase()))
    : unique;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { setOpen((p) => !p); setSearch(""); }}
        className="flex items-center gap-1 rounded border border-white/10 bg-[#0F1012] px-2 py-0.5 text-[11px] font-semibold text-white hover:border-white/20"
      >
        {currentSymbol}
        <svg className="h-3 w-3 text-[#6B6F76]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-[200px] rounded-lg border border-white/10 bg-[#111318] shadow-xl">
          <div className="p-1.5">
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded border border-white/10 bg-[#0B0C0F] px-2 py-1 text-[11px] text-white placeholder-[#555] outline-none focus:border-[#F5C542]/40"
              autoFocus
            />
          </div>
          <div className="max-h-[240px] overflow-y-auto p-1">
            {filtered.map((symbol) => (
              <button
                key={symbol}
                type="button"
                onClick={() => { onSelect(symbol); setOpen(false); }}
                className={`w-full rounded px-2 py-1 text-left text-[11px] transition ${
                  symbol === currentSymbol
                    ? "bg-[#F5C542]/10 text-[#F5C542]"
                    : "text-[#BFC2C7] hover:bg-white/5"
                }`}
              >
                {symbol}
              </button>
            ))}
            {!filtered.length && (
              <p className="px-2 py-2 text-center text-[10px] text-[#555]">No results</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
