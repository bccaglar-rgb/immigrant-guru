import { useState } from "react";
import BotExchangeBar from "../../components/bot/BotExchangeBar";
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

/* ── Mock Data ── */
const SPREAD_HISTORY = [3.1, 2.6, 2.9, 3.4, 2.2, 2.8, 3.0, 2.5, 2.7, 3.2, 2.4, 2.1, 2.9, 3.3, 2.6, 2.8, 2.3, 2.5, 2.7, 2.8];
const SPREAD_THRESHOLD = 5;

interface ScalpTrade {
  time: string;
  pair: string;
  side: "LONG" | "SHORT";
  entry: number;
  exit: number;
  pnl: number;
  holdTime: string;
  status: "Win" | "Loss" | "Open";
}

const RECENT_SCALPS: ScalpTrade[] = [
  { time: "14:42:18", pair: "BTC/USDT", side: "LONG",  entry: 94820, exit: 94992, pnl: 0.18, holdTime: "1m 48s", status: "Win" },
  { time: "14:38:05", pair: "BTC/USDT", side: "SHORT", entry: 94910, exit: 94832, pnl: 0.08, holdTime: "2m 12s", status: "Win" },
  { time: "14:33:41", pair: "ETH/USDT", side: "LONG",  entry: 3482,  exit: 3479,  pnl: -0.09, holdTime: "3m 05s", status: "Loss" },
  { time: "14:29:10", pair: "BTC/USDT", side: "LONG",  entry: 94650, exit: 94830, pnl: 0.19, holdTime: "1m 33s", status: "Win" },
  { time: "14:24:55", pair: "SOL/USDT", side: "SHORT", entry: 178.4, exit: 178.1, pnl: 0.17, holdTime: "2m 44s", status: "Win" },
  { time: "14:20:02", pair: "BTC/USDT", side: "LONG",  entry: 94580, exit: 94720, pnl: 0.15, holdTime: "1m 58s", status: "Win" },
  { time: "14:15:38", pair: "ETH/USDT", side: "SHORT", entry: 3490,  exit: 3497,  pnl: -0.20, holdTime: "4m 12s", status: "Loss" },
  { time: "14:11:22", pair: "BTC/USDT", side: "LONG",  entry: 94420, exit: 94590, pnl: 0.18, holdTime: "2m 01s", status: "Win" },
  { time: "14:06:50", pair: "SOL/USDT", side: "LONG",  entry: 177.8, exit: 178.2, pnl: 0.22, holdTime: "1m 40s", status: "Win" },
  { time: "14:02:15", pair: "BTC/USDT", side: "SHORT", entry: 94550, exit: 94410, pnl: 0.15, holdTime: "2m 30s", status: "Win" },
];

/* ── Speed Dashboard ── */
const SpeedDashboard = () => {
  const speeds = [
    { label: "Order Placement",  ms: 12,  max: 50,  status: "Excellent" },
    { label: "Fill Confirmation", ms: 42, max: 100, status: "Good" },
    { label: "Cancel Latency",   ms: 8,   max: 30,  status: "Excellent" },
    { label: "Data Feed",        ms: 3,   max: 20,  status: "Excellent" },
  ];

  return (
    <Card>
      <SectionLabel>Speed Dashboard</SectionLabel>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {speeds.map((s, i) => {
          const pct = Math.min(100, (s.ms / s.max) * 100);
          const fast = pct < 50;
          return (
            <div key={i} className="rounded-lg bg-[#0F1012] p-3">
              <p className="text-[9px] uppercase tracking-wider text-white/30">{s.label}</p>
              <p className={cn("mt-1 text-[18px] font-bold font-mono", fast ? "text-[#2bc48a]" : "text-[#F5C542]")}>
                {s.ms}ms
              </p>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.04]">
                <div
                  className={cn("h-full rounded-full", fast ? "bg-[#2bc48a]" : "bg-[#F5C542]")}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className={cn("mt-1 text-[8px] font-bold uppercase", fast ? "text-[#2bc48a]/60" : "text-[#F5C542]/60")}>
                {s.status}
              </p>
            </div>
          );
        })}
      </div>
    </Card>
  );
};

/* ── Session Summary ── */
const SessionSummary = () => (
  <Card>
    <SectionLabel>Session Summary</SectionLabel>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[
        { label: "Gross Profit", value: "+$84.20", color: "text-[#2bc48a]" },
        { label: "Gross Loss",   value: "-$32.10", color: "text-[#f6465d]" },
        { label: "Net PnL",      value: "+$52.10", color: "text-[#2bc48a]" },
        { label: "Profit Factor", value: "2.62",   color: "text-[#5B8DEF]" },
        { label: "Max Drawdown", value: "-0.34%",  color: "text-[#f6465d]" },
        { label: "Sharpe (est)", value: "3.8",     color: "text-[#F5C542]" },
        { label: "Longest Win",  value: "8 trades", color: "text-[#2bc48a]" },
        { label: "Avg Slippage", value: "0.4 bps", color: "text-white/60" },
      ].map((s, i) => (
        <div key={i} className="rounded-lg bg-[#0F1012] p-2.5 text-center">
          <p className="text-[9px] uppercase tracking-wider text-white/30">{s.label}</p>
          <p className={cn("mt-0.5 text-[14px] font-bold font-mono", s.color)}>{s.value}</p>
        </div>
      ))}
    </div>
  </Card>
);

/* ── Spread Monitor ── */
const SpreadMonitor = () => {
  const current = SPREAD_HISTORY[SPREAD_HISTORY.length - 1];
  const max = Math.max(...SPREAD_HISTORY);
  const ok = current < SPREAD_THRESHOLD;

  return (
    <Card>
      <SectionLabel>Spread Monitor</SectionLabel>

      {/* Current Spread */}
      <div className="mb-4 flex items-center justify-between rounded-lg bg-[#0F1012] p-3">
        <div>
          <p className="text-[9px] uppercase tracking-wider text-white/30">Current Spread</p>
          <p className={cn("text-[22px] font-bold", ok ? "text-[#2bc48a]" : "text-[#f6465d]")}>
            {fmt(current, 1)} bps {ok ? "\u2705" : "\u274C"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[9px] text-white/30">Threshold</p>
          <p className="text-[13px] font-medium text-white/50">&lt; {SPREAD_THRESHOLD} bps</p>
        </div>
      </div>

      {/* Mini bar chart */}
      <div className="mb-4 flex items-end gap-[3px]" style={{ height: 60 }}>
        {SPREAD_HISTORY.map((s, i) => {
          const pct = max > 0 ? (s / max) * 100 : 50;
          const barOk = s < SPREAD_THRESHOLD;
          return (
            <div
              key={i}
              className={cn("flex-1 rounded-t", barOk ? "bg-[#2bc48a]/60" : "bg-[#f6465d]/60")}
              style={{ height: `${pct}%` }}
              title={`${fmt(s, 1)} bps`}
            />
          );
        })}
      </div>

      {/* Volume + EMA status */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-[#0F1012] p-2 text-center">
          <p className="text-[9px] text-white/30">Volume Status</p>
          <p className="mt-0.5 text-[12px] font-bold text-[#2bc48a]">1.3x avg</p>
        </div>
        <div className="rounded-lg bg-[#0F1012] p-2 text-center">
          <p className="text-[9px] text-white/30">EMA5 / EMA13</p>
          <p className="mt-0.5 text-[12px] font-bold text-[#2bc48a]">Bullish Cross</p>
        </div>
      </div>
    </Card>
  );
};

/* ── Setup Panel ── */
const SETUP_FIELDS = [
  { label: "Fast EMA",       key: "fastEma",    type: "number" as const, defaultVal: 5 },
  { label: "Slow EMA",       key: "slowEma",    type: "number" as const, defaultVal: 13 },
  { label: "Max Spread (bps)", key: "maxSpread", type: "number" as const, defaultVal: 5 },
  { label: "Take Profit %",  key: "tp",         type: "number" as const, defaultVal: 0.4 },
  { label: "Stop Loss %",    key: "sl",         type: "number" as const, defaultVal: 0.2 },
  { label: "Min Volume (x)", key: "minVol",     type: "number" as const, defaultVal: 1.0 },
  { label: "Max Trades / hr", key: "maxTrades", type: "number" as const, defaultVal: 20 },
  { label: "Cooldown (sec)", key: "cooldown",   type: "number" as const, defaultVal: 30 },
];

const SetupPanel = () => {
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(SETUP_FIELDS.map((f) => [f.key, f.defaultVal]))
  );

  return (
    <Card>
      <SectionLabel>Scalping Setup</SectionLabel>
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

/* ── Thinking Conditions ── */
const ThinkingPanel = () => {
  const conditions = [
    { label: "EMA5 > EMA13", met: true, detail: "Cross 2 candles ago" },
    { label: "Spread < 5 bps", met: true, detail: "2.8 bps" },
    { label: "Volume > avg",   met: true, detail: "1.3x" },
    { label: "Cooldown clear", met: true, detail: "42s since last" },
  ];
  const allMet = conditions.every((c) => c.met);

  return (
    <Card>
      <SectionLabel>Bot Thinking</SectionLabel>
      <div className="space-y-2">
        {conditions.map((c, i) => (
          <div key={i} className="flex items-center justify-between rounded-lg bg-[#0F1012] px-3 py-2">
            <div className="flex items-center gap-2">
              <span className={cn("text-[12px]", c.met ? "text-[#2bc48a]" : "text-[#f6465d]")}>
                {c.met ? "\u25CF" : "\u25CB"}
              </span>
              <span className="text-[11px] font-medium text-white/60">{c.label}</span>
            </div>
            <span className={cn("text-[11px] font-mono", c.met ? "text-[#2bc48a]" : "text-[#f6465d]")}>
              {c.detail}
            </span>
          </div>
        ))}
      </div>
      <div className={cn(
        "mt-3 rounded-lg border px-3 py-2 text-center text-[11px] font-bold",
        allMet
          ? "border-[#2bc48a]/30 bg-[#2bc48a]/10 text-[#2bc48a]"
          : "border-[#f6465d]/30 bg-[#f6465d]/10 text-[#f6465d]"
      )}>
        {allMet ? "SIGNAL ACTIVE \u2014 Executing scalp entry" : "WAITING \u2014 Conditions not met"}
      </div>
    </Card>
  );
};

/* ── Trades Table ── */
const TradesTable = () => (
  <Card>
    <SectionLabel>Active Scalps (Last 10)</SectionLabel>
    <div className="overflow-x-auto">
      <table className="w-full text-[10px]">
        <thead>
          <tr className="border-b border-white/[0.06] text-white/30">
            {["Time", "Pair", "Side", "Entry", "Exit", "PnL %", "Hold Time", "Status"].map((h) => (
              <th key={h} className="px-2 py-1.5 text-left font-medium uppercase tracking-wider">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {RECENT_SCALPS.map((t, i) => (
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

/* ── Main Page ── */
export default function ScalpingBotPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      {/* 1. Exchange Bar */}
      <BotExchangeBar botName="Scalping Engine" accentColor="#2bc48a" />

      {/* 2. Execution Metrics */}
      <Card>
        <SectionLabel>Execution Metrics</SectionLabel>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          <StatBox label="Trades Today" value="47" color="text-white" sub="last 24h" />
          <StatBox label="Win Rate"     value="62%" color="text-[#2bc48a]" sub="29W / 18L" />
          <StatBox label="Avg Trade"    value="+0.18%" color="text-[#2bc48a]" sub="per scalp" />
          <StatBox label="Avg Hold"     value="2.1 min" color="text-[#5B8DEF]" sub="mean duration" />
          <StatBox label="Latency"      value="42ms" color="text-[#F5C542]" sub="order to fill" />
          <StatBox label="Spread Avg"   value="2.8 bps" color="text-white/70" sub="session avg" />
        </div>
      </Card>

      {/* 3. Chart + Spread Monitor */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BotStrategyChart defaultTf="1m" indicators={["EMA 5", "EMA 13"]} accentColor="#2bc48a" />
        <SpreadMonitor />
      </div>

      {/* Speed Dashboard */}
      <SpeedDashboard />

      {/* Session Summary */}
      <SessionSummary />

      {/* 4. Backtest */}
      <BotBacktestPanel strategyName="EMA Scalp" accentColor="#2bc48a" />

      {/* 5. Setup */}
      <SetupPanel />

      {/* 6. Active Scalps */}
      <TradesTable />

      {/* 7. Bot Thinking */}
      <ThinkingPanel />

      {/* 8. Execution Log */}
      <BotExecutionLog accentColor="#2bc48a" />
    </div>
  );
}
