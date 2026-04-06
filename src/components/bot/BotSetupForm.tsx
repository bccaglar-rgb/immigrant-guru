import { useState, useEffect, useCallback } from "react";

/* ── Types ── */
interface ExchangeAccount {
  id: string;
  exchangeId: string;
  exchangeDisplayName: string;
  accountName: string;
  status: "READY" | "PARTIAL" | "FAILED";
}

interface BotSetupFormProps {
  botName: string;
  defaultPair?: string;
  defaultTf?: string;
  defaultSize?: number;
  defaultRisk?: number;
  defaultLeverage?: number;
  defaultTp?: number;
  defaultSl?: number;
  indicators?: string[];
  accentColor?: string;
  onLaunch?: (config: Record<string, any>) => void;
}

/* ── Constants ── */
const PAIRS = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT", "DOGE/USDT"];
const TIMEFRAMES = ["1m", "3m", "5m", "15m", "1h", "4h", "1d"];
const RISK_PROFILES = ["Conservative", "Balanced", "Aggressive"] as const;

const STATUS_DOT: Record<string, string> = {
  READY:   "bg-[#2bc48a]",
  PARTIAL: "bg-[#F5C542]",
  FAILED:  "bg-[#f6465d]",
};

/* ── Hook: exchange accounts ── */
function useExchangeAccounts(): ExchangeAccount[] {
  const [accounts, setAccounts] = useState<ExchangeAccount[]>([]);

  useEffect(() => {
    const load = () => {
      try {
        const raw = window.localStorage.getItem("exchange-accounts-v1");
        if (!raw) return;
        const parsed = JSON.parse(raw) as any[];
        if (!Array.isArray(parsed)) return;
        setAccounts(
          parsed
            .filter(r => r.enabled !== false && r.status !== "FAILED")
            .map(r => ({
              id: `${r.exchangeId}::${r.accountName ?? "Main"}`,
              exchangeId: r.exchangeId,
              exchangeDisplayName: r.exchangeDisplayName,
              accountName: r.accountName ?? "Main",
              status: (r.status as ExchangeAccount["status"]) ?? "READY",
            })),
        );
      } catch { /* noop */ }
    };
    load();

    const headers: Record<string, string> = {};
    try {
      const t = window.localStorage.getItem("auth-token");
      if (t) headers["Authorization"] = `Bearer ${t}`;
    } catch { /* noop */ }

    fetch("/api/exchanges", { headers })
      .then(r => (r.ok ? r.json() : null))
      .then(body => {
        if (!body?.exchanges) return;
        const rows = (body.exchanges as any[])
          .filter(r => r.enabled !== false && r.status !== "FAILED")
          .map(r => ({
            id: `${r.exchangeId}::${r.accountName ?? "Main"}`,
            exchangeId: r.exchangeId,
            exchangeDisplayName: r.exchangeDisplayName,
            accountName: r.accountName ?? "Main",
            status: (r.status as ExchangeAccount["status"]) ?? "READY",
          }));
        setAccounts(rows);
        try { window.localStorage.setItem("exchange-accounts-v1", JSON.stringify(rows)); } catch { /* noop */ }
      })
      .catch(() => {});

    window.addEventListener("exchange-manager-updated", load);
    return () => window.removeEventListener("exchange-manager-updated", load);
  }, []);

  return accounts;
}

/* ── Component ── */
export default function BotSetupForm({
  botName,
  defaultPair = "BTC/USDT",
  defaultTf = "5m",
  defaultSize = 100,
  defaultRisk = 1,
  defaultLeverage = 5,
  defaultTp = 1.8,
  defaultSl = 0.75,
  accentColor = "#2bc48a",
  onLaunch,
}: BotSetupFormProps) {
  const accounts = useExchangeAccounts();

  const [exchangeId, setExchangeId] = useState("");
  const [mode, setMode] = useState<"paper" | "live">("paper");
  const [pair, setPair] = useState(defaultPair);
  const [tf, setTf] = useState(defaultTf);
  const [size, setSize] = useState(defaultSize);
  const [risk, setRisk] = useState(defaultRisk);
  const [leverage, setLeverage] = useState(defaultLeverage);
  const [tp, setTp] = useState(defaultTp);
  const [sl, setSl] = useState(defaultSl);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [maxTrades, setMaxTrades] = useState(10);
  const [cooldown, setCooldown] = useState(5);
  const [riskProfile, setRiskProfile] = useState<(typeof RISK_PROFILES)[number]>("Balanced");

  useEffect(() => {
    if (!exchangeId && accounts.length > 0) setExchangeId(accounts[0].id);
  }, [accounts, exchangeId]);

  const canLaunch = mode === "paper" || accounts.length > 0;

  const handleLaunch = useCallback(() => {
    if (!canLaunch) return;
    onLaunch?.({
      botName, exchangeId, mode, pair, tf, size, risk, leverage, tp, sl,
      maxTrades, cooldown, riskProfile,
    });
  }, [botName, exchangeId, mode, pair, tf, size, risk, leverage, tp, sl, maxTrades, cooldown, riskProfile, canLaunch, onLaunch]);

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 space-y-5">
      {/* Exchange */}
      <FieldGroup label="Exchange">
        {accounts.length === 0 ? (
          <a
            href="/settings"
            className="flex items-center gap-1 rounded-md border border-[#F5C542]/30 bg-[#F5C542]/10 px-3 py-1.5 text-[11px] font-medium text-[#F5C542] transition hover:bg-[#F5C542]/20"
          >
            &#9888; Connect Exchange
          </a>
        ) : (
          <select
            value={exchangeId}
            onChange={e => setExchangeId(e.target.value)}
            className="w-full rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-[12px] text-white outline-none"
          >
            {accounts.map(a => (
              <option key={a.id} value={a.id}>
                {a.exchangeDisplayName} &middot; {a.accountName}
              </option>
            ))}
          </select>
        )}
        {accounts.length > 0 && (
          <span className={`absolute right-3 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full ${STATUS_DOT[accounts.find(a => a.id === exchangeId)?.status ?? "READY"]}`} />
        )}
        <Hint>Select the exchange account to execute trades</Hint>
      </FieldGroup>

      {/* Mode */}
      <FieldGroup label="Mode">
        <div className="flex rounded-md border border-white/10 bg-[#0F1012] p-0.5">
          <button
            onClick={() => setMode("paper")}
            className={`flex-1 rounded px-3 py-1 text-[11px] font-semibold transition ${mode === "paper" ? "bg-[#2bc48a]/20 text-[#2bc48a]" : "text-white/40 hover:text-white/60"}`}
          >Paper</button>
          <button
            onClick={() => setMode("live")}
            className={`flex-1 rounded px-3 py-1 text-[11px] font-semibold transition ${mode === "live" ? "bg-[#f6465d]/20 text-[#f6465d]" : "text-white/40 hover:text-white/60"}`}
          >Live</button>
        </div>
        {mode === "live" && accounts.length === 0 && (
          <p className="mt-1 text-[10px] text-[#f6465d]">&#9888; Live mode requires a connected exchange</p>
        )}
        <Hint>Paper mode simulates trades without real funds</Hint>
      </FieldGroup>

      {/* Market */}
      <FieldGroup label="Market">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <select value={pair} onChange={e => setPair(e.target.value)} className="w-full rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-[12px] text-white outline-none">
              {PAIRS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <Hint>Trading pair</Hint>
          </div>
          <div>
            <select value={tf} onChange={e => setTf(e.target.value)} className="w-full rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-[12px] text-white outline-none">
              {TIMEFRAMES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <Hint>Candle timeframe</Hint>
          </div>
        </div>
      </FieldGroup>

      {/* Position */}
      <FieldGroup label="Position">
        <div className="grid grid-cols-3 gap-2">
          <NumInput label="Size ($)" value={size} onChange={setSize} hint="Trade size in USDT" />
          <NumInput label="Risk %" value={risk} onChange={setRisk} step={0.25} hint="Max risk per trade" />
          <NumInput label="Leverage" value={leverage} onChange={setLeverage} step={1} hint="Position leverage" />
        </div>
      </FieldGroup>

      {/* Targets */}
      <FieldGroup label="Targets">
        <div className="grid grid-cols-2 gap-2">
          <NumInput label="TP %" value={tp} onChange={setTp} step={0.1} hint="Take-profit percentage" />
          <NumInput label="SL %" value={sl} onChange={setSl} step={0.1} hint="Stop-loss percentage" />
        </div>
      </FieldGroup>

      {/* Advanced */}
      <div>
        <button
          onClick={() => setShowAdvanced(v => !v)}
          className="flex items-center gap-1.5 text-[11px] font-medium text-white/40 transition hover:text-white/60"
        >
          <span className={`text-[10px] transition-transform ${showAdvanced ? "rotate-90" : ""}`}>&#9654;</span>
          Advanced
        </button>

        {showAdvanced && (
          <div className="mt-3 space-y-3 rounded-lg border border-white/[0.04] bg-white/[0.01] p-3">
            <div className="grid grid-cols-2 gap-2">
              <NumInput label="Max Trades / Day" value={maxTrades} onChange={setMaxTrades} step={1} hint="Daily trade limit" />
              <NumInput label="Cooldown (min)" value={cooldown} onChange={setCooldown} step={1} hint="Minutes between trades" />
            </div>

            <div>
              <span className="mb-1 block text-[10px] font-medium text-white/40">Risk Profile</span>
              <div className="flex gap-1.5">
                {RISK_PROFILES.map(p => (
                  <button
                    key={p}
                    onClick={() => setRiskProfile(p)}
                    className={`flex-1 rounded-md border px-2 py-1 text-[10px] font-semibold transition ${
                      riskProfile === p
                        ? "border-white/20 bg-white/[0.06] text-white"
                        : "border-white/[0.06] text-white/30 hover:text-white/50"
                    }`}
                  >{p}</button>
                ))}
              </div>
              <Hint>Adjusts signal sensitivity and position sizing</Hint>
            </div>
          </div>
        )}
      </div>

      {/* Launch */}
      <button
        onClick={handleLaunch}
        disabled={!canLaunch}
        className="w-full rounded-lg py-2.5 text-[13px] font-bold tracking-wide text-white transition disabled:cursor-not-allowed disabled:opacity-30"
        style={{ background: canLaunch ? accentColor : undefined, backgroundColor: canLaunch ? accentColor : "rgba(255,255,255,0.06)" }}
      >
        Start Bot
      </button>
    </div>
  );
}

/* ── Helpers ── */
function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="relative">
      <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-white/30">{label}</span>
      {children}
    </div>
  );
}

function NumInput({
  label, value, onChange, step = 1, hint,
}: {
  label: string; value: number; onChange: (v: number) => void; step?: number; hint?: string;
}) {
  return (
    <div>
      <input
        type="number"
        value={value}
        step={step}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full rounded-md border border-white/10 bg-[#0F1012] px-3 py-1.5 text-[12px] text-white outline-none placeholder:text-white/20"
        placeholder={label}
      />
      {hint && <Hint>{hint}</Hint>}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-0.5 text-[9px] text-white/20">{children}</p>;
}
