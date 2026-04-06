import { useMemo } from "react";

/* ── Types ── */
type BotStatus = "READY" | "RUNNING" | "PAUSED" | "ERROR";

interface BotStatePanelProps {
  accentColor?: string;
}

/* ── Status config ── */
const STATUS_MAP: Record<BotStatus, { label: string; color: string; pulse: boolean }> = {
  READY:   { label: "READY",   color: "#2bc48a", pulse: false },
  RUNNING: { label: "RUNNING", color: "#2bc48a", pulse: true },
  PAUSED:  { label: "PAUSED",  color: "#F5C542", pulse: false },
  ERROR:   { label: "ERROR",   color: "#f6465d", pulse: false },
};

/* ── Mock data ── */
const MOCK_STATE = {
  status: "READY" as BotStatus,
  lastTrade: {
    direction: "LONG",
    pair: "BTC/USDT",
    entry: "94,800",
    result: "TP HIT",
    pnl: "+1.8%",
    positive: true,
  },
  currentPosition: null as null | { direction: string; pair: string; entry: string; size: string },
  nextAction: "Waiting for EMA pullback signal",
  uptime: "\u2014",
};

/* ── Component ── */
export default function BotStatePanel({ accentColor: _accentColor = "#2bc48a" }: BotStatePanelProps) {
  const state = useMemo(() => MOCK_STATE, []);
  const cfg = STATUS_MAP[state.status];

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold tracking-wide text-white/80">Bot Status</h3>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-wider"
          style={{
            color: cfg.color,
            background: `${cfg.color}15`,
            boxShadow: cfg.pulse ? `0 0 10px ${cfg.color}50` : "none",
          }}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${cfg.pulse ? "animate-pulse" : ""}`}
            style={{ background: cfg.color, boxShadow: cfg.pulse ? `0 0 6px ${cfg.color}` : "none" }}
          />
          {cfg.label}
        </span>
      </div>

      {/* Sections */}
      <div className="space-y-3.5">
        {/* Last Trade */}
        <Section label="Last Trade">
          {state.lastTrade ? (
            <span className={state.lastTrade.positive ? "text-[#2bc48a]" : "text-[#f6465d]"}>
              {state.lastTrade.direction} {state.lastTrade.pair}{" "}
              {state.lastTrade.entry} &rarr; {state.lastTrade.result}{" "}
              <span className="font-semibold">{state.lastTrade.pnl}</span>
            </span>
          ) : (
            <span className="text-white/30">No trades yet</span>
          )}
        </Section>

        {/* Current Position */}
        <Section label="Current Position">
          {state.currentPosition ? (
            <span className="text-white/70">
              {state.currentPosition.direction} {state.currentPosition.pair}{" "}
              @ {state.currentPosition.entry} &middot; {state.currentPosition.size}
            </span>
          ) : (
            <span className="text-white/30">No active position</span>
          )}
        </Section>

        {/* Next Action */}
        <Section label="Next Action">
          <span className="text-[#5B8DEF]">{state.nextAction}</span>
        </Section>

        {/* Uptime */}
        <Section label="Uptime">
          <span className="text-white/40">{state.uptime}</span>
        </Section>
      </div>
    </div>
  );
}

/* ── Helpers ── */
function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-white/30">{label}</span>
      <span className="text-right text-[12px] leading-snug">{children}</span>
    </div>
  );
}
