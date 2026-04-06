/**
 * BotLivePanel — Real-time trade tracking, PNL, controls, execution log.
 * Integrates with useBotTrader hook for live data.
 * Minimal, premium, institutional design.
 */
import { useState, useCallback } from "react";
import { useBotTrader, type BotTraderConfig } from "../../hooks/useBotTrader";
import { useBotContext } from "./BotContext";

/* ── Types ── */
interface BotLivePanelProps {
  botSlug: string;
  botName: string;
  strategyId?: string;
  strategyName?: string;
  accentColor?: string;
}

/* ── Status Config ── */
const STATE_CONFIG = {
  idle:    { label: "Idle",    color: "#8e95a1", dot: "bg-white/30" },
  running: { label: "Running", color: "#2bc48a", dot: "bg-[#2bc48a] animate-pulse" },
  paused:  { label: "Paused",  color: "#F5C542", dot: "bg-[#F5C542]" },
  error:   { label: "Error",   color: "#f6465d", dot: "bg-[#f6465d]" },
  loading: { label: "Loading", color: "#8e95a1", dot: "bg-white/30 animate-pulse" },
} as const;

/* ── Helpers ── */
const cn = (...cls: (string | false | undefined)[]) => cls.filter(Boolean).join(" ");
const fmt = (n: number, d = 2) => n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });

/* ── Component ── */
export default function BotLivePanel({ botSlug, botName, strategyId, strategyName, accentColor = "#2bc48a" }: BotLivePanelProps) {
  const ctx = useBotContext();
  const bot = useBotTrader(botSlug);
  const [confirmEmergency, setConfirmEmergency] = useState(false);
  const stCfg = STATE_CONFIG[bot.botState];

  const handleStart = useCallback(() => {
    const config: BotTraderConfig = {
      name: botName,
      strategyId: strategyId || botSlug,
      strategyName: strategyName || botName,
      symbol: ctx.pair,
      timeframe: ctx.timeframe,
      exchange: ctx.selectedAccount?.exchangeDisplayName || "AUTO",
      exchangeAccountId: ctx.selectedAccount?.id?.split("::")[0] || "",
      exchangeAccountName: ctx.selectedAccount?.accountName || "Auto",
      scanIntervalSec: 180,
    };
    bot.startBot(config);
  }, [bot, botName, botSlug, strategyId, strategyName, ctx]);

  const handleEmergency = useCallback(() => {
    if (!confirmEmergency) { setConfirmEmergency(true); return; }
    bot.emergencyStop();
    setConfirmEmergency(false);
  }, [bot, confirmEmergency]);

  return (
    <div className="space-y-3">
      {/* ── Bot Controls ── */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-semibold text-white">Bot Controls</h3>
            <span className="flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider" style={{ color: stCfg.color, background: `${stCfg.color}15` }}>
              <span className={cn("h-1.5 w-1.5 rounded-full", stCfg.dot)} />
              {stCfg.label}
            </span>
          </div>
          {ctx.mode === "live" && <span className="text-[9px] text-[#f6465d] font-semibold uppercase">Live Trading</span>}
          {ctx.mode === "paper" && <span className="text-[9px] text-[#2bc48a] font-semibold uppercase">Paper Mode</span>}
        </div>

        {/* Error display */}
        {bot.error && (
          <div className="mb-3 rounded-lg border border-[#f6465d]/20 bg-[#f6465d]/5 px-3 py-2 text-[10px] text-[#f6465d]">
            {bot.error}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2">
          {bot.botState === "idle" || bot.botState === "error" ? (
            <button
              onClick={handleStart}
              disabled={bot.loading || (ctx.mode === "live" && !ctx.hasAccounts)}
              className="flex-1 rounded-lg py-2.5 text-[12px] font-bold text-black transition disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ background: accentColor }}
            >
              {bot.loading ? "Starting..." : "Start Bot"}
            </button>
          ) : (
            <>
              <button onClick={() => bot.stopBot()} disabled={bot.loading}
                className="flex-1 rounded-lg border border-white/10 bg-white/[0.04] py-2.5 text-[12px] font-semibold text-white/70 transition hover:bg-white/[0.06] disabled:opacity-30">
                {bot.loading ? "Stopping..." : "Stop Bot"}
              </button>
              <button onClick={handleEmergency}
                className={cn("rounded-lg px-4 py-2.5 text-[12px] font-bold transition",
                  confirmEmergency ? "bg-[#f6465d] text-white animate-pulse" : "border border-[#f6465d]/30 bg-[#f6465d]/10 text-[#f6465d] hover:bg-[#f6465d]/20"
                )}>
                {confirmEmergency ? "CONFIRM STOP ALL" : "Emergency"}
              </button>
            </>
          )}
        </div>

        {ctx.mode === "live" && !ctx.hasAccounts && (
          <p className="mt-2 text-[9px] text-[#f6465d]">Connect an exchange in Settings to trade live.</p>
        )}
      </div>

      {/* ── Active Positions ── */}
      {bot.positions.length > 0 && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <h3 className="text-[12px] font-semibold text-white/80 mb-2">Active Positions</h3>
          <div className="space-y-1.5">
            {bot.positions.map((pos, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-white/[0.02] border border-white/[0.04] px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className={cn("text-[10px] font-bold", pos.side === "LONG" ? "text-[#2bc48a]" : "text-[#f6465d]")}>{pos.side}</span>
                  <span className="text-[11px] text-white/70">{pos.symbol}</span>
                </div>
                <div className="flex items-center gap-3 text-[10px]">
                  <span className="text-white/40">Entry: <span className="text-white/60 font-mono">${fmt(pos.entryPrice)}</span></span>
                  <span className="text-white/40">SL: <span className="text-[#f6465d] font-mono">${fmt(pos.sl1)}</span></span>
                  <span className="text-white/40">TP: <span className="text-[#2bc48a] font-mono">${fmt(pos.tp1)}</span></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Performance Summary ── */}
      {(bot.totalTrades > 0 || bot.botState === "running") && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <h3 className="text-[12px] font-semibold text-white/80 mb-2">Performance</h3>
          <div className="grid grid-cols-4 gap-2">
            <div className="rounded-lg bg-white/[0.02] p-2 text-center">
              <p className="text-[8px] uppercase text-white/25">Total PnL</p>
              <p className={cn("text-[13px] font-bold font-mono", bot.totalPnl >= 0 ? "text-[#2bc48a]" : "text-[#f6465d]")}>
                {bot.totalPnl >= 0 ? "+" : ""}{fmt(bot.totalPnl)}%
              </p>
            </div>
            <div className="rounded-lg bg-white/[0.02] p-2 text-center">
              <p className="text-[8px] uppercase text-white/25">Win Rate</p>
              <p className="text-[13px] font-bold text-white/70">{fmt(bot.winRate, 1)}%</p>
            </div>
            <div className="rounded-lg bg-white/[0.02] p-2 text-center">
              <p className="text-[8px] uppercase text-white/25">Trades</p>
              <p className="text-[13px] font-bold text-white/70">{bot.totalTrades}</p>
            </div>
            <div className="rounded-lg bg-white/[0.02] p-2 text-center">
              <p className="text-[8px] uppercase text-white/25">Runs</p>
              <p className="text-[13px] font-bold text-white/70">{bot.trader?.stats.runs ?? 0}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Recent Scans (mini log) ── */}
      {bot.scans.length > 0 && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <h3 className="text-[12px] font-semibold text-white/80 mb-2">Recent Activity</h3>
          <div className="max-h-[160px] overflow-y-auto space-y-0.5 pr-1">
            {bot.scans.slice(0, 20).map((scan, i) => (
              <div key={i} className="flex items-center gap-2 py-1 text-[10px]">
                <span className="font-mono text-white/20 shrink-0">{new Date(scan.time).toLocaleTimeString()}</span>
                <span className="text-white/40">{scan.symbol}</span>
                <span className={cn("font-semibold",
                  scan.decision === "TRADE" ? "text-[#2bc48a]" :
                  scan.decision === "WATCH" ? "text-[#F5C542]" :
                  "text-white/30"
                )}>{scan.decision}</span>
                <span className="text-white/20">{scan.scorePct}%</span>
                {scan.pnlPct !== null && (
                  <span className={cn("ml-auto font-mono", scan.pnlPct >= 0 ? "text-[#2bc48a]" : "text-[#f6465d]")}>
                    {scan.pnlPct >= 0 ? "+" : ""}{fmt(scan.pnlPct)}%
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
