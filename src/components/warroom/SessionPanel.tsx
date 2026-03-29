interface Props {
  sentiment: { fearGreed: number; fearGreedLabel: string; crowdBias: number; crowdDirection: string; contrarianSignal: string; positioning: string };
  session: { current: string; volatility: number; bias: string; high: number; low: number; range: number; avgRange: number; timeRemaining: string };
}

const fgColor = (v: number) => v <= 25 ? "#f6465d" : v <= 45 ? "#FF9F43" : v <= 55 ? "#F5C542" : v <= 75 ? "#8fc9ab" : "#2bc48a";

export const SessionPanel = ({ sentiment, session }: Props) => (
  <div className="space-y-2">
    {/* Sentiment */}
    <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-3 space-y-2">
      <div className="flex items-center gap-2">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-[#8fc9ab]" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></svg>
        <span className="text-[10px] font-bold tracking-wider text-[#8fc9ab] uppercase">Sentiment & Flow</span>
      </div>

      {/* Fear/Greed Arc */}
      <div className="flex justify-center">
        <div className="flex flex-col items-center">
          <div className="relative h-10 w-20 overflow-hidden">
            <svg viewBox="0 0 120 60" className="absolute inset-0 h-full w-full">
              <path d="M 10 55 A 50 50 0 0 1 110 55" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" strokeLinecap="round" />
              <path d="M 10 55 A 50 50 0 0 1 110 55" fill="none" stroke={fgColor(sentiment.fearGreed)} strokeWidth="8" strokeLinecap="round"
                strokeDasharray={`${(sentiment.fearGreed / 100) * 157} 157`} className="transition-all duration-1000" />
            </svg>
          </div>
          <span className="font-mono text-base font-bold" style={{ color: fgColor(sentiment.fearGreed) }}>{sentiment.fearGreed}</span>
          <span className="text-[8px] font-bold uppercase" style={{ color: fgColor(sentiment.fearGreed) }}>{sentiment.fearGreedLabel}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <MiniStat label="Crowd Bias" value={`${sentiment.crowdBias}% ${sentiment.crowdDirection}`} color={sentiment.crowdDirection === "Long" ? "#2bc48a" : "#f6465d"} />
        <MiniStat label="Contrarian" value={sentiment.contrarianSignal} color={sentiment.contrarianSignal === "Strong" ? "#f6465d" : "#F5C542"} />
      </div>
      <div className="rounded-lg bg-black/20 px-2 py-1">
        <span className="text-[8px] text-[var(--textSubtle)]">Positioning:</span>
        <p className="text-[9px] text-[var(--textMuted)]">{sentiment.positioning}</p>
      </div>
    </div>

    {/* Session */}
    <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-[var(--accent)]" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
          <span className="text-[10px] font-bold tracking-wider text-[var(--accent)] uppercase">Session</span>
        </div>
        <span className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-bold text-[var(--text)]">{session.current}</span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <MiniStat label="Volatility" value={`${session.volatility}`} color={session.volatility > 60 ? "#FF9F43" : "#8A8F98"} />
        <MiniStat label="Bias" value={session.bias} color={session.bias === "Bullish" ? "#2bc48a" : session.bias === "Bearish" ? "#f6465d" : "#F5C542"} />
        <MiniStat label="Remaining" value={session.timeRemaining} />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <MiniStat label="High" value={`$${session.high.toFixed(2)}`} color="#2bc48a" />
        <MiniStat label="Low" value={`$${session.low.toFixed(2)}`} color="#f6465d" />
        <MiniStat label="Range" value={`$${session.range.toFixed(2)}`} color={session.range > session.avgRange ? "#FF9F43" : "#8A8F98"} />
      </div>
    </div>
  </div>
);

const MiniStat = ({ label, value, color }: { label: string; value: string; color?: string }) => (
  <div>
    <div className="text-[7px] text-[var(--textSubtle)]">{label}</div>
    <div className="font-mono text-[9px] font-bold" style={{ color: color ?? "var(--text)" }}>{value}</div>
  </div>
);
