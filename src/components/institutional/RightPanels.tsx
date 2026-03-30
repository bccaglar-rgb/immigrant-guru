import { SectionHead } from "./MultiTimeframePanel";
import { LWChart, type OHLCVData } from "../shared/LWChart";

/* ── BTC Mini Chart ── */

export const BTCChart = ({ data }: { data: OHLCVData[] }) => {
  const last = data[data.length - 1], prev = data[data.length - 2];
  const pct = prev ? ((last.close - prev.close) / prev.close) * 100 : 0, up = pct >= 0;

  return (
    <div className="rounded-2xl border border-white/[0.04] bg-white/[0.015] overflow-hidden">
      <div className="flex items-center justify-between px-2.5 py-1 border-b border-white/[0.04]">
        <div className="flex items-center gap-1.5"><span className="text-[9px] font-bold text-[var(--text)]">BTC/USDT</span><span className="rounded bg-white/[0.05] px-1 py-px font-mono text-[9px] text-[var(--textMuted)]">1m</span></div>
        <div className="flex items-center gap-1.5">
          <span className={`font-mono text-[9px] font-bold ${up ? "text-[#2bc48a]" : "text-[#f6465d]"}`}>${last?.close.toLocaleString()}</span>
          <span className={`rounded-full px-1 py-px font-mono text-[9px] font-bold ${up ? "bg-[#2bc48a]/10 text-[#2bc48a]" : "bg-[#f6465d]/10 text-[#f6465d]"}`}>{up ? "+" : ""}{pct.toFixed(2)}%</span>
        </div>
      </div>
      <div className="h-20">
        <LWChart data={data} compact showVolume={false} showIndicators={false} />
      </div>
    </div>
  );
};

/* ── Market Intelligence Feed ── */
interface IntelProps { intel: typeof import("./mockData").marketIntel }
export const MarketIntelFeed = ({ intel }: IntelProps) => {
  const tc = intel.btcTrend === "Bullish" ? "#2bc48a" : intel.btcTrend === "Bearish" ? "#f6465d" : "#F5C542";
  const rc = intel.riskMode === "Risk-On" ? "#2bc48a" : "#f6465d";
  return (
    <div className="rounded-2xl border border-white/[0.04] bg-white/[0.015] p-2.5 space-y-1.5">
      <SectionHead icon={<svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>} label="Intelligence" color="#FF9F43" />
      <div className="grid grid-cols-2 gap-1">
        <KV l="BTC" v={intel.btcTrend} c={tc} /><KV l="Risk" v={intel.riskMode} c={rc} /><KV l="Dom" v={intel.dominance} /><KV l="Regime" v={intel.regime.split(" ")[0]} />
      </div>
      <IB l="Cross-Asset" t={intel.crossAsset} />
      <IB l="Liquidity" t={intel.liquidity} />
      <IB l="Macro" t={intel.macro} />
      <div className="rounded-lg border border-[#F5C542]/10 bg-[#F5C542]/[0.02] px-2 py-1.5">
        <span className="text-[9px] font-bold text-[#F5C542] uppercase tracking-wider">AI Narrative</span>
        <p className="mt-0.5 text-[9px] leading-relaxed text-[var(--textMuted)]">{intel.narrative}</p>
      </div>
    </div>
  );
};

/* ── Structure + Levels ── */
interface LvlProps { data: typeof import("./mockData").levels }
export const StructureLevelsPanel = ({ data }: LvlProps) => (
  <div className="rounded-2xl border border-white/[0.04] bg-white/[0.015] p-2.5 space-y-1.5">
    <SectionHead icon={<svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3h18v18H3z" /><path d="M3 12h18M12 3v18" /></svg>} label="Structure & Levels" color="#FF9F43" />
    <div className="space-y-0.5"><span className="text-[9px] font-bold text-[#f6465d] uppercase">Resistance</span>
      {data.resistances.map((l, i) => <LR key={i} p={l.price} lbl={l.label} s={l.strength} c="#f6465d" htf={l.htf} />)}</div>
    <div className="space-y-0.5"><span className="text-[9px] font-bold text-[#2bc48a] uppercase">Support</span>
      {data.supports.map((l, i) => <LR key={i} p={l.price} lbl={l.label} s={l.strength} c="#2bc48a" htf={l.htf} />)}</div>
    <div className="flex items-center justify-between rounded-lg bg-[#f6465d]/[0.05] px-2 py-1">
      <span className="text-[9px] font-bold text-[#f6465d]">INVALIDATION</span>
      <span className="font-mono text-[9px] font-bold text-[#f6465d]">${data.invalidation.toFixed(2)}</span>
    </div>
    <div className="grid grid-cols-3 gap-1">
      <KV l="Pivot R1" v={`$${data.pivots.r1}`} c="#f6465d" /><KV l="PP" v={`$${data.pivots.pp}`} /><KV l="Pivot S1" v={`$${data.pivots.s1}`} c="#2bc48a" />
    </div>
    <KV l="VWAP" v={data.vwapRelation} c={data.vwapRelation === "Above" ? "#2bc48a" : "#f6465d"} />
    <div className="space-y-0.5"><span className="text-[9px] font-bold text-[#5B8DEF] uppercase">Liquidity</span>
      {data.liquidityZones.map((z, i) => (
        <div key={i} className="flex items-center justify-between py-px">
          <div className="flex items-center gap-1"><span className={`h-1 w-1 rounded-full ${z.side === "buy" ? "bg-[#2bc48a]" : "bg-[#f6465d]"}`} /><span className="font-mono text-[9px] text-[var(--text)]">${z.price}</span></div>
          <span className="text-[9px] text-[var(--textSubtle)]">{z.side.toUpperCase()} · {z.magnitude}</span>
        </div>
      ))}
    </div>
    <div className="space-y-0.5"><span className="text-[9px] font-bold text-[var(--textSubtle)] uppercase">Imbalances</span>
      {data.imbalances.map((z, i) => (
        <div key={i} className="flex items-center justify-between py-px">
          <span className="font-mono text-[9px] text-[var(--textMuted)]">${z.from} — ${z.to}</span>
          <span className={`text-[9px] font-bold ${z.status === "Open" ? "text-[#F5C542]" : "text-[var(--textSubtle)]"}`}>{z.status}</span>
        </div>
      ))}
    </div>
  </div>
);

/* ── Alert Matrix ── */
interface AlertProps { alerts: typeof import("./mockData").alerts }
export const AlertMatrixPanel = ({ alerts }: AlertProps) => {
  const sevS: Record<string, { dot: string; bl: string }> = { high: { dot: "bg-[#f6465d] animate-pulse", bl: "border-l-[#f6465d]" }, medium: { dot: "bg-[#F5C542]", bl: "border-l-[#F5C542]" }, low: { dot: "bg-[#5B8DEF]", bl: "border-l-[#5B8DEF]" } };
  return (
    <div className="rounded-2xl border border-white/[0.04] bg-white/[0.015] p-2.5 space-y-1.5">
      <SectionHead icon={<svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>} label="Alerts" color="#f6465d"
        right={<span className="rounded-full bg-[#f6465d]/10 px-1 py-px text-[9px] font-bold text-[#f6465d]">{alerts.filter(a => a.sev === "high").length} HIGH</span>} />
      {alerts.map((a, i) => { const s = sevS[a.sev]; return (
        <div key={i} className={`flex items-start gap-1.5 rounded-lg border-l-2 bg-black/20 px-2 py-1 ${s.bl}`}>
          <span className={`mt-[3px] h-1 w-1 flex-shrink-0 rounded-full ${s.dot}`} />
          <span className="flex-1 text-[9px] text-[var(--text)] truncate">{a.text}</span>
          <span className="flex-shrink-0 text-[9px] text-[var(--textSubtle)]">{a.time}</span>
        </div>
      ); })}
    </div>
  );
};

/* ── Session + Sentiment + Exec Quality ── */
interface BottomProps { session: typeof import("./mockData").session; sentiment: typeof import("./mockData").sentiment; execQuality: typeof import("./mockData").execQuality }
export const BottomStrip = ({ session, sentiment, execQuality }: BottomProps) => {
  const fgc = (v: number) => v <= 25 ? "#f6465d" : v <= 45 ? "#FF9F43" : v <= 55 ? "#F5C542" : v <= 75 ? "#8fc9ab" : "#2bc48a";
  return (
    <div className="rounded-2xl border border-white/[0.04] bg-white/[0.015] p-2.5 space-y-1.5">
      <div className="grid grid-cols-3 gap-2">
        {/* Session */}
        <div className="space-y-1">
          <span className="text-[9px] font-bold text-[var(--accent)] uppercase">Session: {session.name}</span>
          <div className="grid grid-cols-2 gap-1"><KV l="Vol" v={`${session.volatility}`} c={session.volatility > 60 ? "#FF9F43" : "#8A8F98"} /><KV l="Bias" v={session.bias} c={session.bias === "Bullish" ? "#2bc48a" : "#f6465d"} /><KV l="H" v={`$${session.high}`} c="#2bc48a" /><KV l="L" v={`$${session.low}`} c="#f6465d" /></div>
        </div>
        {/* Sentiment */}
        <div className="space-y-1">
          <span className="text-[9px] font-bold text-[#8fc9ab] uppercase">Sentiment</span>
          <div className="grid grid-cols-2 gap-1"><KV l="F&G" v={`${sentiment.fearGreed} ${sentiment.label}`} c={fgc(sentiment.fearGreed)} /><KV l="Crowd" v={`${sentiment.crowdBias}% ${sentiment.crowdDir}`} c={sentiment.crowdDir === "Long" ? "#2bc48a" : "#f6465d"} /></div>
          <span className="text-[9px] text-[var(--textSubtle)]">Contrarian: {sentiment.contrarian}</span>
        </div>
        {/* Exec Quality */}
        <div className="space-y-1">
          <span className="text-[9px] font-bold text-[#5B8DEF] uppercase">Exec Quality</span>
          <div className="grid grid-cols-2 gap-1"><KV l="Slip" v={execQuality.slippage} /><KV l="Fill" v={execQuality.fillQuality} c="#2bc48a" /><KV l="Lat" v={execQuality.latency} /><KV l="E[Move]" v={execQuality.expectedMove} /></div>
        </div>
      </div>
    </div>
  );
};

/* ── Helpers ── */
const KV = ({ l, v, c }: { l: string; v: string; c?: string }) => (
  <div className="rounded bg-black/20 px-1.5 py-0.5"><div className="text-[9px] text-[var(--textSubtle)]">{l}</div><div className="text-[9px] font-bold" style={{ color: c ?? "var(--text)" }}>{v}</div></div>
);
const IB = ({ l, t }: { l: string; t: string }) => (
  <div className="rounded-lg bg-black/20 px-2 py-1"><span className="text-[9px] font-bold text-[var(--textSubtle)] uppercase">{l}</span><p className="text-[9px] text-[var(--textMuted)]">{t}</p></div>
);
const LR = ({ p, lbl, s, c, htf }: { p: number; lbl: string; s: number; c: string; htf: boolean }) => (
  <div className="flex items-center justify-between py-px">
    <div className="flex items-center gap-1"><span className="rounded px-0.5 py-px text-[9px] font-bold" style={{ color: c, background: `${c}12` }}>{htf ? "HTF" : "LTF"}</span><span className="font-mono text-[9px] text-[var(--text)]">${p.toFixed(2)}</span></div>
    <div className="flex items-center gap-1"><span className="text-[9px] text-[var(--textSubtle)]">{lbl}</span><div className="h-[3px] w-6 rounded-full bg-white/[0.05]"><div className="h-full rounded-full" style={{ width: `${s}%`, background: c }} /></div></div>
  </div>
);
