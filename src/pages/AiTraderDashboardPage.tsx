import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AiTraderTopTabs } from "../components/AiTraderTopTabs";
import {
  createTrader,
  deleteTrader,
  fetchConnectedExchangeAccounts,
  fetchTraderHubState,
  fetchTraders,
  type ConnectedExchangeAccount,
  type TraderAiModule,
  type TraderExchange,
  type TraderHubMetrics,
  type TraderHubRow,
  updateTraderStatus,
} from "../services/traderHubApi";

const pnlColor = (v: number) => (v >= 0 ? "text-[#2bc48a]" : "text-[#f47070]");
const fmtSigned = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;

interface CreateTraderModalProps {
  open: boolean;
  busy: boolean;
  error: string;
  accounts: ConnectedExchangeAccount[];
  accountsLoading: boolean;
  onClose: () => void;
  onCreate: (payload: {
    name: string;
    aiModule: TraderAiModule;
    exchange: TraderExchange;
    exchangeAccountId: string;
    exchangeAccountName: string;
    strategyId: string;
    strategyName: string;
    symbol: string;
    timeframe: "1m" | "5m" | "15m" | "30m" | "1h";
    scanIntervalSec: number;
  }) => Promise<void>;
}

function CreateTraderModal({ open, busy, error, accounts, accountsLoading, onClose, onCreate }: CreateTraderModalProps) {
  const [traderName, setTraderName] = useState("");
  const [aiModule, setAiModule] = useState<TraderAiModule>("CHATGPT");
  const [exchange, setExchange] = useState<TraderExchange>("AUTO");
  const [exchangeAccountId, setExchangeAccountId] = useState("");
  const [strategyName, setStrategyName] = useState("Scalpc1");
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [timeframe, setTimeframe] = useState<"1m" | "5m" | "15m" | "30m" | "1h">("15m");
  const [scanInterval, setScanInterval] = useState(180);

  useEffect(() => {
    if (!open) return;
    setTraderName("");
    setAiModule("CHATGPT");
    setExchange("AUTO");
    setExchangeAccountId("");
    setStrategyName("Scalpc1");
    setSymbol("BTCUSDT");
    setTimeframe("15m");
    setScanInterval(180);
  }, [open]);

  const availableAccounts = useMemo(() => {
    const ready = accounts.filter((row) => row.enabled && row.status !== "FAILED");
    if (exchange === "BINANCE") return ready.filter((row) => row.exchangeId === "binance");
    if (exchange === "GATEIO") return ready.filter((row) => row.exchangeId === "gate");
    return ready.filter((row) => row.exchangeId === "binance" || row.exchangeId === "gate");
  }, [accounts, exchange]);

  useEffect(() => {
    if (!availableAccounts.length) {
      setExchangeAccountId("");
      return;
    }
    const exists = availableAccounts.some((row) => row.id === exchangeAccountId);
    if (!exists) setExchangeAccountId(String(availableAccounts[0]?.id ?? ""));
  }, [availableAccounts, exchangeAccountId]);

  if (!open) return null;

  const canSubmit = traderName.trim().length > 1 && symbol.trim().length >= 3 && !busy && !!exchangeAccountId;

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-black/70 p-4">
      <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-[var(--borderSoft)] bg-[linear-gradient(180deg,#141922,#10151e)] shadow-[0_40px_120px_rgba(0,0,0,0.6)]">
        <div className="flex items-start justify-between border-b border-[var(--borderSoft)] p-5">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#7a6840] bg-[#2a2418] text-xl font-semibold text-[#F5C542]">
              +
            </span>
            <div>
              <h2 className="text-3xl font-semibold text-white">Create Trader</h2>
              <p className="text-sm text-[var(--textMuted)]">
                Select AI module, exchange, and strategy. Trader Hub runs this trader independently.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="rounded-md border border-white/15 px-2 py-1 text-xs text-[var(--textMuted)] hover:border-white/30 hover:text-white"
            onClick={onClose}
            disabled={busy}
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 p-5">
          <section className="rounded-xl border border-[var(--borderSoft)] bg-[#0F131B] p-4">
            <h3 className="mb-4 text-xl font-semibold text-white">
              <span className="mr-2 text-[#F5C542]">1</span>Trader Identity
            </h3>
            <label className="text-sm text-[var(--textMuted)]">
              Trader Name <span className="text-[#f47070]">*</span>
              <input
                value={traderName}
                onChange={(e) => setTraderName(e.target.value)}
                placeholder="ex: Momentum Hunter 01"
                className="mt-1 w-full rounded-lg border border-white/15 bg-[#0B0F14] px-3 py-2 text-[var(--text)] outline-none placeholder:text-[var(--textSubtle)]"
              />
            </label>
          </section>

          <section className="rounded-xl border border-[var(--borderSoft)] bg-[#0F131B] p-4">
            <h3 className="mb-4 text-xl font-semibold text-white">
              <span className="mr-2 text-[#F5C542]">2</span>AI Module + Exchange
            </h3>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm text-[var(--textMuted)]">
                AI Module
                <select
                  value={aiModule}
                  onChange={(e) => setAiModule((e.target.value === "QWEN" ? "QWEN" : "CHATGPT") as TraderAiModule)}
                  className="mt-1 w-full rounded-lg border border-white/15 bg-[#0B0F14] px-3 py-2 text-[var(--text)] outline-none"
                >
                  <option value="CHATGPT">ChatGPT</option>
                  <option value="QWEN">Qwen</option>
                </select>
              </label>
              <label className="text-sm text-[var(--textMuted)]">
                Exchange Route
                <select
                  value={exchange}
                  onChange={(e) => {
                    const value = e.target.value;
                    setExchange(value === "BINANCE" ? "BINANCE" : value === "GATEIO" ? "GATEIO" : "AUTO");
                  }}
                  className="mt-1 w-full rounded-lg border border-white/15 bg-[#0B0F14] px-3 py-2 text-[var(--text)] outline-none"
                >
                  <option value="AUTO">Auto (Binance primary, Gate fallback)</option>
                  <option value="BINANCE">Binance Futures</option>
                  <option value="GATEIO">Gate.io Futures</option>
                </select>
              </label>
              <label className="text-sm text-[var(--textMuted)] md:col-span-2">
                Connected Exchange Account
                <select
                  value={exchangeAccountId}
                  onChange={(e) => setExchangeAccountId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/15 bg-[#0B0F14] px-3 py-2 text-[var(--text)] outline-none"
                >
                  {accountsLoading ? <option value="">Loading accounts...</option> : null}
                  {!accountsLoading && !availableAccounts.length ? (
                    <option value="">No connected Binance/Gate account</option>
                  ) : null}
                  {!accountsLoading
                    ? availableAccounts.map((row) => (
                        <option key={row.id ?? `${row.exchangeId}-${row.accountName ?? "main"}`} value={row.id ?? ""}>
                          {row.exchangeDisplayName} · {row.accountName ?? "Main"} · {row.status}
                        </option>
                      ))
                    : null}
                </select>
                <span className="mt-1 block text-[11px] text-[var(--textSubtle)]">
                  Binance-first/Gate-ready routing uses this selected account for live execution.
                </span>
              </label>
            </div>
          </section>

          <section className="rounded-xl border border-[var(--borderSoft)] bg-[#0F131B] p-4">
            <h3 className="mb-4 text-xl font-semibold text-white">
              <span className="mr-2 text-[#F5C542]">3</span>Strategy + Runtime
            </h3>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm text-[var(--textMuted)]">
                Strategy
                <select
                  value={strategyName}
                  onChange={(e) => setStrategyName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/15 bg-[#0B0F14] px-3 py-2 text-[var(--text)] outline-none"
                >
                  <option>Scalpc1</option>
                  <option>Riskli Scalp</option>
                  <option>Intraday</option>
                  <option>Capital Guard</option>
                </select>
              </label>
              <label className="text-sm text-[var(--textMuted)]">
                Symbol
                <input
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  placeholder="BTCUSDT"
                  className="mt-1 w-full rounded-lg border border-white/15 bg-[#0B0F14] px-3 py-2 text-[var(--text)] outline-none placeholder:text-[var(--textSubtle)]"
                />
              </label>
              <label className="text-sm text-[var(--textMuted)]">
                Timeframe
                <select
                  value={timeframe}
                  onChange={(e) => {
                    const value = e.target.value as "1m" | "5m" | "15m" | "30m" | "1h";
                    setTimeframe(value);
                  }}
                  className="mt-1 w-full rounded-lg border border-white/15 bg-[#0B0F14] px-3 py-2 text-[var(--text)] outline-none"
                >
                  <option value="1m">1m</option>
                  <option value="5m">5m</option>
                  <option value="15m">15m</option>
                  <option value="30m">30m</option>
                  <option value="1h">1h</option>
                </select>
              </label>
              <label className="text-sm text-[var(--textMuted)]">
                Scan Interval (sec)
                <input
                  type="number"
                  min={30}
                  max={600}
                  value={scanInterval}
                  onChange={(e) => setScanInterval(Math.max(30, Math.min(600, Number(e.target.value) || 30)))}
                  className="mt-1 w-full rounded-lg border border-white/15 bg-[#0B0F14] px-3 py-2 text-[var(--text)] outline-none"
                />
              </label>
            </div>
          </section>
        </div>

        <div className="flex items-center justify-between border-t border-[var(--borderSoft)] bg-[#1a1f29] px-5 py-4">
          <p className="text-xs text-[#fca5a5]">{error}</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/15 bg-[#2a2f3a] px-6 py-2 text-base font-semibold text-[var(--textMuted)] hover:text-white"
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() =>
                void onCreate({
                  name: traderName.trim(),
                  aiModule,
                  exchange,
                  exchangeAccountId,
                  exchangeAccountName:
                    availableAccounts.find((row) => row.id === exchangeAccountId)?.accountName ?? "Main",
                  strategyId: `strategy-${strategyName.toLowerCase().replace(/\s+/g, "-")}`,
                  strategyName,
                  symbol: symbol.trim().toUpperCase(),
                  timeframe,
                  scanIntervalSec: scanInterval,
                })
              }
              className="rounded-xl border border-[#7a6840] bg-[#9f8133] px-6 py-2 text-base font-semibold text-[#1a1408] hover:bg-[#b79338] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Creating..." : "Create Trader"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const fromNow = (value: string): string => {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return "N/A";
  const diff = Math.max(0, Date.now() - ms);
  if (diff < 5_000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
};

export default function AiTraderDashboardPage() {
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [rows, setRows] = useState<TraderHubRow[]>([]);
  const [metrics, setMetrics] = useState<TraderHubMetrics | null>(null);
  const [accounts, setAccounts] = useState<ConnectedExchangeAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createError, setCreateError] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [rowBusyId, setRowBusyId] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [items, nextMetrics] = await Promise.all([fetchTraders(), fetchTraderHubState()]);
      setRows(items.sort((a, b) => b.stats.pnlPct - a.stats.pnlPct));
      setMetrics(nextMetrics);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load trader hub state");
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshAccounts = useCallback(async () => {
    try {
      const rows = await fetchConnectedExchangeAccounts();
      setAccounts(rows);
    } catch {
      setAccounts([]);
    } finally {
      setAccountsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    void refreshAccounts();
    const timer = window.setInterval(() => {
      void refresh();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [refresh, refreshAccounts]);

  const onCreateTrader = useCallback(
    async (payload: {
      name: string;
      aiModule: TraderAiModule;
      exchange: TraderExchange;
      exchangeAccountId: string;
      exchangeAccountName: string;
      strategyId: string;
      strategyName: string;
      symbol: string;
      timeframe: "1m" | "5m" | "15m" | "30m" | "1h";
      scanIntervalSec: number;
    }) => {
      setCreateBusy(true);
      setCreateError("");
      try {
        await createTrader(payload);
        setCreateOpen(false);
        await Promise.all([refresh(), refreshAccounts()]);
      } catch (err) {
        setCreateError(err instanceof Error ? err.message : "Create trader failed");
      } finally {
        setCreateBusy(false);
      }
    },
    [refresh, refreshAccounts],
  );

  const toggleStatus = useCallback(
    async (row: TraderHubRow) => {
      setRowBusyId(row.id);
      try {
        await updateTraderStatus(row.id, row.status === "RUNNING" ? "STOPPED" : "RUNNING");
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update trader status");
      } finally {
        setRowBusyId("");
      }
    },
    [refresh],
  );

  const removeTrader = useCallback(
    async (row: TraderHubRow) => {
      setRowBusyId(row.id);
      try {
        await deleteTrader(row.id);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete trader");
      } finally {
        setRowBusyId("");
      }
    },
    [refresh],
  );

  const summary = useMemo(() => {
    const running = rows.filter((row) => row.status === "RUNNING").length;
    const totalPnl = rows.reduce((acc, row) => acc + row.stats.pnlPct, 0);
    return { running, totalPnl };
  }, [rows]);

  return (
    <main className="min-h-screen bg-[var(--bg)] p-4 text-[var(--text)] md:p-6">
      <div className="mx-auto max-w-[1720px] rounded-2xl border border-[var(--borderSoft)] bg-[linear-gradient(180deg,var(--panel),var(--panelAlt))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_18px_42px_rgba(0,0,0,0.35)] md:p-5">
        <AiTraderTopTabs />
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--borderSoft)] bg-[var(--panelAlt)] text-[#F5C542]">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M4 20h16" />
                <path d="M7 16V8" />
                <path d="M12 16V5" />
                <path d="M17 16v-6" />
              </svg>
            </span>
            <div>
              <h1 className="text-xl font-semibold text-white">Current Traders</h1>
              <p className="text-xs text-[var(--textMuted)]">
                Trader Hub isolation mode · {summary.running}/{rows.length} running · total PnL {fmtSigned(summary.totalPnl)}%
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-lg border border-[var(--borderSoft)] bg-[#101520] px-3 py-1 text-[11px] text-[var(--textMuted)]">
              {metrics
                ? `Engine ${metrics.started ? "ON" : "OFF"} · in-flight ${metrics.inFlightJobs} · shards ${metrics.shardCount}`
                : "Engine loading..."}
            </div>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="rounded-lg border border-[#7a6840] bg-[#2a2418] px-3 py-1.5 text-xs font-semibold text-[#F5C542] hover:bg-[#312a1d]"
            >
              + CREATE TRADER
            </button>
          </div>
        </header>

        {error ? <p className="mb-3 text-xs text-[#fca5a5]">{error}</p> : null}
        {loading ? <p className="mb-3 text-xs text-[var(--textMuted)]">Loading trader fleet...</p> : null}

        <section className="space-y-3">
          {rows.map((row) => (
            <article
              key={row.id}
              className="rounded-xl border border-[var(--borderSoft)] bg-[linear-gradient(180deg,var(--panelAlt),#0e1116)] p-3"
            >
              <div className="grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_260px]">
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--borderSoft)] bg-[#0e1218] text-[#F5C542]">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <circle cx="12" cy="12" r="8" />
                      <path d="M12 7v5l3 3" />
                    </svg>
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-2xl font-semibold text-white">{row.name}</p>
                    <p className="mt-1 truncate text-xs text-[var(--textMuted)]">
                      {row.aiModule} · {row.exchange} · {row.exchangeAccountName || "Auto"} · {row.strategyName} · {row.symbol} · {row.timeframe}
                    </p>
                    <p className="mt-1 text-[11px] text-[var(--textSubtle)]">
                      Last run: {row.lastRunAt ? fromNow(row.lastRunAt) : "not yet"} · Next: {fromNow(row.nextRunAt)}
                    </p>
                  </div>
                </div>

                <div>
                  <div
                    className={`mb-2 rounded-md border px-2 py-1 text-center text-[11px] font-semibold tracking-wider ${
                      row.status === "RUNNING"
                        ? "border-[#3d6b58] bg-[linear-gradient(90deg,rgba(34,197,94,0.14),rgba(11,20,15,0.4))] text-[#9fe4bf]"
                        : row.status === "ERROR"
                          ? "border-[#7d4444] bg-[linear-gradient(90deg,rgba(220,80,80,0.2),rgba(30,16,16,0.45))] text-[#f8b4b4]"
                          : "border-[#5b5f66] bg-[linear-gradient(90deg,rgba(120,130,140,0.12),rgba(20,22,26,0.4))] text-[#c5cdd9]"
                    }`}
                  >
                    {row.status}
                  </div>

                  <div className="grid grid-cols-4 gap-2 text-[12px]">
                    <div className="rounded-md border border-[var(--borderSoft)] bg-[#0F1012] px-2 py-1">
                      <p className="text-[10px] uppercase tracking-wider text-[var(--textMuted)]">Runs</p>
                      <p className="text-lg font-semibold text-white">{row.stats.runs}</p>
                    </div>
                    <div className="rounded-md border border-[var(--borderSoft)] bg-[#0F1012] px-2 py-1">
                      <p className="text-[10px] uppercase tracking-wider text-[var(--textMuted)]">Trade</p>
                      <p className="text-lg font-semibold text-[#2bc48a]">{row.stats.tradeCount}</p>
                    </div>
                    <div className="rounded-md border border-[var(--borderSoft)] bg-[#0F1012] px-2 py-1">
                      <p className="text-[10px] uppercase tracking-wider text-[var(--textMuted)]">Watch</p>
                      <p className="text-lg font-semibold text-[#e8d07b]">{row.stats.watchCount}</p>
                    </div>
                    <div className="rounded-md border border-[var(--borderSoft)] bg-[#0F1012] px-2 py-1 text-right">
                      <p className="text-[10px] uppercase tracking-wider text-[var(--textMuted)]">PnL %</p>
                      <p className={`text-lg font-semibold ${pnlColor(row.stats.pnlPct)}`}>{fmtSigned(row.stats.pnlPct)}</p>
                    </div>
                  </div>

                  <div className="mt-2 rounded-md border border-[var(--borderSoft)] bg-[#0F1012] px-2 py-1.5 text-[11px] text-[var(--textMuted)]">
                    {row.lastResult ? (
                      <>
                        <span className="font-semibold text-[var(--text)]">
                          {row.lastResult.decision} · {row.lastResult.bias} · score {row.lastResult.scorePct.toFixed(1)}%
                        </span>
                        <span className="mx-1">·</span>
                        <span>{row.lastResult.reason}</span>
                        <span className="mx-1">·</span>
                        <span>Source {row.lastResult.sourceExchange}</span>
                        {row.lastResult.execution ? (
                          <>
                            <span className="mx-1">·</span>
                            <span>
                              Exec {row.lastResult.execution.state}
                              {row.lastResult.execution.venue !== "N/A" ? ` @ ${row.lastResult.execution.venue}` : ""}
                            </span>
                          </>
                        ) : null}
                      </>
                    ) : (
                      "No decision yet. Engine will run when next interval triggers."
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => void toggleStatus(row)}
                    disabled={rowBusyId === row.id}
                    className={`rounded-md border px-2 py-1.5 text-[11px] font-semibold ${
                      row.status === "RUNNING"
                        ? "border-[#704844] bg-[#271a19] text-[#f47070]"
                        : "border-[#3d6b58] bg-[#1f251b] text-[#2bc48a]"
                    } disabled:opacity-50`}
                  >
                    {row.status === "RUNNING" ? "Stop" : "Start"}
                  </button>
                  <button
                    type="button"
                    disabled={rowBusyId === row.id}
                    onClick={() => void removeTrader(row)}
                    className="rounded-md border border-[#704844] bg-[#271a19] px-2 py-1.5 text-[11px] font-semibold text-[#f47070] disabled:opacity-50"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const exchangeLabel =
                        row.exchange === "GATEIO"
                          ? "Gate.io"
                          : row.exchange === "BINANCE"
                            ? "Binance"
                            : row.lastResult?.sourceExchange === "Gate.io"
                              ? "Gate.io"
                              : "Binance";
                      const q = new URLSearchParams({
                        symbol: row.symbol,
                        exchange: exchangeLabel,
                      });
                      if (row.exchangeAccountName?.trim()) q.set("account", row.exchangeAccountName.trim());
                      navigate(`/exchange-terminal?${q.toString()}`);
                    }}
                    className="rounded-md border border-[#3b5a84] bg-[#162238] px-2 py-1.5 text-[11px] font-semibold text-[#8cb8ff]"
                  >
                    Open Exchange
                  </button>
                  <div className="col-span-2 rounded-md border border-[var(--borderSoft)] bg-[#0F1012] px-2 py-1.5 text-[11px] text-[var(--textMuted)] sm:col-span-1 xl:col-span-2">
                    {row.lastResult?.plan && row.lastResult.price ? (
                      <>
                        Entry {row.lastResult.plan.entryLow ?? "-"} - {row.lastResult.plan.entryHigh ?? "-"} · SL1 {row.lastResult.plan.sl1 ?? "-"} ·
                        TP1 {row.lastResult.plan.tp1 ?? "-"}
                      </>
                    ) : (
                      "Plan N/A"
                    )}
                  </div>
                </div>
              </div>
            </article>
          ))}
          {!rows.length && !loading ? (
            <div className="rounded-xl border border-[var(--borderSoft)] bg-[var(--panelAlt)] p-4 text-sm text-[var(--textMuted)]">
              No trader yet. Create trader and Trader Hub will run it on selected AI + exchange route.
            </div>
          ) : null}
        </section>
      </div>
      <CreateTraderModal
        open={createOpen}
        busy={createBusy}
        error={createError}
        accounts={accounts}
        accountsLoading={accountsLoading}
        onClose={() => {
          if (createBusy) return;
          setCreateError("");
          setCreateOpen(false);
        }}
        onCreate={onCreateTrader}
      />
    </main>
  );
}
