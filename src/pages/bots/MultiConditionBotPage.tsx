import { useState, useMemo } from "react";
import BotExchangeBar from "../../components/bot/BotExchangeBar";
import { BotProvider } from "../../components/bot/BotContext";
import BotExecutionLog from "../../components/bot/BotExecutionLog";
import BotLivePanel from "../../components/bot/BotLivePanel";
import BotStrategyChart from "../../components/bot/BotStrategyChart";
import BotBacktestPanel from "../../components/bot/BotBacktestPanel";
import SignalsOverview from "../../components/bot/SignalsOverview";

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
interface Condition {
  id: string;
  label: string;
  status: boolean;
  currentValue: string;
  target: string;
  weight: number;
  enabled: boolean;
}

/* ── Initial conditions ── */
const INITIAL_CONDITIONS: Condition[] = [
  { id: "ema", label: "EMA Alignment", status: true, currentValue: "Bullish", target: "Aligned", weight: 1.0, enabled: true },
  { id: "rsi", label: "RSI Range", status: false, currentValue: "52", target: "30-50", weight: 0.8, enabled: true },
  { id: "macd", label: "MACD Cross", status: true, currentValue: "Bullish", target: "Cross up", weight: 1.0, enabled: true },
  { id: "vol", label: "Volume > avg", status: true, currentValue: "1.3x", target: "> 1.0x", weight: 0.6, enabled: true },
  { id: "atr", label: "ATR Regime", status: true, currentValue: "1.8%", target: "1-3%", weight: 0.4, enabled: false },
];

const ACCENT = "#F5C542";

/* ── Bot State mock ── */
const BOT_STATE = {
  status: "READY" as const,
  lastTrade: { dir: "LONG", pair: "BTC/USDT", entry: "94,800", result: "TP HIT", pnl: "+2.1%" },
  position: null as null | string,
  nextAction: "Waiting for RSI to enter 30-50 zone",
  uptime: "2h 14m",
};

/* ── Strategy Logic ── */
const STRATEGY_LOGIC = [
  "Checks EMA 20/50/200 alignment for trend direction",
  "Validates RSI is in optimal entry zone (30-50 longs, 50-70 shorts)",
  "Confirms MACD crossover aligns with trend direction",
  "Requires volume above average to ensure participation",
  "Only enters when weighted score exceeds threshold",
];

/* ── Setup state type ── */
interface SetupState {
  pair: string;
  timeframe: string;
  threshold: number;
}

/* ── Component ── */
export default function MultiConditionBotPage() {
  const [conditions, setConditions] = useState<Condition[]>(INITIAL_CONDITIONS);
  const [setup, setSetup] = useState<SetupState>({ pair: "BTCUSDT", timeframe: "15m", threshold: 75 });

  /* Toggle condition enabled */
  const toggleEnabled = (id: string) => {
    setConditions((prev) =>
      prev.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c))
    );
  };

  /* Adjust weight */
  const adjustWeight = (id: string, delta: number) => {
    setConditions((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, weight: Math.max(0.1, Math.min(2.0, +(c.weight + delta).toFixed(1))) } : c
      )
    );
  };

  /* Calculations */
  const { passedWeight, totalWeight, score, pass } = useMemo(() => {
    const active = conditions.filter((c) => c.enabled);
    const total = active.reduce((s, c) => s + c.weight, 0);
    const passed = active.filter((c) => c.status).reduce((s, c) => s + c.weight, 0);
    const pct = total > 0 ? (passed / total) * 100 : 0;
    return { passedWeight: passed, totalWeight: total, score: pct, pass: pct >= setup.threshold };
  }, [conditions, setup.threshold]);

  return (
    <BotProvider>
    <div className="min-h-screen bg-[#0B0B0C] text-white">
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-6">
        {/* Exchange Bar */}
        <BotExchangeBar botName="Multi-Condition Engine" accentColor={ACCENT} />

        {/* Trust Stats */}
        <Card>
          <div className="flex items-center gap-6">
            <h2 className="text-sm font-bold text-white/90">Trust Metrics</h2>
            <div className="flex gap-5 text-xs">
              <span className="text-[#2bc48a]">65% WR</span>
              <span className="text-white/60">1:1.8 RR</span>
              <span className="text-[#f6465d]">-4.2% DD</span>
            </div>
          </div>
        </Card>

        {/* ===== CONDITION MATRIX (PRIMARY UNIQUE) ===== */}
        <Card className="overflow-hidden">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: ACCENT, boxShadow: `0 0 6px ${ACCENT}` }} />
              <h3 className="text-sm font-bold tracking-wide text-white/90">Condition Matrix</h3>
            </div>
            <span className="text-[10px] text-white/30">{conditions.filter((c) => c.enabled).length} active conditions</span>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-wider text-white/30">
                  <th className="pb-2 pr-4 font-medium">Condition</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 pr-4 font-medium">Value</th>
                  <th className="pb-2 pr-4 font-medium">Target</th>
                  <th className="pb-2 pr-4 font-medium">Weight</th>
                  <th className="pb-2 font-medium">Enabled</th>
                </tr>
              </thead>
              <tbody>
                {conditions.map((c) => (
                  <tr
                    key={c.id}
                    className={cn(
                      "border-b border-white/[0.04] transition",
                      !c.enabled && "opacity-40"
                    )}
                  >
                    <td className="py-2.5 pr-4 font-medium text-white/80">{c.label}</td>
                    <td className="py-2.5 pr-4">
                      {c.enabled ? (
                        c.status ? (
                          <span className="text-[#2bc48a]">&#10003;</span>
                        ) : (
                          <span className="text-[#f6465d]">&#10007;</span>
                        )
                      ) : (
                        <span className="text-white/20">--</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-white/60">{c.currentValue}</td>
                    <td className="py-2.5 pr-4 text-white/40">{c.target}</td>
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => adjustWeight(c.id, -0.1)}
                          className="flex h-5 w-5 items-center justify-center rounded border border-white/10 text-[10px] text-white/40 transition hover:bg-white/[0.06] hover:text-white/70"
                        >
                          -
                        </button>
                        <span className="w-8 text-center font-mono text-white/70">{fmt(c.weight, 1)}</span>
                        <button
                          onClick={() => adjustWeight(c.id, 0.1)}
                          className="flex h-5 w-5 items-center justify-center rounded border border-white/10 text-[10px] text-white/40 transition hover:bg-white/[0.06] hover:text-white/70"
                        >
                          +
                        </button>
                      </div>
                    </td>
                    <td className="py-2.5">
                      <button
                        onClick={() => toggleEnabled(c.id)}
                        className={cn(
                          "rounded-full px-3 py-0.5 text-[10px] font-bold tracking-wider transition",
                          c.enabled
                            ? "bg-[#2bc48a]/15 text-[#2bc48a]"
                            : "bg-white/[0.04] text-white/30 hover:text-white/50"
                        )}
                      >
                        {c.enabled ? "ON" : "OFF"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Score Calculation */}
          <div className="mt-4 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <div className="text-xs text-white/50">
                Weighted Score:{" "}
                <span className="font-mono font-semibold text-white/80">
                  {fmt(passedWeight, 1)} / {fmt(totalWeight, 1)} = {fmt(score, 0)}%
                </span>
              </div>
              <div className="text-xs text-white/50">
                Threshold:{" "}
                <span className="font-mono font-semibold text-white/80">{setup.threshold}%</span>
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
            {/* Progress bar */}
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
        </Card>

        {/* Signals Overview */}
        <SignalsOverview overrides={[
          { id: "trend", status: "Bullish" },
          { id: "rsi-divergence", status: "Watching" },
          { id: "volume", status: "Bullish" },
          { id: "vwap", status: "Neutral" },
          { id: "market-structure", status: "Bullish" },
          { id: "composite", status: "Bullish" },
        ]} />

        {/* Chart */}
        <Card className="overflow-hidden p-0">
          <BotStrategyChart defaultPair={setup.pair} defaultTf={setup.timeframe} accentColor={ACCENT} />
        </Card>

        {/* Backtest */}
        <BotBacktestPanel strategyName="Multi-Condition Engine" accentColor={ACCENT} />

        {/* Setup Panel */}
        <Card>
          <h3 className="mb-3 text-[13px] font-semibold tracking-wide text-white/80">Setup</h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {/* Pair */}
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-white/30">Pair</label>
              <select
                value={setup.pair}
                onChange={(e) => setSetup((s) => ({ ...s, pair: e.target.value }))}
                className="w-full rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              >
                {["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"].map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            {/* Timeframe */}
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-white/30">Timeframe</label>
              <select
                value={setup.timeframe}
                onChange={(e) => setSetup((s) => ({ ...s, timeframe: e.target.value }))}
                className="w-full rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              >
                {["1m", "5m", "15m", "1h", "4h"].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            {/* Threshold */}
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-white/30">Threshold %</label>
              <input
                type="number"
                min={10}
                max={100}
                value={setup.threshold}
                onChange={(e) => setSetup((s) => ({ ...s, threshold: +e.target.value }))}
                className="w-full rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              />
            </div>
            {/* Active conditions count */}
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-white/30">Active</label>
              <div className="flex h-[30px] items-center text-sm font-semibold" style={{ color: ACCENT }}>
                {conditions.filter((c) => c.enabled).length} / {conditions.length}
              </div>
            </div>
          </div>
        </Card>

        {/* Strategy Logic */}
        <Card>
          <h3 className="mb-3 text-[13px] font-semibold tracking-wide text-white/80">Strategy Logic</h3>
          <ul className="space-y-1.5">
            {STRATEGY_LOGIC.map((step, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-white/50">
                <span className="mt-0.5 h-1 w-1 shrink-0 rounded-full bg-white/20" />
                {step}
              </li>
            ))}
          </ul>
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
              <span className="text-[#2bc48a]">
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
        <BotLivePanel botSlug="multi-condition" botName="Multi-Condition Bot" accentColor="#F5C542" />
        <BotExecutionLog accentColor={ACCENT} />
      </div>
    </div>
    </BotProvider>
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
