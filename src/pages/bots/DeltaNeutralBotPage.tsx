import { useState } from "react";
import BotExchangeBar from "../../components/bot/BotExchangeBar";
import { BotProvider } from "../../components/bot/BotContext";
import BotExecutionLog from "../../components/bot/BotExecutionLog";
import BotLivePanel from "../../components/bot/BotLivePanel";
import BotStrategyChart from "../../components/bot/BotStrategyChart";
import SignalsOverview from "../../components/bot/SignalsOverview";

/* ── Shared helpers ── */
const cn = (...cls: (string | false | undefined)[]) => cls.filter(Boolean).join(" ");
const fmt = (n: number, d = 2) => n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtUsd = (n: number) => "$" + fmt(n);
const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("rounded-xl border border-white/[0.06] bg-white/[0.02] p-4", className)}>{children}</div>
);

/* ── Mock data ── */
const POSITIONS = [
  { asset: "BTC", longSize: 0.52, shortSize: 0.52, spotPrice: 96420, futuresPrice: 96485, netDelta: -0.02, fundingCollected: 412.80, durationDays: 14 },
  { asset: "ETH", longSize: 8.4, shortSize: 8.4, spotPrice: 3612, futuresPrice: 3618, netDelta: 0.01, fundingCollected: 187.30, durationDays: 9 },
];

const FUNDING_COINS = [
  { coin: "BTC", rate: 0.0120, predicted: 0.0105, annualized: 13.14, avg30d: 0.0098 },
  { coin: "ETH", rate: 0.0085, predicted: 0.0092, annualized: 9.31, avg30d: 0.0076 },
  { coin: "SOL", rate: 0.0210, predicted: 0.0180, annualized: 22.99, avg30d: 0.0155 },
  { coin: "DOGE", rate: -0.0045, predicted: -0.0030, annualized: -4.93, avg30d: -0.0022 },
  { coin: "XRP", rate: 0.0065, predicted: 0.0070, annualized: 7.12, avg30d: 0.0058 },
  { coin: "AVAX", rate: 0.0150, predicted: 0.0140, annualized: 16.43, avg30d: 0.0120 },
  { coin: "LINK", rate: 0.0095, predicted: 0.0088, annualized: 10.40, avg30d: 0.0082 },
  { coin: "ARB", rate: -0.0110, predicted: -0.0085, annualized: -12.05, avg30d: -0.0070 },
];

/* ── Page ── */
export default function DeltaNeutralBotPage() {
  const [targetPair, setTargetPair] = useState("BTC");
  const [fundingThreshold, setFundingThreshold] = useState("0.005");
  const [maxPosition, setMaxPosition] = useState("50000");
  const [rebalanceTrigger, setRebalanceTrigger] = useState("0.10");
  const [autoCompound, setAutoCompound] = useState(true);

  const totalFunding = POSITIONS.reduce((s, p) => s + p.fundingCollected, 0);
  const avgDelta = POSITIONS.reduce((s, p) => s + Math.abs(p.netDelta), 0) / POSITIONS.length;

  /* delta gauge color */
  const deltaColor = (d: number) => {
    const a = Math.abs(d);
    if (a < 0.05) return "#2bc48a";
    if (a < 0.1) return "#F5C542";
    return "#f6465d";
  };

  return (
    <BotProvider>
    <div className="min-h-screen bg-[#0B0B0C] text-white">
      <div className="mx-auto max-w-6xl space-y-5 p-6">
        {/* 1 ── Exchange bar */}
        <BotExchangeBar botName="Delta Neutral Engine" accentColor="#ef4444" />

        {/* 2 ── Position Overview */}
        <Card>
          <h3 className="mb-3 text-[13px] font-semibold tracking-wide text-white/80">Position Overview</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead>
                <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-wider text-white/30">
                  <th className="pb-2 pr-4">Asset</th>
                  <th className="pb-2 pr-4">Long Leg (Spot)</th>
                  <th className="pb-2 pr-4">Short Leg (Futures)</th>
                  <th className="pb-2 pr-4">Size</th>
                  <th className="pb-2 pr-4">Net Delta</th>
                  <th className="pb-2 pr-4">Funding Collected</th>
                  <th className="pb-2">Duration</th>
                </tr>
              </thead>
              <tbody>
                {POSITIONS.map((p) => (
                  <tr key={p.asset} className="border-b border-white/[0.03]">
                    <td className="py-2 pr-4 font-semibold text-white/90">{p.asset}</td>
                    <td className="py-2 pr-4 text-[#2bc48a]">{fmtUsd(p.spotPrice)}</td>
                    <td className="py-2 pr-4 text-[#f6465d]">{fmtUsd(p.futuresPrice)}</td>
                    <td className="py-2 pr-4 text-white/70">{p.longSize} {p.asset}</td>
                    <td className="py-2 pr-4 font-mono" style={{ color: deltaColor(p.netDelta) }}>{p.netDelta > 0 ? "+" : ""}{fmt(p.netDelta, 3)}</td>
                    <td className="py-2 pr-4 text-[#2bc48a]">{fmtUsd(p.fundingCollected)}</td>
                    <td className="py-2 text-white/50">{p.durationDays}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* 3 ── Delta Monitor */}
        <Card>
          <h3 className="mb-4 text-[13px] font-semibold tracking-wide text-white/80">Delta Monitor</h3>
          <div className="space-y-4">
            {POSITIONS.map((p) => {
              const pct = Math.min(Math.abs(p.netDelta) / 0.5, 1) * 100;
              const col = deltaColor(p.netDelta);
              return (
                <div key={p.asset}>
                  <div className="mb-1 flex items-center justify-between text-[11px]">
                    <span className="text-white/60">{p.asset} Net Delta</span>
                    <span className="font-mono" style={{ color: col }}>{p.netDelta > 0 ? "+" : ""}{fmt(p.netDelta, 3)}</span>
                  </div>
                  <div className="relative h-3 w-full overflow-hidden rounded-full bg-white/[0.04]">
                    {/* center line = 0 */}
                    <div className="absolute left-1/2 top-0 h-full w-px bg-white/20" />
                    {/* delta bar from center */}
                    <div
                      className="absolute top-0 h-full rounded-full transition-all"
                      style={{
                        background: col,
                        opacity: 0.7,
                        width: `${pct / 2}%`,
                        left: p.netDelta >= 0 ? "50%" : `${50 - pct / 2}%`,
                      }}
                    />
                  </div>
                  <div className="mt-1 flex justify-between text-[9px] text-white/20">
                    <span>-0.50</span>
                    <span>0.00</span>
                    <span>+0.50</span>
                  </div>
                </div>
              );
            })}
            <div className="flex items-center gap-2 rounded-lg bg-white/[0.02] px-3 py-2 text-[10px]">
              <span className="h-2 w-2 rounded-full bg-[#F5C542]" />
              <span className="text-white/40">Rebalance Threshold:</span>
              <span className="font-mono text-[#F5C542]">{"\u00B1"}{rebalanceTrigger}</span>
              <span className="ml-auto text-white/30">Current avg |delta| = {fmt(avgDelta, 3)}</span>
            </div>
          </div>
        </Card>

        {/* 4 ── Funding Dashboard */}
        <Card>
          <h3 className="mb-3 text-[13px] font-semibold tracking-wide text-white/80">Funding Dashboard</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead>
                <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-wider text-white/30">
                  <th className="pb-2 pr-4">Coin</th>
                  <th className="pb-2 pr-4">Current Rate</th>
                  <th className="pb-2 pr-4">Predicted Next</th>
                  <th className="pb-2 pr-4">Annualized %</th>
                  <th className="pb-2">30d Avg</th>
                </tr>
              </thead>
              <tbody>
                {FUNDING_COINS.map((c) => (
                  <tr key={c.coin} className="border-b border-white/[0.03]">
                    <td className="py-2 pr-4 font-semibold text-white/90">{c.coin}</td>
                    <td className={cn("py-2 pr-4 font-mono", c.rate >= 0 ? "text-[#2bc48a]" : "text-[#f6465d]")}>
                      {c.rate >= 0 ? "+" : ""}{fmt(c.rate, 4)}%
                    </td>
                    <td className={cn("py-2 pr-4 font-mono", c.predicted >= 0 ? "text-[#2bc48a]/70" : "text-[#f6465d]/70")}>
                      {c.predicted >= 0 ? "+" : ""}{fmt(c.predicted, 4)}%
                    </td>
                    <td className={cn("py-2 pr-4 font-mono", c.annualized >= 0 ? "text-[#2bc48a]" : "text-[#f6465d]")}>
                      {c.annualized >= 0 ? "+" : ""}{fmt(c.annualized)}%
                    </td>
                    <td className="py-2 font-mono text-white/50">{c.avg30d >= 0 ? "+" : ""}{fmt(c.avg30d, 4)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* ── Signals Overview ── */}
        <SignalsOverview
          overrides={[
            { id: "funding-rate", status: "Triggered" },
            { id: "open-interest", status: "Bullish" },
            { id: "delta-volume", status: "Neutral" },
            { id: "volume", status: "Neutral" },
            { id: "trend", status: "Neutral" },
            { id: "squeeze", status: "Watching" },
            { id: "composite", status: "Bullish" },
          ]}
        />

        {/* ── CHART PREVIEW ── */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[13px] font-bold text-white">Strategy Preview</h2>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[9px] text-white/40">PREVIEW</span>
          </div>
          <BotStrategyChart defaultPair="BTCUSDT" defaultTf="15m" accentColor="#ef4444" />
        </div>

        {/* 5 ── Stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Total Funding Collected", value: fmtUsd(totalFunding), color: "#2bc48a" },
            { label: "Annualized APY", value: "14.8%", color: "#2bc48a" },
            { label: "Days Active", value: "14", color: "#5B8DEF" },
            { label: "Max Delta Deviation", value: "0.08", color: "#F5C542" },
          ].map((s) => (
            <Card key={s.label} className="text-center">
              <p className="text-[10px] uppercase tracking-wider text-white/30">{s.label}</p>
              <p className="mt-1 text-[20px] font-bold" style={{ color: s.color }}>{s.value}</p>
            </Card>
          ))}
        </div>

        {/* 6 ── Setup */}
        <Card>
          <h3 className="mb-4 text-[13px] font-semibold tracking-wide text-white/80">Setup</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-white/30">Target Pair</span>
              <select value={targetPair} onChange={(e) => setTargetPair(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0F1012] px-3 py-2 text-[12px] text-white outline-none">
                <option>BTC</option><option>ETH</option><option>SOL</option>
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-white/30">Min Funding Rate %</span>
              <input value={fundingThreshold} onChange={(e) => setFundingThreshold(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0F1012] px-3 py-2 text-[12px] text-white outline-none" />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-white/30">Max Position (USD)</span>
              <input value={maxPosition} onChange={(e) => setMaxPosition(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0F1012] px-3 py-2 text-[12px] text-white outline-none" />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-white/30">Rebalance Trigger (delta)</span>
              <input value={rebalanceTrigger} onChange={(e) => setRebalanceTrigger(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0F1012] px-3 py-2 text-[12px] text-white outline-none" />
            </label>
            <div className="flex items-center gap-3">
              <span className="text-[10px] uppercase tracking-wider text-white/30">Auto-Compound</span>
              <button
                onClick={() => setAutoCompound((v) => !v)}
                className={cn("rounded-full px-3 py-1 text-[11px] font-semibold transition", autoCompound ? "bg-[#2bc48a]/20 text-[#2bc48a]" : "bg-white/[0.04] text-white/40")}
              >
                {autoCompound ? "ON" : "OFF"}
              </button>
            </div>
          </div>
        </Card>

        {/* 7 ── Bot Thinking */}
        <Card>
          <h3 className="mb-3 text-[13px] font-semibold tracking-wide text-white/80">Bot Thinking</h3>
          <div className="space-y-2 text-[11px]">
            {[
              { q: "Funding rate direction?", a: "BTC funding positive at +0.012%, predicted to stay positive next period. Favorable for short-futures collection.", color: "#2bc48a" },
              { q: "Delta status?", a: "BTC net delta at -0.02, ETH at +0.01. Both well within rebalance threshold of \u00B10.10. No action needed.", color: "#2bc48a" },
              { q: "Rebalance needed?", a: "No. All positions within tolerance. Next check in 4h or if delta exceeds threshold.", color: "#5B8DEF" },
              { q: "Risk assessment?", a: "Low risk. Both legs hedged. Funding annualized yield ~14.8%. Max observed delta deviation 0.08 over 14 days.", color: "#F5C542" },
            ].map((t, i) => (
              <div key={i} className="rounded-lg bg-white/[0.02] px-3 py-2">
                <span className="text-white/40">{t.q}</span>
                <p className="mt-0.5" style={{ color: t.color }}>{t.a}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* 8 ── Execution Log */}
        <BotLivePanel botSlug="delta-neutral" botName="Delta Neutral Bot" accentColor="#ef4444" />
        <BotExecutionLog accentColor="#ef4444" />
      </div>
    </div>
    </BotProvider>
  );
}
