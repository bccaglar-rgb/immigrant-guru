import { useState, useMemo } from "react";

interface Props { currentPrice: number; symbol: string }

export const ExecutionEngine = ({ currentPrice, symbol }: Props) => {
  const [side, setSide] = useState<"LONG" | "SHORT">("LONG");
  const [entry, setEntry] = useState(currentPrice.toFixed(2));
  const [sl, setSl] = useState((currentPrice * 0.97).toFixed(2));
  const [tp1, setTp1] = useState((currentPrice * 1.03).toFixed(2));
  const [tp2, setTp2] = useState((currentPrice * 1.05).toFixed(2));
  const [tp3, setTp3] = useState((currentPrice * 1.08).toFixed(2));
  const [balance, setBalance] = useState("10000");
  const [riskPct, setRiskPct] = useState("2");
  const [slType, setSlType] = useState<"structure" | "volatility" | "liquidity">("structure");

  const e = parseFloat(entry) || 0;
  const s = parseFloat(sl) || 0;
  const t1 = parseFloat(tp1) || 0;
  const t3 = parseFloat(tp3) || 0;
  const bal = parseFloat(balance) || 0;
  const risk = parseFloat(riskPct) || 0;

  const calc = useMemo(() => {
    const slDist = Math.abs(e - s);
    const tp1Dist = Math.abs(t1 - e);
    const tp3Dist = Math.abs(t3 - e);
    const rr1 = slDist > 0 ? tp1Dist / slDist : 0;
    const rr3 = slDist > 0 ? tp3Dist / slDist : 0;
    const riskAmt = bal * (risk / 100);
    const posSize = slDist > 0 ? riskAmt / slDist : 0;
    const posValue = posSize * e;
    return { rr1, rr3, riskAmt, posSize, posValue };
  }, [e, s, t1, t3, bal, risk]);

  const rrColor = (rr: number) => rr >= 3 ? "#2bc48a" : rr >= 2 ? "#F5C542" : rr >= 1 ? "#FF9F43" : "#f6465d";

  return (
    <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-[#5B8DEF]" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M2 12h20" /></svg>
          <span className="text-[10px] font-bold tracking-wider text-[#5B8DEF] uppercase">Execution Engine</span>
        </div>
        <span className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[8px] text-[var(--textMuted)]">{symbol}</span>
      </div>

      {/* Side Toggle */}
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-black/30 p-0.5">
        {(["LONG", "SHORT"] as const).map((s) => (
          <button key={s} type="button" onClick={() => setSide(s)}
            className={`rounded-md py-1 text-[10px] font-bold transition-all ${side === s
              ? s === "LONG" ? "bg-[#2bc48a]/20 text-[#2bc48a]" : "bg-[#f6465d]/20 text-[#f6465d]"
              : "text-[var(--textSubtle)] hover:text-[var(--textMuted)]"}`}>
            {s}
          </button>
        ))}
      </div>

      {/* Entry + SL */}
      <div className="grid grid-cols-2 gap-1.5">
        <Field label="Entry" value={entry} onChange={setEntry} prefix="$" />
        <Field label={`SL (${slType})`} value={sl} onChange={setSl} prefix="$" color="#f6465d" />
      </div>

      {/* SL Type */}
      <div className="flex gap-1">
        {(["structure", "volatility", "liquidity"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setSlType(t)}
            className={`rounded px-2 py-0.5 text-[8px] font-bold transition ${slType === t ? "bg-white/10 text-[var(--text)]" : "text-[var(--textSubtle)] hover:text-[var(--textMuted)]"}`}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Multi-TP */}
      <div className="grid grid-cols-3 gap-1.5">
        <Field label="TP1 (40%)" value={tp1} onChange={setTp1} prefix="$" color="#2bc48a" />
        <Field label="TP2 (35%)" value={tp2} onChange={setTp2} prefix="$" color="#2bc48a" />
        <Field label="TP3 (25%)" value={tp3} onChange={setTp3} prefix="$" color="#2bc48a" />
      </div>

      {/* Account */}
      <div className="grid grid-cols-2 gap-1.5">
        <Field label="Account" value={balance} onChange={setBalance} prefix="$" />
        <Field label="Risk" value={riskPct} onChange={setRiskPct} suffix="%" />
      </div>

      {/* Calculations */}
      <div className="grid grid-cols-3 gap-2 rounded-lg bg-black/20 px-2.5 py-2">
        <CalcItem label="R:R (TP1)" value={`1:${calc.rr1.toFixed(1)}`} color={rrColor(calc.rr1)} />
        <CalcItem label="R:R (TP3)" value={`1:${calc.rr3.toFixed(1)}`} color={rrColor(calc.rr3)} />
        <CalcItem label="Risk $" value={`$${calc.riskAmt.toFixed(0)}`} color="#f6465d" />
        <CalcItem label="Size" value={`${calc.posSize.toFixed(2)}`} />
        <CalcItem label="Exposure" value={`$${calc.posValue.toFixed(0)}`} />
        <CalcItem label="Leverage" value={calc.posValue > 0 ? `${(calc.posValue / bal).toFixed(1)}x` : "—"} />
      </div>

      {/* Trade Plan Summary */}
      <div className="rounded-lg border border-[#F5C542]/10 bg-[#F5C542]/[0.03] px-2.5 py-2">
        <span className="text-[8px] font-bold text-[#F5C542] uppercase tracking-wider">Trade Plan</span>
        <p className="mt-0.5 text-[9px] leading-relaxed text-[var(--textMuted)]">
          {side} {symbol} @ ${entry} | SL ${sl} ({slType}) | TP1 ${tp1} / TP2 ${tp2} / TP3 ${tp3} | Risk ${riskPct}% (${`$${calc.riskAmt.toFixed(0)}`}) | R:R {calc.rr1.toFixed(1)}–{calc.rr3.toFixed(1)}
        </p>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-4 gap-1.5">
        <ActionBtn label="LONG" color="#2bc48a" active={side === "LONG"} />
        <ActionBtn label="SHORT" color="#f6465d" active={side === "SHORT"} />
        <ActionBtn label="SCALE IN" color="#5B8DEF" />
        <ActionBtn label="CLOSE" color="#FF9F43" />
      </div>
    </div>
  );
};

const Field = ({ label, value, onChange, prefix, suffix, color }: {
  label: string; value: string; onChange: (v: string) => void; prefix?: string; suffix?: string; color?: string;
}) => (
  <label className="space-y-0.5">
    <span className="text-[8px] text-[var(--textSubtle)]">{label}</span>
    <div className="flex items-center rounded border border-white/[0.06] bg-black/20 px-1.5 py-1">
      {prefix && <span className="mr-0.5 text-[8px] text-[var(--textSubtle)]">{prefix}</span>}
      <input type="text" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full bg-transparent font-mono text-[10px] outline-none" style={{ color: color ?? "var(--text)" }} />
      {suffix && <span className="ml-0.5 text-[8px] text-[var(--textSubtle)]">{suffix}</span>}
    </div>
  </label>
);

const CalcItem = ({ label, value, color }: { label: string; value: string; color?: string }) => (
  <div className="text-center">
    <div className="text-[7px] text-[var(--textSubtle)]">{label}</div>
    <div className="font-mono text-[10px] font-bold" style={{ color: color ?? "var(--text)" }}>{value}</div>
  </div>
);

const ActionBtn = ({ label, color, active }: { label: string; color: string; active?: boolean }) => (
  <button type="button"
    className="rounded-lg py-1.5 text-[9px] font-bold tracking-wide transition-all"
    style={{
      background: active ? `${color}20` : "rgba(255,255,255,0.03)",
      color: active ? color : "var(--textSubtle)",
      border: `1px solid ${active ? `${color}40` : "rgba(255,255,255,0.05)"}`,
      boxShadow: active ? `0 0 12px ${color}15` : "none",
    }}>
    {label}
  </button>
);
