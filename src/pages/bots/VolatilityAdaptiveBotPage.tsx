import { useState } from "react";
import BotExchangeBar from "../../components/bot/BotExchangeBar";
import { BotProvider } from "../../components/bot/BotContext";
import BotExecutionLog from "../../components/bot/BotExecutionLog";
import BotLivePanel from "../../components/bot/BotLivePanel";
import SignalsOverview from "../../components/bot/SignalsOverview";

/* ── Helpers ── */
const cn = (...cls: (string | false | undefined)[]) => cls.filter(Boolean).join(" ");
const fmt = (n: number, d = 2) =>
  n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtUsd = (n: number) => "$" + fmt(n);
const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("rounded-xl border border-white/[0.06] bg-white/[0.02] p-4", className)}>
    {children}
  </div>
);

/* ── Types ── */
type RegimeKey = "low" | "mid" | "high";

interface Regime {
  key: RegimeKey;
  label: string;
  range: string;
  strategy: string;
  winRate: number;
  avgRr: string;
  trades: number;
  pnl: number;
  color: string;
  indicators: string[];
  entryCondition: string;
  exitCondition: string;
  positionScale: number;
}

interface RegimeBlock {
  regime: RegimeKey;
  from: string;
  to: string;
  trades: number;
}

/* ── Mock Data ── */
const CURRENT_ATR = 2.18;
const ACTIVE_REGIME: RegimeKey = "mid";

const REGIMES: Regime[] = [
  {
    key: "low",
    label: "LOW VOL",
    range: "ATR < 1.5%",
    strategy: "Mean Reversion",
    winRate: 64,
    avgRr: "1:1.2",
    trades: 42,
    pnl: 385.2,
    color: "#2bc48a",
    indicators: ["Bollinger Bands (20,2)", "RSI (14)", "Keltner Channel"],
    entryCondition: "Price touches outer BB + RSI divergence + inside Keltner",
    exitCondition: "Return to BB midline or RSI normalization",
    positionScale: 1.5,
  },
  {
    key: "mid",
    label: "MID VOL",
    range: "1.5% - 3%",
    strategy: "Trend Following",
    winRate: 55,
    avgRr: "1:2.0",
    trades: 67,
    pnl: 612.8,
    color: "#F5C542",
    indicators: ["EMA 9/21 Cross", "ADX (14)", "MACD (12,26,9)"],
    entryCondition: "EMA crossover + ADX > 25 + MACD confirmation",
    exitCondition: "EMA crossunder or ADX declining below 20",
    positionScale: 1.0,
  },
  {
    key: "high",
    label: "HIGH VOL",
    range: "ATR > 3%",
    strategy: "Breakout",
    winRate: 48,
    avgRr: "1:3.0",
    trades: 31,
    pnl: 445.5,
    color: "#ef4444",
    indicators: ["ATR Bands", "Volume Profile", "Pivot Points"],
    entryCondition: "Price breaks ATR band + volume spike > 2x avg + pivot confirmation",
    exitCondition: "Trailing stop at 1.5x ATR or opposite ATR band",
    positionScale: 0.5,
  },
];

const REGIME_HISTORY: RegimeBlock[] = [
  { regime: "low",  from: "00:00", to: "03:15", trades: 4 },
  { regime: "mid",  from: "03:15", to: "06:40", trades: 6 },
  { regime: "low",  from: "06:40", to: "09:00", trades: 3 },
  { regime: "high", from: "09:00", to: "11:30", trades: 5 },
  { regime: "mid",  from: "11:30", to: "16:45", trades: 9 },
  { regime: "high", from: "16:45", to: "19:20", trades: 4 },
  { regime: "mid",  from: "19:20", to: "22:00", trades: 7 },
  { regime: "low",  from: "22:00", to: "00:00", trades: 2 },
];

const REGIME_COLOR: Record<RegimeKey, string> = {
  low: "#2bc48a",
  mid: "#F5C542",
  high: "#ef4444",
};

const REGIME_LABEL: Record<RegimeKey, string> = {
  low: "Low Vol",
  mid: "Mid Vol",
  high: "High Vol",
};

/* ── Setup form state defaults ── */
const DEFAULT_SETUP = {
  lowThreshold: 1.5,
  highThreshold: 3.0,
  lowStrategy: "Mean Reversion",
  midStrategy: "Trend Following",
  highStrategy: "Breakout",
  positionScaleFactor: 1.0,
  minRegimeDuration: 15,
  atrPeriod: 14,
  atrTimeframe: "15m",
};

/* ── ATR Gauge ── */
function AtrGauge({ value }: { value: number }) {
  const maxAtr = 5;
  const pct = Math.min(value / maxAtr, 1) * 100;
  const lowPct = (1.5 / maxAtr) * 100;
  const highPct = (3 / maxAtr) * 100;

  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] text-white/40">ATR Gauge</span>
        <span className="text-[11px] font-bold text-white">{fmt(value)}%</span>
      </div>
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-white/[0.06]">
        {/* Zone backgrounds */}
        <div className="absolute inset-y-0 left-0 bg-[#2bc48a]/20" style={{ width: `${lowPct}%` }} />
        <div
          className="absolute inset-y-0 bg-[#F5C542]/20"
          style={{ left: `${lowPct}%`, width: `${highPct - lowPct}%` }}
        />
        <div className="absolute inset-y-0 right-0 bg-[#ef4444]/20" style={{ left: `${highPct}%` }} />
        {/* Current marker */}
        <div
          className="absolute top-0 h-full w-1 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.6)]"
          style={{ left: `${pct}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[9px] text-white/30">
        <span>0%</span>
        <span>1.5%</span>
        <span>3%</span>
        <span>5%</span>
      </div>
    </div>
  );
}

/* ── Regime Card ── */
function RegimeCard({ regime, isActive }: { regime: Regime; isActive: boolean }) {
  return (
    <div
      className={cn(
        "relative flex-1 rounded-xl border p-4 transition-all",
        isActive
          ? "border-transparent bg-white/[0.04]"
          : "border-white/[0.06] bg-white/[0.02] opacity-60"
      )}
      style={
        isActive
          ? {
              borderColor: regime.color + "55",
              boxShadow: `0 0 20px ${regime.color}15, inset 0 0 20px ${regime.color}08`,
            }
          : undefined
      }
    >
      {isActive && (
        <div
          className="absolute inset-0 animate-pulse rounded-xl border"
          style={{ borderColor: regime.color + "30" }}
        />
      )}
      <div className="relative">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[13px] font-bold" style={{ color: regime.color }}>
            {regime.label}
          </span>
          <span className="text-[10px] text-white/30">({regime.range})</span>
        </div>
        <div className="mb-3 text-[11px] text-white/60">
          Strategy: <span className="font-semibold text-white/90">{regime.strategy}</span>
        </div>
        <div className="mb-2 flex items-center gap-2">
          {isActive ? (
            <span className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: regime.color }}>
              <span className="inline-block h-2 w-2 animate-pulse rounded-full" style={{ background: regime.color }} />
              ACTIVE
            </span>
          ) : (
            <span className="text-[11px] text-white/30">INACTIVE</span>
          )}
        </div>
        <div className="space-y-1 text-[11px]">
          <div className="flex justify-between">
            <span className="text-white/40">Win Rate</span>
            <span className="font-semibold text-white/80">{regime.winRate}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/40">Avg R:R</span>
            <span className="font-semibold text-white/80">{regime.avgRr}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/40">Trades</span>
            <span className="font-semibold text-white/80">{regime.trades}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/40">PnL</span>
            <span className={cn("font-semibold", regime.pnl >= 0 ? "text-[#2bc48a]" : "text-[#f6465d]")}>
              {regime.pnl >= 0 ? "+" : ""}
              {fmtUsd(regime.pnl)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Page ── */
export default function VolatilityAdaptiveBotPage() {
  const [tab, setTab] = useState<"dashboard" | "setup">("dashboard");
  const [setup, setSetup] = useState(DEFAULT_SETUP);

  const activeRegime = REGIMES.find((r) => r.key === ACTIVE_REGIME)!;
  const totalTrades = REGIMES.reduce((s, r) => s + r.trades, 0);
  const totalPnl = REGIMES.reduce((s, r) => s + r.pnl, 0);

  /* Regime time distribution */
  const regimeMinutes: Record<RegimeKey, number> = { low: 0, mid: 0, high: 0 };
  REGIME_HISTORY.forEach((b) => {
    const [fH, fM] = b.from.split(":").map(Number);
    const [tH, tM] = b.to.split(":").map(Number);
    let mins = (tH * 60 + tM) - (fH * 60 + fM);
    if (mins <= 0) mins += 1440;
    regimeMinutes[b.regime] += mins;
  });
  const totalMin = Object.values(regimeMinutes).reduce((a, b) => a + b, 0);

  return (
    <BotProvider>
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      {/* Exchange Bar */}
      <BotExchangeBar botName="Volatility Adaptive Engine" accentColor="#ef4444" />

      {/* Tab Toggle */}
      <div className="flex gap-1 rounded-lg border border-white/[0.06] bg-white/[0.02] p-1">
        {(["dashboard", "setup"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-md px-4 py-1.5 text-[11px] font-semibold capitalize transition",
              tab === t ? "bg-white/[0.08] text-white" : "text-white/40 hover:text-white/60"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "dashboard" && (
        <>
          {/* ── 1. Regime Dashboard ── */}
          <Card>
            <h3 className="mb-4 text-[13px] font-semibold tracking-wide text-white/80">
              Volatility Regime Dashboard
            </h3>
            <div className="flex gap-3">
              {REGIMES.map((r) => (
                <RegimeCard key={r.key} regime={r} isActive={r.key === ACTIVE_REGIME} />
              ))}
            </div>
            <AtrGauge value={CURRENT_ATR} />
          </Card>

          {/* ── 2. Regime History ── */}
          <Card>
            <h3 className="mb-3 text-[13px] font-semibold tracking-wide text-white/80">
              Regime History (24h)
            </h3>
            <div className="flex h-10 w-full overflow-hidden rounded-lg">
              {REGIME_HISTORY.map((block, i) => {
                const [fH, fM] = block.from.split(":").map(Number);
                const [tH, tM] = block.to.split(":").map(Number);
                let mins = (tH * 60 + tM) - (fH * 60 + fM);
                if (mins <= 0) mins += 1440;
                const widthPct = (mins / 1440) * 100;
                return (
                  <div
                    key={i}
                    className="relative flex items-center justify-center overflow-hidden border-r border-black/30 last:border-r-0"
                    style={{ width: `${widthPct}%`, background: REGIME_COLOR[block.regime] + "25" }}
                    title={`${REGIME_LABEL[block.regime]}: ${block.from} - ${block.to}`}
                  >
                    {widthPct > 8 && (
                      <span className="text-[8px] font-semibold" style={{ color: REGIME_COLOR[block.regime] }}>
                        {REGIME_LABEL[block.regime]}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-3 space-y-1">
              {REGIME_HISTORY.map((block, i) => (
                <div key={i} className="flex items-center gap-2 text-[10px]">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: REGIME_COLOR[block.regime] }}
                  />
                  <span className="font-mono text-white/30">
                    {block.from} - {block.to}
                  </span>
                  <span className="font-semibold" style={{ color: REGIME_COLOR[block.regime] }}>
                    {REGIME_LABEL[block.regime]}
                  </span>
                  <span className="text-white/30">{block.trades} trades</span>
                </div>
              ))}
            </div>
          </Card>

          {/* ── 3. Strategy Details (Active Regime) ── */}
          <Card>
            <div className="mb-3 flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 animate-pulse rounded-full"
                style={{ background: activeRegime.color }}
              />
              <h3 className="text-[13px] font-semibold tracking-wide text-white/80">
                Active Strategy: {activeRegime.strategy}
              </h3>
              <span className="ml-auto rounded-md px-2 py-0.5 text-[10px] font-bold" style={{ background: activeRegime.color + "20", color: activeRegime.color }}>
                {activeRegime.label}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-white/30">
                  Indicators
                </span>
                <div className="space-y-1">
                  {activeRegime.indicators.map((ind) => (
                    <div key={ind} className="flex items-center gap-2 text-[11px]">
                      <span className="text-white/20">+</span>
                      <span className="text-white/70">{ind}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-white/30">
                    Entry Condition
                  </span>
                  <p className="text-[11px] leading-relaxed text-white/60">{activeRegime.entryCondition}</p>
                </div>
                <div>
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-white/30">
                    Exit Condition
                  </span>
                  <p className="text-[11px] leading-relaxed text-white/60">{activeRegime.exitCondition}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div>
                    <span className="mb-1 block text-[10px] text-white/30">Position Scale</span>
                    <span className="text-[14px] font-bold text-white">{activeRegime.positionScale}x</span>
                  </div>
                  <div>
                    <span className="mb-1 block text-[10px] text-white/30">Current Signal</span>
                    <span className="text-[11px] font-semibold text-[#F5C542]">Watching for EMA cross</span>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* ── 4. Adaptive Stats ── */}
          <Card>
            <h3 className="mb-3 text-[13px] font-semibold tracking-wide text-white/80">
              Adaptive Stats
            </h3>
            <div className="grid grid-cols-3 gap-3">
              {/* Regime Distribution */}
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                <span className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-white/30">
                  Regime Distribution
                </span>
                <div className="space-y-2">
                  {(["low", "mid", "high"] as RegimeKey[]).map((k) => {
                    const pct = totalMin > 0 ? (regimeMinutes[k] / totalMin) * 100 : 0;
                    return (
                      <div key={k}>
                        <div className="mb-0.5 flex items-center justify-between text-[10px]">
                          <span style={{ color: REGIME_COLOR[k] }}>{REGIME_LABEL[k]}</span>
                          <span className="text-white/50">{fmt(pct, 1)}%</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${pct}%`, background: REGIME_COLOR[k] }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Per-Regime Performance */}
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                <span className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-white/30">
                  Per-Regime Performance
                </span>
                <div className="space-y-2">
                  {REGIMES.map((r) => (
                    <div key={r.key} className="flex items-center justify-between text-[10px]">
                      <span style={{ color: r.color }}>{r.label}</span>
                      <span className="text-white/50">{r.winRate}% WR</span>
                      <span className={r.pnl >= 0 ? "text-[#2bc48a]" : "text-[#f6465d]"}>
                        {r.pnl >= 0 ? "+" : ""}{fmtUsd(r.pnl)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Summary */}
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                <span className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-white/30">
                  Totals
                </span>
                <div className="space-y-2 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-white/40">Total Trades</span>
                    <span className="font-bold text-white">{totalTrades}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/40">Total PnL</span>
                    <span className={cn("font-bold", totalPnl >= 0 ? "text-[#2bc48a]" : "text-[#f6465d]")}>
                      {totalPnl >= 0 ? "+" : ""}{fmtUsd(totalPnl)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/40">Regime Switches</span>
                    <span className="font-bold text-white">{REGIME_HISTORY.length - 1}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/40">Avg Regime Duration</span>
                    <span className="font-bold text-white">{Math.round(totalMin / REGIME_HISTORY.length)}m</span>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* ── Signals Overview ── */}
          <SignalsOverview
            overrides={[
              { id: "trend", status: "Bullish" },
              { id: "volume", status: "Bullish" },
              { id: "rsi-divergence", status: "Neutral" },
              { id: "vwap", status: "Neutral" },
              { id: "open-interest", status: "Neutral" },
              { id: "funding-rate", status: "Bearish" },
              { id: "composite", status: "Bullish" },
            ]}
          />

          {/* ── 5. Bot Thinking ── */}
          <Card>
            <h3 className="mb-3 text-[13px] font-semibold tracking-wide text-white/80">
              Bot Thinking
            </h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[11px]">
              {[
                { label: "Current ATR", value: `${fmt(CURRENT_ATR)}%`, color: "#F5C542" },
                { label: "Regime Classification", value: "MID VOL", color: "#F5C542" },
                { label: "Active Strategy", value: "Trend Following (EMA Cross)", color: "#fff" },
                { label: "EMA 9", value: "94,620", color: "#5B8DEF" },
                { label: "EMA 21", value: "94,480", color: "#5B8DEF" },
                { label: "ADX", value: "28.4 (Trending)", color: "#2bc48a" },
                { label: "MACD Signal", value: "Bullish cross pending", color: "#F5C542" },
                { label: "Position Scale", value: `${activeRegime.positionScale}x (inverse vol)`, color: "#fff" },
              ].map((row) => (
                <div key={row.label} className="flex justify-between border-b border-white/[0.04] py-1">
                  <span className="text-white/40">{row.label}</span>
                  <span className="font-semibold" style={{ color: row.color }}>
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-lg border border-[#F5C542]/20 bg-[#F5C542]/5 px-3 py-2 text-[11px] text-[#F5C542]">
              Mid-vol regime detected (ATR {fmt(CURRENT_ATR)}%). Trend following active. EMA 9 above EMA 21, ADX rising. Watching for MACD bullish crossover to confirm long entry.
            </div>
          </Card>

          {/* ── 6. Execution Log ── */}
          <BotLivePanel botSlug="volatility-adaptive" botName="Volatility Adaptive Bot" accentColor="#ef4444" />
          <BotExecutionLog accentColor="#ef4444" />
        </>
      )}

      {tab === "setup" && (
        <Card>
          <h3 className="mb-4 text-[13px] font-semibold tracking-wide text-white/80">
            Regime Configuration
          </h3>
          <div className="grid grid-cols-2 gap-4">
            {/* ATR Thresholds */}
            <div className="space-y-3">
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-white/30">
                ATR Thresholds
              </span>
              {[
                { label: "Low / Mid Boundary", key: "lowThreshold" as const, suffix: "%" },
                { label: "Mid / High Boundary", key: "highThreshold" as const, suffix: "%" },
              ].map((field) => (
                <div key={field.key}>
                  <label className="mb-1 block text-[10px] text-white/50">{field.label}</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      step={0.1}
                      value={setup[field.key]}
                      onChange={(e) => setSetup((s) => ({ ...s, [field.key]: +e.target.value }))}
                      className="w-20 rounded-md border border-white/10 bg-[#0F1012] px-2 py-1 text-[11px] text-white outline-none"
                    />
                    <span className="text-[10px] text-white/30">{field.suffix}</span>
                  </div>
                </div>
              ))}
              <div>
                <label className="mb-1 block text-[10px] text-white/50">ATR Period</label>
                <input
                  type="number"
                  value={setup.atrPeriod}
                  onChange={(e) => setSetup((s) => ({ ...s, atrPeriod: +e.target.value }))}
                  className="w-20 rounded-md border border-white/10 bg-[#0F1012] px-2 py-1 text-[11px] text-white outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] text-white/50">ATR Timeframe</label>
                <select
                  value={setup.atrTimeframe}
                  onChange={(e) => setSetup((s) => ({ ...s, atrTimeframe: e.target.value }))}
                  className="rounded-md border border-white/10 bg-[#0F1012] px-2 py-1 text-[11px] text-white outline-none"
                >
                  {["5m", "15m", "1h", "4h"].map((tf) => (
                    <option key={tf} value={tf}>{tf}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Strategy Assignment */}
            <div className="space-y-3">
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-white/30">
                Strategy Per Regime
              </span>
              {[
                { label: "Low Vol Strategy", key: "lowStrategy" as const },
                { label: "Mid Vol Strategy", key: "midStrategy" as const },
                { label: "High Vol Strategy", key: "highStrategy" as const },
              ].map((field) => (
                <div key={field.key}>
                  <label className="mb-1 block text-[10px] text-white/50">{field.label}</label>
                  <select
                    value={setup[field.key]}
                    onChange={(e) => setSetup((s) => ({ ...s, [field.key]: e.target.value }))}
                    className="w-full rounded-md border border-white/10 bg-[#0F1012] px-2 py-1 text-[11px] text-white outline-none"
                  >
                    {["Mean Reversion", "Trend Following", "Breakout", "Scalping", "Range Trading"].map((st) => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>
              ))}
              <div>
                <label className="mb-1 block text-[10px] text-white/50">Position Scale Factor</label>
                <input
                  type="number"
                  step={0.1}
                  value={setup.positionScaleFactor}
                  onChange={(e) => setSetup((s) => ({ ...s, positionScaleFactor: +e.target.value }))}
                  className="w-20 rounded-md border border-white/10 bg-[#0F1012] px-2 py-1 text-[11px] text-white outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] text-white/50">
                  Min Regime Duration (avoid whipsaw)
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={setup.minRegimeDuration}
                    onChange={(e) => setSetup((s) => ({ ...s, minRegimeDuration: +e.target.value }))}
                    className="w-20 rounded-md border border-white/10 bg-[#0F1012] px-2 py-1 text-[11px] text-white outline-none"
                  />
                  <span className="text-[10px] text-white/30">minutes</span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
    </BotProvider>
  );
}
