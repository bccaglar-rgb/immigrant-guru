import { useState } from "react";
import BotExchangeBar from "../../components/bot/BotExchangeBar";
import { BotProvider } from "../../components/bot/BotContext";
import BotExecutionLog from "../../components/bot/BotExecutionLog";
import BotStrategyChart from "../../components/bot/BotStrategyChart";
import BotBacktestPanel from "../../components/bot/BotBacktestPanel";

/* ── Helpers ── */
const cn = (...cls: (string | false | undefined)[]) => cls.filter(Boolean).join(" ");
const fmt = (n: number, d = 2) =>
  n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });

const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("rounded-xl border border-white/[0.06] bg-white/[0.02] p-4", className)}>{children}</div>
);

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <h3 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-white/30">{children}</h3>
);

const StatBox = ({
  label, value, color, sub,
}: { label: string; value: string; color: string; sub?: string }) => (
  <div className="rounded-lg border border-white/[0.06] bg-[#0F1012] p-3 text-center">
    <p className="text-[9px] uppercase tracking-wider text-white/30">{label}</p>
    <p className={cn("mt-1 text-[17px] font-bold", color)}>{value}</p>
    {sub && <p className="mt-0.5 text-[9px] text-white/30">{sub}</p>}
  </div>
);

/* ── Orderbook Health Data ── */
interface HealthMetric {
  label: string;
  value: string;
  numericValue: number;
  threshold: string;
  thresholdNum: number;
  unit: string;
  met: boolean;
  direction: "above" | "below";
}

const HEALTH_METRICS: HealthMetric[] = [
  { label: "SPREAD",    value: "2.1 bps",  numericValue: 2.1,  threshold: "< 3 bps",   thresholdNum: 3,   unit: "bps",  met: true,  direction: "below" },
  { label: "DEPTH",     value: "$1.2M",     numericValue: 1200, threshold: "> $500K",    thresholdNum: 500, unit: "$K",   met: true,  direction: "above" },
  { label: "IMBALANCE", value: "+0.12",     numericValue: 0.12, threshold: "> 0.2",      thresholdNum: 0.2, unit: "",     met: false, direction: "above" },
  { label: "MOMENTUM",  value: "Flat",      numericValue: 0,    threshold: "Need burst", thresholdNum: 1,   unit: "",     met: false, direction: "above" },
];

/* ── Mock Trades ── */
interface MicroTrade {
  time: string;
  pair: string;
  side: "LONG" | "SHORT";
  entry: number;
  exit: number;
  pnl: number;
  holdTime: string;
  status: "Win" | "Loss" | "Open";
}

const MICRO_TRADES: MicroTrade[] = [
  { time: "14:42:58", pair: "BTC/USDT", side: "LONG",  entry: 94820, exit: 94896, pnl: 0.08, holdTime: "32s",  status: "Win" },
  { time: "14:42:12", pair: "BTC/USDT", side: "SHORT", entry: 94910, exit: 94868, pnl: 0.04, holdTime: "28s",  status: "Win" },
  { time: "14:41:30", pair: "ETH/USDT", side: "LONG",  entry: 3482,  exit: 3480,  pnl: -0.06, holdTime: "45s", status: "Loss" },
  { time: "14:40:48", pair: "BTC/USDT", side: "LONG",  entry: 94750, exit: 94830, pnl: 0.08, holdTime: "38s",  status: "Win" },
  { time: "14:40:02", pair: "SOL/USDT", side: "SHORT", entry: 178.5, exit: 178.3, pnl: 0.11, holdTime: "22s",  status: "Win" },
  { time: "14:39:18", pair: "BTC/USDT", side: "LONG",  entry: 94680, exit: 94760, pnl: 0.08, holdTime: "40s",  status: "Win" },
  { time: "14:38:35", pair: "ETH/USDT", side: "SHORT", entry: 3495,  exit: 3499,  pnl: -0.11, holdTime: "52s", status: "Loss" },
  { time: "14:37:50", pair: "BTC/USDT", side: "LONG",  entry: 94600, exit: 94670, pnl: 0.07, holdTime: "35s",  status: "Win" },
  { time: "14:37:05", pair: "SOL/USDT", side: "LONG",  entry: 177.9, exit: 178.1, pnl: 0.11, holdTime: "29s",  status: "Win" },
  { time: "14:36:22", pair: "BTC/USDT", side: "SHORT", entry: 94700, exit: 94630, pnl: 0.07, holdTime: "42s",  status: "Win" },
  { time: "14:35:40", pair: "ETH/USDT", side: "LONG",  entry: 3478,  exit: 3482,  pnl: 0.11, holdTime: "26s",  status: "Win" },
  { time: "14:34:55", pair: "BTC/USDT", side: "LONG",  entry: 94550, exit: 94620, pnl: 0.07, holdTime: "38s",  status: "Win" },
  { time: "14:34:10", pair: "SOL/USDT", side: "SHORT", entry: 178.2, exit: 178.4, pnl: -0.11, holdTime: "50s", status: "Loss" },
  { time: "14:33:28", pair: "BTC/USDT", side: "SHORT", entry: 94650, exit: 94590, pnl: 0.06, holdTime: "33s",  status: "Win" },
  { time: "14:32:45", pair: "BTC/USDT", side: "LONG",  entry: 94500, exit: 94580, pnl: 0.08, holdTime: "41s",  status: "Win" },
];

/* ── Latency Monitor ── */
const LatencyMonitor = () => {
  const latencyHistory = [22, 18, 24, 16, 19, 21, 15, 18, 20, 17, 23, 18, 14, 19, 16, 22, 18, 20, 17, 18];
  const avg = latencyHistory.reduce((a, b) => a + b, 0) / latencyHistory.length;
  const maxLat = Math.max(...latencyHistory);
  const minLat = Math.min(...latencyHistory);

  return (
    <Card>
      <SectionLabel>Latency Monitor</SectionLabel>
      <div className="mb-3 grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-[#0F1012] p-2.5 text-center">
          <p className="text-[9px] text-white/30">Current</p>
          <p className="mt-0.5 text-[16px] font-bold font-mono text-[#2bc48a]">18ms</p>
        </div>
        <div className="rounded-lg bg-[#0F1012] p-2.5 text-center">
          <p className="text-[9px] text-white/30">Average</p>
          <p className="mt-0.5 text-[16px] font-bold font-mono text-[#5B8DEF]">{fmt(avg, 0)}ms</p>
        </div>
        <div className="rounded-lg bg-[#0F1012] p-2.5 text-center">
          <p className="text-[9px] text-white/30">Range</p>
          <p className="mt-0.5 text-[16px] font-bold font-mono text-white/60">{minLat}-{maxLat}ms</p>
        </div>
      </div>
      <div className="flex items-end gap-[2px]" style={{ height: 48 }}>
        {latencyHistory.map((l, i) => {
          const pct = maxLat > 0 ? (l / maxLat) * 100 : 50;
          const fast = l < 20;
          return (
            <div
              key={i}
              className={cn("flex-1 rounded-t", fast ? "bg-[#2bc48a]/50" : "bg-[#F5C542]/50")}
              style={{ height: `${pct}%` }}
              title={`${l}ms`}
            />
          );
        })}
      </div>
    </Card>
  );
};

/* ── Micro Session Stats ── */
const MicroSessionStats = () => (
  <Card>
    <SectionLabel>Micro Session Stats</SectionLabel>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {[
        { label: "Gross Profit", value: "+$42.80", color: "text-[#2bc48a]" },
        { label: "Gross Loss",   value: "-$18.60", color: "text-[#f6465d]" },
        { label: "Net PnL",      value: "+$24.20", color: "text-[#2bc48a]" },
        { label: "Profit Factor", value: "2.30",   color: "text-[#5B8DEF]" },
        { label: "Max Drawdown", value: "-0.18%",  color: "text-[#f6465d]" },
        { label: "Trades / Min", value: "2.1",     color: "text-[#F5C542]" },
        { label: "Best Streak",  value: "12W",     color: "text-[#2bc48a]" },
        { label: "Fill Rate",    value: "98.4%",   color: "text-white/60" },
      ].map((s, i) => (
        <div key={i} className="rounded-lg bg-[#0F1012] p-2 text-center">
          <p className="text-[9px] uppercase tracking-wider text-white/30">{s.label}</p>
          <p className={cn("mt-0.5 text-[13px] font-bold font-mono", s.color)}>{s.value}</p>
        </div>
      ))}
    </div>
  </Card>
);

/* ── Orderbook Health Panel ── */
const OrderbookHealth = () => (
  <Card>
    <SectionLabel>Orderbook Health</SectionLabel>
    <div className="space-y-3">
      {HEALTH_METRICS.map((m, i) => {
        const fillPct = m.direction === "below"
          ? Math.max(5, Math.min(100, (1 - m.numericValue / (m.thresholdNum * 2)) * 100))
          : Math.max(5, Math.min(100, (m.numericValue / (m.thresholdNum * 2)) * 100));

        return (
          <div key={i} className="rounded-lg bg-[#0F1012] p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-bold tracking-wider text-white/50">{m.label}</span>
                <span className={cn(
                  "text-[15px] font-bold font-mono",
                  m.met ? "text-[#2bc48a]" : "text-[#f6465d]"
                )}>
                  {m.value}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-white/30">{m.threshold}</span>
                <span className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold",
                  m.met ? "bg-[#2bc48a]/20 text-[#2bc48a]" : "bg-[#f6465d]/20 text-[#f6465d]"
                )}>
                  {m.met ? "\u2713" : "\u2717"}
                </span>
              </div>
            </div>
            {/* Progress bar */}
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.04]">
              <div
                className={cn("h-full rounded-full transition-all", m.met ? "bg-[#2bc48a]" : "bg-[#f6465d]/60")}
                style={{ width: `${fillPct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
    {/* Aggregate status */}
    {(() => {
      const metCount = HEALTH_METRICS.filter((m) => m.met).length;
      const allMet = metCount === HEALTH_METRICS.length;
      return (
        <div className={cn(
          "mt-3 rounded-lg border px-3 py-2 text-center text-[11px] font-bold",
          allMet
            ? "border-[#2bc48a]/30 bg-[#2bc48a]/10 text-[#2bc48a]"
            : "border-[#F5C542]/30 bg-[#F5C542]/10 text-[#F5C542]"
        )}>
          {allMet
            ? "ALL CONDITIONS MET \u2014 Ready to scalp"
            : `${metCount}/${HEALTH_METRICS.length} CONDITIONS MET \u2014 Waiting for ${HEALTH_METRICS.length - metCount} more`}
        </div>
      );
    })()}
  </Card>
);

/* ── Setup Panel ── */
const SETUP_FIELDS = [
  { label: "Max Spread (bps)", key: "maxSpread", defaultVal: 3 },
  { label: "Min Depth ($K)",   key: "minDepth",  defaultVal: 500 },
  { label: "Momentum Threshold", key: "momentum", defaultVal: 1.0 },
  { label: "TP (pips)",        key: "tp",         defaultVal: 8 },
  { label: "SL (pips)",        key: "sl",         defaultVal: 5 },
  { label: "Max Trades / hr",  key: "maxTrades",  defaultVal: 50 },
  { label: "Cooldown (sec)",   key: "cooldown",   defaultVal: 10 },
  { label: "Imbalance Min",    key: "imbMin",     defaultVal: 0.2 },
];

const SetupPanel = () => {
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(SETUP_FIELDS.map((f) => [f.key, f.defaultVal]))
  );

  return (
    <Card>
      <SectionLabel>Micro Scalper Setup</SectionLabel>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {SETUP_FIELDS.map((f) => (
          <div key={f.key}>
            <label className="mb-1 block text-[9px] uppercase tracking-wider text-white/30">{f.label}</label>
            <input
              type="number"
              step="any"
              value={values[f.key]}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: parseFloat(e.target.value) || 0 }))}
              className="w-full rounded-lg border border-white/[0.08] bg-[#0F1012] px-3 py-2 text-[13px] text-white/80 outline-none focus:border-[#2bc48a]/40"
            />
          </div>
        ))}
      </div>
    </Card>
  );
};

/* ── Trades Table ── */
const TradesTable = () => (
  <Card>
    <SectionLabel>Recent Micro Trades (Last 15)</SectionLabel>
    <div className="overflow-x-auto">
      <table className="w-full text-[10px]">
        <thead>
          <tr className="border-b border-white/[0.06] text-white/30">
            {["Time", "Pair", "Side", "Entry", "Exit", "PnL %", "Hold", "Status"].map((h) => (
              <th key={h} className="px-2 py-1.5 text-left font-medium uppercase tracking-wider">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MICRO_TRADES.map((t, i) => (
            <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
              <td className="px-2 py-1.5 font-mono text-white/50">{t.time}</td>
              <td className="px-2 py-1.5 text-white/70">{t.pair}</td>
              <td className={cn("px-2 py-1.5 font-bold", t.side === "LONG" ? "text-[#2bc48a]" : "text-[#f6465d]")}>
                {t.side}
              </td>
              <td className="px-2 py-1.5 font-mono text-white/60">{fmt(t.entry, t.entry > 1000 ? 0 : 1)}</td>
              <td className="px-2 py-1.5 font-mono text-white/60">{fmt(t.exit, t.exit > 1000 ? 0 : 1)}</td>
              <td className={cn("px-2 py-1.5 font-mono font-bold", t.pnl >= 0 ? "text-[#2bc48a]" : "text-[#f6465d]")}>
                {t.pnl >= 0 ? "+" : ""}{fmt(t.pnl)}%
              </td>
              <td className="px-2 py-1.5 font-mono text-white/50">{t.holdTime}</td>
              <td className="px-2 py-1.5">
                <span className={cn(
                  "inline-block rounded-full border px-2 py-0.5 text-[8px] font-bold uppercase",
                  t.status === "Win" ? "border-[#2bc48a]/30 bg-[#2bc48a]/10 text-[#2bc48a]"
                    : t.status === "Loss" ? "border-[#f6465d]/30 bg-[#f6465d]/10 text-[#f6465d]"
                    : "border-[#F5C542]/30 bg-[#F5C542]/10 text-[#F5C542]"
                )}>
                  {t.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </Card>
);

/* ── Thinking Panel ── */
const ThinkingPanel = () => {
  const conditions = [
    { label: "Spread < 3 bps",   met: true,  detail: "2.1 bps" },
    { label: "Depth > $500K",    met: true,  detail: "$1.2M" },
    { label: "Imbalance > 0.2",  met: false, detail: "0.12" },
    { label: "Momentum burst",   met: false, detail: "Flat" },
  ];

  return (
    <Card>
      <SectionLabel>Bot Thinking</SectionLabel>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {conditions.map((c, i) => (
          <div key={i} className={cn(
            "rounded-lg border p-3 text-center",
            c.met ? "border-[#2bc48a]/20 bg-[#2bc48a]/5" : "border-[#f6465d]/20 bg-[#f6465d]/5"
          )}>
            <p className={cn("text-[10px] font-bold", c.met ? "text-[#2bc48a]" : "text-[#f6465d]")}>
              {c.met ? "\u25CF PASS" : "\u25CB FAIL"}
            </p>
            <p className="mt-1 text-[9px] text-white/40">{c.label}</p>
            <p className="mt-0.5 text-[12px] font-mono font-bold text-white/70">{c.detail}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-lg border border-[#F5C542]/30 bg-[#F5C542]/10 px-3 py-2 text-center text-[11px] font-bold text-[#F5C542]">
        TIGHT SPREAD CONFIRMED \u2014 Waiting for imbalance spike
      </div>
    </Card>
  );
};

/* ── Main Page ── */
export default function MicroScalperBotPage() {
  return (
    <BotProvider>
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      {/* 1. Exchange Bar */}
      <BotExchangeBar botName="Micro Scalper Engine" accentColor="#2bc48a" />

      {/* 2. Execution Metrics */}
      <Card>
        <SectionLabel>Execution Metrics</SectionLabel>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          <StatBox label="Trades Today" value="124" color="text-white" sub="ultra-fast" />
          <StatBox label="Win Rate"     value="64%" color="text-[#2bc48a]" sub="79W / 45L" />
          <StatBox label="Avg Trade"    value="+0.08%" color="text-[#2bc48a]" sub="micro profit" />
          <StatBox label="Avg Hold"     value="38s" color="text-[#5B8DEF]" sub="sub-minute" />
          <StatBox label="Latency"      value="18ms" color="text-[#F5C542]" sub="order to fill" />
          <StatBox label="Spread"       value="2.1 bps" color="text-white/70" sub="session avg" />
        </div>
      </Card>

      {/* 3. Orderbook Health */}
      <OrderbookHealth />

      {/* Latency Monitor + Session Stats */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <LatencyMonitor />
        <MicroSessionStats />
      </div>

      {/* 4. Chart */}
      <BotStrategyChart defaultTf="1m" indicators={["Spread", "Depth"]} accentColor="#2bc48a" />

      {/* 5. Backtest */}
      <BotBacktestPanel strategyName="Micro Scalp" accentColor="#2bc48a" />

      {/* 6. Setup */}
      <SetupPanel />

      {/* 7. Recent Trades */}
      <TradesTable />

      {/* 8. Bot Thinking + Log */}
      <ThinkingPanel />
      <BotExecutionLog accentColor="#2bc48a" />
    </div>
    </BotProvider>
  );
}
