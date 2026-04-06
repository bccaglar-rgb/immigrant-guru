import { useRef, useEffect } from "react";

/* ── Types ── */
interface LogEntry {
  time: string;
  type: "info" | "signal" | "entry" | "exit" | "error" | "warning";
  message: string;
}

interface BotExecutionLogProps {
  maxHeight?: number;
  accentColor?: string;
}

/* ── Color map ── */
const TYPE_COLOR: Record<LogEntry["type"], string> = {
  info:    "text-white/50",
  signal:  "text-[#5B8DEF]",
  entry:   "text-[#2bc48a]",
  exit:    "text-[#F5C542]",
  error:   "text-[#f6465d]",
  warning: "text-[#f4906c]",
};

/* ── Mock entries ── */
const MOCK_LOGS: LogEntry[] = [
  { time: "14:30:01", type: "info",    message: "Bot initialized \u00B7 EMA Pullback Strategy v2.1" },
  { time: "14:30:01", type: "info",    message: "Connected to BTC/USDT 5m feed" },
  { time: "14:30:02", type: "info",    message: "Loading historical candles (500 bars)" },
  { time: "14:32:15", type: "signal",  message: "EMA 9/21 bullish crossover detected" },
  { time: "14:32:16", type: "signal",  message: "RSI at 42.3 \u2014 oversold zone confirmed" },
  { time: "14:32:16", type: "info",    message: "Volume spike +34% above 20-bar average" },
  { time: "14:32:17", type: "entry",   message: "LONG BTC/USDT @ 94,800 \u00B7 Size 0.02 BTC \u00B7 Lev 5x" },
  { time: "14:32:17", type: "info",    message: "TP set @ 96,505 (+1.8%) \u00B7 SL set @ 94,090 (-0.75%)" },
  { time: "14:48:33", type: "warning", message: "Price nearing SL zone \u2014 monitoring closely" },
  { time: "14:55:02", type: "info",    message: "Price recovered \u2014 back above entry" },
  { time: "15:12:44", type: "exit",    message: "TP HIT @ 96,505 \u00B7 PnL +1.8% (+$34.10)" },
  { time: "15:12:45", type: "info",    message: "Cooldown active \u2014 next scan in 5m" },
];

/* ── Component ── */
export default function BotExecutionLog({ maxHeight = 240 }: BotExecutionLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
      {/* Header */}
      <div className="mb-3 flex items-center gap-2">
        <span className="text-[14px] text-white/40">{"\u25B8"}</span>
        <h3 className="text-[13px] font-semibold tracking-wide text-white/80">Execution Log</h3>
        <span className="ml-auto text-[9px] text-white/20">{MOCK_LOGS.length} entries</span>
      </div>

      {/* Log list */}
      <div
        ref={scrollRef}
        className="overflow-y-auto pr-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10"
        style={{ maxHeight }}
      >
        <div className="space-y-1">
          {MOCK_LOGS.map((entry, i) => (
            <div key={i} className="flex gap-2 text-[11px] leading-relaxed">
              <span className="shrink-0 font-mono text-white/25">[{entry.time}]</span>
              <span className={TYPE_COLOR[entry.type]}>{entry.message}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Auto-scroll indicator */}
      <div className="mt-2 flex items-center gap-1.5">
        <span className="h-1 w-1 animate-pulse rounded-full bg-white/20" />
        <span className="text-[9px] text-white/20">Auto-scroll enabled</span>
      </div>
    </div>
  );
}
