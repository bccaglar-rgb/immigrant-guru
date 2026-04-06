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

/* ── Order Flow Metrics ── */
interface FlowBar {
  label: string;
  value: string;
  detail: string;
  fillPct: number;
  met: boolean;
  barColor: string;
}

const FLOW_BARS: FlowBar[] = [
  {
    label: "DELTA",
    value: "+$42K",
    detail: "buyers dominating",
    fillPct: 68,
    met: true,
    barColor: "#2bc48a",
  },
  {
    label: "IMBALANCE",
    value: "0.38",
    detail: "above 0.3 threshold",
    fillPct: 82,
    met: true,
    barColor: "#2bc48a",
  },
  {
    label: "CVD TREND",
    value: "Bullish",
    detail: "15 positive ticks",
    fillPct: 90,
    met: true,
    barColor: "#5B8DEF",
  },
  {
    label: "AGGRESSION",
    value: "67%",
    detail: "buy-side aggressive",
    fillPct: 67,
    met: true,
    barColor: "#2bc48a",
  },
  {
    label: "VOL SPIKE",
    value: "1.1x",
    detail: "need > 1.5x",
    fillPct: 38,
    met: false,
    barColor: "#f6465d",
  },
  {
    label: "DEPTH",
    value: "$800K",
    detail: "adequate liquidity",
    fillPct: 72,
    met: true,
    barColor: "#2bc48a",
  },
];

/* ── Mock Flow Trades ── */
interface FlowTrade {
  time: string;
  pair: string;
  side: "LONG" | "SHORT";
  entry: number;
  exit: number;
  pnl: number;
  holdTime: string;
  delta: string;
  imbalance: string;
  status: "Win" | "Loss" | "Open";
}

const FLOW_TRADES: FlowTrade[] = [
  { time: "14:42:30", pair: "BTC/USDT", side: "LONG",  entry: 94820, exit: 94960, pnl: 0.15, holdTime: "1m 22s", delta: "+$38K", imbalance: "0.41", status: "Win" },
  { time: "14:38:12", pair: "BTC/USDT", side: "SHORT", entry: 94950, exit: 94820, pnl: 0.14, holdTime: "1m 48s", delta: "-$52K", imbalance: "-0.35", status: "Win" },
  { time: "14:34:05", pair: "ETH/USDT", side: "LONG",  entry: 3482,  exit: 3478,  pnl: -0.11, holdTime: "2m 10s", delta: "+$12K", imbalance: "0.18", status: "Loss" },
  { time: "14:30:40", pair: "BTC/USDT", side: "LONG",  entry: 94650, exit: 94810, pnl: 0.17, holdTime: "1m 35s", delta: "+$65K", imbalance: "0.52", status: "Win" },
  { time: "14:26:18", pair: "SOL/USDT", side: "SHORT", entry: 178.6, exit: 178.2, pnl: 0.22, holdTime: "1m 50s", delta: "-$28K", imbalance: "-0.42", status: "Win" },
  { time: "14:22:55", pair: "BTC/USDT", side: "LONG",  entry: 94500, exit: 94620, pnl: 0.13, holdTime: "2m 05s", delta: "+$44K", imbalance: "0.36", status: "Win" },
  { time: "14:18:30", pair: "ETH/USDT", side: "SHORT", entry: 3498,  exit: 3504,  pnl: -0.17, holdTime: "2m 40s", delta: "-$8K",  imbalance: "-0.22", status: "Loss" },
  { time: "14:14:08", pair: "BTC/USDT", side: "LONG",  entry: 94380, exit: 94530, pnl: 0.16, holdTime: "1m 42s", delta: "+$55K", imbalance: "0.48", status: "Win" },
  { time: "14:10:45", pair: "SOL/USDT", side: "LONG",  entry: 177.5, exit: 177.9, pnl: 0.23, holdTime: "1m 28s", delta: "+$32K", imbalance: "0.39", status: "Win" },
  { time: "14:06:20", pair: "BTC/USDT", side: "SHORT", entry: 94600, exit: 94450, pnl: 0.16, holdTime: "1m 55s", delta: "-$48K", imbalance: "-0.44", status: "Win" },
];

/* ── Order Flow Panel ── */
const OrderFlowPanel = () => (
  <Card>
    <SectionLabel>Order Flow Analysis</SectionLabel>
    <div className="space-y-3">
      {FLOW_BARS.map((bar, i) => (
        <div key={i} className="rounded-lg bg-[#0F1012] p-3">
          <div className="mb-1.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="w-24 text-[10px] font-bold tracking-wider text-white/40">{bar.label}</span>
              <span className={cn("text-[15px] font-bold font-mono", bar.met ? "text-white" : "text-[#f6465d]")}>
                {bar.value}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-white/30">{bar.detail}</span>
              <span className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold",
                bar.met ? "bg-[#2bc48a]/20 text-[#2bc48a]" : "bg-[#f6465d]/20 text-[#f6465d]"
              )}>
                {bar.met ? "\u2713" : "\u2717"}
              </span>
            </div>
          </div>
          {/* Visual bar */}
          <div className="h-3 w-full overflow-hidden rounded-full bg-white/[0.04]">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${bar.fillPct}%`, backgroundColor: bar.barColor }}
            />
          </div>
        </div>
      ))}
    </div>

    {/* Aggregate signal */}
    {(() => {
      const metCount = FLOW_BARS.filter((b) => b.met).length;
      const total = FLOW_BARS.length;
      const strong = metCount >= total - 1;
      return (
        <div className={cn(
          "mt-3 rounded-lg border px-3 py-2 text-center text-[11px] font-bold",
          strong
            ? "border-[#2bc48a]/30 bg-[#2bc48a]/10 text-[#2bc48a]"
            : "border-[#F5C542]/30 bg-[#F5C542]/10 text-[#F5C542]"
        )}>
          {strong
            ? `STRONG BUY PRESSURE \u2014 ${metCount}/${total} flow signals aligned`
            : `PARTIAL SIGNAL \u2014 ${metCount}/${total} flow conditions met`}
        </div>
      );
    })()}
  </Card>
);

/* ── Setup Panel ── */
const SETUP_FIELDS = [
  { label: "Imbalance Threshold", key: "imbalance",   defaultVal: 0.3 },
  { label: "Vol Spike Mult",      key: "volSpike",    defaultVal: 1.5 },
  { label: "Delta Threshold ($K)", key: "deltaThresh", defaultVal: 30 },
  { label: "Min Depth ($K)",      key: "minDepth",    defaultVal: 500 },
  { label: "Aggression Filter %", key: "aggression",  defaultVal: 60 },
  { label: "Take Profit %",      key: "tp",           defaultVal: 0.3 },
  { label: "Stop Loss %",        key: "sl",           defaultVal: 0.15 },
  { label: "Max Trades / hr",    key: "maxTrades",    defaultVal: 15 },
];

const SetupPanel = () => {
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(SETUP_FIELDS.map((f) => [f.key, f.defaultVal]))
  );

  return (
    <Card>
      <SectionLabel>Order Flow Scalper Setup</SectionLabel>
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

/* ── Flow Trades Table ── */
const FlowTradesTable = () => (
  <Card>
    <SectionLabel>Recent Flow Trades (Last 10)</SectionLabel>
    <div className="overflow-x-auto">
      <table className="w-full text-[10px]">
        <thead>
          <tr className="border-b border-white/[0.06] text-white/30">
            {["Time", "Pair", "Side", "Entry", "Exit", "PnL %", "Hold", "Delta", "Imb.", "Status"].map((h) => (
              <th key={h} className="px-2 py-1.5 text-left font-medium uppercase tracking-wider">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {FLOW_TRADES.map((t, i) => (
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
              <td className={cn(
                "px-2 py-1.5 font-mono text-[9px]",
                t.delta.startsWith("+") ? "text-[#2bc48a]" : "text-[#f6465d]"
              )}>
                {t.delta}
              </td>
              <td className={cn(
                "px-2 py-1.5 font-mono text-[9px]",
                parseFloat(t.imbalance) > 0 ? "text-[#2bc48a]" : "text-[#f6465d]"
              )}>
                {t.imbalance}
              </td>
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
    { label: "Delta positive",   met: true,  detail: "+$42K" },
    { label: "Imbalance > 0.3",  met: true,  detail: "0.38" },
    { label: "Volume spike",     met: false, detail: "1.1x (need 1.5x)" },
    { label: "Depth adequate",   met: true,  detail: "$800K" },
    { label: "CVD bullish",      met: true,  detail: "15 ticks" },
    { label: "Aggression > 60%", met: true,  detail: "67%" },
  ];

  return (
    <Card>
      <SectionLabel>Bot Thinking</SectionLabel>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {conditions.map((c, i) => (
          <div key={i} className="flex items-center gap-2 rounded-lg bg-[#0F1012] px-3 py-2">
            <span className={cn(
              "flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[8px] font-bold",
              c.met ? "bg-[#2bc48a]/20 text-[#2bc48a]" : "bg-[#f6465d]/20 text-[#f6465d]"
            )}>
              {c.met ? "\u2713" : "\u2717"}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[9px] text-white/40">{c.label}</p>
              <p className={cn("text-[11px] font-mono font-bold", c.met ? "text-[#2bc48a]" : "text-[#f6465d]")}>
                {c.detail}
              </p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-lg border border-[#F5C542]/30 bg-[#F5C542]/10 px-3 py-2 text-center text-[11px] font-bold text-[#F5C542]">
        STRONG BUY PRESSURE \u2014 Waiting for volume confirmation
      </div>
    </Card>
  );
};

/* ── Main Page ── */
export default function OrderFlowScalperBotPage() {
  return (
    <BotProvider>
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      {/* 1. Exchange Bar */}
      <BotExchangeBar botName="Order Flow Scalper Engine" accentColor="#2bc48a" />

      {/* 2. Flow Metrics */}
      <Card>
        <SectionLabel>Flow Metrics</SectionLabel>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          <StatBox label="Delta"      value="+$42K" color="text-[#2bc48a]" sub="net flow" />
          <StatBox label="CVD Trend"  value="Bullish" color="text-[#5B8DEF]" sub="15 pos ticks" />
          <StatBox label="Imbalance"  value="0.38" color="text-[#2bc48a]" sub="> 0.3 threshold" />
          <StatBox label="Vol Spike"  value="1.1x" color="text-[#f6465d]" sub="need > 1.5x" />
          <StatBox label="Depth"      value="$800K" color="text-white/70" sub="adequate" />
          <StatBox label="Aggression" value="67%" color="text-[#2bc48a]" sub="buy-side" />
        </div>
      </Card>

      {/* 3. Order Flow Panel */}
      <OrderFlowPanel />

      {/* 4. Chart */}
      <BotStrategyChart defaultTf="1m" indicators={["Delta/CVD", "Imbalance"]} accentColor="#2bc48a" />

      {/* 5. Backtest */}
      <BotBacktestPanel strategyName="Order Flow" accentColor="#2bc48a" />

      {/* 6. Setup */}
      <SetupPanel />

      {/* 7. Recent Flow Trades */}
      <FlowTradesTable />

      {/* 8. Bot Thinking + Log */}
      <ThinkingPanel />
      <BotExecutionLog accentColor="#2bc48a" />
    </div>
    </BotProvider>
  );
}
