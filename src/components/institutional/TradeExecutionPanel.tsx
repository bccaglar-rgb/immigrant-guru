import { useState, useMemo } from "react";
import { SectionHead } from "./MultiTimeframePanel";

interface Props { price: number; symbol: string }

export const TradeExecutionPanel = ({ price, symbol }: Props) => {
  const [side, setSide] = useState<"LONG" | "SHORT">("LONG");
  const [entry, setEntry] = useState(price.toFixed(2));
  const [sl, setSl] = useState((price * 0.97).toFixed(2));
  const [tp1, setTp1] = useState((price * 1.025).toFixed(2));
  const [tp2, setTp2] = useState((price * 1.045).toFixed(2));
  const [tp3, setTp3] = useState((price * 1.075).toFixed(2));
  const [bal, setBal] = useState("25000");
  const [riskPct, setRiskPct] = useState("1.5");
  const [slMode, setSlMode] = useState<"structure" | "atr" | "liquidity">("structure");

  const e = parseFloat(entry) || 0, s = parseFloat(sl) || 0;
  const t1 = parseFloat(tp1) || 0, t2 = parseFloat(tp2) || 0, t3 = parseFloat(tp3) || 0;
  const b = parseFloat(bal) || 0, rp = parseFloat(riskPct) || 0;

  const calc = useMemo(() => {
    const sd = Math.abs(e - s), ra = b * (rp / 100), ps = sd > 0 ? ra / sd : 0;
    return { sd, ra, ps, pv: ps * e, rr1: sd > 0 ? Math.abs(t1 - e) / sd : 0, rr2: sd > 0 ? Math.abs(t2 - e) / sd : 0, rr3: sd > 0 ? Math.abs(t3 - e) / sd : 0 };
  }, [e, s, t1, t2, t3, b, rp]);

  const rc = (r: number) => r >= 3 ? "#2bc48a" : r >= 2 ? "#F5C542" : r >= 1 ? "#FF9F43" : "#f6465d";

  return (
    <div className="rounded-2xl border border-white/[0.04] bg-white/[0.015] p-2.5 space-y-2">
      <SectionHead icon={<svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M2 12h20" /></svg>} label="Execution" color="#5B8DEF"
        right={<span className="rounded bg-white/[0.05] px-1.5 py-0.5 text-[9px] text-[var(--textMuted)]">{symbol}</span>} />

      {/* Side */}
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-black/30 p-0.5">
        {(["LONG", "SHORT"] as const).map((sd) => (
          <button key={sd} type="button" onClick={() => setSide(sd)}
            className={`rounded py-1 text-[9px] font-bold transition ${side === sd ? sd === "LONG" ? "bg-[#2bc48a]/15 text-[#2bc48a]" : "bg-[#f6465d]/15 text-[#f6465d]" : "text-[var(--textSubtle)]"}`}>{sd}</button>
        ))}
      </div>

      {/* Entry + SL */}
      <div className="grid grid-cols-2 gap-1"><In l="Entry" v={entry} set={setEntry} p="$" /><In l={`SL (${slMode})`} v={sl} set={setSl} p="$" c="#f6465d" /></div>

      {/* SL Mode */}
      <div className="flex gap-0.5">
        {(["structure", "atr", "liquidity"] as const).map((m) => (
          <button key={m} type="button" onClick={() => setSlMode(m)}
            className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${slMode === m ? "bg-white/10 text-[var(--text)]" : "text-[var(--textSubtle)]"}`}>{m.charAt(0).toUpperCase() + m.slice(1)}</button>
        ))}
      </div>

      {/* Multi-TP */}
      <div className="grid grid-cols-3 gap-1">
        <In l="TP1 Conservative" v={tp1} set={setTp1} p="$" c="#2bc48a" />
        <In l="TP2 Balanced" v={tp2} set={setTp2} p="$" c="#2bc48a" />
        <In l="TP3 Aggressive" v={tp3} set={setTp3} p="$" c="#2bc48a" />
      </div>

      {/* Account */}
      <div className="grid grid-cols-2 gap-1"><In l="Account" v={bal} set={setBal} p="$" /><In l="Risk" v={riskPct} set={setRiskPct} s="%" /></div>

      {/* Calcs */}
      <div className="grid grid-cols-4 gap-1.5 rounded-lg bg-black/25 px-2 py-1.5">
        <CV l="Risk $" v={`$${calc.ra.toFixed(0)}`} c="#f6465d" />
        <CV l="Size" v={calc.ps.toFixed(2)} />
        <CV l="Exposure" v={`$${calc.pv.toFixed(0)}`} />
        <CV l="Leverage" v={calc.pv > 0 ? `${(calc.pv / b).toFixed(1)}x` : "—"} />
        <CV l="R:R TP1" v={`1:${calc.rr1.toFixed(1)}`} c={rc(calc.rr1)} />
        <CV l="R:R TP2" v={`1:${calc.rr2.toFixed(1)}`} c={rc(calc.rr2)} />
        <CV l="R:R TP3" v={`1:${calc.rr3.toFixed(1)}`} c={rc(calc.rr3)} />
        <CV l="R Multiple" v={`${calc.rr3.toFixed(1)}R`} c={rc(calc.rr3)} />
      </div>

      {/* Trade Plan */}
      <div className="rounded-lg border border-[#F5C542]/10 bg-[#F5C542]/[0.02] px-2 py-1.5">
        <span className="text-[9px] font-bold text-[#F5C542] uppercase tracking-wider">Trade Plan</span>
        <p className="mt-0.5 text-[9px] leading-relaxed text-[var(--textMuted)]">
          {side} {symbol} @ ${entry} | SL ${sl} ({slMode}) | TP1 ${tp1} TP2 ${tp2} TP3 ${tp3} | Risk {riskPct}% (${ calc.ra.toFixed(0)}) | R {calc.rr1.toFixed(1)}–{calc.rr3.toFixed(1)}
        </p>
      </div>

      {/* Buttons */}
      <div className="grid grid-cols-4 gap-1">
        {[{ l: "LONG", c: "#2bc48a", a: side === "LONG" }, { l: "SHORT", c: "#f6465d", a: side === "SHORT" }, { l: "SCALE", c: "#5B8DEF" }, { l: "CLOSE", c: "#FF9F43" }].map((b) => (
          <button key={b.l} type="button" className="rounded-lg py-1.5 text-[9px] font-bold tracking-wide transition"
            style={{ background: b.a ? `${b.c}18` : "rgba(255,255,255,0.02)", color: b.a ? b.c : "var(--textSubtle)", border: `1px solid ${b.a ? `${b.c}35` : "rgba(255,255,255,0.04)"}` }}>{b.l}</button>
        ))}
      </div>
    </div>
  );
};

const In = ({ l, v, set, p, s, c }: { l: string; v: string; set: (v: string) => void; p?: string; s?: string; c?: string }) => (
  <label className="space-y-0.5">
    <span className="text-[9px] text-[var(--textSubtle)]">{l}</span>
    <div className="flex items-center rounded border border-white/[0.05] bg-black/20 px-1.5 py-1">
      {p && <span className="mr-0.5 text-[9px] text-[var(--textSubtle)]">{p}</span>}
      <input type="text" inputMode="decimal" value={v} onChange={(e) => set(e.target.value)} className="w-full bg-transparent font-mono text-[9px] outline-none" style={{ color: c ?? "var(--text)" }} />
      {s && <span className="ml-0.5 text-[9px] text-[var(--textSubtle)]">{s}</span>}
    </div>
  </label>
);

const CV = ({ l, v, c }: { l: string; v: string; c?: string }) => (
  <div className="text-center"><div className="text-[9px] text-[var(--textSubtle)]">{l}</div><div className="font-mono text-[9px] font-bold" style={{ color: c ?? "var(--text)" }}>{v}</div></div>
);
