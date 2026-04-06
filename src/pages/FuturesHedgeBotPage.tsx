import { useState } from "react";

/* ═══════════════════════════════════════════════════════════════════
   FUTURES HEDGE BOT — Spread, Funding & Basis Engines
   ═══════════════════════════════════════════════════════════════════ */

// ── Mock Data ──

const SPREAD_OPPS = [
  { coin: "BTC", longEx: "Gate.io", shortEx: "Binance", longPrice: 68432.50, shortPrice: 68612.30, spreadPct: 0.26, fees: 0.08, netEdge: 0.18, score: 92 },
  { coin: "ETH", longEx: "Gate.io", shortEx: "Binance", longPrice: 3542.10, shortPrice: 3554.80, spreadPct: 0.36, fees: 0.08, netEdge: 0.28, score: 88 },
  { coin: "SOL", longEx: "Gate.io", shortEx: "Binance", longPrice: 148.22, shortPrice: 148.68, spreadPct: 0.31, fees: 0.10, netEdge: 0.21, score: 85 },
  { coin: "ARB", longEx: "Gate.io", shortEx: "Binance", longPrice: 1.0820, shortPrice: 1.0865, spreadPct: 0.42, fees: 0.12, netEdge: 0.30, score: 82 },
  { coin: "AVAX", longEx: "Binance", shortEx: "Gate.io", longPrice: 35.42, shortPrice: 35.56, spreadPct: 0.40, fees: 0.10, netEdge: 0.30, score: 80 },
  { coin: "LINK", longEx: "Gate.io", shortEx: "Binance", longPrice: 14.55, shortPrice: 14.60, spreadPct: 0.34, fees: 0.08, netEdge: 0.26, score: 78 },
  { coin: "DOGE", longEx: "Gate.io", shortEx: "Binance", longPrice: 0.1542, shortPrice: 0.1548, spreadPct: 0.39, fees: 0.14, netEdge: 0.25, score: 75 },
  { coin: "MATIC", longEx: "Binance", shortEx: "Gate.io", longPrice: 0.7120, shortPrice: 0.7142, spreadPct: 0.31, fees: 0.10, netEdge: 0.21, score: 72 },
];

const FUNDING_OPPS = [
  { coin: "BTC", exchange: "Binance", currentFunding: 0.0100, nextFunding: 0.0120, delta: 0.0020, bias: "Long Pay" },
  { coin: "ETH", exchange: "Gate.io", currentFunding: -0.0080, nextFunding: -0.0060, delta: 0.0020, bias: "Short Pay" },
  { coin: "SOL", exchange: "Binance", currentFunding: 0.0250, nextFunding: 0.0280, delta: 0.0030, bias: "Long Pay" },
  { coin: "DOGE", exchange: "Binance", currentFunding: 0.0310, nextFunding: 0.0340, delta: 0.0030, bias: "Long Pay" },
  { coin: "ARB", exchange: "Gate.io", currentFunding: -0.0150, nextFunding: -0.0120, delta: 0.0030, bias: "Short Pay" },
  { coin: "AVAX", exchange: "Binance", currentFunding: 0.0180, nextFunding: 0.0200, delta: 0.0020, bias: "Long Pay" },
  { coin: "LINK", exchange: "Gate.io", currentFunding: 0.0050, nextFunding: 0.0070, delta: 0.0020, bias: "Long Pay" },
  { coin: "MATIC", exchange: "Binance", currentFunding: -0.0040, nextFunding: -0.0020, delta: 0.0020, bias: "Short Pay" },
];

const BASIS_OPPS = [
  { coin: "BTC", spotPrice: 68432.50, futuresPrice: 68652.80, basisPct: 0.32, direction: "Contango" },
  { coin: "ETH", spotPrice: 3542.10, futuresPrice: 3558.40, basisPct: 0.46, direction: "Contango" },
  { coin: "SOL", spotPrice: 148.22, futuresPrice: 148.92, basisPct: 0.47, direction: "Contango" },
  { coin: "AVAX", spotPrice: 35.42, futuresPrice: 35.28, basisPct: -0.40, direction: "Backwardation" },
  { coin: "ARB", spotPrice: 1.0820, futuresPrice: 1.0870, basisPct: 0.46, direction: "Contango" },
  { coin: "DOGE", spotPrice: 0.1542, futuresPrice: 0.1549, basisPct: 0.45, direction: "Contango" },
  { coin: "LINK", spotPrice: 14.55, futuresPrice: 14.50, basisPct: -0.34, direction: "Backwardation" },
  { coin: "MATIC", spotPrice: 0.7120, futuresPrice: 0.7148, basisPct: 0.39, direction: "Contango" },
];

const ACTIVE_BOTS = [
  { name: "Spread-A1", strategy: "Spread", status: "Running", exchangePair: "Gate.io / Binance", openPairs: 4, pnl: 127.42 },
  { name: "Funding-B2", strategy: "Funding", status: "Running", exchangePair: "Binance / Gate.io", openPairs: 6, pnl: 84.18 },
  { name: "Basis-C1", strategy: "Basis", status: "Paused", exchangePair: "Gate.io / Binance", openPairs: 2, pnl: -12.30 },
];

const OPEN_POSITIONS = [
  { pairId: "SP-001", coin: "BTC", longEx: "Gate.io", shortEx: "Binance", longEntry: 68432.50, shortEntry: 68612.30, currentSpread: 0.22, unrealizedPnl: 34.20, fundingImpact: 2.10 },
  { pairId: "SP-002", coin: "ETH", longEx: "Gate.io", shortEx: "Binance", longEntry: 3542.10, shortEntry: 3554.80, currentSpread: 0.30, unrealizedPnl: 18.50, fundingImpact: 1.40 },
  { pairId: "FD-001", coin: "SOL", longEx: "Binance", shortEx: "Gate.io", longEntry: 148.22, shortEntry: 148.68, currentSpread: 0.28, unrealizedPnl: 12.80, fundingImpact: 4.20 },
  { pairId: "FD-002", coin: "DOGE", longEx: "Binance", shortEx: "Gate.io", longEntry: 0.1542, shortEntry: 0.1548, currentSpread: 0.35, unrealizedPnl: 8.60, fundingImpact: 3.10 },
  { pairId: "BS-001", coin: "ARB", longEx: "Gate.io", shortEx: "Binance", longEntry: 1.0820, shortEntry: 1.0865, currentSpread: 0.38, unrealizedPnl: -4.20, fundingImpact: -0.80 },
];

const DECISIONS_LOG = [
  { time: "14:32:01", bot: "Spread-A1", coin: "BTC", decision: "ENTER", spread: "0.26%", blockReason: "-" },
  { time: "14:31:45", bot: "Funding-B2", coin: "SOL", decision: "ENTER", spread: "0.028%", blockReason: "-" },
  { time: "14:31:12", bot: "Spread-A1", coin: "MATIC", decision: "SKIP", spread: "0.18%", blockReason: "Below min edge" },
  { time: "14:30:58", bot: "Basis-C1", coin: "LINK", decision: "SKIP", spread: "-0.34%", blockReason: "Backwardation" },
  { time: "14:30:22", bot: "Spread-A1", coin: "AVAX", decision: "ENTER", spread: "0.40%", blockReason: "-" },
  { time: "14:29:50", bot: "Funding-B2", coin: "DOGE", decision: "ENTER", spread: "0.034%", blockReason: "-" },
];

const EXECUTION_LOG = [
  { time: "14:32:01", leg: "Long", exchange: "Gate.io", symbol: "BTCUSDT", side: "BUY", price: 68432.50, fill: "100%", latency: "42ms" },
  { time: "14:32:01", leg: "Short", exchange: "Binance", symbol: "BTCUSDT", side: "SELL", price: 68612.30, fill: "100%", latency: "28ms" },
  { time: "14:31:45", leg: "Long", exchange: "Binance", symbol: "SOLUSDT", side: "BUY", price: 148.22, fill: "100%", latency: "35ms" },
  { time: "14:31:45", leg: "Short", exchange: "Gate.io", symbol: "SOLUSDT", side: "SELL", price: 148.68, fill: "100%", latency: "51ms" },
  { time: "14:30:22", leg: "Long", exchange: "Binance", symbol: "AVAXUSDT", side: "BUY", price: 35.42, fill: "100%", latency: "31ms" },
  { time: "14:30:22", leg: "Short", exchange: "Gate.io", symbol: "AVAXUSDT", side: "SELL", price: 35.56, fill: "100%", latency: "44ms" },
];

const RISK_METRICS = { dailyPnl: 209.30, maxDD: -42.10, leverage: "2.4x", liquidationProx: "82%", oneLegFills: 0, staleAlerts: 1 };

const PERFORMANCE = { scansHr: 14200, setups: 48, executed: 12, avgEdge: "0.24%", fundingCaptured: "$18.40", pnl: "$209.30" };

const FUNDING_MONITOR = [
  { coin: "BTC", exchange: "Binance", currentRate: 0.0100, nextTime: "16:00 UTC", delta: 0.0020, bias: "Long Pay" },
  { coin: "ETH", exchange: "Gate.io", currentRate: -0.0080, nextTime: "16:00 UTC", delta: 0.0020, bias: "Short Pay" },
  { coin: "SOL", exchange: "Binance", currentRate: 0.0250, nextTime: "16:00 UTC", delta: 0.0030, bias: "Long Pay" },
  { coin: "DOGE", exchange: "Binance", currentRate: 0.0310, nextTime: "16:00 UTC", delta: 0.0030, bias: "Long Pay" },
  { coin: "ARB", exchange: "Gate.io", currentRate: -0.0150, nextTime: "16:00 UTC", delta: 0.0030, bias: "Short Pay" },
  { coin: "AVAX", exchange: "Binance", currentRate: 0.0180, nextTime: "16:00 UTC", delta: 0.0020, bias: "Long Pay" },
];

// ── Helpers ──

const cls = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(" ");
const card = "rounded-xl border border-white/[0.06] bg-white/[0.02] p-4";
const th = "px-2 py-1.5 text-left text-[9px] font-semibold uppercase tracking-wider text-white/40";
const td = "px-2 py-1.5 text-[10px] font-mono text-white/70";
const pnlColor = (v: number) => v >= 0 ? "text-[#2bc48a]" : "text-[#f6465d]";
const biasColor = (b: string) => b === "Long Pay" ? "text-[#f6465d]" : "text-[#2bc48a]";
const dirColor = (d: string) => d === "Contango" ? "text-[#5B8DEF]" : "text-[#f6465d]";

const Pill = ({ label, color = "#5B8DEF" }: { label: string; color?: string }) => (
  <span className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide" style={{ background: `${color}22`, color }}>{label}</span>
);

const MiniBtn = ({ label, variant = "default", onClick }: { label: string; variant?: "default" | "green" | "red" | "yellow"; onClick?: () => void }) => {
  const colors = { default: "border-white/10 text-white/50 hover:text-white/80", green: "border-[#2bc48a]/30 text-[#2bc48a] hover:bg-[#2bc48a]/10", red: "border-[#f6465d]/30 text-[#f6465d] hover:bg-[#f6465d]/10", yellow: "border-[#F5C542]/30 text-[#F5C542] hover:bg-[#F5C542]/10" };
  return <button onClick={onClick} className={cls("rounded border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide transition-colors", colors[variant])}>{label}</button>;
};

// ── Components ──

function TopBar({ mode, setMode, killSwitch, setKillSwitch }: { mode: string; setMode: (m: string) => void; killSwitch: boolean; setKillSwitch: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-[var(--panel)] px-3 py-1.5">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-[#2bc48a] animate-pulse" />
          <span className="text-lg font-bold tracking-wide text-white">FUTURES HEDGE BOT</span>
        </div>
        <span className="text-white/20">|</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-white/40">Mode:</span>
          <select value={mode} onChange={e => setMode(e.target.value)} className="rounded border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-mono text-[#5B8DEF] outline-none">
            <option value="paper">Paper</option>
            <option value="live">Live</option>
          </select>
        </div>
        <span className="text-white/20">|</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-white/40">Kill Switch:</span>
          <button onClick={() => setKillSwitch(!killSwitch)} className={cls("rounded border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide transition-colors", killSwitch ? "border-[#f6465d]/40 bg-[#f6465d]/10 text-[#f6465d]" : "border-white/10 text-white/30")}>
            {killSwitch ? "Armed" : "Disarmed"}
          </button>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-white/40">Data:</span>
          <div className="h-1.5 w-1.5 rounded-full bg-[#2bc48a]" />
          <span className="text-[10px] text-[#2bc48a] font-mono">Live</span>
        </div>
        <span className="text-white/20">|</span>
        <span className="text-[10px] text-white/50">Exchanges: <span className="text-white/70">Binance + Gate.io</span></span>
      </div>
    </div>
  );
}

function EngineCard({ title, children, running, onStart, onPause }: { title: string; children: React.ReactNode; running: boolean; onStart: () => void; onPause: () => void }) {
  return (
    <div className={card}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cls("h-1.5 w-1.5 rounded-full", running ? "bg-[#2bc48a] animate-pulse" : "bg-white/20")} />
          <span className="text-xs font-bold text-white">{title}</span>
        </div>
        <Pill label={running ? "Running" : "Idle"} color={running ? "#2bc48a" : "#666"} />
      </div>
      <div className="space-y-2 text-[10px]">{children}</div>
      <div className="mt-3 flex gap-2">
        <MiniBtn label={running ? "Running" : "Start"} variant="green" onClick={onStart} />
        <MiniBtn label="Pause" variant="yellow" onClick={onPause} />
      </div>
    </div>
  );
}

function EngineRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-white/40">{label}</span>
      <span className="font-mono text-white/70">{value}</span>
    </div>
  );
}

function OpportunityBoard() {
  const [tab, setTab] = useState<"spread" | "funding" | "basis">("spread");
  const tabs = [
    { key: "spread" as const, label: "Spread" },
    { key: "funding" as const, label: "Funding" },
    { key: "basis" as const, label: "Basis" },
  ];
  return (
    <div className={card}>
      <div className="mb-3 flex items-center gap-4">
        <span className="text-xs font-bold text-white">Opportunity Board</span>
        <div className="flex gap-1">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} className={cls("rounded px-2.5 py-0.5 text-[10px] font-semibold transition-colors", tab === t.key ? "bg-white/[0.08] text-white" : "text-white/30 hover:text-white/50")}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        {tab === "spread" && (
          <table className="w-full">
            <thead><tr>
              {["Coin", "Long Exchange", "Short Exchange", "Long Price", "Short Price", "Spread%", "Fees", "Net Edge", "Score", "Action"].map(h => <th key={h} className={th}>{h}</th>)}
            </tr></thead>
            <tbody>
              {SPREAD_OPPS.map((r, i) => (
                <tr key={i} className="border-t border-white/[0.03] hover:bg-white/[0.02]">
                  <td className={cls(td, "font-bold text-white/90")}>{r.coin}</td>
                  <td className={td}>{r.longEx}</td>
                  <td className={td}>{r.shortEx}</td>
                  <td className={td}>${r.longPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className={td}>${r.shortPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className={cls(td, "text-[#2bc48a]")}>{r.spreadPct.toFixed(2)}%</td>
                  <td className={td}>{r.fees.toFixed(2)}%</td>
                  <td className={cls(td, "text-[#F5C542]")}>{r.netEdge.toFixed(2)}%</td>
                  <td className={td}><span className="rounded bg-white/[0.06] px-1.5 py-0.5 font-bold text-white/80">{r.score}</span></td>
                  <td className={td}><MiniBtn label="Execute" variant="green" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === "funding" && (
          <table className="w-full">
            <thead><tr>
              {["Coin", "Exchange", "Current Funding", "Next Funding", "Delta", "Bias", "Action"].map(h => <th key={h} className={th}>{h}</th>)}
            </tr></thead>
            <tbody>
              {FUNDING_OPPS.map((r, i) => (
                <tr key={i} className="border-t border-white/[0.03] hover:bg-white/[0.02]">
                  <td className={cls(td, "font-bold text-white/90")}>{r.coin}</td>
                  <td className={td}>{r.exchange}</td>
                  <td className={cls(td, r.currentFunding >= 0 ? "text-[#2bc48a]" : "text-[#f6465d]")}>{r.currentFunding.toFixed(4)}%</td>
                  <td className={cls(td, r.nextFunding >= 0 ? "text-[#2bc48a]" : "text-[#f6465d]")}>{r.nextFunding.toFixed(4)}%</td>
                  <td className={cls(td, "text-[#F5C542]")}>{r.delta.toFixed(4)}%</td>
                  <td className={cls(td, biasColor(r.bias))}>{r.bias}</td>
                  <td className={td}><MiniBtn label="Capture" variant="green" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === "basis" && (
          <table className="w-full">
            <thead><tr>
              {["Coin", "Spot Price", "Futures Price", "Basis%", "Direction", "Action"].map(h => <th key={h} className={th}>{h}</th>)}
            </tr></thead>
            <tbody>
              {BASIS_OPPS.map((r, i) => (
                <tr key={i} className="border-t border-white/[0.03] hover:bg-white/[0.02]">
                  <td className={cls(td, "font-bold text-white/90")}>{r.coin}</td>
                  <td className={td}>${r.spotPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className={td}>${r.futuresPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className={cls(td, r.basisPct >= 0 ? "text-[#5B8DEF]" : "text-[#f6465d]")}>{r.basisPct.toFixed(2)}%</td>
                  <td className={cls(td, dirColor(r.direction))}>{r.direction}</td>
                  <td className={td}><MiniBtn label="Trade" variant="green" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function ActiveHedgeBots() {
  return (
    <div>
      <h3 className="mb-2 text-xs font-bold text-white/80 uppercase tracking-wider">Active Hedge Bots</h3>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        {ACTIVE_BOTS.map((b, i) => {
          const statusColor = b.status === "Running" ? "#2bc48a" : b.status === "Paused" ? "#F5C542" : "#f6465d";
          return (
            <div key={i} className={card}>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold text-white">{b.name}</span>
                <Pill label={b.status} color={statusColor} />
              </div>
              <div className="space-y-1 text-[10px]">
                <div className="flex justify-between"><span className="text-white/40">Strategy</span><span className="text-white/70">{b.strategy}</span></div>
                <div className="flex justify-between"><span className="text-white/40">Exchange Pair</span><span className="text-white/70">{b.exchangePair}</span></div>
                <div className="flex justify-between"><span className="text-white/40">Open Pairs</span><span className="font-mono text-white/70">{b.openPairs}</span></div>
                <div className="flex justify-between"><span className="text-white/40">PnL</span><span className={cls("font-mono font-bold", pnlColor(b.pnl))}>${b.pnl.toFixed(2)}</span></div>
              </div>
              <div className="mt-3 flex gap-1.5">
                <MiniBtn label="Pause" variant="yellow" />
                <MiniBtn label="Stop" variant="red" />
                <MiniBtn label="Unwind" variant="default" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OpenPairedPositions() {
  return (
    <div className={card}>
      <h3 className="mb-2 text-xs font-bold text-white/80 uppercase tracking-wider">Open Paired Positions</h3>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr>
            {["Pair ID", "Coin", "Long Exchange", "Short Exchange", "Long Entry", "Short Entry", "Current Spread", "Unrealized PnL", "Funding Impact", "Action"].map(h => <th key={h} className={th}>{h}</th>)}
          </tr></thead>
          <tbody>
            {OPEN_POSITIONS.map((r, i) => (
              <tr key={i} className="border-t border-white/[0.03] hover:bg-white/[0.02]">
                <td className={cls(td, "text-[#5B8DEF]")}>{r.pairId}</td>
                <td className={cls(td, "font-bold text-white/90")}>{r.coin}</td>
                <td className={td}>{r.longEx}</td>
                <td className={td}>{r.shortEx}</td>
                <td className={td}>${r.longEntry.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td className={td}>${r.shortEntry.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td className={cls(td, "text-[#F5C542]")}>{r.currentSpread.toFixed(2)}%</td>
                <td className={cls(td, "font-bold", pnlColor(r.unrealizedPnl))}>${r.unrealizedPnl.toFixed(2)}</td>
                <td className={cls(td, pnlColor(r.fundingImpact))}>${r.fundingImpact.toFixed(2)}</td>
                <td className={td}>
                  <div className="flex gap-1">
                    <MiniBtn label="Close Pair" variant="red" />
                    <MiniBtn label="Reduce" variant="yellow" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BottomTabs() {
  const [tab, setTab] = useState<"decisions" | "execution" | "risk" | "performance" | "funding">("decisions");
  const tabs = [
    { key: "decisions" as const, label: "Decisions" },
    { key: "execution" as const, label: "Execution" },
    { key: "risk" as const, label: "Risk" },
    { key: "performance" as const, label: "Performance" },
    { key: "funding" as const, label: "Funding Monitor" },
  ];
  return (
    <div className={card}>
      <div className="mb-3 flex gap-1">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className={cls("rounded px-2.5 py-0.5 text-[10px] font-semibold transition-colors", tab === t.key ? "bg-white/[0.08] text-white" : "text-white/30 hover:text-white/50")}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        {tab === "decisions" && (
          <table className="w-full">
            <thead><tr>{["Time", "Bot", "Coin", "Decision", "Spread", "Block Reason"].map(h => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody>{DECISIONS_LOG.map((r, i) => (
              <tr key={i} className="border-t border-white/[0.03]">
                <td className={cls(td, "text-white/40")}>{r.time}</td>
                <td className={td}>{r.bot}</td>
                <td className={cls(td, "font-bold text-white/90")}>{r.coin}</td>
                <td className={td}><Pill label={r.decision} color={r.decision === "ENTER" ? "#2bc48a" : "#666"} /></td>
                <td className={cls(td, "text-[#F5C542]")}>{r.spread}</td>
                <td className={cls(td, r.blockReason !== "-" ? "text-[#f6465d]" : "text-white/30")}>{r.blockReason}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
        {tab === "execution" && (
          <table className="w-full">
            <thead><tr>{["Time", "Leg", "Exchange", "Symbol", "Side", "Price", "Fill", "Latency"].map(h => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody>{EXECUTION_LOG.map((r, i) => (
              <tr key={i} className="border-t border-white/[0.03]">
                <td className={cls(td, "text-white/40")}>{r.time}</td>
                <td className={td}><Pill label={r.leg} color={r.leg === "Long" ? "#2bc48a" : "#f6465d"} /></td>
                <td className={td}>{r.exchange}</td>
                <td className={cls(td, "text-white/90")}>{r.symbol}</td>
                <td className={cls(td, r.side === "BUY" ? "text-[#2bc48a]" : "text-[#f6465d]")}>{r.side}</td>
                <td className={td}>${r.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td className={cls(td, "text-[#2bc48a]")}>{r.fill}</td>
                <td className={cls(td, "text-[#5B8DEF]")}>{r.latency}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
        {tab === "risk" && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {[
              { label: "Daily PnL", value: `$${RISK_METRICS.dailyPnl.toFixed(2)}`, color: pnlColor(RISK_METRICS.dailyPnl) },
              { label: "Max Drawdown", value: `$${RISK_METRICS.maxDD.toFixed(2)}`, color: "text-[#f6465d]" },
              { label: "Leverage", value: RISK_METRICS.leverage, color: "text-[#F5C542]" },
              { label: "Liquidation Proximity", value: RISK_METRICS.liquidationProx, color: "text-[#2bc48a]" },
              { label: "One-Leg Fills", value: String(RISK_METRICS.oneLegFills), color: RISK_METRICS.oneLegFills === 0 ? "text-[#2bc48a]" : "text-[#f6465d]" },
              { label: "Stale Alerts", value: String(RISK_METRICS.staleAlerts), color: RISK_METRICS.staleAlerts === 0 ? "text-[#2bc48a]" : "text-[#F5C542]" },
            ].map(m => (
              <div key={m.label} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-center">
                <div className="text-[9px] uppercase tracking-wider text-white/40 mb-1">{m.label}</div>
                <div className={cls("font-mono text-sm font-bold", m.color)}>{m.value}</div>
              </div>
            ))}
          </div>
        )}
        {tab === "performance" && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {[
              { label: "Scans/hr", value: PERFORMANCE.scansHr.toLocaleString(), color: "text-[#5B8DEF]" },
              { label: "Setups", value: String(PERFORMANCE.setups), color: "text-white/80" },
              { label: "Executed", value: String(PERFORMANCE.executed), color: "text-[#2bc48a]" },
              { label: "Avg Edge", value: PERFORMANCE.avgEdge, color: "text-[#F5C542]" },
              { label: "Funding Captured", value: PERFORMANCE.fundingCaptured, color: "text-[#2bc48a]" },
              { label: "PnL", value: PERFORMANCE.pnl, color: "text-[#2bc48a]" },
            ].map(m => (
              <div key={m.label} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-center">
                <div className="text-[9px] uppercase tracking-wider text-white/40 mb-1">{m.label}</div>
                <div className={cls("font-mono text-sm font-bold", m.color)}>{m.value}</div>
              </div>
            ))}
          </div>
        )}
        {tab === "funding" && (
          <table className="w-full">
            <thead><tr>{["Coin", "Exchange", "Current Rate", "Next Time", "Delta", "Bias"].map(h => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody>{FUNDING_MONITOR.map((r, i) => (
              <tr key={i} className="border-t border-white/[0.03]">
                <td className={cls(td, "font-bold text-white/90")}>{r.coin}</td>
                <td className={td}>{r.exchange}</td>
                <td className={cls(td, r.currentRate >= 0 ? "text-[#2bc48a]" : "text-[#f6465d]")}>{r.currentRate.toFixed(4)}%</td>
                <td className={cls(td, "text-white/50")}>{r.nextTime}</td>
                <td className={cls(td, "text-[#F5C542]")}>{r.delta.toFixed(4)}%</td>
                <td className={cls(td, biasColor(r.bias))}>{r.bias}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Main Page ──

export default function FuturesHedgeBotPage() {
  const [mode, setMode] = useState("paper");
  const [killSwitch, setKillSwitch] = useState(true);
  const [spreadRunning, setSpreadRunning] = useState(true);
  const [fundingRunning, setFundingRunning] = useState(true);
  const [basisRunning, setBasisRunning] = useState(false);

  return (
    <main className="min-h-screen bg-[var(--bg)] p-1.5 md:p-2 flex flex-col gap-2">
      {/* ── TOP BAR ── */}
      <TopBar mode={mode} setMode={setMode} killSwitch={killSwitch} setKillSwitch={setKillSwitch} />

      {/* ── ENGINE CARDS ── */}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <EngineCard title="Spread Engine" running={spreadRunning} onStart={() => setSpreadRunning(true)} onPause={() => setSpreadRunning(false)}>
          <EngineRow label="Long" value="Gate.io" />
          <EngineRow label="Short" value="Binance" />
          <EngineRow label="Universe" value="Top 50" />
          <EngineRow label="Min gross spread" value="0.20%" />
          <EngineRow label="Slippage buffer" value="0.05%" />
        </EngineCard>
        <EngineCard title="Funding Engine" running={fundingRunning} onStart={() => setFundingRunning(true)} onPause={() => setFundingRunning(false)}>
          <EngineRow label="Exchange pair" value="Gate.io <> Binance" />
          <EngineRow label="Funding threshold" value="0.01%" />
          <EngineRow label="Holding horizon" value="8H" />
        </EngineCard>
        <EngineCard title="Basis Engine" running={basisRunning} onStart={() => setBasisRunning(true)} onPause={() => setBasisRunning(false)}>
          <EngineRow label="Reference" value="Spot vs Futures" />
          <EngineRow label="Basis threshold" value="0.30%" />
        </EngineCard>
      </div>

      {/* ── OPPORTUNITY BOARD ── */}
      <OpportunityBoard />

      {/* ── ACTIVE HEDGE BOTS ── */}
      <ActiveHedgeBots />

      {/* ── OPEN PAIRED POSITIONS ── */}
      <OpenPairedPositions />

      {/* ── BOTTOM TABS ── */}
      <BottomTabs />
    </main>
  );
}
