import { useState } from "react";

/* ── mock data ── */
const sameExOps = [
  { coin: "ARB", buyEx: "Gate.io", sellEx: "Gate.io", buyP: 0.8723, sellP: 0.8761, spread: 0.44, fees: 0.20, net: 0.24, conf: 92 },
  { coin: "MATIC", buyEx: "Gate.io", sellEx: "Gate.io", buyP: 0.5412, sellP: 0.5448, spread: 0.66, fees: 0.20, net: 0.46, conf: 88 },
  { coin: "DOGE", buyEx: "Gate.io", sellEx: "Gate.io", buyP: 0.1623, sellP: 0.1630, spread: 0.43, fees: 0.20, net: 0.23, conf: 85 },
  { coin: "SOL", buyEx: "Gate.io", sellEx: "Gate.io", buyP: 186.42, sellP: 186.98, spread: 0.30, fees: 0.10, net: 0.20, conf: 90 },
  { coin: "AVAX", buyEx: "Gate.io", sellEx: "Gate.io", buyP: 35.18, sellP: 35.29, spread: 0.31, fees: 0.12, net: 0.19, conf: 82 },
  { coin: "FTM", buyEx: "Gate.io", sellEx: "Gate.io", buyP: 0.4102, sellP: 0.4121, spread: 0.46, fees: 0.20, net: 0.26, conf: 87 },
  { coin: "NEAR", buyEx: "Gate.io", sellEx: "Gate.io", buyP: 5.432, sellP: 5.462, spread: 0.55, fees: 0.20, net: 0.35, conf: 91 },
  { coin: "INJ", buyEx: "Gate.io", sellEx: "Gate.io", buyP: 22.15, sellP: 22.22, spread: 0.32, fees: 0.12, net: 0.20, conf: 84 },
  { coin: "LINK", buyEx: "Gate.io", sellEx: "Gate.io", buyP: 14.23, sellP: 14.28, spread: 0.35, fees: 0.15, net: 0.20, conf: 86 },
  { coin: "UNI", buyEx: "Gate.io", sellEx: "Gate.io", buyP: 9.812, sellP: 9.847, spread: 0.36, fees: 0.18, net: 0.18, conf: 80 },
];

const crossExOps = [
  { coin: "BTC", buyEx: "Gate.io", sellEx: "Binance", buyP: 69842.50, sellP: 69952.30, spread: 0.16, fees: 0.05, net: 0.11, conf: 96 },
  { coin: "ETH", buyEx: "Gate.io", sellEx: "Binance", buyP: 3512.18, sellP: 3521.42, spread: 0.26, fees: 0.08, net: 0.18, conf: 94 },
  { coin: "SOL", buyEx: "Binance", sellEx: "Gate.io", buyP: 186.12, sellP: 186.98, spread: 0.46, fees: 0.10, net: 0.36, conf: 93 },
  { coin: "XRP", buyEx: "Gate.io", sellEx: "Binance", buyP: 0.6234, sellP: 0.6252, spread: 0.29, fees: 0.10, net: 0.19, conf: 89 },
  { coin: "ADA", buyEx: "Binance", sellEx: "Gate.io", buyP: 0.4518, sellP: 0.4531, spread: 0.29, fees: 0.12, net: 0.17, conf: 86 },
  { coin: "DOGE", buyEx: "Gate.io", sellEx: "Binance", buyP: 0.1618, sellP: 0.1630, spread: 0.74, fees: 0.20, net: 0.54, conf: 91 },
  { coin: "AVAX", buyEx: "Binance", sellEx: "Gate.io", buyP: 35.10, sellP: 35.29, spread: 0.54, fees: 0.12, net: 0.42, conf: 88 },
  { coin: "LINK", buyEx: "Gate.io", sellEx: "Binance", buyP: 14.18, sellP: 14.28, spread: 0.70, fees: 0.15, net: 0.55, conf: 92 },
  { coin: "DOT", buyEx: "Binance", sellEx: "Gate.io", buyP: 7.123, sellP: 7.148, spread: 0.35, fees: 0.14, net: 0.21, conf: 83 },
  { coin: "MATIC", buyEx: "Gate.io", sellEx: "Binance", buyP: 0.5398, sellP: 0.5448, spread: 0.93, fees: 0.20, net: 0.73, conf: 95 },
];

const activeBots = [
  { name: "Gate-Tri-Alpha", type: "Same-Exchange", status: "Running", scans: 14823, opps: 312, trades: 47, winRate: 89.4, pnl: 1284.50 },
  { name: "Gate-Binance-Spread", type: "Cross-Exchange", status: "Running", scans: 8412, opps: 186, trades: 31, winRate: 93.5, pnl: 2156.80 },
  { name: "Gate-Direct-Beta", type: "Same-Exchange", status: "Paused", scans: 6201, opps: 98, trades: 12, winRate: 83.3, pnl: 342.10 },
];

const decisions = [
  { time: "14:32:18", bot: "Gate-Tri-Alpha", coin: "ARB", decision: "EXECUTE", edge: "0.24%", block: "-" },
  { time: "14:32:15", bot: "Gate-Binance-Spread", coin: "DOGE", decision: "EXECUTE", edge: "0.54%", block: "-" },
  { time: "14:32:12", bot: "Gate-Tri-Alpha", coin: "SOL", decision: "SKIP", edge: "0.08%", block: "Below min edge" },
  { time: "14:32:09", bot: "Gate-Binance-Spread", coin: "BTC", decision: "EXECUTE", edge: "0.11%", block: "-" },
  { time: "14:32:05", bot: "Gate-Direct-Beta", coin: "MATIC", decision: "SKIP", edge: "0.22%", block: "Bot paused" },
  { time: "14:31:58", bot: "Gate-Tri-Alpha", coin: "NEAR", decision: "EXECUTE", edge: "0.35%", block: "-" },
  { time: "14:31:52", bot: "Gate-Binance-Spread", coin: "AVAX", decision: "EXECUTE", edge: "0.42%", block: "-" },
  { time: "14:31:48", bot: "Gate-Tri-Alpha", coin: "FTM", decision: "SKIP", edge: "0.12%", block: "Low confidence" },
];

const execLog = [
  { time: "14:32:18", exchange: "Gate.io", symbol: "ARB/USDT", side: "BUY", price: 0.8723, qty: 1150, status: "Filled", latency: "42ms" },
  { time: "14:32:18", exchange: "Gate.io", symbol: "ARB/BTC", side: "SELL", price: 0.8761, qty: 1150, status: "Filled", latency: "38ms" },
  { time: "14:32:15", exchange: "Gate.io", symbol: "DOGE/USDT", side: "BUY", price: 0.1618, qty: 6200, status: "Filled", latency: "55ms" },
  { time: "14:32:15", exchange: "Binance", symbol: "DOGE/USDT", side: "SELL", price: 0.1630, qty: 6200, status: "Filled", latency: "31ms" },
  { time: "14:32:09", exchange: "Gate.io", symbol: "BTC/USDT", side: "BUY", price: 69842.50, qty: 0.015, status: "Filled", latency: "28ms" },
  { time: "14:32:09", exchange: "Binance", symbol: "BTC/USDT", side: "SELL", price: 69952.30, qty: 0.015, status: "Filled", latency: "22ms" },
  { time: "14:31:58", exchange: "Gate.io", symbol: "NEAR/USDT", side: "BUY", price: 5.432, qty: 420, status: "Filled", latency: "47ms" },
  { time: "14:31:58", exchange: "Gate.io", symbol: "NEAR/ETH", side: "SELL", price: 5.462, qty: 420, status: "Partial", latency: "61ms" },
];

const riskData = { dailyPnl: 3783.40, maxDrawdown: -412.20, exposure: 18420.00, staleAlerts: 0, feeAnomalies: 1 };

const perfData = { scansHr: 4820, validSetups: 312, executed: 78, avgEdge: 0.31, avgSlippage: 0.04, realizedPnl: 3783.40 };

/* ── helpers ── */
const cn = (...cls: (string | false | undefined)[]) => cls.filter(Boolean).join(" ");
const fmt = (n: number, d = 2) => n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtUsd = (n: number) => "$" + fmt(n);

const Badge = ({ children, color }: { children: string; color: string }) => (
  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ background: color + "18", color }}>
    <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
    {children}
  </span>
);

const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("rounded-xl border border-white/[0.06] bg-white/[0.02] p-4", className)}>{children}</div>
);

const Btn = ({ children, variant = "default", onClick }: { children: React.ReactNode; variant?: "default" | "green" | "yellow" | "red"; onClick?: () => void }) => {
  const colors = { default: "border-white/10 text-white/60 hover:bg-white/[0.04]", green: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20", yellow: "border-yellow-500/30 bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20", red: "border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20" };
  return <button onClick={onClick} className={cn("rounded-md border px-3 py-1 text-[11px] font-medium transition-colors", colors[variant])}>{children}</button>;
};

const Select = ({ value, options }: { value: string; options: string[] }) => (
  <select className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-white/80 outline-none" defaultValue={value}>
    {options.map((o) => <option key={o} value={o}>{o}</option>)}
  </select>
);

const Th = ({ children }: { children: React.ReactNode }) => <th className="whitespace-nowrap px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-white/40">{children}</th>;
const Td = ({ children, mono, color }: { children: React.ReactNode; mono?: boolean; color?: string }) => <td className={cn("whitespace-nowrap px-3 py-1.5 text-[11px]", mono && "font-mono", color ?? "text-white/70")}>{children}</td>;

/* ── Page ── */
const SpotArbitrageBotPage = () => {
  const [oppTab, setOppTab] = useState<"same" | "cross">("same");
  const [bottomTab, setBottomTab] = useState<"decisions" | "exec" | "risk" | "perf">("decisions");

  const opps = oppTab === "same" ? sameExOps : crossExOps;

  return (
    <div className="flex h-full flex-col overflow-auto bg-[#0B0B0C] text-white">
      {/* TOP BAR */}
      <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.06] bg-white/[0.015] px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,.5)]" />
          <span className="text-[13px] font-bold tracking-wide text-white/90">SPOT ARBITRAGE BOT</span>
        </div>
        <span className="text-white/20">|</span>
        <span className="text-[11px] text-white/50">Mode:</span>
        <Select value="Paper" options={["Paper", "Live"]} />
        <span className="text-white/20">|</span>
        <span className="text-[11px] text-white/50">Kill Switch:</span>
        <span className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-400">Armed</span>
        <span className="text-white/20">|</span>
        <span className="text-[11px] text-white/50">Scan: <span className="font-mono text-white/70">5s</span></span>
        <span className="text-white/20">|</span>
        <span className="text-[11px] text-white/50">Data:</span>
        <span className="h-2 w-2 rounded-full bg-emerald-400" title="Connected" />
      </div>

      <div className="flex-1 space-y-3 overflow-auto p-4">
        {/* ENGINE CARDS */}
        <div className="grid gap-3 lg:grid-cols-2">
          {/* Same-Exchange Engine */}
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[13px] font-bold text-white/90">Same-Exchange Engine</h3>
              <Badge color="#10b981">Scanning</Badge>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[11px]">
              <div className="text-white/40">Exchange</div><div><Select value="Gate.io" options={["Gate.io", "Binance", "OKX", "Bybit"]} /></div>
              <div className="text-white/40">Scope</div><div className="text-white/70">Top 50 coins</div>
              <div className="text-white/40">Route</div><div className="text-white/70">Direct / Triangular</div>
              <div className="text-white/40">Min net edge</div><div className="font-mono text-white/70">0.15%</div>
            </div>
            <div className="mt-3 flex gap-2">
              <Btn variant="green">Start</Btn>
              <Btn variant="yellow">Pause</Btn>
            </div>
          </Card>

          {/* Cross-Exchange Engine */}
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[13px] font-bold text-white/90">Cross-Exchange Engine</h3>
              <Badge color="#10b981">Scanning</Badge>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[11px]">
              <div className="text-white/40">Buy</div><div><Select value="Gate.io" options={["Gate.io", "OKX", "Bybit"]} /></div>
              <div className="text-white/40">Sell</div><div><Select value="Binance" options={["Binance", "OKX", "Bybit"]} /></div>
              <div className="text-white/40">Shared universe</div><div className="text-white/70">Top 100</div>
              <div className="text-white/40">Min spread</div><div className="font-mono text-white/70">0.10%</div>
              <div className="text-white/40">Inventory mode</div><div className="text-white/70">Pre-funded</div>
            </div>
            <div className="mt-3 flex gap-2">
              <Btn variant="green">Start</Btn>
              <Btn variant="yellow">Pause</Btn>
            </div>
          </Card>
        </div>

        {/* OPPORTUNITY BOARD */}
        <Card>
          <div className="mb-3 flex items-center gap-1 border-b border-white/[0.06] pb-2">
            <h3 className="mr-3 text-[13px] font-bold text-white/90">Opportunity Board</h3>
            {(["same", "cross"] as const).map((t) => (
              <button key={t} onClick={() => setOppTab(t)} className={cn("rounded-md px-3 py-1 text-[11px] font-medium transition-colors", oppTab === t ? "bg-white/[0.08] text-white" : "text-white/40 hover:text-white/60")}>
                {t === "same" ? "Same-Exchange" : "Cross-Exchange"}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead><tr className="border-b border-white/[0.04]">
                <Th>Coin</Th><Th>Buy Exchange</Th><Th>Sell Exchange</Th><Th>Buy Price</Th><Th>Sell Price</Th><Th>Spread%</Th><Th>Fees</Th><Th>Net Edge</Th><Th>Confidence</Th><Th>Action</Th>
              </tr></thead>
              <tbody>
                {opps.map((o, i) => (
                  <tr key={i} className="border-b border-white/[0.03] transition-colors hover:bg-white/[0.02]">
                    <Td><span className="font-semibold text-white/90">{o.coin}</span></Td>
                    <Td>{o.buyEx}</Td>
                    <Td>{o.sellEx}</Td>
                    <Td mono>{fmtUsd(o.buyP)}</Td>
                    <Td mono>{fmtUsd(o.sellP)}</Td>
                    <Td mono color="text-emerald-400">{fmt(o.spread)}%</Td>
                    <Td mono>{fmt(o.fees)}%</Td>
                    <Td mono color={o.net >= 0.3 ? "text-emerald-400" : "text-yellow-400"}>{fmt(o.net)}%</Td>
                    <Td>
                      <div className="flex items-center gap-1.5">
                        <div className="h-1 w-12 rounded-full bg-white/10">
                          <div className="h-1 rounded-full bg-emerald-400" style={{ width: `${o.conf}%` }} />
                        </div>
                        <span className="font-mono text-[10px] text-white/50">{o.conf}%</span>
                      </div>
                    </Td>
                    <Td><Btn variant="green">Execute</Btn></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* ACTIVE BOTS */}
        <Card>
          <h3 className="mb-3 text-[13px] font-bold text-white/90">Active Bots</h3>
          <div className="grid gap-3 md:grid-cols-3">
            {activeBots.map((b, i) => (
              <div key={i} className="rounded-lg border border-white/[0.06] bg-white/[0.015] p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-white/90">{b.name}</span>
                  <Badge color={b.status === "Running" ? "#10b981" : "#eab308"}>{b.status}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                  <span className="text-white/40">Type</span><span className="text-white/60">{b.type}</span>
                  <span className="text-white/40">Scans</span><span className="font-mono text-white/60">{b.scans.toLocaleString()}</span>
                  <span className="text-white/40">Opportunities</span><span className="font-mono text-white/60">{b.opps}</span>
                  <span className="text-white/40">Trades</span><span className="font-mono text-white/60">{b.trades}</span>
                  <span className="text-white/40">Win Rate</span><span className="font-mono text-emerald-400">{fmt(b.winRate, 1)}%</span>
                  <span className="text-white/40">PnL</span><span className={cn("font-mono", b.pnl >= 0 ? "text-emerald-400" : "text-red-400")}>{fmtUsd(b.pnl)}</span>
                </div>
                <div className="mt-2 flex gap-2">
                  <Btn variant="yellow">Pause</Btn>
                  <Btn variant="red">Stop</Btn>
                  <Btn>Logs</Btn>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* BOTTOM TABS */}
        <Card>
          <div className="mb-3 flex items-center gap-1 border-b border-white/[0.06] pb-2">
            {(["decisions", "exec", "risk", "perf"] as const).map((t) => {
              const labels = { decisions: "Decisions", exec: "Execution Log", risk: "Risk", perf: "Performance" };
              return (
                <button key={t} onClick={() => setBottomTab(t)} className={cn("rounded-md px-3 py-1 text-[11px] font-medium transition-colors", bottomTab === t ? "bg-white/[0.08] text-white" : "text-white/40 hover:text-white/60")}>
                  {labels[t]}
                </button>
              );
            })}
          </div>

          {/* Decisions */}
          {bottomTab === "decisions" && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead><tr className="border-b border-white/[0.04]">
                  <Th>Time</Th><Th>Bot</Th><Th>Coin</Th><Th>Decision</Th><Th>Edge</Th><Th>Block Reason</Th>
                </tr></thead>
                <tbody>
                  {decisions.map((d, i) => (
                    <tr key={i} className="border-b border-white/[0.03] transition-colors hover:bg-white/[0.02]">
                      <Td mono>{d.time}</Td>
                      <Td>{d.bot}</Td>
                      <Td><span className="font-semibold text-white/90">{d.coin}</span></Td>
                      <Td><Badge color={d.decision === "EXECUTE" ? "#10b981" : "#eab308"}>{d.decision}</Badge></Td>
                      <Td mono>{d.edge}</Td>
                      <Td color={d.block === "-" ? "text-white/30" : "text-yellow-400"}>{d.block}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Execution Log */}
          {bottomTab === "exec" && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead><tr className="border-b border-white/[0.04]">
                  <Th>Time</Th><Th>Exchange</Th><Th>Symbol</Th><Th>Side</Th><Th>Price</Th><Th>Qty</Th><Th>Status</Th><Th>Latency</Th>
                </tr></thead>
                <tbody>
                  {execLog.map((e, i) => (
                    <tr key={i} className="border-b border-white/[0.03] transition-colors hover:bg-white/[0.02]">
                      <Td mono>{e.time}</Td>
                      <Td>{e.exchange}</Td>
                      <Td><span className="font-semibold text-white/90">{e.symbol}</span></Td>
                      <Td color={e.side === "BUY" ? "text-emerald-400" : "text-red-400"}>{e.side}</Td>
                      <Td mono>{fmtUsd(e.price)}</Td>
                      <Td mono>{e.qty.toLocaleString()}</Td>
                      <Td><Badge color={e.status === "Filled" ? "#10b981" : "#eab308"}>{e.status}</Badge></Td>
                      <Td mono>{e.latency}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Risk */}
          {bottomTab === "risk" && (
            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {([
                { label: "Daily PnL", value: fmtUsd(riskData.dailyPnl), color: "text-emerald-400" },
                { label: "Max Drawdown", value: fmtUsd(riskData.maxDrawdown), color: "text-red-400" },
                { label: "Exposure", value: fmtUsd(riskData.exposure), color: "text-white/80" },
                { label: "Stale Data Alerts", value: String(riskData.staleAlerts), color: riskData.staleAlerts > 0 ? "text-yellow-400" : "text-emerald-400" },
                { label: "Fee Anomalies", value: String(riskData.feeAnomalies), color: riskData.feeAnomalies > 0 ? "text-yellow-400" : "text-emerald-400" },
              ]).map((r, i) => (
                <div key={i} className="rounded-lg border border-white/[0.06] bg-white/[0.015] p-3 text-center">
                  <div className="text-[10px] uppercase tracking-wider text-white/40">{r.label}</div>
                  <div className={cn("mt-1 font-mono text-lg font-bold", r.color)}>{r.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Performance */}
          {bottomTab === "perf" && (
            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {([
                { label: "Scans/hour", value: perfData.scansHr.toLocaleString() },
                { label: "Valid setups", value: String(perfData.validSetups) },
                { label: "Executed", value: String(perfData.executed) },
                { label: "Avg edge", value: fmt(perfData.avgEdge) + "%" },
                { label: "Avg slippage", value: fmt(perfData.avgSlippage) + "%" },
                { label: "Realized PnL", value: fmtUsd(perfData.realizedPnl), color: "text-emerald-400" },
              ]).map((p, i) => (
                <div key={i} className="rounded-lg border border-white/[0.06] bg-white/[0.015] p-3 text-center">
                  <div className="text-[10px] uppercase tracking-wider text-white/40">{p.label}</div>
                  <div className={cn("mt-1 font-mono text-lg font-bold", (p as any).color ?? "text-white/80")}>{p.value}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default SpotArbitrageBotPage;
