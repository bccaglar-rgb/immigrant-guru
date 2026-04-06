import { useState, useMemo } from "react";
import BotExchangeBar from "../../components/bot/BotExchangeBar";
import BotExecutionLog from "../../components/bot/BotExecutionLog";
import BotStrategyChart from "../../components/bot/BotStrategyChart";
import BotBacktestPanel from "../../components/bot/BotBacktestPanel";

/* ── Shared helpers ── */
const cn = (...cls: (string | false | undefined)[]) => cls.filter(Boolean).join(" ");
const fmt = (n: number, d = 2) =>
  n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("rounded-xl border border-white/[0.06] bg-white/[0.02] p-4", className)}>
    {children}
  </div>
);

/* ── Types ── */
type Operator = "<" | ">" | "=" | ">=" | "<=" | "crosses above" | "crosses below";
type Action = "LONG" | "SHORT" | "ANY";

interface Rule {
  id: number;
  indicator: string;
  operator: Operator;
  value: string;
  weight: number;
  action: Action;
  status: boolean;
  currentValue: string;
}

const INDICATORS = ["RSI", "EMA20", "EMA50", "SMA20", "SMA50", "MACD", "BB", "VWAP", "Volume Ratio", "ADX", "ATR"];
const OPERATORS: Operator[] = ["<", ">", "=", ">=", "<=", "crosses above", "crosses below"];
const ACTIONS: Action[] = ["LONG", "SHORT", "ANY"];

const ACCENT = "#f4906c";

/* ── Initial rules ── */
let nextId = 5;
const INITIAL_RULES: Rule[] = [
  { id: 1, indicator: "RSI", operator: "<", value: "30", weight: 1.0, action: "LONG", status: true, currentValue: "28" },
  { id: 2, indicator: "Volume Ratio", operator: ">", value: "1.5", weight: 0.8, action: "LONG", status: false, currentValue: "1.2" },
  { id: 3, indicator: "EMA20", operator: ">", value: "EMA50", weight: 1.0, action: "LONG", status: true, currentValue: "Above" },
  { id: 4, indicator: "ADX", operator: ">", value: "20", weight: 0.5, action: "ANY", status: true, currentValue: "28" },
];

/* ── Bot state ── */
const BOT_STATE = {
  status: "READY" as const,
  lastTrade: { dir: "LONG", pair: "ETH/USDT", entry: "3,420", result: "SL HIT", pnl: "-0.8%" },
  position: null as null | string,
  nextAction: "Evaluating custom rules - waiting for volume confirmation",
  uptime: "1h 52m",
};

/* ── Component ── */
export default function CustomRuleBotPage() {
  const [rules, setRules] = useState<Rule[]>(INITIAL_RULES);
  const [threshold, setThreshold] = useState(70);
  const [pair, setPair] = useState("BTCUSDT");
  const [timeframe, setTimeframe] = useState("15m");

  /* Update a rule field */
  const updateRule = <K extends keyof Rule>(id: number, key: K, val: Rule[K]) => {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, [key]: val } : r)));
  };

  /* Delete rule */
  const deleteRule = (id: number) => {
    setRules((prev) => prev.filter((r) => r.id !== id));
  };

  /* Add rule */
  const addRule = () => {
    const id = nextId++;
    setRules((prev) => [
      ...prev,
      { id, indicator: "RSI", operator: ">", value: "50", weight: 0.5, action: "LONG", status: false, currentValue: "--" },
    ]);
  };

  /* Score calculations */
  const { passedWeight, totalWeight, score, pass } = useMemo(() => {
    const total = rules.reduce((s, r) => s + r.weight, 0);
    const passed = rules.filter((r) => r.status).reduce((s, r) => s + r.weight, 0);
    const pct = total > 0 ? (passed / total) * 100 : 0;
    return { passedWeight: passed, totalWeight: total, score: pct, pass: pct >= threshold };
  }, [rules, threshold]);

  return (
    <div className="min-h-screen bg-[#0B0B0C] text-white">
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-6">
        {/* Exchange Bar */}
        <BotExchangeBar botName="Custom Rule Engine" accentColor={ACCENT} />

        {/* Trust Stats */}
        <Card>
          <div className="flex items-center gap-6">
            <h2 className="text-sm font-bold text-white/90">Trust Metrics</h2>
            <div className="flex gap-5 text-xs">
              <span className="text-[#2bc48a]">55% WR</span>
              <span className="text-white/60">1:1.6 RR</span>
              <span className="text-[#f6465d]">-6.2% DD</span>
            </div>
          </div>
        </Card>

        {/* ===== RULE BUILDER (PRIMARY UNIQUE) ===== */}
        <Card className="overflow-hidden">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: ACCENT, boxShadow: `0 0 6px ${ACCENT}` }} />
              <h3 className="text-sm font-bold tracking-wide text-white/90">Rule Builder</h3>
            </div>
            <span className="text-[10px] text-white/30">{rules.length} rules defined</span>
          </div>

          {/* Rules table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-wider text-white/30">
                  <th className="pb-2 pr-2 font-medium w-8">#</th>
                  <th className="pb-2 pr-2 font-medium">Indicator</th>
                  <th className="pb-2 pr-2 font-medium">Operator</th>
                  <th className="pb-2 pr-2 font-medium">Value</th>
                  <th className="pb-2 pr-2 font-medium">Weight</th>
                  <th className="pb-2 pr-2 font-medium">Action</th>
                  <th className="pb-2 pr-2 font-medium">Status</th>
                  <th className="pb-2 font-medium w-8" />
                </tr>
              </thead>
              <tbody>
                {rules.map((r, idx) => (
                  <tr key={r.id} className="border-b border-white/[0.04] transition hover:bg-white/[0.01]">
                    <td className="py-2 pr-2 font-mono text-white/30">{idx + 1}</td>
                    <td className="py-2 pr-2">
                      <select
                        value={r.indicator}
                        onChange={(e) => updateRule(r.id, "indicator", e.target.value)}
                        className="rounded border border-white/10 bg-[#0F1012] px-2 py-1 text-[11px] text-white outline-none"
                      >
                        {INDICATORS.map((ind) => (
                          <option key={ind} value={ind}>{ind}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-2">
                      <select
                        value={r.operator}
                        onChange={(e) => updateRule(r.id, "operator", e.target.value as Operator)}
                        className="rounded border border-white/10 bg-[#0F1012] px-2 py-1 text-[11px] text-white outline-none"
                      >
                        {OPERATORS.map((op) => (
                          <option key={op} value={op}>{op}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        type="text"
                        value={r.value}
                        onChange={(e) => updateRule(r.id, "value", e.target.value)}
                        className="w-20 rounded border border-white/10 bg-[#0F1012] px-2 py-1 text-[11px] text-white outline-none"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        type="number"
                        min={0.1}
                        max={2.0}
                        step={0.1}
                        value={r.weight}
                        onChange={(e) => updateRule(r.id, "weight", +e.target.value)}
                        className="w-16 rounded border border-white/10 bg-[#0F1012] px-2 py-1 text-[11px] text-white outline-none"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <select
                        value={r.action}
                        onChange={(e) => updateRule(r.id, "action", e.target.value as Action)}
                        className="rounded border border-white/10 bg-[#0F1012] px-2 py-1 text-[11px] text-white outline-none"
                      >
                        {ACTIONS.map((a) => (
                          <option key={a} value={a}>{a}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-2">
                      <div className="flex items-center gap-1.5">
                        {r.status ? (
                          <span className="text-[#2bc48a]">&#10003;</span>
                        ) : (
                          <span className="text-[#f6465d]">&#10007;</span>
                        )}
                        <span className="font-mono text-[10px] text-white/40">({r.currentValue})</span>
                      </div>
                    </td>
                    <td className="py-2">
                      <button
                        onClick={() => deleteRule(r.id)}
                        className="flex h-5 w-5 items-center justify-center rounded text-white/20 transition hover:bg-[#f6465d]/15 hover:text-[#f6465d]"
                        title="Delete rule"
                      >
                        &#10005;
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Add Rule button */}
          <button
            onClick={addRule}
            className="mt-3 flex items-center gap-1.5 rounded-lg border border-dashed border-white/10 px-4 py-2 text-[11px] text-white/40 transition hover:border-white/20 hover:text-white/60"
          >
            <span className="text-[14px]">+</span> Add Rule
          </button>

          {/* Score calculation */}
          <div className="mt-4 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <div className="text-xs text-white/50">
                Score:{" "}
                <span className="font-mono font-semibold text-white/80">
                  {fmt(passedWeight, 1)} / {fmt(totalWeight, 1)} = {fmt(score, 0)}%
                </span>
              </div>
              <div className="text-xs text-white/50">
                Threshold:{" "}
                <span className="font-mono font-semibold text-white/80">{threshold}%</span>
              </div>
              <div
                className={cn(
                  "rounded-full px-3 py-0.5 text-[11px] font-bold tracking-wider",
                  pass ? "bg-[#2bc48a]/15 text-[#2bc48a]" : "bg-[#f6465d]/15 text-[#f6465d]"
                )}
              >
                {pass ? "PASS" : "FAIL"}
              </div>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(score, 100)}%`,
                  background: pass ? "#2bc48a" : "#f6465d",
                  boxShadow: `0 0 8px ${pass ? "#2bc48a" : "#f6465d"}40`,
                }}
              />
            </div>
          </div>

          {/* Available indicators / operators reference */}
          <div className="mt-3 flex flex-wrap gap-4 text-[10px] text-white/25">
            <div>
              <span className="font-medium text-white/35">Indicators:</span>{" "}
              {INDICATORS.join(", ")}
            </div>
            <div>
              <span className="font-medium text-white/35">Operators:</span>{" "}
              {OPERATORS.join(", ")}
            </div>
          </div>
        </Card>

        {/* Chart */}
        <Card className="overflow-hidden p-0">
          <BotStrategyChart defaultPair={pair} defaultTf={timeframe} accentColor={ACCENT} />
        </Card>

        {/* Backtest */}
        <BotBacktestPanel strategyName="Custom Rule Engine" accentColor={ACCENT} />

        {/* Setup */}
        <Card>
          <h3 className="mb-3 text-[13px] font-semibold tracking-wide text-white/80">Setup</h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-white/30">Pair</label>
              <select
                value={pair}
                onChange={(e) => setPair(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              >
                {["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"].map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-white/30">Timeframe</label>
              <select
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              >
                {["1m", "5m", "15m", "1h", "4h"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-white/30">Threshold %</label>
              <input
                type="number"
                min={10}
                max={100}
                value={threshold}
                onChange={(e) => setThreshold(+e.target.value)}
                className="w-full rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-white/30">Rules</label>
              <div className="flex h-[30px] items-center gap-2 text-sm">
                <span className="font-semibold" style={{ color: ACCENT }}>{rules.length}</span>
                <span className="text-[10px] text-white/30">
                  ({rules.filter((r) => r.status).length} passing)
                </span>
              </div>
            </div>
          </div>
        </Card>

        {/* Bot State */}
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[13px] font-semibold tracking-wide text-white/80">Bot State</h3>
            <span className="rounded-full bg-[#2bc48a]/15 px-2.5 py-0.5 text-[10px] font-bold text-[#2bc48a]">
              {BOT_STATE.status}
            </span>
          </div>
          <div className="space-y-2.5 text-xs">
            <Row label="Last Trade">
              <span className="text-[#f6465d]">
                {BOT_STATE.lastTrade.dir} {BOT_STATE.lastTrade.pair} @ {BOT_STATE.lastTrade.entry}{" "}
                &rarr; {BOT_STATE.lastTrade.result}{" "}
                <span className="font-semibold">{BOT_STATE.lastTrade.pnl}</span>
              </span>
            </Row>
            <Row label="Position">
              <span className="text-white/30">{BOT_STATE.position ?? "No active position"}</span>
            </Row>
            <Row label="Next Action">
              <span className="text-[#5B8DEF]">{BOT_STATE.nextAction}</span>
            </Row>
            <Row label="Uptime">
              <span className="text-white/40">{BOT_STATE.uptime}</span>
            </Row>
          </div>
        </Card>

        {/* Execution Log */}
        <BotExecutionLog accentColor={ACCENT} />
      </div>
    </div>
  );
}

/* ── Row helper ── */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-white/30">{label}</span>
      <span className="text-right text-[12px] leading-snug">{children}</span>
    </div>
  );
}
