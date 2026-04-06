import { useState } from "react";
import BotExchangeBar from "../../components/bot/BotExchangeBar";
import BotExecutionLog from "../../components/bot/BotExecutionLog";

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
type SessionKey = "asian" | "european" | "us";
type SessionCondition = "IDEAL" | "ACTIVE" | "UPCOMING" | "CLOSED";

interface Session {
  key: SessionKey;
  label: string;
  startUtc: number;
  endUtc: number;
  strategy: string;
  winRate: number;
  avgRr: string;
  tradesToday: number;
  pnl: number;
  condition: SessionCondition;
  color: string;
  volumeVsAvg: number;
  rangeVsAvg: number;
  keyLevels: { label: string; price: string }[];
}

interface OverlapZone {
  label: string;
  startUtc: number;
  endUtc: number;
  sessions: [SessionKey, SessionKey];
  volumeBoost: string;
  color: string;
}

/* ── Mock Data ── */
const CURRENT_UTC_HOUR = 13;
const CURRENT_UTC_MIN = 42;

const SESSIONS: Session[] = [
  {
    key: "asian",
    label: "Asian",
    startUtc: 0,
    endUtc: 8,
    strategy: "Range Fade",
    winRate: 62,
    avgRr: "1:1.5",
    tradesToday: 3,
    pnl: 45.2,
    condition: "CLOSED",
    color: "#5B8DEF",
    volumeVsAvg: 0.85,
    rangeVsAvg: 0.72,
    keyLevels: [
      { label: "Session High", price: "94,320" },
      { label: "Session Low", price: "93,680" },
      { label: "VWAP", price: "93,980" },
      { label: "Range Midpoint", price: "94,000" },
    ],
  },
  {
    key: "european",
    label: "European",
    startUtc: 8,
    endUtc: 16,
    strategy: "Breakout",
    winRate: 55,
    avgRr: "1:2.0",
    tradesToday: 5,
    pnl: 120.6,
    condition: "ACTIVE",
    color: "#2bc48a",
    volumeVsAvg: 1.35,
    rangeVsAvg: 1.22,
    keyLevels: [
      { label: "Asia High (Breakout)", price: "94,320" },
      { label: "Asia Low (Breakdown)", price: "93,680" },
      { label: "Session VWAP", price: "94,540" },
      { label: "POC", price: "94,480" },
    ],
  },
  {
    key: "us",
    label: "US",
    startUtc: 16,
    endUtc: 24,
    strategy: "Trend",
    winRate: 52,
    avgRr: "1:2.5",
    tradesToday: 2,
    pnl: 80.4,
    condition: "UPCOMING",
    color: "#F5C542",
    volumeVsAvg: 0,
    rangeVsAvg: 0,
    keyLevels: [
      { label: "EU High (Resistance)", price: "94,720" },
      { label: "EU Low (Support)", price: "94,180" },
      { label: "Daily VWAP", price: "94,350" },
      { label: "Prior Day Close", price: "94,100" },
    ],
  },
];

const OVERLAPS: OverlapZone[] = [
  {
    label: "EU / US Overlap",
    startUtc: 16,
    endUtc: 18,
    sessions: ["european", "us"],
    volumeBoost: "+65% above average",
    color: "#f4906c",
  },
];

const CONDITION_STYLE: Record<SessionCondition, { bg: string; text: string }> = {
  IDEAL: { bg: "bg-[#5B8DEF]/10", text: "text-[#5B8DEF]" },
  ACTIVE: { bg: "bg-[#2bc48a]/10", text: "text-[#2bc48a]" },
  UPCOMING: { bg: "bg-[#F5C542]/10", text: "text-[#F5C542]" },
  CLOSED: { bg: "bg-white/5", text: "text-white/40" },
};

/* ── Setup defaults ── */
const DEFAULT_SETUP = {
  asianStart: 0,
  asianEnd: 8,
  europeanStart: 8,
  europeanEnd: 16,
  usStart: 16,
  usEnd: 24,
  asianStrategy: "Range Fade",
  europeanStrategy: "Breakout",
  usStrategy: "Trend",
  volumeFilter: 1.2,
  dstAutoAdjust: true,
  enableAsian: true,
  enableEuropean: true,
  enableUs: true,
};

/* ── Timeline Component ── */
function SessionTimeline() {
  const nowPct = ((CURRENT_UTC_HOUR * 60 + CURRENT_UTC_MIN) / 1440) * 100;

  return (
    <div>
      {/* Session blocks */}
      <div className="relative flex h-14 w-full overflow-hidden rounded-lg">
        {SESSIONS.map((s) => {
          const startPct = (s.startUtc / 24) * 100;
          const widthPct = ((s.endUtc - s.startUtc) / 24) * 100;
          const isActive = s.condition === "ACTIVE";
          return (
            <div
              key={s.key}
              className="relative flex flex-col items-center justify-center border-r border-black/30 last:border-r-0"
              style={{
                width: `${widthPct}%`,
                left: `${startPct}%`,
                background: isActive ? s.color + "20" : s.color + "0A",
              }}
            >
              {isActive && (
                <div
                  className="absolute inset-0 animate-pulse"
                  style={{ background: s.color + "10" }}
                />
              )}
              <span className="relative text-[11px] font-bold" style={{ color: s.color }}>
                {s.label.toUpperCase()}
              </span>
              <span className="relative text-[9px] text-white/30">
                {String(s.startUtc).padStart(2, "0")}:00 - {String(s.endUtc).padStart(2, "0")}:00 UTC
              </span>
              <span className="relative text-[9px] text-white/40">{s.strategy}</span>
            </div>
          );
        })}
        {/* Overlap markers */}
        {OVERLAPS.map((o) => {
          const startPct = (o.startUtc / 24) * 100;
          const widthPct = ((o.endUtc - o.startUtc) / 24) * 100;
          return (
            <div
              key={o.label}
              className="absolute top-0 h-full border-x"
              style={{
                left: `${startPct}%`,
                width: `${widthPct}%`,
                borderColor: o.color + "40",
                background: o.color + "08",
              }}
            />
          );
        })}
        {/* Current time marker */}
        <div
          className="absolute top-0 z-10 h-full w-0.5 bg-white shadow-[0_0_8px_rgba(255,255,255,0.5)]"
          style={{ left: `${nowPct}%` }}
        />
      </div>
      {/* Time labels */}
      <div className="mt-1 flex justify-between text-[8px] text-white/20">
        {[0, 4, 8, 12, 16, 20, 24].map((h) => (
          <span key={h}>{String(h).padStart(2, "0")}:00</span>
        ))}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 text-[9px] text-white/40">
        <span className="h-1 w-1 animate-pulse rounded-full bg-white" />
        Current: {String(CURRENT_UTC_HOUR).padStart(2, "0")}:{String(CURRENT_UTC_MIN).padStart(2, "0")} UTC
      </div>
    </div>
  );
}

/* ── Page ── */
export default function SessionBotPage() {
  const [tab, setTab] = useState<"dashboard" | "setup">("dashboard");
  const [setup, setSetup] = useState(DEFAULT_SETUP);

  const activeSession = SESSIONS.find((s) => s.condition === "ACTIVE")!;
  const timeLeftMin =
    activeSession.endUtc * 60 - (CURRENT_UTC_HOUR * 60 + CURRENT_UTC_MIN);
  const timeLeftH = Math.floor(timeLeftMin / 60);
  const timeLeftM = timeLeftMin % 60;

  /* overlap check */
  const activeOverlap = OVERLAPS.find(
    (o) => CURRENT_UTC_HOUR >= o.startUtc && CURRENT_UTC_HOUR < o.endUtc
  );

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      {/* Exchange Bar */}
      <BotExchangeBar botName="Session Trading Engine" accentColor="#ef4444" />

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
          {/* ── 1. Session Timeline ── */}
          <Card>
            <h3 className="mb-3 text-[13px] font-semibold tracking-wide text-white/80">
              Session Timeline (24h UTC)
            </h3>
            <SessionTimeline />
          </Card>

          {/* ── 2. Session Stats ── */}
          <Card>
            <h3 className="mb-3 text-[13px] font-semibold tracking-wide text-white/80">
              Session Performance
            </h3>
            <div className="overflow-hidden rounded-lg border border-white/[0.06]">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                    {["Session", "Strategy", "Win Rate", "Avg R:R", "Trades", "PnL", "Condition"].map(
                      (h) => (
                        <th
                          key={h}
                          className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-white/30"
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {SESSIONS.map((s) => {
                    const cond = CONDITION_STYLE[s.condition];
                    return (
                      <tr key={s.key} className="border-b border-white/[0.04] last:border-b-0">
                        <td className="px-3 py-2">
                          <span className="font-semibold" style={{ color: s.color }}>
                            {s.label}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-white/60">{s.strategy}</td>
                        <td className="px-3 py-2 font-semibold text-white/80">{s.winRate}%</td>
                        <td className="px-3 py-2 text-white/60">{s.avgRr}</td>
                        <td className="px-3 py-2 text-white/80">{s.tradesToday}</td>
                        <td className="px-3 py-2">
                          <span className={s.pnl >= 0 ? "text-[#2bc48a]" : "text-[#f6465d]"}>
                            {s.pnl >= 0 ? "+" : ""}
                            {fmtUsd(s.pnl)}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span className={cn("rounded-md px-2 py-0.5 text-[9px] font-bold", cond.bg, cond.text)}>
                            {s.condition}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Summary row */}
            <div className="mt-2 flex gap-6 text-[10px]">
              <span className="text-white/30">
                Total Trades:{" "}
                <span className="font-bold text-white">{SESSIONS.reduce((s, x) => s + x.tradesToday, 0)}</span>
              </span>
              <span className="text-white/30">
                Total PnL:{" "}
                <span className="font-bold text-[#2bc48a]">
                  +{fmtUsd(SESSIONS.reduce((s, x) => s + x.pnl, 0))}
                </span>
              </span>
            </div>
          </Card>

          {/* ── 3. Current Session Detail ── */}
          <Card>
            <div className="mb-3 flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 animate-pulse rounded-full"
                style={{ background: activeSession.color }}
              />
              <h3 className="text-[13px] font-semibold tracking-wide text-white/80">
                Current Session: {activeSession.label}
              </h3>
              <span
                className="ml-auto rounded-md px-2 py-0.5 text-[10px] font-bold"
                style={{ background: activeSession.color + "20", color: activeSession.color }}
              >
                {activeSession.strategy}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {/* Metrics */}
              <div className="space-y-2">
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-white/30">
                  Session Metrics
                </span>
                {[
                  {
                    label: "Volume vs Average",
                    value: `${fmt(activeSession.volumeVsAvg * 100, 0)}%`,
                    bar: activeSession.volumeVsAvg,
                    color: activeSession.volumeVsAvg >= 1 ? "#2bc48a" : "#F5C542",
                  },
                  {
                    label: "Range vs Average",
                    value: `${fmt(activeSession.rangeVsAvg * 100, 0)}%`,
                    bar: activeSession.rangeVsAvg,
                    color: activeSession.rangeVsAvg >= 1 ? "#2bc48a" : "#F5C542",
                  },
                ].map((m) => (
                  <div key={m.label}>
                    <div className="mb-0.5 flex items-center justify-between text-[10px]">
                      <span className="text-white/40">{m.label}</span>
                      <span className="font-semibold" style={{ color: m.color }}>
                        {m.value}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${Math.min(m.bar * 50, 100)}%`, background: m.color }}
                      />
                    </div>
                  </div>
                ))}
                <div className="mt-2 flex items-center gap-3 text-[11px]">
                  <div>
                    <span className="block text-[10px] text-white/30">Time Remaining</span>
                    <span className="text-[14px] font-bold text-white">
                      {timeLeftH}h {timeLeftM}m
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-white/30">Signal Status</span>
                    <span className="text-[11px] font-semibold text-[#2bc48a]">
                      Breakout confirmed above 94,320
                    </span>
                  </div>
                </div>
              </div>

              {/* Key Levels */}
              <div>
                <span className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-white/30">
                  Key Levels
                </span>
                <div className="space-y-1.5">
                  {activeSession.keyLevels.map((lv) => (
                    <div key={lv.label} className="flex items-center justify-between text-[11px]">
                      <span className="text-white/50">{lv.label}</span>
                      <span className="font-mono font-semibold text-white/80">{lv.price}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {/* ── 4. Session Overlap ── */}
          <Card>
            <h3 className="mb-3 text-[13px] font-semibold tracking-wide text-white/80">
              Session Overlaps
            </h3>
            {OVERLAPS.map((o) => {
              const isNow = activeOverlap?.label === o.label;
              return (
                <div
                  key={o.label}
                  className={cn(
                    "flex items-center gap-4 rounded-lg border p-3",
                    isNow ? "border-transparent" : "border-white/[0.06] bg-white/[0.02]"
                  )}
                  style={
                    isNow
                      ? { borderColor: o.color + "40", background: o.color + "10" }
                      : undefined
                  }
                >
                  <div className="flex items-center gap-2">
                    {isNow && (
                      <span
                        className="h-2 w-2 animate-pulse rounded-full"
                        style={{ background: o.color }}
                      />
                    )}
                    <span className="text-[12px] font-bold" style={{ color: o.color }}>
                      {o.label}
                    </span>
                  </div>
                  <span className="text-[10px] text-white/40">
                    {String(o.startUtc).padStart(2, "0")}:00 - {String(o.endUtc).padStart(2, "0")}:00 UTC
                  </span>
                  <span className="text-[10px] text-white/50">
                    Volume: <span className="font-semibold" style={{ color: o.color }}>{o.volumeBoost}</span>
                  </span>
                  <span className={cn("ml-auto rounded-md px-2 py-0.5 text-[9px] font-bold", isNow ? "bg-[#f4906c]/10 text-[#f4906c]" : "bg-white/5 text-white/30")}>
                    {isNow ? "ACTIVE NOW" : "UPCOMING"}
                  </span>
                </div>
              );
            })}
            <div className="mt-2 rounded-lg border border-white/[0.04] bg-white/[0.02] p-2.5 text-[10px] text-white/40">
              Session overlaps typically produce +40-70% volume spikes and wider ranges. The bot increases position monitoring frequency during these windows.
            </div>
          </Card>

          {/* ── 5. Bot Thinking ── */}
          <Card>
            <h3 className="mb-3 text-[13px] font-semibold tracking-wide text-white/80">
              Bot Thinking
            </h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[11px]">
              {[
                {
                  label: "Current Session",
                  value: `${activeSession.label} (${activeSession.strategy})`,
                  color: activeSession.color,
                },
                { label: "Time Remaining", value: `${timeLeftH}h ${timeLeftM}m`, color: "#fff" },
                { label: "Session Volume", value: `${fmt(activeSession.volumeVsAvg * 100, 0)}% of avg`, color: activeSession.volumeVsAvg >= 1 ? "#2bc48a" : "#F5C542" },
                { label: "Session Range", value: `${fmt(activeSession.rangeVsAvg * 100, 0)}% of avg`, color: activeSession.rangeVsAvg >= 1 ? "#2bc48a" : "#F5C542" },
                { label: "Breakout Level", value: "94,320 (Asia High)", color: "#5B8DEF" },
                { label: "Breakdown Level", value: "93,680 (Asia Low)", color: "#5B8DEF" },
                { label: "Signal Readiness", value: "Confirmed LONG", color: "#2bc48a" },
                { label: "Next Session", value: `US opens in ${16 * 60 - (CURRENT_UTC_HOUR * 60 + CURRENT_UTC_MIN)}m`, color: "#F5C542" },
              ].map((row) => (
                <div key={row.label} className="flex justify-between border-b border-white/[0.04] py-1">
                  <span className="text-white/40">{row.label}</span>
                  <span className="font-semibold" style={{ color: row.color }}>
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-lg border border-[#2bc48a]/20 bg-[#2bc48a]/5 px-3 py-2 text-[11px] text-[#2bc48a]">
              European session active. Breakout confirmed above Asian high at 94,320. Volume running 135% of session average. Holding long position with trailing stop. EU/US overlap approaching in {16 * 60 - (CURRENT_UTC_HOUR * 60 + CURRENT_UTC_MIN)} minutes, expecting volume increase.
            </div>
          </Card>

          {/* ── 6. Execution Log ── */}
          <BotExecutionLog accentColor="#ef4444" />
        </>
      )}

      {tab === "setup" && (
        <Card>
          <h3 className="mb-4 text-[13px] font-semibold tracking-wide text-white/80">
            Session Configuration
          </h3>
          <div className="grid grid-cols-2 gap-6">
            {/* Session Hours */}
            <div className="space-y-3">
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-white/30">
                Session Hours (UTC)
              </span>
              {(["asian", "european", "us"] as const).map((sKey) => {
                const s = SESSIONS.find((x) => x.key === sKey)!;
                const startKey = `${sKey}Start` as keyof typeof DEFAULT_SETUP;
                const endKey = `${sKey}End` as keyof typeof DEFAULT_SETUP;
                const enableKey = `enable${sKey.charAt(0).toUpperCase() + sKey.slice(1)}` as keyof typeof DEFAULT_SETUP;
                return (
                  <div key={sKey} className="flex items-center gap-2">
                    <button
                      onClick={() => setSetup((prev) => ({ ...prev, [enableKey]: !prev[enableKey] }))}
                      className={cn(
                        "h-4 w-4 rounded border text-[8px]",
                        setup[enableKey]
                          ? "border-[#2bc48a] bg-[#2bc48a]/20 text-[#2bc48a]"
                          : "border-white/20 text-white/20"
                      )}
                    >
                      {setup[enableKey] ? "\u2713" : ""}
                    </button>
                    <span className="w-16 text-[11px] font-semibold" style={{ color: s.color }}>
                      {s.label}
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={24}
                      value={setup[startKey] as number}
                      onChange={(e) => setSetup((prev) => ({ ...prev, [startKey]: +e.target.value }))}
                      className="w-14 rounded-md border border-white/10 bg-[#0F1012] px-2 py-1 text-[11px] text-white outline-none"
                    />
                    <span className="text-[10px] text-white/30">to</span>
                    <input
                      type="number"
                      min={0}
                      max={24}
                      value={setup[endKey] as number}
                      onChange={(e) => setSetup((prev) => ({ ...prev, [endKey]: +e.target.value }))}
                      className="w-14 rounded-md border border-white/10 bg-[#0F1012] px-2 py-1 text-[11px] text-white outline-none"
                    />
                    <span className="text-[9px] text-white/20">UTC</span>
                  </div>
                );
              })}
            </div>

            {/* Strategy & Filters */}
            <div className="space-y-3">
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-white/30">
                Strategy Per Session
              </span>
              {(["asian", "european", "us"] as const).map((sKey) => {
                const s = SESSIONS.find((x) => x.key === sKey)!;
                const stratKey = `${sKey}Strategy` as keyof typeof DEFAULT_SETUP;
                return (
                  <div key={sKey}>
                    <label className="mb-1 block text-[10px] text-white/50">{s.label} Session</label>
                    <select
                      value={setup[stratKey] as string}
                      onChange={(e) => setSetup((prev) => ({ ...prev, [stratKey]: e.target.value }))}
                      className="w-full rounded-md border border-white/10 bg-[#0F1012] px-2 py-1 text-[11px] text-white outline-none"
                    >
                      {["Range Fade", "Breakout", "Trend", "Scalping", "Mean Reversion"].map((st) => (
                        <option key={st} value={st}>{st}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
              <div>
                <label className="mb-1 block text-[10px] text-white/50">Volume Filter (min ratio)</label>
                <input
                  type="number"
                  step={0.1}
                  value={setup.volumeFilter}
                  onChange={(e) => setSetup((prev) => ({ ...prev, volumeFilter: +e.target.value }))}
                  className="w-20 rounded-md border border-white/10 bg-[#0F1012] px-2 py-1 text-[11px] text-white outline-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSetup((prev) => ({ ...prev, dstAutoAdjust: !prev.dstAutoAdjust }))}
                  className={cn(
                    "h-4 w-4 rounded border text-[8px]",
                    setup.dstAutoAdjust
                      ? "border-[#2bc48a] bg-[#2bc48a]/20 text-[#2bc48a]"
                      : "border-white/20 text-white/20"
                  )}
                >
                  {setup.dstAutoAdjust ? "\u2713" : ""}
                </button>
                <span className="text-[11px] text-white/60">Auto-adjust for DST changes</span>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
