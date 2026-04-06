import { useBotContext } from "./BotContext";

interface BotExchangeBarProps {
  botName: string;
  accentColor?: string;
}

const HEALTH_CONFIG = {
  loading:      { label: "Checking...", color: "text-white/40", dot: "bg-white/30 animate-pulse" },
  connected:    { label: "Connected",   color: "text-[#2bc48a]", dot: "bg-[#2bc48a]" },
  degraded:     { label: "Degraded",    color: "text-[#F5C542]", dot: "bg-[#F5C542]" },
  disconnected: { label: "Disconnected",color: "text-[#f6465d]", dot: "bg-[#f6465d] animate-pulse" },
} as const;

export default function BotExchangeBar({ botName, accentColor = "#2bc48a" }: BotExchangeBarProps) {
  const ctx = useBotContext();
  const health = HEALTH_CONFIG[ctx.dataHealth];

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-2.5">
      {/* Bot name */}
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full shadow-[0_0_6px]" style={{ background: accentColor, boxShadow: `0 0 6px ${accentColor}` }} />
        <span className="text-[12px] font-bold text-white">{botName}</span>
      </div>

      {/* Exchange selector */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-white/40">Exchange:</span>
        {!ctx.hasAccounts ? (
          <a href="/settings" className="flex items-center gap-1 rounded-md border border-[#F5C542]/30 bg-[#F5C542]/10 px-2 py-0.5 text-[10px] font-medium text-[#F5C542] transition hover:bg-[#F5C542]/20">
            &#9888; Connect Exchange
          </a>
        ) : (
          <select
            value={ctx.selectedExchangeId}
            onChange={e => ctx.setSelectedExchangeId(e.target.value)}
            className="rounded-md border border-white/10 bg-[#0F1012] px-2 py-0.5 text-[11px] text-white outline-none"
          >
            {ctx.accounts.map(acc => (
              <option key={acc.id} value={acc.id}>
                {acc.exchangeDisplayName} · {acc.accountName}
                {acc.status === "PARTIAL" ? " (Partial)" : ""}
              </option>
            ))}
          </select>
        )}
        {ctx.selectedAccount?.status === "READY" && <span className="h-1.5 w-1.5 rounded-full bg-[#2bc48a]" title="Connected" />}
        {ctx.selectedAccount?.status === "PARTIAL" && <span className="h-1.5 w-1.5 rounded-full bg-[#F5C542]" title="Partial" />}
      </div>

      <div className="flex-1" />

      {/* Mode toggle */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-white/40">Mode:</span>
        <div className="flex rounded-md border border-white/10 bg-[#0F1012] p-0.5">
          <button
            onClick={() => ctx.setMode("paper")}
            className={`rounded px-2 py-0.5 text-[10px] font-semibold transition ${ctx.mode === "paper" ? "bg-[#2bc48a]/20 text-[#2bc48a]" : "text-white/40 hover:text-white/60"}`}
          >Paper</button>
          <button
            onClick={() => ctx.setMode("live")}
            className={`rounded px-2 py-0.5 text-[10px] font-semibold transition ${ctx.mode === "live" ? "bg-[#f6465d]/20 text-[#f6465d]" : "text-white/40 hover:text-white/60"}`}
          >Live</button>
        </div>
      </div>

      {/* Kill switch */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-white/40">Kill Switch:</span>
        <button
          onClick={() => ctx.setKillSwitch(!ctx.killSwitch)}
          className={`text-[10px] font-semibold ${ctx.killSwitch ? "text-[#2bc48a]" : "text-[#f6465d]"}`}
        >{ctx.killSwitch ? "Armed" : "Disarmed"}</button>
      </div>

      {/* Data health (REAL check, not hardcoded) */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-white/40">Data:</span>
        <span className={`h-1.5 w-1.5 rounded-full ${health.dot}`} />
        <span className={`text-[10px] font-semibold ${health.color}`}>{health.label}</span>
        {ctx.latencyMs !== null && ctx.dataHealth !== "disconnected" && (
          <span className="text-[9px] text-white/20">{ctx.latencyMs}ms</span>
        )}
      </div>

      {/* Mock data warning */}
      {ctx.isMockFallback && (
        <div className="w-full mt-1 rounded-md border border-[#F5C542]/30 bg-[#F5C542]/5 px-3 py-1.5 text-[10px] text-[#F5C542]">
          &#9888; Showing simulated data — live market data unavailable. Do not make trading decisions based on this view.
        </div>
      )}

      {/* Live mode + no exchange warning */}
      {ctx.mode === "live" && !ctx.hasAccounts && (
        <div className="w-full mt-1 rounded-md border border-[#f6465d]/30 bg-[#f6465d]/5 px-3 py-1.5 text-[10px] text-[#f6465d]">
          &#9888; Live mode requires a connected exchange. Go to Settings to connect your exchange API.
        </div>
      )}
    </div>
  );
}
