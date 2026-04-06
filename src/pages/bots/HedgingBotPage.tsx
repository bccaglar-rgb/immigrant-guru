import { useState } from "react";
import BotExchangeBar from "../../components/bot/BotExchangeBar";
import { BotProvider } from "../../components/bot/BotContext";
import BotExecutionLog from "../../components/bot/BotExecutionLog";
import BotStrategyChart from "../../components/bot/BotStrategyChart";

/* ── Helpers ── */
const cn = (...cls: (string | false | undefined)[]) => cls.filter(Boolean).join(" ");
const fmt = (n: number, d = 2) => n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtUsd = (n: number) => "$" + fmt(n);

/* ── Mock Data ── */
const PORTFOLIO = [
  { asset: "BTC", side: "LONG" as const, size: 2.5, notional: 237500, entry: 94200, current: 95000, pnl: 2000, pnlPct: 0.84 },
  { asset: "ETH", side: "LONG" as const, size: 15, notional: 52500, entry: 3480, current: 3500, pnl: 300, pnlPct: 0.57 },
  { asset: "SOL", side: "LONG" as const, size: 200, notional: 37400, entry: 185, current: 187, pnl: 400, pnlPct: 1.08 },
];

const HEDGE_POSITIONS = [
  { asset: "BTC", side: "SHORT" as const, size: 1.2, notional: 114000, entry: 95100, current: 95000, pnl: 120, pnlPct: 0.11, status: "Active" as const },
];

const RISK_HISTORY = [
  { time: "14:00", volatility: 1.2, atr: 850, drawdown: -1.1, risk: "LOW" },
  { time: "14:15", volatility: 1.8, atr: 1200, drawdown: -1.8, risk: "MEDIUM" },
  { time: "14:30", volatility: 2.4, atr: 1650, drawdown: -2.5, risk: "MEDIUM" },
  { time: "14:45", volatility: 3.1, atr: 2100, drawdown: -3.2, risk: "HIGH" },
  { time: "15:00", volatility: 3.8, atr: 2400, drawdown: -4.1, risk: "HIGH" },
  { time: "15:15", volatility: 2.9, atr: 1900, drawdown: -3.0, risk: "MEDIUM" },
  { time: "15:30", volatility: 2.1, atr: 1400, drawdown: -2.2, risk: "MEDIUM" },
  { time: "15:45", volatility: 1.5, atr: 980, drawdown: -1.4, risk: "LOW" },
];

/* ── Sub-Components ── */
const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("rounded-xl border border-white/[0.06] bg-white/[0.02] p-4", className)}>{children}</div>
);

const StatBox = ({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) => (
  <div className="rounded-lg border border-white/[0.06] bg-[#0F1012] p-3 text-center">
    <p className="text-[9px] uppercase tracking-wider text-white/30">{label}</p>
    <p className={cn("mt-1 text-[15px] font-bold", color)}>{value}</p>
    {sub && <p className="mt-0.5 text-[9px] text-white/30">{sub}</p>}
  </div>
);

const RiskBadge = ({ level }: { level: string }) => {
  const c = level === "HIGH" || level === "CRITICAL"
    ? "bg-[#f6465d]/10 border-[#f6465d]/30 text-[#f6465d]"
    : level === "MEDIUM"
    ? "bg-[#F5C542]/10 border-[#F5C542]/30 text-[#F5C542]"
    : "bg-[#2bc48a]/10 border-[#2bc48a]/30 text-[#2bc48a]";
  const dot = level === "HIGH" || level === "CRITICAL" ? "#f6465d" : level === "MEDIUM" ? "#F5C542" : "#2bc48a";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase", c)}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />{level}
    </span>
  );
};

const ExposureBar = ({ longPct, hedgePct }: { longPct: number; hedgePct: number }) => {
  const netPct = Math.max(0, longPct - hedgePct);
  return (
    <div className="space-y-1.5">
      {[
        { label: "LONG", pct: longPct, color: "bg-[#2bc48a]", textColor: "text-[#2bc48a]" },
        { label: "HEDGE", pct: hedgePct, color: "bg-[#f6465d]", textColor: "text-[#f6465d]" },
        { label: "NET", pct: netPct, color: "bg-[#5B8DEF]", textColor: "text-[#5B8DEF]" },
      ].map(b => (
        <div key={b.label} className="flex items-center gap-2 text-[10px]">
          <span className="w-12 text-white/40">{b.label}</span>
          <div className="h-3 flex-1 rounded-full bg-white/[0.04] overflow-hidden">
            <div className={cn("h-full rounded-full", b.color)} style={{ width: `${b.pct}%` }} />
          </div>
          <span className={cn("w-10 text-right font-mono", b.textColor)}>{b.pct}%</span>
        </div>
      ))}
    </div>
  );
};

/* ── Main Page ── */
export default function HedgingBotPage() {
  const [botStatus, setBotStatus] = useState<"READY" | "RUNNING" | "PAUSED">("READY");
  const [hedgeMode, setHedgeMode] = useState<"portfolio" | "single">("portfolio");
  const [autoClose, setAutoClose] = useState(true);
  const [hedgeRatio, setHedgeRatio] = useState("1x");
  const [riskTriggerAtr, setRiskTriggerAtr] = useState(2.0);
  const [riskTriggerVol, setRiskTriggerVol] = useState(3.0);
  const [riskTriggerDd, setRiskTriggerDd] = useState(5.0);
  const [maxHedgeSize, setMaxHedgeSize] = useState(100000);

  const totalLongNotional = PORTFOLIO.reduce((s, p) => s + p.notional, 0);
  const totalHedgeNotional = HEDGE_POSITIONS.reduce((s, p) => s + p.notional, 0);
  const hedgePct = totalLongNotional > 0 ? Math.round((totalHedgeNotional / totalLongNotional) * 100) : 0;
  const netExposure = totalLongNotional - totalHedgeNotional;
  const totalPnl = PORTFOLIO.reduce((s, p) => s + p.pnl, 0) + HEDGE_POSITIONS.reduce((s, p) => s + p.pnl, 0);
  const currentRisk = RISK_HISTORY[RISK_HISTORY.length - 1];

  const I = "mt-1 w-full rounded-lg border border-white/10 bg-[#0F1012] px-3 py-2 text-sm text-white outline-none";
  const L = "text-[11px] text-white/40";

  return (
    <BotProvider>
    <div className="flex h-full flex-col overflow-auto bg-[#0B0B0C] text-white">
      <div className="shrink-0 p-4 pb-0">
        <BotExchangeBar botName="Hedging Engine — Portfolio Protection" accentColor="#ef4444" />
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* ── 1. PORTFOLIO EXPOSURE ── */}
        <Card className="border-[#ef4444]/20">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-[16px]">&#128737;</span>
              <h2 className="text-[14px] font-bold">Portfolio Exposure</h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-white/40">Net Direction:</span>
              <span className="rounded-full bg-[#2bc48a]/10 border border-[#2bc48a]/30 px-2 py-0.5 text-[10px] font-bold text-[#2bc48a]">LONG</span>
              <RiskBadge level={currentRisk.risk} />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead><tr className="border-b border-white/[0.04]">
                {["Asset", "Side", "Size", "Notional", "Entry", "Current", "PnL", "PnL %"].map(h => (
                  <th key={h} className="px-2 py-1.5 text-left text-[9px] font-semibold uppercase tracking-wider text-white/30">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {PORTFOLIO.map((p, i) => (
                  <tr key={i} className="border-b border-white/[0.03]">
                    <td className="px-2 py-1.5 text-[11px] font-semibold text-white">{p.asset}</td>
                    <td className="px-2 py-1.5 text-[11px] text-[#2bc48a] font-semibold">{p.side}</td>
                    <td className="px-2 py-1.5 text-[11px] font-mono text-white/70">{p.size}</td>
                    <td className="px-2 py-1.5 text-[11px] font-mono text-white/70">{fmtUsd(p.notional)}</td>
                    <td className="px-2 py-1.5 text-[11px] font-mono text-white/50">{fmtUsd(p.entry)}</td>
                    <td className="px-2 py-1.5 text-[11px] font-mono text-white/70">{fmtUsd(p.current)}</td>
                    <td className={cn("px-2 py-1.5 text-[11px] font-mono font-semibold", p.pnl >= 0 ? "text-[#2bc48a]" : "text-[#f6465d]")}>{p.pnl >= 0 ? "+" : ""}{fmtUsd(p.pnl)}</td>
                    <td className={cn("px-2 py-1.5 text-[11px] font-mono", p.pnlPct >= 0 ? "text-[#2bc48a]" : "text-[#f6465d]")}>{p.pnlPct >= 0 ? "+" : ""}{fmt(p.pnlPct)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-3">
            <StatBox label="Total Long" value={fmtUsd(totalLongNotional)} color="text-[#2bc48a]" />
            <StatBox label="Total Hedge" value={fmtUsd(totalHedgeNotional)} color="text-[#f6465d]" />
            <StatBox label="Net Exposure" value={fmtUsd(netExposure)} color="text-[#5B8DEF]" />
            <StatBox label="Total PnL" value={(totalPnl >= 0 ? "+" : "") + fmtUsd(totalPnl)} color={totalPnl >= 0 ? "text-[#2bc48a]" : "text-[#f6465d]"} />
          </div>
          <div className="mt-3"><ExposureBar longPct={100} hedgePct={hedgePct} /></div>
        </Card>

        {/* ── CHART PREVIEW ── */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[13px] font-bold text-white">Strategy Preview</h2>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[9px] text-white/40">PREVIEW</span>
          </div>
          <BotStrategyChart defaultPair="BTCUSDT" defaultTf="15m" accentColor="#ef4444" />
        </div>

        {/* ── 2. RISK ENGINE + BOT THINKING ── */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-[13px] font-bold">Risk Engine</h3>
              <div className="ml-auto"><RiskBadge level={currentRisk.risk} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <StatBox label="Volatility" value={fmt(currentRisk.volatility) + "%"} color={currentRisk.volatility > 2.5 ? "text-[#f6465d]" : currentRisk.volatility > 1.5 ? "text-[#F5C542]" : "text-[#2bc48a]"} sub={currentRisk.volatility > 2.5 ? "Above threshold" : "Normal"} />
              <StatBox label="ATR (14)" value={fmtUsd(currentRisk.atr)} color={currentRisk.atr > 1500 ? "text-[#f6465d]" : "text-[#F5C542]"} sub="14-period" />
              <StatBox label="Drawdown" value={fmt(currentRisk.drawdown) + "%"} color="text-[#f6465d]" sub="From peak" />
              <StatBox label="Leverage" value="4.5x" color="text-[#F5C542]" sub="Effective" />
            </div>
            <div className="mt-3">
              <p className="text-[9px] uppercase tracking-wider text-white/30 mb-1">Risk Timeline</p>
              <div className="flex gap-1 h-8">
                {RISK_HISTORY.map((r, i) => (
                  <div key={i} className="flex-1 flex flex-col justify-end" title={`${r.time}: ${r.risk}`}>
                    <div className="rounded-sm" style={{ height: `${Math.min(100, r.volatility * 25)}%`, background: r.risk === "HIGH" ? "#f6465d" : r.risk === "MEDIUM" ? "#F5C542" : "#2bc48a" }} />
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-3 rounded-lg border border-[#F5C542]/20 bg-[#F5C542]/5 p-2.5 text-center">
              <p className="text-[10px] text-white/40">Risk Decision</p>
              <p className="text-[14px] font-bold text-[#F5C542]">HEDGE ACTIVE — MONITORING</p>
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-[13px] font-bold">Bot Decision Engine</h3>
              <span className="ml-auto h-2 w-2 rounded-full bg-[#2bc48a] animate-pulse" />
            </div>
            <div className="space-y-2">
              {[
                { label: "Current Exposure", value: "LONG biased", met: true },
                { label: "Market Risk", value: "Decreasing", met: true },
                { label: "Volatility", value: fmt(currentRisk.volatility) + "% (normalizing)", met: currentRisk.volatility < 2.5 },
                { label: "ATR Trigger", value: `${fmtUsd(currentRisk.atr)} vs ${fmtUsd(riskTriggerAtr * 1000)}`, met: currentRisk.atr < riskTriggerAtr * 1000 },
                { label: "Hedge Status", value: `Partial hedge active (${hedgePct}%)`, met: true },
              ].map((c, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg bg-[#0F1012] px-3 py-2">
                  <span className={c.met ? "text-[#2bc48a]" : "text-[#f6465d]"}>{c.met ? "\u2713" : "\u2717"}</span>
                  <span className="text-[11px] text-white/60">{c.label}</span>
                  <span className="ml-auto text-[11px] font-mono text-white/40">{c.value}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-lg bg-[#0F1012] p-3 text-center">
              <p className="text-[9px] uppercase tracking-wider text-white/30">Current Action</p>
              <p className="mt-1 text-[13px] font-bold text-[#2bc48a]">Risk normalizing — monitoring for hedge reduction</p>
            </div>
          </Card>
        </div>

        {/* ── 3. HEDGE POSITIONS + CONTROLS ── */}
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-[13px] font-bold">Active Hedge Positions</h3>
              <span className="rounded-full bg-[#f6465d]/10 border border-[#f6465d]/30 px-2 py-0.5 text-[10px] font-semibold text-[#f6465d]">{HEDGE_POSITIONS.length} active</span>
            </div>
            {HEDGE_POSITIONS.map((h, i) => (
              <div key={i} className="rounded-lg border border-white/[0.06] bg-[#0F1012] p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-bold text-white">{h.asset}</span>
                    <span className="rounded bg-[#f6465d]/20 px-1.5 py-0.5 text-[10px] font-bold text-[#f6465d]">{h.side}</span>
                    <span className="rounded-full bg-[#2bc48a]/10 px-2 py-0.5 text-[9px] font-semibold text-[#2bc48a]">{h.status}</span>
                  </div>
                  <span className={cn("text-[13px] font-bold font-mono", h.pnl >= 0 ? "text-[#2bc48a]" : "text-[#f6465d]")}>+{fmtUsd(h.pnl)}</span>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-2 text-[10px]">
                  <div><span className="text-white/30">Size</span><p className="font-mono text-white/60">{h.size}</p></div>
                  <div><span className="text-white/30">Notional</span><p className="font-mono text-white/60">{fmtUsd(h.notional)}</p></div>
                  <div><span className="text-white/30">Entry</span><p className="font-mono text-white/60">{fmtUsd(h.entry)}</p></div>
                  <div><span className="text-white/30">Protection</span><p className="font-mono text-[#2bc48a]">STRONG</p></div>
                </div>
              </div>
            ))}
          </Card>

          <Card>
            <h3 className="text-[13px] font-bold mb-3">Hedge Controls</h3>
            <div className="space-y-2">
              <button className="w-full rounded-lg bg-[#f6465d] py-2.5 text-[12px] font-bold text-white hover:bg-[#d93a50] transition">Emergency Full Hedge</button>
              <div className="grid grid-cols-2 gap-2">
                <button className="rounded-lg border border-[#2bc48a]/30 bg-[#2bc48a]/10 py-2 text-[11px] font-semibold text-[#2bc48a]">Increase</button>
                <button className="rounded-lg border border-[#F5C542]/30 bg-[#F5C542]/10 py-2 text-[11px] font-semibold text-[#F5C542]">Reduce</button>
              </div>
              <button className="w-full rounded-lg border border-white/10 bg-white/[0.03] py-2 text-[11px] font-semibold text-white/60">Close All Hedges</button>
            </div>
            <div className="mt-4 border-t border-white/[0.06] pt-3 space-y-1.5">
              {[
                { l: "Coverage", v: `${hedgePct}%`, c: "text-[#2bc48a]" },
                { l: "Hedge Cost", v: "-$42/day", c: "text-[#F5C542]" },
                { l: "Protection Since", v: "2h 14m", c: "text-white/60" },
                { l: "Saved PnL", v: "+$1,240", c: "text-[#2bc48a]" },
              ].map(s => (
                <div key={s.l} className="flex justify-between text-[10px]">
                  <span className="text-white/40">{s.l}</span>
                  <span className={cn("font-mono", s.c)}>{s.v}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* ── 4. RISK SETTINGS ── */}
        <Card>
          <h3 className="text-[13px] font-bold mb-3">Risk Settings</h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className={L}>Hedging Mode</label>
              <div className="mt-1 flex gap-1">
                {(["portfolio", "single"] as const).map(m => (
                  <button key={m} onClick={() => setHedgeMode(m)} className={cn("flex-1 rounded-lg border py-2 text-[11px] font-semibold transition", hedgeMode === m ? "border-[#ef4444]/40 bg-[#ef4444]/10 text-[#ef4444]" : "border-white/10 text-white/40")}>{m === "portfolio" ? "Portfolio" : "Single Asset"}</button>
                ))}
              </div>
            </div>
            <div>
              <label className={L}>Hedge Ratio</label>
              <div className="mt-1 flex gap-1">
                {["0.5x", "1x", "1.5x"].map(r => (
                  <button key={r} onClick={() => setHedgeRatio(r)} className={cn("flex-1 rounded-lg border py-2 text-[10px] font-semibold transition", hedgeRatio === r ? "border-[#ef4444]/40 bg-[#ef4444]/10 text-[#ef4444]" : "border-white/10 text-white/40")}>{r}</button>
                ))}
              </div>
            </div>
            <div>
              <label className={L}>Max Hedge Size</label>
              <input type="number" value={maxHedgeSize} onChange={e => setMaxHedgeSize(Number(e.target.value))} className={I} />
            </div>
            <div>
              <label className={L}>Auto Close</label>
              <div className="mt-1 flex gap-1">
                {[true, false].map(v => (
                  <button key={String(v)} onClick={() => setAutoClose(v)} className={cn("flex-1 rounded-lg border py-2 text-[11px] font-semibold transition", autoClose === v ? "border-[#2bc48a]/40 bg-[#2bc48a]/10 text-[#2bc48a]" : "border-white/10 text-white/40")}>{v ? "Auto" : "Manual"}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-4 border-t border-white/[0.06] pt-3">
            <p className="text-[11px] font-semibold text-white/60 mb-2">Risk Triggers</p>
            <div className="grid gap-3 md:grid-cols-3">
              <div><label className={L}>ATR Threshold</label><input type="number" step="0.1" value={riskTriggerAtr} onChange={e => setRiskTriggerAtr(Number(e.target.value))} className={I} /></div>
              <div><label className={L}>Volatility %</label><input type="number" step="0.1" value={riskTriggerVol} onChange={e => setRiskTriggerVol(Number(e.target.value))} className={I} /></div>
              <div><label className={L}>Max Drawdown %</label><input type="number" step="0.1" value={riskTriggerDd} onChange={e => setRiskTriggerDd(Number(e.target.value))} className={I} /></div>
            </div>
          </div>
          <div className="mt-4 flex gap-3">
            <button onClick={() => setBotStatus(s => s === "RUNNING" ? "PAUSED" : "RUNNING")}
              className={cn("flex-1 rounded-lg py-3 text-[13px] font-bold transition", botStatus === "RUNNING" ? "bg-[#F5C542] text-black" : "bg-[#ef4444] text-white")}>
              {botStatus === "RUNNING" ? "Pause Protection" : "Start Protection"}
            </button>
            <div className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3">
              <span className={cn("h-2 w-2 rounded-full", botStatus === "RUNNING" ? "bg-[#2bc48a] animate-pulse" : "bg-white/20")} />
              <span className="text-[11px] font-semibold text-white/60">{botStatus}</span>
            </div>
          </div>
        </Card>

        {/* ── 5. EXECUTION LOG ── */}
        <BotExecutionLog accentColor="#ef4444" />
      </div>
    </div>
    </BotProvider>
  );
}
