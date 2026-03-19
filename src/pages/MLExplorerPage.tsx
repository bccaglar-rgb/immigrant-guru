import { useState } from "react";
import {
  fetchTrainingData,
  fetchFeatures,
  type TrainingDataResponse,
  type FeaturesResponse,
} from "../services/mlApi";

const panel = "rounded-2xl border border-white/10 bg-[#121316] p-4";
const inputCls = "w-full rounded-lg border border-[var(--borderSoft)] bg-[var(--panelMuted)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]/60";
const btnCls = "rounded-lg border border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] px-4 py-2 text-sm font-semibold text-[var(--accent)] disabled:opacity-50";
const labelCls = "text-[10px] uppercase tracking-wider text-[#6B6F76]";

type Tab = "training" | "features";

export default function MLExplorerPage() {
  const [tab, setTab] = useState<Tab>("training");

  // Training Data form
  const [tdSymbols, setTdSymbols] = useState("BTCUSDT,ETHUSDT");
  const [tdStart, setTdStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [tdEnd, setTdEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [tdInterval, setTdInterval] = useState("15m");
  const [tdExchange, setTdExchange] = useState("BINANCE");
  const [tdLimit, setTdLimit] = useState(10000);
  const [tdResult, setTdResult] = useState<TrainingDataResponse | null>(null);
  const [tdLoading, setTdLoading] = useState(false);

  // Features form
  const [fSymbol, setFSymbol] = useState("BTCUSDT");
  const [fHours, setFHours] = useState(24);
  const [fLimit, setFLimit] = useState(5000);
  const [fResult, setFResult] = useState<FeaturesResponse | null>(null);
  const [fLoading, setFLoading] = useState(false);

  const [error, setError] = useState("");

  const onFetchTrainingData = async () => {
    setTdLoading(true);
    setError("");
    try {
      const res = await fetchTrainingData({
        symbols: tdSymbols,
        start: tdStart,
        end: tdEnd,
        interval: tdInterval,
        exchange: tdExchange,
        limit: tdLimit,
      });
      setTdResult(res);
    } catch (e: any) {
      setError(e?.message ?? "Failed to fetch training data");
    } finally {
      setTdLoading(false);
    }
  };

  const onFetchFeatures = async () => {
    setFLoading(true);
    setError("");
    try {
      const res = await fetchFeatures({
        symbol: fSymbol,
        hours: fHours,
        limit: fLimit,
      });
      setFResult(res);
    } catch (e: any) {
      setError(e?.message ?? "Failed to fetch features");
    } finally {
      setFLoading(false);
    }
  };

  const downloadJson = (data: unknown, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const tabCls = (active: boolean) =>
    `rounded-lg px-4 py-2 text-sm font-semibold transition ${
      active
        ? "border border-[var(--accent)]/70 bg-[#2b2417] text-[var(--accent)]"
        : "border border-white/10 bg-[#0F1012] text-[#BFC2C7] hover:bg-[#17191d]"
    }`;

  return (
    <main className="min-h-screen bg-[var(--bg)] p-4 text-[var(--textMuted)] md:p-6">
      <div className="mx-auto max-w-[1560px] space-y-4">
        {/* Header */}
        <section className={panel}>
          <h1 className="text-lg font-semibold text-white">ML Data Explorer</h1>
          <p className="text-xs text-[#6B6F76]">Export training data and feature snapshots for ML pipelines</p>
          <div className="mt-3 flex gap-2">
            <button type="button" className={tabCls(tab === "training")} onClick={() => setTab("training")}>Training Data</button>
            <button type="button" className={tabCls(tab === "features")} onClick={() => setTab("features")}>Feature Snapshots</button>
          </div>
        </section>

        {error && <div className="rounded-xl border border-[#704844] bg-[#271a19] p-3 text-sm text-[#d6b3af]">{error}</div>}

        {/* Training Data Tab */}
        {tab === "training" && (
          <>
            <section className={panel}>
              <h2 className="text-sm font-semibold text-white mb-3">Training Data Query</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label className="block space-y-1">
                  <span className="text-xs text-[#6B6F76]">Symbols (comma-separated)</span>
                  <input className={inputCls} value={tdSymbols} onChange={(e) => setTdSymbols(e.target.value)} placeholder="BTCUSDT,ETHUSDT" />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs text-[#6B6F76]">Start Date</span>
                  <input type="date" className={inputCls} value={tdStart} onChange={(e) => setTdStart(e.target.value)} />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs text-[#6B6F76]">End Date</span>
                  <input type="date" className={inputCls} value={tdEnd} onChange={(e) => setTdEnd(e.target.value)} />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs text-[#6B6F76]">Interval</span>
                  <select className={inputCls} value={tdInterval} onChange={(e) => setTdInterval(e.target.value)}>
                    <option value="1m">1m</option>
                    <option value="5m">5m</option>
                    <option value="15m">15m</option>
                    <option value="1h">1h</option>
                    <option value="4h">4h</option>
                    <option value="1d">1d</option>
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="text-xs text-[#6B6F76]">Exchange</span>
                  <select className={inputCls} value={tdExchange} onChange={(e) => setTdExchange(e.target.value)}>
                    <option value="BINANCE">Binance</option>
                    <option value="BYBIT">Bybit</option>
                    <option value="OKX">OKX</option>
                    <option value="GATE">Gate.io</option>
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="text-xs text-[#6B6F76]">Limit (max 50000)</span>
                  <input type="number" className={inputCls} value={tdLimit} onChange={(e) => setTdLimit(Number(e.target.value))} min={1} max={50000} />
                </label>
              </div>
              <div className="mt-4 flex gap-2">
                <button type="button" disabled={tdLoading || !tdSymbols} className={btnCls} onClick={onFetchTrainingData}>
                  {tdLoading ? "Loading..." : "Fetch Data"}
                </button>
                {tdResult && (
                  <button type="button" className="rounded-lg border border-white/10 bg-[#0F1012] px-4 py-2 text-sm text-[#BFC2C7] hover:bg-[#17191d]"
                    onClick={() => downloadJson(tdResult.data, `training-${tdSymbols.replace(/,/g, "_")}-${tdInterval}.json`)}>
                    Download JSON ({tdResult.count} rows)
                  </button>
                )}
              </div>
            </section>

            {tdResult && (
              <section className={panel}>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-white">Results</h2>
                  <div className="flex gap-4 text-[11px] text-[#6B6F76]">
                    <span>Symbols: <span className="text-white">{tdResult.symbols.join(", ")}</span></span>
                    <span>Interval: <span className="text-white">{tdResult.interval}</span></span>
                    <span>Rows: <span className="text-white">{tdResult.count.toLocaleString()}</span></span>
                  </div>
                </div>
                {tdResult.data.length > 0 ? (
                  <div className="overflow-x-auto max-h-96">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-[#0F1012]">
                        <tr className="text-[10px] text-[#6B6F76] uppercase">
                          {Object.keys(tdResult.data[0]).slice(0, 12).map((k) => (
                            <th key={k} className="pb-1.5 pr-3 text-left whitespace-nowrap">{k}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {tdResult.data.slice(0, 100).map((row, i) => (
                          <tr key={i} className="border-t border-white/5">
                            {Object.values(row).slice(0, 12).map((v, j) => (
                              <td key={j} className="py-1 pr-3 text-white whitespace-nowrap">
                                {typeof v === "number" ? (v > 1000 ? v.toLocaleString() : v.toPrecision(6)) : String(v ?? "—")}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {tdResult.data.length > 100 && (
                      <p className="mt-2 text-xs text-[#6B6F76]">Showing first 100 of {tdResult.count.toLocaleString()} rows. Download JSON for full dataset.</p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-[#6B6F76]">No data returned.</p>
                )}
              </section>
            )}
          </>
        )}

        {/* Features Tab */}
        {tab === "features" && (
          <>
            <section className={panel}>
              <h2 className="text-sm font-semibold text-white mb-3">Feature Snapshot Query</h2>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block space-y-1">
                  <span className="text-xs text-[#6B6F76]">Symbol</span>
                  <input className={inputCls} value={fSymbol} onChange={(e) => setFSymbol(e.target.value.toUpperCase())} placeholder="BTCUSDT" />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs text-[#6B6F76]">Lookback (hours, max 720)</span>
                  <input type="number" className={inputCls} value={fHours} onChange={(e) => setFHours(Number(e.target.value))} min={1} max={720} />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs text-[#6B6F76]">Limit (max 50000)</span>
                  <input type="number" className={inputCls} value={fLimit} onChange={(e) => setFLimit(Number(e.target.value))} min={1} max={50000} />
                </label>
              </div>
              <div className="mt-4 flex gap-2">
                <button type="button" disabled={fLoading || !fSymbol} className={btnCls} onClick={onFetchFeatures}>
                  {fLoading ? "Loading..." : "Fetch Features"}
                </button>
                {fResult && (
                  <button type="button" className="rounded-lg border border-white/10 bg-[#0F1012] px-4 py-2 text-sm text-[#BFC2C7] hover:bg-[#17191d]"
                    onClick={() => downloadJson(fResult.data, `features-${fSymbol}-${fHours}h.json`)}>
                    Download JSON ({fResult.count} rows)
                  </button>
                )}
              </div>
            </section>

            {fResult && (
              <section className={panel}>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-white">Results</h2>
                  <div className="flex gap-4 text-[11px] text-[#6B6F76]">
                    <span>Symbol: <span className="text-white">{fResult.symbol}</span></span>
                    <span>Hours: <span className="text-white">{fResult.hours}</span></span>
                    <span>Rows: <span className="text-white">{fResult.count.toLocaleString()}</span></span>
                  </div>
                </div>
                {fResult.data.length > 0 ? (
                  <div className="overflow-x-auto max-h-96">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-[#0F1012]">
                        <tr className="text-[10px] text-[#6B6F76] uppercase">
                          {Object.keys(fResult.data[0]).slice(0, 12).map((k) => (
                            <th key={k} className="pb-1.5 pr-3 text-left whitespace-nowrap">{k}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {fResult.data.slice(0, 100).map((row, i) => (
                          <tr key={i} className="border-t border-white/5">
                            {Object.values(row).slice(0, 12).map((v, j) => (
                              <td key={j} className="py-1 pr-3 text-white whitespace-nowrap">
                                {typeof v === "number" ? (v > 1000 ? v.toLocaleString() : v.toPrecision(6)) : String(v ?? "—")}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {fResult.data.length > 100 && (
                      <p className="mt-2 text-xs text-[#6B6F76]">Showing first 100 of {fResult.count.toLocaleString()} rows.</p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-[#6B6F76]">No data returned.</p>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
