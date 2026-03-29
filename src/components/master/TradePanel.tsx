import { useState, useMemo } from "react";

interface TradePanelProps {
  currentPrice: number;
  symbol: string;
}

export const TradePanel = ({ currentPrice, symbol }: TradePanelProps) => {
  const [side, setSide] = useState<"LONG" | "SHORT">("LONG");
  const [entryPrice, setEntryPrice] = useState(currentPrice.toFixed(2));
  const [stopLoss, setStopLoss] = useState((currentPrice * 0.97).toFixed(2));
  const [takeProfit, setTakeProfit] = useState((currentPrice * 1.06).toFixed(2));
  const [accountBalance, setAccountBalance] = useState("10000");
  const [riskPct, setRiskPct] = useState("2");

  const entry = parseFloat(entryPrice) || 0;
  const sl = parseFloat(stopLoss) || 0;
  const tp = parseFloat(takeProfit) || 0;
  const balance = parseFloat(accountBalance) || 0;
  const risk = parseFloat(riskPct) || 0;

  const calc = useMemo(() => {
    const slDist = Math.abs(entry - sl);
    const tpDist = Math.abs(tp - entry);
    const rr = slDist > 0 ? tpDist / slDist : 0;
    const riskAmount = balance * (risk / 100);
    const positionSize = slDist > 0 ? riskAmount / slDist : 0;
    const positionValue = positionSize * entry;
    const potentialProfit = positionSize * tpDist;
    const potentialLoss = riskAmount;
    return { rr, riskAmount, positionSize, positionValue, potentialProfit, potentialLoss };
  }, [entry, sl, tp, balance, risk]);

  const rrColor = calc.rr >= 3 ? "#2bc48a" : calc.rr >= 2 ? "#F5C542" : calc.rr >= 1 ? "#FF9F43" : "#f6465d";

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/[0.06] bg-[var(--panel)] p-3.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#5B8DEF]/10">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-[#5B8DEF]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 2v20M2 12h20" />
            </svg>
          </div>
          <span className="text-xs font-semibold text-[var(--text)]">Trade Execution</span>
          <span className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[9px] text-[var(--textMuted)]">{symbol}</span>
        </div>
      </div>

      {/* Long / Short Toggle */}
      <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-white/[0.03] p-1">
        <button
          type="button"
          onClick={() => setSide("LONG")}
          className={`rounded-lg py-1.5 text-[11px] font-bold transition-all ${
            side === "LONG"
              ? "bg-[#2bc48a]/20 text-[#2bc48a] shadow-[0_0_12px_rgba(43,196,138,0.1)]"
              : "text-[var(--textMuted)] hover:text-[var(--text)]"
          }`}
        >
          LONG
        </button>
        <button
          type="button"
          onClick={() => setSide("SHORT")}
          className={`rounded-lg py-1.5 text-[11px] font-bold transition-all ${
            side === "SHORT"
              ? "bg-[#f6465d]/20 text-[#f6465d] shadow-[0_0_12px_rgba(246,70,93,0.1)]"
              : "text-[var(--textMuted)] hover:text-[var(--text)]"
          }`}
        >
          SHORT
        </button>
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-3 gap-2">
        <InputField label="Entry Price" value={entryPrice} onChange={setEntryPrice} prefix="$" />
        <InputField label="Stop Loss" value={stopLoss} onChange={setStopLoss} prefix="$" color="#f6465d" />
        <InputField label="Take Profit" value={takeProfit} onChange={setTakeProfit} prefix="$" color="#2bc48a" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <InputField label="Account Balance" value={accountBalance} onChange={setAccountBalance} prefix="$" />
        <InputField label="Risk %" value={riskPct} onChange={setRiskPct} suffix="%" />
      </div>

      {/* R:R Display */}
      <div className="flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2">
        <span className="text-[10px] text-[var(--textMuted)]">Risk / Reward</span>
        <span className="font-mono text-sm font-bold" style={{ color: rrColor }}>
          1 : {calc.rr.toFixed(2)}
        </span>
      </div>

      {/* Calculated Values */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        <CalcRow label="Position Size" value={`${calc.positionSize.toFixed(4)} ${symbol.split("/")[0]}`} />
        <CalcRow label="Position Value" value={`$${calc.positionValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} />
        <CalcRow label="Risk Amount" value={`$${calc.riskAmount.toFixed(2)}`} color="#f6465d" />
        <CalcRow label="Potential Profit" value={`$${calc.potentialProfit.toFixed(2)}`} color="#2bc48a" />
      </div>

      {/* Execute Button */}
      <button
        type="button"
        className={`w-full rounded-xl py-2.5 text-xs font-bold tracking-wide transition-all ${
          side === "LONG"
            ? "bg-[#2bc48a] text-black hover:bg-[#24a775] shadow-[0_0_20px_rgba(43,196,138,0.15)]"
            : "bg-[#f6465d] text-white hover:bg-[#d93a4e] shadow-[0_0_20px_rgba(246,70,93,0.15)]"
        }`}
      >
        {side === "LONG" ? "OPEN LONG" : "OPEN SHORT"} — {symbol}
      </button>
    </div>
  );
};

/* ── Subcomponents ── */

const InputField = ({
  label, value, onChange, prefix, suffix, color,
}: {
  label: string; value: string; onChange: (v: string) => void; prefix?: string; suffix?: string; color?: string;
}) => (
  <label className="space-y-1">
    <span className="text-[10px] text-[var(--textMuted)]">{label}</span>
    <div className="flex items-center rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 py-1.5">
      {prefix && <span className="mr-1 text-[10px] text-[var(--textSubtle)]">{prefix}</span>}
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-transparent font-mono text-[11px] text-[var(--text)] outline-none"
        style={color ? { color } : undefined}
      />
      {suffix && <span className="ml-1 text-[10px] text-[var(--textSubtle)]">{suffix}</span>}
    </div>
  </label>
);

const CalcRow = ({ label, value, color }: { label: string; value: string; color?: string }) => (
  <div className="flex items-center justify-between">
    <span className="text-[10px] text-[var(--textMuted)]">{label}</span>
    <span className="font-mono text-[10px] font-semibold" style={{ color: color ?? "var(--text)" }}>{value}</span>
  </div>
);
