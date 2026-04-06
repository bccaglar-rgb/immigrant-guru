import { useState, useEffect, useMemo } from "react";

/* ── Types ── */
interface ExchangeAccount {
  id: string;
  exchangeId: string;
  exchangeDisplayName: string;
  accountName: string;
  status: "READY" | "PARTIAL" | "FAILED";
  enabled: boolean;
  iconUrl: string;
}

interface BotExchangeBarProps {
  botName: string;
  accentColor?: string;
}

/* ── Read exchange accounts from localStorage + backend ── */
function useExchangeAccounts(): ExchangeAccount[] {
  const [accounts, setAccounts] = useState<ExchangeAccount[]>([]);

  useEffect(() => {
    const load = () => {
      try {
        const raw = window.localStorage.getItem("exchange-accounts-v1");
        if (!raw) return;
        const parsed = JSON.parse(raw) as Array<{
          exchangeId: string; exchangeDisplayName: string;
          accountName?: string; status?: string; enabled?: boolean;
        }>;
        if (!Array.isArray(parsed)) return;
        setAccounts(parsed.filter(r => r.enabled !== false && r.status !== "FAILED").map(r => ({
          id: `${r.exchangeId}::${r.accountName ?? "Main"}`,
          exchangeId: r.exchangeId,
          exchangeDisplayName: r.exchangeDisplayName,
          accountName: r.accountName ?? "Main",
          status: (r.status as "READY" | "PARTIAL" | "FAILED") ?? "READY",
          enabled: r.enabled ?? true,
          iconUrl: "",
        })));
      } catch { /* noop */ }
    };
    load();

    // Also fetch from API
    const headers: Record<string, string> = {};
    try {
      const raw = window.localStorage.getItem("auth-token");
      if (raw) headers["Authorization"] = `Bearer ${raw}`;
    } catch { /* noop */ }

    fetch("/api/exchanges", { headers }).then(r => r.ok ? r.json() : null).then(body => {
      if (!body?.exchanges) return;
      const rows = (body.exchanges as Array<{
        exchangeId: string; exchangeDisplayName: string;
        accountName?: string; status?: string; enabled?: boolean;
      }>).filter(r => r.enabled !== false && r.status !== "FAILED").map(r => ({
        id: `${r.exchangeId}::${r.accountName ?? "Main"}`,
        exchangeId: r.exchangeId,
        exchangeDisplayName: r.exchangeDisplayName,
        accountName: r.accountName ?? "Main",
        status: (r.status as "READY" | "PARTIAL" | "FAILED") ?? "READY",
        enabled: true,
        iconUrl: "",
      }));
      setAccounts(rows);
      try { window.localStorage.setItem("exchange-accounts-v1", JSON.stringify(rows)); } catch { /* noop */ }
    }).catch(() => { /* keep local */ });

    window.addEventListener("exchange-manager-updated", load);
    return () => window.removeEventListener("exchange-manager-updated", load);
  }, []);

  return accounts;
}

/* ── Component ── */
export default function BotExchangeBar({ botName, accentColor = "#2bc48a" }: BotExchangeBarProps) {
  const accounts = useExchangeAccounts();
  const [selectedId, setSelectedId] = useState("");
  const [mode, setMode] = useState<"paper" | "live">("paper");
  const [killSwitch, setKillSwitch] = useState(true);

  // Auto-select first account
  useEffect(() => {
    if (!selectedId && accounts.length > 0) setSelectedId(accounts[0].id);
  }, [accounts, selectedId]);

  const selectedAccount = useMemo(() => accounts.find(a => a.id === selectedId), [accounts, selectedId]);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-2.5">
      {/* Live indicator */}
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full shadow-[0_0_6px]" style={{ background: accentColor, boxShadow: `0 0 6px ${accentColor}` }} />
        <span className="text-[12px] font-bold text-white">{botName}</span>
      </div>

      {/* Exchange selector */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-white/40">Exchange:</span>
        {accounts.length === 0 ? (
          <a href="/settings" className="flex items-center gap-1 rounded-md border border-[#F5C542]/30 bg-[#F5C542]/10 px-2 py-0.5 text-[10px] font-medium text-[#F5C542] transition hover:bg-[#F5C542]/20">
            <span>&#9888;</span> Connect Exchange
          </a>
        ) : (
          <select
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
            className="rounded-md border border-white/10 bg-[#0F1012] px-2 py-0.5 text-[11px] text-white outline-none"
          >
            {accounts.map(acc => (
              <option key={acc.id} value={acc.id}>
                {acc.exchangeDisplayName} · {acc.accountName}
                {acc.status === "PARTIAL" ? " (Partial)" : ""}
              </option>
            ))}
          </select>
        )}
        {selectedAccount?.status === "READY" && <span className="h-1.5 w-1.5 rounded-full bg-[#2bc48a]" title="Connected" />}
        {selectedAccount?.status === "PARTIAL" && <span className="h-1.5 w-1.5 rounded-full bg-[#F5C542]" title="Partial" />}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Mode toggle */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-white/40">Mode:</span>
        <div className="flex rounded-md border border-white/10 bg-[#0F1012] p-0.5">
          <button
            onClick={() => setMode("paper")}
            className={`rounded px-2 py-0.5 text-[10px] font-semibold transition ${mode === "paper" ? "bg-[#2bc48a]/20 text-[#2bc48a]" : "text-white/40 hover:text-white/60"}`}
          >Paper</button>
          <button
            onClick={() => setMode("live")}
            className={`rounded px-2 py-0.5 text-[10px] font-semibold transition ${mode === "live" ? "bg-[#f6465d]/20 text-[#f6465d]" : "text-white/40 hover:text-white/60"}`}
          >Live</button>
        </div>
      </div>

      {/* Kill switch */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-white/40">Kill Switch:</span>
        <button
          onClick={() => setKillSwitch(k => !k)}
          className={`text-[10px] font-semibold ${killSwitch ? "text-[#2bc48a]" : "text-[#f6465d]"}`}
        >{killSwitch ? "Armed" : "Disarmed"}</button>
      </div>

      {/* Data status */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-white/40">Data:</span>
        <span className="text-[10px] font-semibold text-[#2bc48a]">Connected</span>
      </div>

      {/* Live mode warning */}
      {mode === "live" && accounts.length === 0 && (
        <div className="w-full mt-1 rounded-md border border-[#f6465d]/30 bg-[#f6465d]/5 px-3 py-1.5 text-[10px] text-[#f6465d]">
          &#9888; Live mode requires a connected exchange. Go to Settings to connect your exchange API.
        </div>
      )}
    </div>
  );
}
