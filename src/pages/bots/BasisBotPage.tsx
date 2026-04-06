import { useState } from "react";
import BotExchangeBar from "../../components/bot/BotExchangeBar";
import { BotProvider } from "../../components/bot/BotContext";
import BotExecutionLog from "../../components/bot/BotExecutionLog";

/* ── Shared helpers ── */
const cn = (...cls: (string | false | undefined)[]) => cls.filter(Boolean).join(" ");
const fmt = (n: number, d = 2) => n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtUsd = (n: number) => "$" + fmt(n);
const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("rounded-xl border border-white/[0.06] bg-white/[0.02] p-4", className)}>{children}</div>
);

/* ── Mock data ── */
const SPREAD_DATA = [
  { coin: "BTC", spot: 96420, futures: 96535, basis: 0.119, zScore: 1.8, direction: "Contango", annualYield: 4.35, score: 72, action: "Watch" },
  { coin: "ETH", spot: 3612, futures: 3634, basis: 0.609, zScore: 2.4, direction: "Contango", annualYield: 22.23, score: 91, action: "Enter" },
  { coin: "SOL", spot: 178.40, futures: 177.24, basis: -0.650, zScore: -2.1, direction: "Backwardation", annualYield: 23.73, score: 88, action: "Enter" },
  { coin: "DOGE", spot: 0.1842, futures: 0.1849, basis: 0.380, zScore: 1.5, direction: "Contango", annualYield: 13.87, score: 64, action: "Watch" },
  { coin: "XRP", spot: 2.34, futures: 2.352, basis: 0.513, zScore: 2.0, direction: "Contango", annualYield: 18.72, score: 80, action: "Enter" },
  { coin: "AVAX", spot: 42.80, futures: 42.62, basis: -0.420, zScore: -1.7, direction: "Backwardation", annualYield: 15.33, score: 60, action: "Watch" },
  { coin: "LINK", spot: 18.92, futures: 19.01, basis: 0.476, zScore: 1.9, direction: "Contango", annualYield: 17.37, score: 76, action: "Watch" },
  { coin: "ARB", spot: 1.24, futures: 1.228, basis: -0.968, zScore: -2.6, direction: "Backwardation", annualYield: 35.33, score: 95, action: "Enter" },
  { coin: "APT", spot: 12.40, futures: 12.47, basis: 0.565, zScore: 2.2, direction: "Contango", annualYield: 20.62, score: 85, action: "Enter" },
  { coin: "MATIC", spot: 0.782, futures: 0.779, basis: -0.384, zScore: -1.4, direction: "Backwardation", annualYield: 14.02, score: 55, action: "---" },
];

const ACTIVE_TRADES = [
  { coin: "ETH", direction: "Long Spot / Short Futures", spotEntry: 3580, futuresEntry: 3612, currentBasis: 0.609, target: 0.10, pnl: 284.50, durationDays: 5 },
  { coin: "ARB", direction: "Short Spot / Long Futures", spotEntry: 1.25, futuresEntry: 1.232, currentBasis: -0.968, target: -0.10, pnl: 142.30, durationDays: 3 },
  { coin: "SOL", direction: "Short Spot / Long Futures", spotEntry: 180.20, futuresEntry: 178.90, currentBasis: -0.650, target: -0.10, pnl: 96.80, durationDays: 2 },
];

/* Visualization data - top 8 coins for basis bars */
const VIS_DATA = SPREAD_DATA.slice(0, 8);

/* ── Page ── */
export default function BasisBotPage() {
  const [minBasis, setMinBasis] = useState("0.30");
  const [zThreshold, setZThreshold] = useState("2.0");
  const [convergenceTarget, setConvergenceTarget] = useState("0.10");
  const [maxPos, setMaxPos] = useState("30000");
  const [lookback, setLookback] = useState("30");

  const maxBasisAbs = Math.max(...VIS_DATA.map((d) => Math.abs(d.basis)));
  const totalPnl = ACTIVE_TRADES.reduce((s, t) => s + t.pnl, 0);

  const scoreColor = (score: number) => {
    if (score >= 85) return "#2bc48a";
    if (score >= 70) return "#5B8DEF";
    if (score >= 55) return "#F5C542";
    return "rgba(255,255,255,0.3)";
  };

  return (
    <BotProvider>
    <div className="min-h-screen bg-[#0B0B0C] text-white">
      <div className="mx-auto max-w-6xl space-y-5 p-6">
        {/* 1 ── Exchange bar */}
        <BotExchangeBar botName="Basis Trading Engine" accentColor="#ef4444" />

        {/* 2 ── Basis Spread Scanner */}
        <Card>
          <h3 className="mb-3 text-[13px] font-semibold tracking-wide text-white/80">Basis Spread Scanner</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead>
                <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-wider text-white/30">
                  <th className="pb-2 pr-3">Coin</th>
                  <th className="pb-2 pr-3">Spot</th>
                  <th className="pb-2 pr-3">Futures</th>
                  <th className="pb-2 pr-3">Basis %</th>
                  <th className="pb-2 pr-3">Z-Score</th>
                  <th className="pb-2 pr-3">Direction</th>
                  <th className="pb-2 pr-3">Annual Yield</th>
                  <th className="pb-2 pr-3">Score</th>
                  <th className="pb-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {SPREAD_DATA.map((r) => {
                  const isContango = r.direction === "Contango";
                  return (
                    <tr key={r.coin} className="border-b border-white/[0.03]">
                      <td className="py-2 pr-3 font-semibold text-white/90">{r.coin}</td>
                      <td className="py-2 pr-3 font-mono text-white/60">{fmtUsd(r.spot)}</td>
                      <td className="py-2 pr-3 font-mono text-white/60">{fmtUsd(r.futures)}</td>
                      <td className={cn("py-2 pr-3 font-mono", isContango ? "text-[#5B8DEF]" : "text-[#f4906c]")}>
                        {r.basis >= 0 ? "+" : ""}{fmt(r.basis, 3)}%
                      </td>
                      <td className={cn("py-2 pr-3 font-mono", Math.abs(r.zScore) >= 2 ? "text-white/90" : "text-white/40")}>
                        {r.zScore >= 0 ? "+" : ""}{fmt(r.zScore, 1)}
                      </td>
                      <td className="py-2 pr-3">
                        <span className={cn("text-[10px] font-semibold", isContango ? "text-[#5B8DEF]" : "text-[#f4906c]")}>
                          {r.direction}
                        </span>
                      </td>
                      <td className="py-2 pr-3 font-mono text-[#2bc48a]">{fmt(r.annualYield)}%</td>
                      <td className="py-2 pr-3">
                        <span className="font-mono font-semibold" style={{ color: scoreColor(r.score) }}>{r.score}</span>
                      </td>
                      <td className="py-2">
                        {r.action === "Enter" ? (
                          <span className="rounded-full bg-[#2bc48a]/15 px-2 py-0.5 text-[10px] font-semibold text-[#2bc48a]">Enter</span>
                        ) : r.action === "Watch" ? (
                          <span className="rounded-full bg-[#F5C542]/15 px-2 py-0.5 text-[10px] font-semibold text-[#F5C542]">Watch</span>
                        ) : (
                          <span className="text-white/20">---</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[9px] text-white/20">Contango = futures &gt; spot (blue). Backwardation = futures &lt; spot (orange).</p>
        </Card>

        {/* 3 ── Active Basis Trades */}
        <Card>
          <h3 className="mb-3 text-[13px] font-semibold tracking-wide text-white/80">Active Basis Trades</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead>
                <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-wider text-white/30">
                  <th className="pb-2 pr-3">Coin</th>
                  <th className="pb-2 pr-3">Direction</th>
                  <th className="pb-2 pr-3">Spot Entry</th>
                  <th className="pb-2 pr-3">Futures Entry</th>
                  <th className="pb-2 pr-3">Current Basis</th>
                  <th className="pb-2 pr-3">Target</th>
                  <th className="pb-2 pr-3">PnL</th>
                  <th className="pb-2">Duration</th>
                </tr>
              </thead>
              <tbody>
                {ACTIVE_TRADES.map((t) => (
                  <tr key={t.coin} className="border-b border-white/[0.03]">
                    <td className="py-2 pr-3 font-semibold text-white/90">{t.coin}</td>
                    <td className="py-2 pr-3 text-[10px] text-white/60">{t.direction}</td>
                    <td className="py-2 pr-3 font-mono text-white/60">{fmtUsd(t.spotEntry)}</td>
                    <td className="py-2 pr-3 font-mono text-white/60">{fmtUsd(t.futuresEntry)}</td>
                    <td className={cn("py-2 pr-3 font-mono", t.currentBasis >= 0 ? "text-[#5B8DEF]" : "text-[#f4906c]")}>
                      {t.currentBasis >= 0 ? "+" : ""}{fmt(t.currentBasis, 3)}%
                    </td>
                    <td className="py-2 pr-3 font-mono text-white/40">{t.target >= 0 ? "+" : ""}{fmt(t.target, 2)}%</td>
                    <td className="py-2 pr-3 font-mono text-[#2bc48a]">+{fmtUsd(t.pnl)}</td>
                    <td className="py-2 text-white/50">{t.durationDays}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* 4 ── Basis Stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Avg Basis", value: fmt(SPREAD_DATA.reduce((s, d) => s + Math.abs(d.basis), 0) / SPREAD_DATA.length, 3) + "%", color: "#5B8DEF" },
            { label: "Convergence Rate", value: "78%", color: "#2bc48a" },
            { label: "Trades Completed", value: "23", color: "#F5C542" },
            { label: "Total Profit", value: fmtUsd(totalPnl), color: "#2bc48a" },
          ].map((s) => (
            <Card key={s.label} className="text-center">
              <p className="text-[10px] uppercase tracking-wider text-white/30">{s.label}</p>
              <p className="mt-1 text-[20px] font-bold" style={{ color: s.color }}>{s.value}</p>
            </Card>
          ))}
        </div>

        {/* 5 ── Basis Visualization */}
        <Card>
          <h3 className="mb-4 text-[13px] font-semibold tracking-wide text-white/80">Basis Visualization</h3>
          <div className="space-y-2">
            {VIS_DATA.map((d) => {
              const pct = (Math.abs(d.basis) / maxBasisAbs) * 100;
              const isContango = d.direction === "Contango";
              const barColor = isContango ? "#5B8DEF" : "#f4906c";
              return (
                <div key={d.coin} className="flex items-center gap-3">
                  <span className="w-12 text-right text-[11px] font-semibold text-white/70">{d.coin}</span>
                  <div className="flex flex-1 items-center">
                    {/* Left side (backwardation) */}
                    <div className="flex w-1/2 justify-end">
                      {!isContango && (
                        <div
                          className="h-5 rounded-l"
                          style={{ width: `${pct}%`, background: barColor, opacity: 0.7 }}
                        />
                      )}
                    </div>
                    {/* Center line */}
                    <div className="h-5 w-px bg-white/20" />
                    {/* Right side (contango) */}
                    <div className="flex w-1/2">
                      {isContango && (
                        <div
                          className="h-5 rounded-r"
                          style={{ width: `${pct}%`, background: barColor, opacity: 0.7 }}
                        />
                      )}
                    </div>
                  </div>
                  <span className="w-20 text-[10px] font-mono" style={{ color: barColor }}>
                    {isContango ? "contango" : "backwrdn"} {d.basis >= 0 ? "+" : ""}{fmt(d.basis, 2)}%
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex justify-center gap-6 text-[9px] text-white/20">
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 rounded bg-[#f4906c]/70" /> Backwardation</span>
            <span>0%</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 rounded bg-[#5B8DEF]/70" /> Contango</span>
          </div>
        </Card>

        {/* 6 ── Setup */}
        <Card>
          <h3 className="mb-4 text-[13px] font-semibold tracking-wide text-white/80">Setup</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-white/30">Min Basis %</span>
              <input value={minBasis} onChange={(e) => setMinBasis(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0F1012] px-3 py-2 text-[12px] text-white outline-none" />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-white/30">Z-Score Threshold</span>
              <input value={zThreshold} onChange={(e) => setZThreshold(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0F1012] px-3 py-2 text-[12px] text-white outline-none" />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-white/30">Convergence Target %</span>
              <input value={convergenceTarget} onChange={(e) => setConvergenceTarget(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0F1012] px-3 py-2 text-[12px] text-white outline-none" />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-white/30">Max Position (USD)</span>
              <input value={maxPos} onChange={(e) => setMaxPos(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0F1012] px-3 py-2 text-[12px] text-white outline-none" />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-white/30">Lookback Period (days)</span>
              <input value={lookback} onChange={(e) => setLookback(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0F1012] px-3 py-2 text-[12px] text-white outline-none" />
            </label>
          </div>
        </Card>

        {/* 7 ── Bot Thinking */}
        <Card>
          <h3 className="mb-3 text-[13px] font-semibold tracking-wide text-white/80">Bot Thinking</h3>
          <div className="space-y-2 text-[11px]">
            {[
              { q: "Why enter ETH basis trade?", a: "ETH futures premium at +0.609% with z-score 2.4 (above 2.0 threshold). Historical mean basis is 0.15%. High probability of convergence within 7-14 days. Score 91.", color: "#2bc48a" },
              { q: "Why enter ARB basis trade?", a: "ARB in deep backwardation at -0.968%, z-score -2.6. Extreme deviation from mean. Annualized yield 35.33% if convergence occurs. Highest score at 95.", color: "#2bc48a" },
              { q: "Why skip MATIC?", a: "Basis at -0.384% but z-score only -1.4, below the 2.0 threshold. Insufficient statistical significance for entry. Score 55.", color: "#F5C542" },
              { q: "Convergence outlook?", a: "3 active trades progressing toward target. ETH narrowing steadily. ARB and SOL showing early signs of mean reversion. Average expected duration 5-10 days.", color: "#5B8DEF" },
            ].map((t, i) => (
              <div key={i} className="rounded-lg bg-white/[0.02] px-3 py-2">
                <span className="text-white/40">{t.q}</span>
                <p className="mt-0.5" style={{ color: t.color }}>{t.a}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* 8 ── Execution Log */}
        <BotExecutionLog accentColor="#ef4444" />
      </div>
    </div>
    </BotProvider>
  );
}
