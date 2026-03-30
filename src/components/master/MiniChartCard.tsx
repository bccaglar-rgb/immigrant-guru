import { useLiveMarketData } from "../../hooks/useLiveMarketData";
import { LWChart, type OHLCVData } from "../shared/LWChart";

/* ── Mock struct / momentum / state data per coin ── */
const coinMeta: Record<string, { struct: string; structColor: string; mom: string; momColor: string; state: string; stateColor: string }> = {
  SOLUSDT:   { struct: "HH/HL", structColor: "#2bc48a", mom: "Building",  momColor: "#2bc48a", state: "Normal",    stateColor: "var(--textMuted)" },
  BTCUSDT:   { struct: "HH/HL", structColor: "#2bc48a", mom: "Strong",    momColor: "#2bc48a", state: "Expansion", stateColor: "#5B8DEF" },
  ETHUSDT:   { struct: "Range", structColor: "#F5C542", mom: "Flat",      momColor: "#F5C542", state: "Normal",    stateColor: "var(--textMuted)" },
  AVAXUSDT:  { struct: "HH/HL", structColor: "#2bc48a", mom: "Building",  momColor: "#2bc48a", state: "Breakout",  stateColor: "#5B8DEF" },
  BNBUSDT:   { struct: "HL",    structColor: "#2bc48a", mom: "Flat",      momColor: "#F5C542", state: "Normal",    stateColor: "var(--textMuted)" },
  ARBUSDT:   { struct: "LL/LH", structColor: "#f6465d", mom: "Fading",    momColor: "#f6465d", state: "Weakness",  stateColor: "#f6465d" },
  DOGEUSDT:  { struct: "LH",    structColor: "#f6465d", mom: "Fading",    momColor: "#f6465d", state: "Normal",    stateColor: "var(--textMuted)" },
  LINKUSDT:  { struct: "HH/HL", structColor: "#2bc48a", mom: "Building",  momColor: "#2bc48a", state: "Normal",    stateColor: "var(--textMuted)" },
  XRPUSDT:   { struct: "Range", structColor: "#F5C542", mom: "Flat",      momColor: "#F5C542", state: "Normal",    stateColor: "var(--textMuted)" },
  DOTUSDT:   { struct: "LL/LH", structColor: "#f6465d", mom: "Weak",      momColor: "#f6465d", state: "Decline",   stateColor: "#f6465d" },
  MATICUSDT: { struct: "HL",    structColor: "#2bc48a", mom: "Building",  momColor: "#2bc48a", state: "Normal",    stateColor: "var(--textMuted)" },
};

const defaultMeta = { struct: "—", structColor: "var(--textMuted)", mom: "—", momColor: "var(--textMuted)", state: "—", stateColor: "var(--textMuted)" };

export function MiniChartCard({
  symbol,
  isActive,
  onClick,
}: {
  symbol: string;
  isActive: boolean;
  onClick: () => void;
}) {
  const { candles1m, currentPrice } = useLiveMarketData(symbol);
  const meta = coinMeta[symbol] ?? defaultMeta;
  const displaySymbol = symbol.replace("USDT", "");

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-lg p-1.5 transition-all ${
        isActive
          ? "border border-[var(--accent)] bg-white/[0.04]"
          : "border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.03]"
      }`}
    >
      {/* Symbol + price header */}
      <div className="flex items-center justify-between mb-0.5 px-0.5">
        <span className="text-[9px] font-bold text-[var(--text)]">{displaySymbol}</span>
        {currentPrice > 0 && (
          <span className="font-mono text-[9px] font-semibold text-[var(--text)]">
            ${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        )}
      </div>

      {/* Mini chart */}
      <div style={{ height: "100px" }}>
        {candles1m.length > 0 ? (
          <LWChart
            data={candles1m as OHLCVData[]}
            compact
            showVolume={false}
            showIndicators={false}
          />
        ) : (
          <div className="h-full flex items-center justify-center">
            <div className="h-4 w-4 rounded-full border border-[var(--textSubtle)] border-t-transparent animate-spin" />
          </div>
        )}
      </div>

      {/* Struct / Mom / State row */}
      <div className="flex items-center gap-1.5 mt-1 px-0.5">
        <div className="flex items-center gap-0.5">
          <span className="text-[8px] text-[var(--textSubtle)]">Struct:</span>
          <span className="font-mono text-[9px] font-semibold" style={{ color: meta.structColor }}>{meta.struct}</span>
        </div>
        <span className="text-[8px] text-[var(--textSubtle)]">|</span>
        <div className="flex items-center gap-0.5">
          <span className="text-[8px] text-[var(--textSubtle)]">Mom:</span>
          <span className="font-mono text-[9px] font-semibold" style={{ color: meta.momColor }}>{meta.mom}</span>
        </div>
        <span className="text-[8px] text-[var(--textSubtle)]">|</span>
        <div className="flex items-center gap-0.5">
          <span className="text-[8px] text-[var(--textSubtle)]">State:</span>
          <span className="font-mono text-[9px] font-semibold" style={{ color: meta.stateColor }}>{meta.state}</span>
        </div>
      </div>
    </button>
  );
}
