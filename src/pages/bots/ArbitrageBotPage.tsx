import { useState } from "react";
import BotExchangeBar from "../../components/bot/BotExchangeBar";
import { BotProvider } from "../../components/bot/BotContext";
import BotExecutionLog from "../../components/bot/BotExecutionLog";

/* ── Mock: Opportunity Scanner Data ── */
const OPPORTUNITIES = [
  { coin: "ARB",   bid: 0.8234, ask: 0.8291, spread: 0.69, avgSpread: 0.32, zScore: 2.84, netEdge: 0.41, volume: "4.2M",  score: 92 },
  { coin: "MATIC", bid: 0.5412, ask: 0.5458, spread: 0.85, avgSpread: 0.41, zScore: 2.61, netEdge: 0.37, volume: "6.8M",  score: 88 },
  { coin: "DOGE",  bid: 0.1618, ask: 0.1631, spread: 0.80, avgSpread: 0.35, zScore: 2.47, netEdge: 0.32, volume: "12.1M", score: 85 },
  { coin: "AVAX",  bid: 28.42,  ask: 28.61,  spread: 0.67, avgSpread: 0.28, zScore: 2.33, netEdge: 0.29, volume: "3.1M",  score: 81 },
  { coin: "NEAR",  bid: 4.812,  ask: 4.848,  spread: 0.75, avgSpread: 0.38, zScore: 2.18, netEdge: 0.27, volume: "2.4M",  score: 78 },
  { coin: "FTM",   bid: 0.3241, ask: 0.3262, spread: 0.65, avgSpread: 0.34, zScore: 2.06, netEdge: 0.23, volume: "1.9M",  score: 74 },
  { coin: "INJ",   bid: 18.34,  ask: 18.47,  spread: 0.71, avgSpread: 0.42, zScore: 1.89, netEdge: 0.19, volume: "1.3M",  score: 69 },
  { coin: "OP",    bid: 1.542,  ask: 1.551,  spread: 0.58, avgSpread: 0.31, zScore: 1.74, netEdge: 0.16, volume: "2.7M",  score: 64 },
  { coin: "ATOM",  bid: 7.812,  ask: 7.854,  spread: 0.54, avgSpread: 0.33, zScore: 1.52, netEdge: 0.12, volume: "1.8M",  score: 58 },
  { coin: "DOT",   bid: 5.234,  ask: 5.261,  spread: 0.52, avgSpread: 0.36, zScore: 1.31, netEdge: 0.10, volume: "2.2M",  score: 52 },
];

/* ── Mock: Active Arbs ── */
const ACTIVE_ARBS = [
  { name: "ARB-Spread-01",   pair: "ARB/USDT",   entrySpread: 0.69, currentSpread: 0.48, targetSpread: 0.32, pnl: "+$12.40", status: "Running" as const,    elapsed: "1m 42s" },
  { name: "MATIC-Spread-02", pair: "MATIC/USDT", entrySpread: 0.85, currentSpread: 0.52, targetSpread: 0.41, pnl: "+$8.72",  status: "Running" as const,    elapsed: "0m 58s" },
  { name: "DOGE-Spread-03",  pair: "DOGE/USDT",  entrySpread: 0.80, currentSpread: 0.71, targetSpread: 0.35, pnl: "+$2.18",  status: "Converging" as const, elapsed: "0m 22s" },
];

/* ── Mock: Bot Thinking ── */
const THINKING_LINES = [
  { time: "14:31:02", text: "ARB spread z-score 2.84 -- significantly above mean. Order book depth sufficient on both sides. Initiating capture." },
  { time: "14:31:03", text: "ARB bid depth: 14,200 units within 0.1%. Ask depth: 11,800 units. Fill probability 97%. Proceeding." },
  { time: "14:31:04", text: "MATIC spread deviation at 2.61 -- above threshold. Volume confirms liquidity. Adding to execution queue." },
  { time: "14:31:06", text: "INJ z-score 1.89 -- below 2.0 threshold. Monitoring but not executing. Spread could widen further." },
  { time: "14:31:07", text: "INJ historical: z-score peaked at 2.4 yesterday same hour. Setting alert if it crosses 2.0 in next scan." },
  { time: "14:31:08", text: "DOT z-score 1.31 -- too low for profitable entry after fees (est. 0.28% round-trip). Skipping this cycle." },
  { time: "14:31:10", text: "DOGE spread narrowing from 0.80 to 0.71 -- mean reversion in progress on active bot. Expected convergence in ~4 min." },
  { time: "14:31:12", text: "FTM volume at 1.9M -- borderline for min volume filter. Allowing entry but reducing size by 40%." },
  { time: "14:31:14", text: "ATOM rejected -- spread 0.54% but avg spread 0.33% gives z-score 1.52. Need 2.0+ for auto-execute." },
  { time: "14:31:16", text: "OP spread stable at 0.58% for 12 consecutive scans. No anomaly detected. Continuing to monitor." },
  { time: "14:31:18", text: "Scanner cycle complete: 840 pairs scanned in 1.42s. Next cycle in 2s. 6 above z-score 2.0, 3 executing." },
];

/* ── Helpers ── */
function zScoreColor(z: number): string {
  if (z >= 2.5) return "text-[#2bc48a]";
  if (z >= 2.0) return "text-[#5B8DEF]";
  if (z >= 1.5) return "text-[#F5C542]";
  return "text-white/40";
}

function scoreBar(score: number): string {
  if (score >= 85) return "bg-[#2bc48a]";
  if (score >= 70) return "bg-[#5B8DEF]";
  if (score >= 55) return "bg-[#F5C542]";
  return "bg-white/20";
}

/* ═══════════════════════════════════════════════════════════════════
   ArbitrageBotPage — Same-Exchange Arbitrage Dashboard
   ═══════════════════════════════════════════════════════════════════ */
export default function ArbitrageBotPage() {
  const [minEdge, setMinEdge] = useState("0.20");
  const [maxExposure, setMaxExposure] = useState("500");
  const [scanInterval, setScanInterval] = useState("2");
  const [autoExecute, setAutoExecute] = useState(true);
  const [minVolume, setMinVolume] = useState("1000000");
  const [zThreshold, setZThreshold] = useState("2.0");

  return (
    <BotProvider>
    <div className="min-h-screen bg-[#0B0B0C] text-white">
      <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">

        {/* ── 1. Exchange Bar ── */}
        <BotExchangeBar botName="Arbitrage Scanner Engine" accentColor="#ef4444" />

        {/* ── Description ── */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-5 py-4">
          <p className="text-[12px] leading-relaxed text-white/45">
            <span className="font-semibold text-white/70">Same-Exchange Spread Arbitrage</span> — Continuously monitors bid/ask spreads across all traded pairs on a single exchange. When the spread deviates
            significantly from its rolling mean (measured by z-score), the bot captures the reversion by simultaneously placing buy and sell orders. Low risk, high frequency, fee-sensitive.
          </p>
        </div>

        {/* ── 2. Opportunity Scanner ── */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
          <div className="mb-4 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#ef4444] shadow-[0_0_6px_#ef4444]" />
            <h2 className="text-[14px] font-bold tracking-wide text-white/90">OPPORTUNITY SCANNER</h2>
            <span className="ml-2 rounded-full bg-[#2bc48a]/15 px-2 py-0.5 text-[9px] font-semibold text-[#2bc48a]">LIVE</span>
            <span className="ml-auto text-[10px] text-white/30">Updated 1s ago</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead>
                <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-wider text-white/30">
                  <th className="pb-2 pr-3 font-medium">Coin</th>
                  <th className="pb-2 pr-3 font-medium text-right">Bid</th>
                  <th className="pb-2 pr-3 font-medium text-right">Ask</th>
                  <th className="pb-2 pr-3 font-medium text-right">Spread%</th>
                  <th className="pb-2 pr-3 font-medium text-right">Avg Spread</th>
                  <th className="pb-2 pr-3 font-medium text-right">Z-Score</th>
                  <th className="pb-2 pr-3 font-medium text-right">Net Edge%</th>
                  <th className="pb-2 pr-3 font-medium text-right">Volume</th>
                  <th className="pb-2 pr-3 font-medium">Score</th>
                  <th className="pb-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {OPPORTUNITIES.map((o) => (
                  <tr key={o.coin} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition">
                    <td className="py-2 pr-3 font-semibold text-white">{o.coin}</td>
                    <td className="py-2 pr-3 text-right font-mono text-white/60">${o.bid.toFixed(4)}</td>
                    <td className="py-2 pr-3 text-right font-mono text-white/60">${o.ask.toFixed(4)}</td>
                    <td className="py-2 pr-3 text-right font-mono text-[#F5C542]">{o.spread.toFixed(2)}%</td>
                    <td className="py-2 pr-3 text-right font-mono text-white/40">{o.avgSpread.toFixed(2)}%</td>
                    <td className={`py-2 pr-3 text-right font-mono font-semibold ${zScoreColor(o.zScore)}`}>{o.zScore.toFixed(2)}</td>
                    <td className="py-2 pr-3 text-right font-mono text-[#2bc48a]">{o.netEdge.toFixed(2)}%</td>
                    <td className="py-2 pr-3 text-right text-white/50">${o.volume}</td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 rounded-full bg-white/[0.06] overflow-hidden">
                          <div className={`h-full rounded-full ${scoreBar(o.score)}`} style={{ width: `${o.score}%` }} />
                        </div>
                        <span className="text-[10px] text-white/50">{o.score}</span>
                      </div>
                    </td>
                    <td className="py-2">
                      {o.zScore >= 2.0 ? (
                        <button className="rounded-md bg-[#2bc48a]/15 px-2.5 py-1 text-[10px] font-semibold text-[#2bc48a] hover:bg-[#2bc48a]/25 transition">
                          Execute
                        </button>
                      ) : (
                        <span className="text-[10px] text-white/25">Below threshold</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── 3. Scanner Stats ── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Scans / min", value: "840", color: "text-white" },
            { label: "Opportunities Found", value: "23", color: "text-[#5B8DEF]" },
            { label: "Valid (above threshold)", value: "8", color: "text-[#2bc48a]" },
            { label: "Executed", value: "3", color: "text-[#F5C542]" },
            { label: "Avg Edge", value: "0.31%", color: "text-[#2bc48a]" },
            { label: "Success Rate", value: "89%", color: "text-[#2bc48a]" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <div className="text-[10px] text-white/35 mb-1">{s.label}</div>
              <div className={`text-[20px] font-bold ${s.color}`}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* ── 4. Active Arbs ── */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
          <div className="mb-4 flex items-center gap-2">
            <span className="text-[14px] text-white/40">{"\u25B8"}</span>
            <h2 className="text-[13px] font-semibold tracking-wide text-white/80">ACTIVE ARBS</h2>
            <span className="ml-auto rounded-full bg-[#2bc48a]/10 px-2 py-0.5 text-[9px] font-semibold text-[#2bc48a]">{ACTIVE_ARBS.length} running</span>
          </div>

          <div className="space-y-2">
            {ACTIVE_ARBS.map((a) => (
              <div key={a.name} className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg border border-white/[0.04] bg-white/[0.015] px-4 py-3">
                <div className="min-w-[120px]">
                  <div className="text-[11px] font-semibold text-white">{a.name}</div>
                  <div className="text-[10px] text-white/35">{a.pair}</div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-white/35">Entry Spread</div>
                  <div className="text-[12px] font-mono text-white/70">{a.entrySpread.toFixed(2)}%</div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-white/35">Current Spread</div>
                  <div className="text-[12px] font-mono text-[#5B8DEF]">{a.currentSpread.toFixed(2)}%</div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-white/35">PnL</div>
                  <div className="text-[12px] font-mono font-semibold text-[#2bc48a]">{a.pnl}</div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-white/35">Elapsed</div>
                  <div className="text-[12px] font-mono text-white/50">{a.elapsed}</div>
                </div>
                <div className="min-w-[100px]">
                  <div className="text-[10px] text-white/35 mb-1">Convergence</div>
                  <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#2bc48a] transition-all"
                      style={{ width: `${Math.round(((a.entrySpread - a.currentSpread) / (a.entrySpread - a.targetSpread)) * 100)}%` }}
                    />
                  </div>
                  <div className="mt-0.5 text-[9px] text-white/25">{a.currentSpread.toFixed(2)}% &rarr; {a.targetSpread.toFixed(2)}%</div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-white/35">Status</div>
                  <div className={`text-[11px] font-semibold ${a.status === "Running" ? "text-[#2bc48a]" : "text-[#F5C542]"}`}>
                    {a.status === "Running" && <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#2bc48a]" />}
                    {a.status}
                  </div>
                </div>
                <div className="ml-auto">
                  <button className="rounded-md border border-[#f6465d]/30 bg-[#f6465d]/10 px-3 py-1 text-[10px] font-semibold text-[#f6465d] hover:bg-[#f6465d]/20 transition">
                    Stop
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── 5. Scanner Config ── */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
          <div className="mb-4 flex items-center gap-2">
            <span className="text-[14px] text-white/40">{"\u2699"}</span>
            <h2 className="text-[13px] font-semibold tracking-wide text-white/80">SCANNER CONFIG</h2>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Min Edge */}
            <div>
              <label className="mb-1 block text-[10px] text-white/40">Min Edge %</label>
              <input
                type="number" step="0.01" value={minEdge} onChange={(e) => setMinEdge(e.target.value)}
                className="w-full rounded-lg border border-white/[0.08] bg-[#0F1012] px-3 py-2 text-[12px] text-white outline-none focus:border-[#ef4444]/40"
              />
            </div>
            {/* Max Exposure */}
            <div>
              <label className="mb-1 block text-[10px] text-white/40">Max Exposure per Trade ($)</label>
              <input
                type="number" step="50" value={maxExposure} onChange={(e) => setMaxExposure(e.target.value)}
                className="w-full rounded-lg border border-white/[0.08] bg-[#0F1012] px-3 py-2 text-[12px] text-white outline-none focus:border-[#ef4444]/40"
              />
            </div>
            {/* Scan Interval */}
            <div>
              <label className="mb-1 block text-[10px] text-white/40">Scan Interval (seconds)</label>
              <input
                type="number" step="1" value={scanInterval} onChange={(e) => setScanInterval(e.target.value)}
                className="w-full rounded-lg border border-white/[0.08] bg-[#0F1012] px-3 py-2 text-[12px] text-white outline-none focus:border-[#ef4444]/40"
              />
            </div>
            {/* Min Volume */}
            <div>
              <label className="mb-1 block text-[10px] text-white/40">Min Volume Filter ($)</label>
              <input
                type="number" step="100000" value={minVolume} onChange={(e) => setMinVolume(e.target.value)}
                className="w-full rounded-lg border border-white/[0.08] bg-[#0F1012] px-3 py-2 text-[12px] text-white outline-none focus:border-[#ef4444]/40"
              />
            </div>
            {/* Z-Score Threshold */}
            <div>
              <label className="mb-1 block text-[10px] text-white/40">Z-Score Threshold</label>
              <input
                type="number" step="0.1" value={zThreshold} onChange={(e) => setZThreshold(e.target.value)}
                className="w-full rounded-lg border border-white/[0.08] bg-[#0F1012] px-3 py-2 text-[12px] text-white outline-none focus:border-[#ef4444]/40"
              />
            </div>
            {/* Auto-execute */}
            <div className="flex items-end">
              <div>
                <label className="mb-1 block text-[10px] text-white/40">Auto-Execute</label>
                <button
                  onClick={() => setAutoExecute((v) => !v)}
                  className={`rounded-lg border px-4 py-2 text-[12px] font-semibold transition ${
                    autoExecute
                      ? "border-[#2bc48a]/30 bg-[#2bc48a]/10 text-[#2bc48a]"
                      : "border-white/10 bg-[#0F1012] text-white/40"
                  }`}
                >
                  {autoExecute ? "Enabled" : "Disabled"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── 6. Bot Thinking ── */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-[14px] text-white/40">{"\uD83E\uDDE0"}</span>
            <h2 className="text-[13px] font-semibold tracking-wide text-white/80">BOT THINKING</h2>
            <span className="ml-auto h-1.5 w-1.5 animate-pulse rounded-full bg-[#ef4444]" />
          </div>

          <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
            {THINKING_LINES.map((t, i) => (
              <div key={i} className="flex gap-2 text-[11px] leading-relaxed">
                <span className="shrink-0 font-mono text-white/25">[{t.time}]</span>
                <span className="text-white/50">{t.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── 7. Execution Log ── */}
        <BotExecutionLog accentColor="#ef4444" />

      </div>
    </div>
    </BotProvider>
  );
}
