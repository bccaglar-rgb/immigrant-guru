import { useState } from "react";
import BotExchangeBar from "../../components/bot/BotExchangeBar";
import { BotProvider } from "../../components/bot/BotContext";
import BotExecutionLog from "../../components/bot/BotExecutionLog";
import BotStrategyChart from "../../components/bot/BotStrategyChart";
import SignalsOverview from "../../components/bot/SignalsOverview";

/* ── Mock: Cross-Exchange Price Matrix ── */
const PRICE_MATRIX = [
  { coin: "DOGE",  binance: 0.1630, gate: 0.1618, okx: 0.1624, bestBuy: "Gate.io",  bestSell: "Binance", gross: 0.74, fees: 0.20, net: 0.54 },
  { coin: "ARB",   binance: 0.8291, gate: 0.8248, okx: 0.8270, bestBuy: "Gate.io",  bestSell: "Binance", gross: 0.52, fees: 0.18, net: 0.34 },
  { coin: "MATIC", binance: 0.5458, gate: 0.5430, okx: 0.5442, bestBuy: "Gate.io",  bestSell: "Binance", gross: 0.52, fees: 0.20, net: 0.32 },
  { coin: "AVAX",  binance: 28.61,  gate: 28.48,  okx: 28.53,  bestBuy: "Gate.io",  bestSell: "Binance", gross: 0.46, fees: 0.18, net: 0.28 },
  { coin: "FTM",   binance: 0.3258, gate: 0.3241, okx: 0.3252, bestBuy: "Gate.io",  bestSell: "Binance", gross: 0.52, fees: 0.24, net: 0.28 },
  { coin: "NEAR",  binance: 4.842,  gate: 4.830,  okx: 4.848,  bestBuy: "Gate.io",  bestSell: "OKX",     gross: 0.37, fees: 0.16, net: 0.21 },
  { coin: "INJ",   binance: 18.47,  gate: 18.38,  okx: 18.44,  bestBuy: "Gate.io",  bestSell: "Binance", gross: 0.49, fees: 0.30, net: 0.19 },
  { coin: "OP",    binance: 1.551,  gate: 1.545,  okx: 1.548,  bestBuy: "Gate.io",  bestSell: "Binance", gross: 0.39, fees: 0.22, net: 0.17 },
  { coin: "ATOM",  binance: 7.854,  gate: 7.838,  okx: 7.845,  bestBuy: "Gate.io",  bestSell: "Binance", gross: 0.20, fees: 0.14, net: 0.06 },
  { coin: "DOT",   binance: 5.261,  gate: 5.252,  okx: 5.258,  bestBuy: "Gate.io",  bestSell: "Binance", gross: 0.17, fees: 0.14, net: 0.03 },
];

/* ── Mock: Active Routes ── */
const ACTIVE_ROUTES = [
  { coin: "DOGE", from: "Gate.io", to: "Binance", buyPrice: 0.1618, sellPrice: 0.1630, transferFee: 0.10, netEdge: 0.54, status: "Executing" as const, elapsed: "1.8s", size: "$1,400", network: "DOGE" },
  { coin: "ARB",  from: "Gate.io", to: "Binance", buyPrice: 0.8248, sellPrice: 0.8291, transferFee: 0.08, netEdge: 0.34, status: "Transferring" as const, elapsed: "12.4s", size: "$1,200", network: "Arbitrum" },
  { coin: "MATIC", from: "Gate.io", to: "Binance", buyPrice: 0.5430, sellPrice: 0.5458, transferFee: 0.10, netEdge: 0.32, status: "Confirming" as const, elapsed: "24.1s", size: "$1,580", network: "Polygon" },
];

/* ── Mock: Bot Thinking ── */
const THINKING_LINES = [
  { time: "14:30:02", text: "DOGE: Gate.io ask $0.1618 vs Binance bid $0.1630 -- gross delta 0.74%. After 0.10% transfer + 0.10% maker fees = net 0.54%. Profitable route confirmed." },
  { time: "14:30:04", text: "DOGE transfer via DOGE network -- estimated 2 min confirmation. Price slippage risk: low (high liquidity both sides)." },
  { time: "14:30:05", text: "ARB: Gate.io $0.8248 vs Binance $0.8291. Transfer takes ~15s on Arbitrum L2. Net edge 0.34% -- executing." },
  { time: "14:30:08", text: "ATOM: Only 0.06% net after fees. Below 0.15% threshold. Not worth the transfer risk and capital lockup." },
  { time: "14:30:11", text: "DOT: 0.03% net edge -- rejected. Transfer time on Polkadot ~45s would expose to price movement risk." },
  { time: "14:30:14", text: "NEAR: OKX best sell at $4.848 vs Gate.io buy at $4.830. Net 0.21% after fees. Route viable but OKX withdrawal queue detected -- delaying." },
  { time: "14:30:17", text: "FTM: Sonic network transfer ~3s. Gate.io to Binance net 0.28%. Fast execution possible -- queuing behind DOGE route." },
  { time: "14:30:20", text: "Rebalancing check: Gate.io USDT balance at $2,840 after 3 active routes. Sufficient for 2 more small routes." },
  { time: "14:30:23", text: "INJ: Gate.io withdrawal fee 0.15 INJ ($2.76). At current delta this erodes edge to 0.19%. Marginal -- skipping for now." },
  { time: "14:30:26", text: "OP: Optimism L2 bridge ~20s. Net edge only 0.17% and falling. Monitoring for improvement before committing capital." },
  { time: "14:30:29", text: "Cycle summary: 10 pairs scanned across 3 exchanges. 3 active routes, 2 queued, 5 rejected. Total capital deployed: $4,180." },
];

/* ── Helpers ── */
function netColor(net: number): string {
  if (net >= 0.30) return "text-[#2bc48a]";
  if (net >= 0.15) return "text-[#5B8DEF]";
  if (net >= 0.05) return "text-[#F5C542]";
  return "text-white/30";
}

function statusColor(status: string): string {
  if (status === "Executing") return "text-[#2bc48a]";
  if (status === "Transferring") return "text-[#5B8DEF]";
  return "text-[#F5C542]";
}

function formatPrice(p: number): string {
  if (p >= 10) return `$${p.toFixed(2)}`;
  if (p >= 1) return `$${p.toFixed(3)}`;
  return `$${p.toFixed(4)}`;
}

/* ═══════════════════════════════════════════════════════════════════
   CrossExchangeArbBotPage — Cross-Exchange Arbitrage Dashboard
   ═══════════════════════════════════════════════════════════════════ */
export default function CrossExchangeArbBotPage() {
  const [minNetEdge, setMinNetEdge] = useState("0.15");
  const [maxTransferFee, setMaxTransferFee] = useState("0.30");
  const [maxLatency, setMaxLatency] = useState("30");
  const [autoRoute, setAutoRoute] = useState(true);
  const [exchanges, setExchanges] = useState({ binance: true, gate: true, okx: true, bybit: false, kucoin: false });

  const toggleExchange = (key: keyof typeof exchanges) => {
    setExchanges((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <BotProvider>
    <div className="min-h-screen bg-[#0B0B0C] text-white">
      <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">

        {/* ── 1. Exchange Bar ── */}
        <BotExchangeBar botName="Cross-Exchange Arb Engine" accentColor="#ef4444" />

        {/* ── Description ── */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-5 py-4">
          <p className="text-[12px] leading-relaxed text-white/45">
            <span className="font-semibold text-white/70">Cross-Exchange Arbitrage</span> — Exploits price differences between exchanges by buying on the cheaper venue and selling on the more expensive one.
            Accounts for trading fees, withdrawal fees, transfer times, and slippage to calculate true net edge. Only executes when the route is profitable after all costs.
          </p>
        </div>

        {/* ── 2. Cross-Exchange Price Matrix ── */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
          <div className="mb-4 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#ef4444] shadow-[0_0_6px_#ef4444]" />
            <h2 className="text-[14px] font-bold tracking-wide text-white/90">CROSS-EXCHANGE PRICE MATRIX</h2>
            <span className="ml-2 rounded-full bg-[#2bc48a]/15 px-2 py-0.5 text-[9px] font-semibold text-[#2bc48a]">LIVE</span>
            <span className="ml-auto text-[10px] text-white/30">Updated 1s ago</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead>
                <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-wider text-white/30">
                  <th className="pb-2 pr-3 font-medium">Coin</th>
                  <th className="pb-2 pr-3 font-medium text-right">Binance</th>
                  <th className="pb-2 pr-3 font-medium text-right">Gate.io</th>
                  <th className="pb-2 pr-3 font-medium text-right">OKX</th>
                  <th className="pb-2 pr-3 font-medium">Best Buy</th>
                  <th className="pb-2 pr-3 font-medium">Best Sell</th>
                  <th className="pb-2 pr-3 font-medium text-right">Gross%</th>
                  <th className="pb-2 pr-3 font-medium text-right">Fees%</th>
                  <th className="pb-2 pr-3 font-medium text-right">Net%</th>
                  <th className="pb-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {PRICE_MATRIX.map((r) => (
                  <tr key={r.coin} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition">
                    <td className="py-2 pr-3 font-semibold text-white">{r.coin}</td>
                    <td className="py-2 pr-3 text-right font-mono text-white/60">{formatPrice(r.binance)}</td>
                    <td className="py-2 pr-3 text-right font-mono text-white/60">{formatPrice(r.gate)}</td>
                    <td className="py-2 pr-3 text-right font-mono text-white/60">{formatPrice(r.okx)}</td>
                    <td className="py-2 pr-3">
                      <span className="rounded bg-[#2bc48a]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#2bc48a]">{r.bestBuy}</span>
                    </td>
                    <td className="py-2 pr-3">
                      <span className="rounded bg-[#5B8DEF]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#5B8DEF]">{r.bestSell}</span>
                    </td>
                    <td className="py-2 pr-3 text-right font-mono text-white/50">{r.gross.toFixed(2)}%</td>
                    <td className="py-2 pr-3 text-right font-mono text-[#f6465d]/60">-{r.fees.toFixed(2)}%</td>
                    <td className={`py-2 pr-3 text-right font-mono font-semibold ${netColor(r.net)}`}>{r.net.toFixed(2)}%</td>
                    <td className="py-2">
                      {r.net >= 0.15 ? (
                        <button className="rounded-md bg-[#2bc48a]/15 px-2.5 py-1 text-[10px] font-semibold text-[#2bc48a] hover:bg-[#2bc48a]/25 transition">
                          Route
                        </button>
                      ) : (
                        <span className="text-[10px] text-white/25">Low edge</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── 3. Active Routes ── */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
          <div className="mb-4 flex items-center gap-2">
            <span className="text-[14px] text-white/40">{"\u25B8"}</span>
            <h2 className="text-[13px] font-semibold tracking-wide text-white/80">ACTIVE ROUTES</h2>
            <span className="ml-auto rounded-full bg-[#2bc48a]/10 px-2 py-0.5 text-[9px] font-semibold text-[#2bc48a]">{ACTIVE_ROUTES.length} active</span>
          </div>

          <div className="space-y-2">
            {ACTIVE_ROUTES.map((r) => (
              <div key={r.coin} className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg border border-white/[0.04] bg-white/[0.015] px-4 py-3">
                <div className="min-w-[100px]">
                  <div className="text-[11px] font-semibold text-white">{r.coin}</div>
                  <div className="text-[10px] text-white/35">{r.from} &rarr; {r.to}</div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-white/35">Buy ({r.from})</div>
                  <div className="text-[12px] font-mono text-[#2bc48a]">{formatPrice(r.buyPrice)}</div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-white/35">Sell ({r.to})</div>
                  <div className="text-[12px] font-mono text-[#5B8DEF]">{formatPrice(r.sellPrice)}</div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-white/35">Transfer Fee</div>
                  <div className="text-[12px] font-mono text-[#f6465d]/60">{r.transferFee.toFixed(2)}%</div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-white/35">Net Edge</div>
                  <div className="text-[12px] font-mono font-semibold text-[#2bc48a]">{r.netEdge.toFixed(2)}%</div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-white/35">Size</div>
                  <div className="text-[12px] font-mono text-white/60">{r.size}</div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-white/35">Network</div>
                  <div className="text-[11px] text-white/50">{r.network}</div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-white/35">Elapsed</div>
                  <div className="text-[12px] font-mono text-white/50">{r.elapsed}</div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-white/35">Status</div>
                  <div className={`text-[11px] font-semibold ${statusColor(r.status)}`}>
                    <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: r.status === "Executing" ? "#2bc48a" : r.status === "Transferring" ? "#5B8DEF" : "#F5C542" }} />
                    {r.status}
                  </div>
                </div>
                <div className="ml-auto">
                  <button className="rounded-md border border-[#f6465d]/30 bg-[#f6465d]/10 px-3 py-1 text-[10px] font-semibold text-[#f6465d] hover:bg-[#f6465d]/20 transition">
                    Cancel
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── 4. Route Stats ── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Active Routes", value: "3", color: "text-white" },
            { label: "Completed Today", value: "12", color: "text-[#5B8DEF]" },
            { label: "Success Rate", value: "93%", color: "text-[#2bc48a]" },
            { label: "Total Profit", value: "$342.50", color: "text-[#2bc48a]" },
            { label: "Avg Net Edge", value: "0.28%", color: "text-[#F5C542]" },
            { label: "Avg Exec Time", value: "2.4s", color: "text-white/70" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <div className="text-[10px] text-white/35 mb-1">{s.label}</div>
              <div className={`text-[20px] font-bold ${s.color}`}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* ── Signals Overview ── */}
        <SignalsOverview
          compact={true}
          overrides={[
            { id: "exchange-flow", status: "Triggered" },
            { id: "volume", status: "Bullish" },
            { id: "liquidity", status: "Watching" },
            { id: "funding-rate", status: "Neutral" },
            { id: "open-interest", status: "Neutral" },
            { id: "whale-activity", status: "Watching" },
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

        {/* ── 5. Scanner Config ── */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
          <div className="mb-4 flex items-center gap-2">
            <span className="text-[14px] text-white/40">{"\u2699"}</span>
            <h2 className="text-[13px] font-semibold tracking-wide text-white/80">SCANNER CONFIG</h2>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Min Net Edge */}
            <div>
              <label className="mb-1 block text-[10px] text-white/40">Min Net Edge % (after fees)</label>
              <input
                type="number" step="0.01" value={minNetEdge} onChange={(e) => setMinNetEdge(e.target.value)}
                className="w-full rounded-lg border border-white/[0.08] bg-[#0F1012] px-3 py-2 text-[12px] text-white outline-none focus:border-[#ef4444]/40"
              />
            </div>
            {/* Max Transfer Fee */}
            <div>
              <label className="mb-1 block text-[10px] text-white/40">Max Transfer Fee Cap %</label>
              <input
                type="number" step="0.01" value={maxTransferFee} onChange={(e) => setMaxTransferFee(e.target.value)}
                className="w-full rounded-lg border border-white/[0.08] bg-[#0F1012] px-3 py-2 text-[12px] text-white outline-none focus:border-[#ef4444]/40"
              />
            </div>
            {/* Max Latency */}
            <div>
              <label className="mb-1 block text-[10px] text-white/40">Max Latency (seconds)</label>
              <input
                type="number" step="1" value={maxLatency} onChange={(e) => setMaxLatency(e.target.value)}
                className="w-full rounded-lg border border-white/[0.08] bg-[#0F1012] px-3 py-2 text-[12px] text-white outline-none focus:border-[#ef4444]/40"
              />
            </div>
            {/* Allowed Exchanges */}
            <div className="sm:col-span-2 lg:col-span-2">
              <label className="mb-2 block text-[10px] text-white/40">Allowed Exchanges</label>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(exchanges) as Array<keyof typeof exchanges>).map((ex) => (
                  <button
                    key={ex}
                    onClick={() => toggleExchange(ex)}
                    className={`rounded-lg border px-3 py-1.5 text-[11px] font-semibold capitalize transition ${
                      exchanges[ex]
                        ? "border-[#2bc48a]/30 bg-[#2bc48a]/10 text-[#2bc48a]"
                        : "border-white/10 bg-[#0F1012] text-white/30 hover:text-white/50"
                    }`}
                  >
                    {ex === "gate" ? "Gate.io" : ex.charAt(0).toUpperCase() + ex.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            {/* Auto-route */}
            <div className="flex items-end">
              <div>
                <label className="mb-1 block text-[10px] text-white/40">Auto-Route</label>
                <button
                  onClick={() => setAutoRoute((v) => !v)}
                  className={`rounded-lg border px-4 py-2 text-[12px] font-semibold transition ${
                    autoRoute
                      ? "border-[#2bc48a]/30 bg-[#2bc48a]/10 text-[#2bc48a]"
                      : "border-white/10 bg-[#0F1012] text-white/40"
                  }`}
                >
                  {autoRoute ? "Enabled" : "Disabled"}
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
