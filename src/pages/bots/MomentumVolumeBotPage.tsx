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
interface MomentumCondition {
  id: string;
  label: string;
  detail: string;
  met: boolean;
  reason?: string;
}

const ACCENT = "#6ec4ff";

/* ── Mock MACD histogram values (last 10) ── */
const MACD_HIST = [-0.18, -0.12, -0.05, 0.04, 0.12, 0.22, 0.31, 0.38, 0.40, 0.42];
const MACD_MAX = Math.max(...MACD_HIST.map(Math.abs));

/* ── Mock volume bars (last 10) ── */
const VOLUME_BARS = [1.1, 0.8, 0.9, 1.2, 0.7, 1.0, 1.3, 0.9, 1.1, 1.4];
const VOLUME_AVG = VOLUME_BARS.reduce((a, b) => a + b, 0) / VOLUME_BARS.length;

/* ── Conditions ── */
const INITIAL_CONDITIONS: MomentumCondition[] = [
  { id: "macd", label: "MACD Histogram", detail: "+0.42 (bullish)", met: true },
  { id: "cross", label: "Signal Cross", detail: "Bullish (2 candles ago)", met: true },
  { id: "vol", label: "Volume", detail: "1.4x avg (need > 2x)", met: false, reason: "Volume confirmation (need > 2x spike)" },
  { id: "rsi", label: "RSI", detail: "48 (in range 30-70)", met: true },
];

/* ── Setup state ── */
interface SetupState {
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
  volumeMultiplier: number;
  rsiMin: number;
  rsiMax: number;
  pair: string;
  timeframe: string;
}

/* ── Bot state ── */
const BOT_STATE = {
  status: "READY" as const,
  lastTrade: { dir: "LONG", pair: "BTC/USDT", entry: "92,400", result: "TP HIT", pnl: "+3.2%" },
  position: null as null | string,
  nextAction: "MACD crossed, waiting for volume confirmation > 2x",
  uptime: "3h 07m",
};

/* ── Component ── */
export default function MomentumVolumeBotPage() {
  const [conditions] = useState<MomentumCondition[]>(INITIAL_CONDITIONS);
  const [setup, setSetup] = useState<SetupState>({
    macdFast: 12,
    macdSlow: 26,
    macdSignal: 9,
    volumeMultiplier: 2.0,
    rsiMin: 30,
    rsiMax: 70,
    pair: "BTCUSDT",
    timeframe: "15m",
  });

  const metCount = useMemo(() => conditions.filter((c) => c.met).length, [conditions]);
  const totalCount = conditions.length;
  const missing = useMemo(() => conditions.filter((c) => !c.met), [conditions]);

  const overallLabel = metCount === totalCount ? "TRADE" : metCount >= totalCount - 1 ? "WATCH" : "WAIT";
  const overallColor = metCount === totalCount ? "#2bc48a" : metCount >= totalCount - 1 ? "#F5C542" : "#f6465d";

  return (
    <div className="min-h-screen bg-[#0B0B0C] text-white">
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-6">
        {/* Exchange Bar */}
        <BotExchangeBar botName="Momentum + Volume Engine" accentColor={ACCENT} />

        {/* Trust Stats */}
        <Card>
          <div className="flex items-center gap-6">
            <h2 className="text-sm font-bold text-white/90">Trust Metrics</h2>
            <div className="flex gap-5 text-xs">
              <span className="text-[#2bc48a]">57% WR</span>
              <span className="text-white/60">1:2.0 RR</span>
              <span className="text-[#f6465d]">-6.8% DD</span>
            </div>
          </div>
        </Card>

        {/* ===== MOMENTUM DASHBOARD (PRIMARY UNIQUE) ===== */}
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: ACCENT, boxShadow: `0 0 6px ${ACCENT}` }} />
              <h3 className="text-sm font-bold tracking-wide text-white/90">Momentum Dashboard</h3>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="rounded-full px-3 py-0.5 text-[11px] font-bold tracking-wider"
                style={{ color: overallColor, background: `${overallColor}15` }}
              >
                {overallLabel}
              </span>
              <span className="text-[10px] text-white/30">
                {metCount}/{totalCount} conditions
              </span>
            </div>
          </div>

          {/* Conditions list */}
          <div className="mb-4 space-y-2">
            {conditions.map((c) => (
              <div
                key={c.id}
                className={cn(
                  "flex items-center justify-between rounded-lg border px-4 py-2.5 transition",
                  c.met
                    ? "border-[#2bc48a]/20 bg-[#2bc48a]/[0.04]"
                    : "border-[#f6465d]/20 bg-[#f6465d]/[0.04]"
                )}
              >
                <div className="flex items-center gap-3">
                  <span className={c.met ? "text-[#2bc48a]" : "text-[#f6465d]"}>
                    {c.met ? "\u2713" : "\u2717"}
                  </span>
                  <span className="text-xs font-medium text-white/80">{c.label}:</span>
                  <span className="text-xs text-white/50">{c.detail}</span>
                </div>
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                  style={{
                    color: c.met ? "#2bc48a" : "#f6465d",
                    background: c.met ? "#2bc48a15" : "#f6465d15",
                  }}
                >
                  {c.met ? "MET" : "MISSING"}
                </span>
              </div>
            ))}
          </div>

          {/* Missing conditions callout */}
          {missing.length > 0 && (
            <div className="mb-4 rounded-lg border border-[#F5C542]/20 bg-[#F5C542]/[0.04] px-4 py-2.5">
              <span className="text-[11px] text-[#F5C542]">
                Missing: {missing.map((c) => c.reason ?? c.label).join(", ")}
              </span>
            </div>
          )}

          {/* Visual MACD Histogram */}
          <div className="mb-4">
            <div className="mb-2 flex items-center gap-2">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-white/40">MACD Histogram</h4>
              <span className="text-[10px] text-white/20">(last 10 bars)</span>
            </div>
            <div className="flex items-end gap-1" style={{ height: 60 }}>
              {MACD_HIST.map((val, i) => {
                const isPositive = val >= 0;
                const pct = Math.abs(val) / (MACD_MAX || 1);
                const height = Math.max(2, pct * 50);
                return (
                  <div key={i} className="flex flex-1 flex-col items-center justify-end" style={{ height: 60 }}>
                    {/* Positive bars grow up from middle, negative down */}
                    {isPositive ? (
                      <div className="flex flex-col items-center justify-end" style={{ height: 30 }}>
                        <div
                          className="w-full rounded-t-sm"
                          style={{
                            height,
                            background: i === MACD_HIST.length - 1 ? ACCENT : "#2bc48a80",
                            boxShadow: i === MACD_HIST.length - 1 ? `0 0 6px ${ACCENT}40` : "none",
                          }}
                        />
                      </div>
                    ) : (
                      <>
                        <div style={{ height: 30 }} />
                        <div
                          className="w-full rounded-b-sm"
                          style={{
                            height,
                            background: "#f6465d80",
                          }}
                        />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-1 flex justify-between text-[9px] text-white/15">
              <span>-10</span>
              <span>Current: {MACD_HIST[MACD_HIST.length - 1] > 0 ? "+" : ""}{fmt(MACD_HIST[MACD_HIST.length - 1], 2)}</span>
            </div>
          </div>

          {/* Visual Volume Bars */}
          <div>
            <div className="mb-2 flex items-center gap-2">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-white/40">Volume</h4>
              <span className="text-[10px] text-white/20">(last 10 bars, relative to avg)</span>
            </div>
            <div className="relative flex items-end gap-1" style={{ height: 50 }}>
              {/* Average line */}
              <div
                className="absolute left-0 right-0 border-t border-dashed border-white/20"
                style={{ bottom: `${(VOLUME_AVG / Math.max(...VOLUME_BARS, 2)) * 50}px` }}
              />
              {VOLUME_BARS.map((val, i) => {
                const maxV = Math.max(...VOLUME_BARS, 2);
                const height = Math.max(3, (val / maxV) * 45);
                const isAboveAvg = val > VOLUME_AVG;
                const isLast = i === VOLUME_BARS.length - 1;
                return (
                  <div key={i} className="flex flex-1 items-end justify-center" style={{ height: 50 }}>
                    <div
                      className="w-full rounded-t-sm"
                      style={{
                        height,
                        background: isLast
                          ? `${ACCENT}cc`
                          : isAboveAvg
                            ? "rgba(43,196,138,0.5)"
                            : "rgba(255,255,255,0.12)",
                        boxShadow: isLast ? `0 0 6px ${ACCENT}40` : "none",
                      }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="mt-1 flex justify-between text-[9px] text-white/15">
              <span>Avg: {fmt(VOLUME_AVG, 1)}x</span>
              <span>Current: {fmt(VOLUME_BARS[VOLUME_BARS.length - 1], 1)}x</span>
              <span className="text-[#f6465d]">Need: &gt; {fmt(setup.volumeMultiplier, 1)}x</span>
            </div>
          </div>
        </Card>

        {/* Chart */}
        <Card className="overflow-hidden p-0">
          <BotStrategyChart defaultPair={setup.pair} defaultTf={setup.timeframe} accentColor={ACCENT} />
        </Card>

        {/* Backtest */}
        <BotBacktestPanel strategyName="Momentum + Volume Engine" accentColor={ACCENT} />

        {/* Setup */}
        <Card>
          <h3 className="mb-3 text-[13px] font-semibold tracking-wide text-white/80">Setup</h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {/* MACD Fast */}
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-white/30">MACD Fast</label>
              <input
                type="number"
                min={2}
                max={50}
                value={setup.macdFast}
                onChange={(e) => setSetup((s) => ({ ...s, macdFast: +e.target.value }))}
                className="w-full rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              />
            </div>
            {/* MACD Slow */}
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-white/30">MACD Slow</label>
              <input
                type="number"
                min={2}
                max={100}
                value={setup.macdSlow}
                onChange={(e) => setSetup((s) => ({ ...s, macdSlow: +e.target.value }))}
                className="w-full rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              />
            </div>
            {/* MACD Signal */}
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-white/30">MACD Signal</label>
              <input
                type="number"
                min={2}
                max={50}
                value={setup.macdSignal}
                onChange={(e) => setSetup((s) => ({ ...s, macdSignal: +e.target.value }))}
                className="w-full rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              />
            </div>
            {/* Volume Multiplier */}
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-white/30">Vol. Multiplier</label>
              <input
                type="number"
                min={1.0}
                max={5.0}
                step={0.1}
                value={setup.volumeMultiplier}
                onChange={(e) => setSetup((s) => ({ ...s, volumeMultiplier: +e.target.value }))}
                className="w-full rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              />
            </div>
            {/* RSI Min */}
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-white/30">RSI Min</label>
              <input
                type="number"
                min={0}
                max={100}
                value={setup.rsiMin}
                onChange={(e) => setSetup((s) => ({ ...s, rsiMin: +e.target.value }))}
                className="w-full rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              />
            </div>
            {/* RSI Max */}
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-white/30">RSI Max</label>
              <input
                type="number"
                min={0}
                max={100}
                value={setup.rsiMax}
                onChange={(e) => setSetup((s) => ({ ...s, rsiMax: +e.target.value }))}
                className="w-full rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              />
            </div>
            {/* Pair */}
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-white/30">Pair</label>
              <select
                value={setup.pair}
                onChange={(e) => setSetup((s) => ({ ...s, pair: e.target.value }))}
                className="w-full rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none"
              >
                {["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"].map((p) => (
                  <option key={p}>{p}</option>
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
                  <option key={t}>{t}</option>
                ))}
              </select>
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
