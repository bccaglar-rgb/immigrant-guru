import { useRef, useEffect, useState, useCallback } from "react";
import { authHeaders } from "../../services/exchangeApi";

/* ── Types ── */
interface LogEntry {
  time: string;
  type: "info" | "signal" | "entry" | "exit" | "error" | "warning";
  message: string;
}

interface BotExecutionLogProps {
  botSlug?: string;
  maxHeight?: number;
  accentColor?: string;
}

/* ── Color map ── */
const TYPE_COLOR: Record<LogEntry["type"], string> = {
  info:    "text-white/40",
  signal:  "text-[#5B8DEF]",
  entry:   "text-[#2bc48a]",
  exit:    "text-[#F5C542]",
  error:   "text-[#f6465d]",
  warning: "text-[#f4906c]",
};

/* ── Convert scan to log entry ── */
function scanToLog(scan: any): LogEntry {
  const time = new Date(scan.time).toLocaleTimeString("en-US", { hour12: false });
  const symbol = scan.symbol || "—";
  const decision = scan.decision || "N/A";
  const score = scan.scorePct != null ? `${scan.scorePct}%` : "";
  const bias = scan.bias || "";
  const pnl = scan.pnlPct != null ? `PnL: ${scan.pnlPct >= 0 ? "+" : ""}${scan.pnlPct.toFixed(2)}%` : "";
  const exec = scan.execState || "";

  let type: LogEntry["type"] = "info";
  let message = `${symbol} ${decision} ${score}`;

  if (decision === "TRADE") {
    type = "entry";
    message = `${symbol} TRADE ${bias} ${score} ${exec ? `[${exec}]` : ""} ${pnl}`.trim();
  } else if (decision === "WATCH") {
    type = "signal";
    message = `${symbol} WATCH ${bias} ${score} — monitoring`.trim();
  } else if (decision === "NO_TRADE") {
    type = "info";
    message = `${symbol} NO_TRADE ${score} — weak setup`.trim();
  }
  if (scan.dataStale) {
    type = "warning";
    message = `${symbol} DATA STALE — skipped`;
  }
  if (pnl && decision === "TRADE") {
    type = (scan.pnlPct ?? 0) >= 0 ? "exit" : "error";
  }

  return { time, type, message };
}

/* ── Placeholder when no data ── */
const EMPTY_MSG: LogEntry[] = [
  { time: new Date().toLocaleTimeString("en-US", { hour12: false }), type: "info", message: "Awaiting bot activity — start a bot to see execution logs" },
];

/* ── Component ── */
export default function BotExecutionLog({ botSlug, maxHeight = 220 }: BotExecutionLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    if (!botSlug) { setLogs(EMPTY_MSG); setLoading(false); return; }
    try {
      const res = await fetch("/api/trader-hub/traders?scope=user", { headers: { ...authHeaders() } });
      if (!res.ok) throw new Error("API error");
      const data = await res.json();
      const match = (data.items || []).find((t: any) =>
        t.strategyId === botSlug || t.name?.toLowerCase().includes(botSlug.replace(/-/g, " "))
      );
      if (!match) { setLogs(EMPTY_MSG); setLoading(false); return; }

      const scansRes = await fetch(`/api/trader-hub/traders/${match.id}/scans?limit=30`, { headers: { ...authHeaders() } });
      if (!scansRes.ok) throw new Error("Scans fetch failed");
      const scansData = await scansRes.json();
      const entries = (scansData.scans || []).map(scanToLog).reverse();
      setLogs(entries.length > 0 ? entries : EMPTY_MSG);
    } catch {
      setLogs(EMPTY_MSG);
    }
    setLoading(false);
  }, [botSlug]);

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 8000);
    return () => clearInterval(interval);
  }, [fetchLogs]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);

  return (
    <div className="rounded-xl border border-white/[0.04] bg-white/[0.015] p-4">
      {/* Header */}
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[13px] text-white/30">{"\u25B8"}</span>
        <h3 className="text-[12px] font-semibold tracking-wide text-white/70">Execution Log</h3>
        <span className="ml-auto text-[9px] text-white/15">{logs.length} entries</span>
      </div>

      {/* Log list */}
      {loading ? (
        <div className="space-y-1.5">
          {[1,2,3,4,5].map(i => <div key={i} className="h-3.5 rounded bg-white/[0.02] animate-pulse" />)}
        </div>
      ) : (
        <div ref={scrollRef} className="overflow-y-auto pr-1" style={{ maxHeight }}>
          <div className="space-y-0.5">
            {logs.map((entry, i) => (
              <div key={i} className="flex gap-2 text-[10px] leading-relaxed">
                <span className="shrink-0 font-mono text-white/15 tabular-nums">{entry.time}</span>
                <span className={TYPE_COLOR[entry.type]}>{entry.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
