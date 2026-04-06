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
type Signal = "LONG" | "SHORT" | "NEUTRAL";

interface SubStrategy {
  id: string;
  name: string;
  shortName: string;
  indicator: string;
  signal: Signal;
  score: number;
  weight: number;
}

/* ── Initial sub-strategies ── */
const INITIAL_STRATEGIES: SubStrategy[] = [
  { id: "trend", name: "Trend Following", shortName: "TREND", indicator: "EMA 20/50", signal: "LONG", score: 72, weight: 40 },
  { id: "momentum", name: "Momentum", shortName: "MOMENTUM", indicator: "MACD", signal: "LONG", score: 68, weight: 35 },
  { id: "meanrev", name: "Mean Reversion", shortName: "MEAN REV", indicator: "BB", signal: "NEUTRAL", score: 45, weight: 25 },
];

const ACCENT = "#f4906c";

const SIGNAL_COLORS: Record<Signal, string> = {
  LONG: "#2bc48a",
  SHORT: "#f6465d",
  NEUTRAL: "#F5C542",
};

/* ── Market regime ── */
interface RegimeState {
  regime: "TRENDING" | "RANGING" | "VOLATILE";
  adx: number;
  autoAdjust: boolean;
}

/* ── Bot state ── */
const BOT_STATE = {
  status: "RUNNING" as const,
  lastTrade: { dir: "LONG", pair: "BTC/USDT", entry: "93,200", result: "TP HIT", pnl: "+1.6%" },
  position: null as null | string,
  nextAction: "Consensus active - waiting for entry confirmation",
  uptime: "4h 38m",
};

/* ── Component ── */
export default function HybridBotPage() {
  const [strategies, setStrategies] = useState<SubStrategy[]>(INITIAL_STRATEGIES);
  const [consensusMode, setConsensusMode] = useState<"2/3" | "3/3">("2/3");
  const [regime, setRegime] = useState<RegimeState>({ regime: "TRENDING", adx: 30, autoAdjust: true });
  const [pair, setPair] = useState("BTCUSDT");
  const [timeframe, setTimeframe] = useState("15m");

  /* Adjust weight */
  const setWeight = (id: string, val: number) => {
    setStrategies((prev) => {
      const updated = prev.map((s) => (s.id === id ? { ...s, weight: Math.max(5, Math.min(80, val)) } : s));
      const total = updated.reduce((sum, s) => sum + s.weight, 0);
      return total > 0 ? updated.map((s) => ({ ...s, weight: Math.round((s.weight / total) * 100) })) : updated;
    });
  };

  /* Regime-adjusted weights */
  const adjustedStrategies = useMemo(() => {
    if (!regime.autoAdjust) return strategies;
    const boost = regime.regime === "TRENDING" ? { trend: 1.3, momentum: 1.1, meanrev: 0.6 }
      : regime.regime === "RANGING" ? { trend: 0.6, momentum: 0.8, meanrev: 1.5 }
      : { trend: 0.8, momentum: 1.2, meanrev: 1.0 };
    const mapped = strategies.map((s) => {
      const mult = s.id === "trend" ? boost.trend : s.id === "momentum" ? boost.momentum : boost.meanrev;
      return { ...s, adjustedWeight: s.weight * mult };
    });
    const total = mapped.reduce((sum, s) => sum + s.adjustedWeight, 0);
    return mapped.map((s) => ({ ...s, adjustedWeight: total > 0 ? Math.round((s.adjustedWeight / total) * 100) : s.weight }));
  }, [strategies, regime]);

  /* Consensus calculation */
  const consensus = useMemo(() => {
    const longCount = adjustedStrategies.filter((s) => s.signal === "LONG").length;
    const shortCount = adjustedStrategies.filter((s) => s.signal === "SHORT").length;
    const required = consensusMode === "2/3" ? 2 : 3;

    const direction: Signal = longCount >= required ? "LONG" : shortCount >= required ? "SHORT" : "NEUTRAL";
    const active = direction !== "NEUTRAL";

    const weightedScore = adjustedStrategies.reduce((sum, s) => {
      const aw = "adjustedWeight" in s ? (s as any).adjustedWeight : s.weight;
      return sum + (s.score * aw) / 100;
    }, 0);

    return { longCount, shortCount, direction, active, weightedScore, required };
  }, [adjustedStrategies, consensusMode]);

  return (
    <div className="min-h-screen bg-[#0B0B0C] text-white">
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-6">
        {/* Exchange Bar */}
        <BotExchangeBar botName="Hybrid Strategy Engine" accentColor={ACCENT} />

        {/* Trust Stats */}
        <Card>
          <div className="flex items-center gap-6">
            <h2 className="text-sm font-bold text-white/90">Trust Metrics</h2>
            <div className="flex gap-5 text-xs">
              <span className="text-[#2bc48a]">63% WR</span>
              <span className="text-white/60">1:1.7 RR</span>
              <span className="text-[#f6465d]">-5.0% DD</span>
            </div>
          </div>
        </Card>

        {/* ===== STRATEGY CONSENSUS (PRIMARY UNIQUE) ===== */}
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: ACCENT, boxShadow: `0 0 6px ${ACCENT}` }} />
              <h3 className="text-sm font-bold tracking-wide text-white/90">Strategy Consensus</h3>
            </div>
            <span className="text-[10px] text-white/30">
              Regime: {regime.regime} (ADX {regime.adx})
            </span>
          </div>

          {/* Sub-strategy cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {adjustedStrategies.map((s) => {
              const aw = "adjustedWeight" in s ? (s as any).adjustedWeight : s.weight;
              return (
                <div
                  key={s.id}
                  className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 transition hover:border-white/[0.12]"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                      {s.shortName}
                    </span>
                    <span className="text-[10px] text-white/20">({s.indicator})</span>
                  </div>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-xs text-white/50">Signal:</span>
                    <span
                      className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                      style={{
                        color: SIGNAL_COLORS[s.signal],
                        background: `${SIGNAL_COLORS[s.signal]}15`,
                      }}
                    >
                      {s.signal} {s.signal !== "NEUTRAL" ? "\u2713" : "\u2717"}
                    </span>
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-white/40">Score</span>
                      <span className="font-mono text-white/70">{s.score}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/40">Base Weight</span>
                      <span className="font-mono text-white/60">{s.weight}%</span>
                    </div>
                    {regime.autoAdjust && (
                      <div className="flex justify-between">
                        <span className="text-white/40">Adj. Weight</span>
                        <span className="font-mono font-semibold" style={{ color: ACCENT }}>
                          {aw}%
                        </span>
                      </div>
                    )}
                  </div>
                  {/* Score bar */}
                  <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${s.score}%`,
                        background: SIGNAL_COLORS[s.signal],
                        boxShadow: `0 0 6px ${SIGNAL_COLORS[s.signal]}40`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Consensus result */}
          <div className="mt-4 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <div className="text-xs text-white/50">
                Consensus:{" "}
                <span className="font-semibold text-white/80">
                  {consensus.longCount}/3 LONG
                </span>
              </div>
              <span
                className={cn(
                  "rounded-full px-3 py-0.5 text-[11px] font-bold tracking-wider",
                  consensus.active
                    ? "bg-[#2bc48a]/15 text-[#2bc48a]"
                    : "bg-white/[0.04] text-white/40"
                )}
              >
                {consensus.active ? "SIGNAL ACTIVE" : "NO SIGNAL"}
              </span>
              <div className="text-xs text-white/50">
                Weighted Score:{" "}
                <span className="font-mono font-semibold text-white/80">{fmt(consensus.weightedScore, 1)}</span>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2 text-[11px]">
              <span className="text-white/30">Market Regime:</span>
              <span className="font-semibold" style={{ color: ACCENT }}>
                {regime.regime} (ADX {regime.adx})
              </span>
              {regime.autoAdjust && (
                <span className="text-white/30">
                  &rarr; {regime.regime === "TRENDING" ? "Trend weight boosted" : regime.regime === "RANGING" ? "Mean Rev weight boosted" : "Balanced"}
                </span>
              )}
            </div>
          </div>
        </Card>

        {/* Chart */}
        <Card className="overflow-hidden p-0">
          <BotStrategyChart defaultPair={pair} defaultTf={timeframe} accentColor={ACCENT} />
        </Card>

        {/* Backtest */}
        <BotBacktestPanel strategyName="Hybrid Strategy Engine" accentColor={ACCENT} />

        {/* Setup */}
        <Card>
          <h3 className="mb-3 text-[13px] font-semibold tracking-wide text-white/80">Setup</h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-white/30">Strategy Weights</label>
              <div className="space-y-1">
                {strategies.map((s) => (
                  <div key={s.id} className="flex items-center gap-2">
                    <span className="w-16 text-[10px] text-white/40">{s.shortName}</span>
                    <input
                      type="range"
                      min={5}
                      max={80}
                      value={s.weight}
                      onChange={(e) => setWeight(s.id, +e.target.value)}
                      className="h-1 flex-1 appearance-none rounded-full bg-white/10 accent-[#f4906c]"
                    />
                    <span className="w-8 text-right font-mono text-[10px] text-white/50">{s.weight}%</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-white/30">Consensus Mode</label>
              <div className="flex gap-1">
                {(["2/3", "3/3"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setConsensusMode(m)}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-xs font-medium transition",
                      consensusMode === m ? "bg-white/[0.08] text-white" : "text-white/30 hover:text-white/50"
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-white/30">Regime Auto-Adjust</label>
              <button
                onClick={() => setRegime((r) => ({ ...r, autoAdjust: !r.autoAdjust }))}
                className={cn(
                  "rounded-full px-3 py-1 text-[11px] font-bold transition",
                  regime.autoAdjust ? "bg-[#2bc48a]/15 text-[#2bc48a]" : "bg-white/[0.04] text-white/30"
                )}
              >
                {regime.autoAdjust ? "ON" : "OFF"}
              </button>
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-white/30">Pair / TF</label>
              <div className="flex gap-2">
                <select
                  value={pair}
                  onChange={(e) => setPair(e.target.value)}
                  className="w-full rounded-md border border-white/10 bg-[#0F1012] px-2 py-1.5 text-xs text-white outline-none"
                >
                  {["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"].map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
                <select
                  value={timeframe}
                  onChange={(e) => setTimeframe(e.target.value)}
                  className="w-20 rounded-md border border-white/10 bg-[#0F1012] px-2 py-1.5 text-xs text-white outline-none"
                >
                  {["1m", "5m", "15m", "1h", "4h"].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </Card>

        {/* Bot State */}
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[13px] font-semibold tracking-wide text-white/80">Bot State</h3>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#2bc48a]/15 px-2.5 py-0.5 text-[10px] font-bold text-[#2bc48a]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#2bc48a]" style={{ boxShadow: "0 0 6px #2bc48a" }} />
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
