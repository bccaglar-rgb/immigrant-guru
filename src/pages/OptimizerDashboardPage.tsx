import { useEffect, useState } from "react";
import {
  fetchOptimizerHealth,
  fetchModePerformance,
  fetchAttributionSummary,
  fetchSlTpParams,
  fetchRegime,
  fetchCalibration,
  fetchThrottle,
  fetchFeatureWeights,
  type OptimizerHealthResponse,
  type ModePerformanceResponse,
  type AttributionResponse,
  type SlTpResponse,
  type RegimeResponse,
  type CalibrationResponse,
  type ThrottleResponse,
  type FeatureWeightsResponse,
} from "../services/optimizerApi";

const panel = "rounded-2xl border border-white/10 bg-[#121316] p-4";
const statBox = "rounded-lg border border-white/10 bg-[#0F1012] px-3 py-2";
const labelCls = "text-[10px] uppercase tracking-wider text-[#6B6F76]";
const valCls = "text-sm font-semibold text-white";

const MODULE_LABELS: Record<string, string> = {
  p1: "Mode Performance",
  p2: "Trade Attribution",
  p3: "SL/TP Optimizer",
  p4: "Regime Engine",
  p5: "Calibrator A",
  p6: "Calibrator B",
  p7: "Self-Throttle",
  p9: "Feature Weights",
  p10: "Champion/Challenger",
};

function fmtTs(ts: number | null | undefined) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

function fmtPct(v: number | undefined | null, digits = 1) {
  if (v == null || isNaN(v)) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

export default function OptimizerDashboardPage() {
  const [health, setHealth] = useState<OptimizerHealthResponse | null>(null);
  const [modes, setModes] = useState<ModePerformanceResponse | null>(null);
  const [attribution, setAttribution] = useState<AttributionResponse | null>(null);
  const [sltp, setSltp] = useState<SlTpResponse | null>(null);
  const [regime, setRegime] = useState<RegimeResponse | null>(null);
  const [calibration, setCalibration] = useState<CalibrationResponse | null>(null);
  const [throttle, setThrottle] = useState<ThrottleResponse | null>(null);
  const [weights, setWeights] = useState<FeatureWeightsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadAll = async () => {
    try {
      const [h, m, a, s, r, c, t, w] = await Promise.all([
        fetchOptimizerHealth(),
        fetchModePerformance(),
        fetchAttributionSummary(),
        fetchSlTpParams(),
        fetchRegime(),
        fetchCalibration(),
        fetchThrottle(),
        fetchFeatureWeights(),
      ]);
      setHealth(h);
      setModes(m);
      setAttribution(a);
      setSltp(s);
      setRegime(r);
      setCalibration(c);
      setThrottle(t);
      setWeights(w);
      setError("");
    } catch (e: any) {
      setError(e?.message ?? "Failed to load optimizer data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
    const timer = setInterval(loadAll, 30_000);
    return () => clearInterval(timer);
  }, []);

  if (loading && !health) {
    return (
      <main className="min-h-screen bg-[var(--bg)] p-4 text-[var(--textMuted)] md:p-6">
        <div className="mx-auto max-w-[1560px] flex items-center justify-center min-h-[60vh]">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#F5C542] border-t-transparent" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--bg)] p-4 text-[var(--textMuted)] md:p-6">
      <div className="mx-auto max-w-[1560px] space-y-4">
        {/* Header */}
        <section className={panel}>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-white">Optimizer Evolution</h1>
              <p className="text-xs text-[#6B6F76]">P1-P10 Module Dashboard &middot; Auto-refresh 30s</p>
            </div>
            <button type="button" onClick={() => void loadAll()} className="rounded-lg border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-[#BFC2C7] hover:bg-[#17191d]">
              Refresh
            </button>
          </div>
        </section>

        {error && (
          <div className="rounded-xl border border-[#704844] bg-[#271a19] p-3 text-sm text-[#d6b3af]">{error}</div>
        )}

        {/* 1. Health Overview — Module Grid */}
        {health && (
          <section className={panel}>
            <h2 className="text-sm font-semibold text-white mb-3">Module Health</h2>
            <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
              {Object.entries(health.modules).map(([key, mod]) => {
                const label = MODULE_LABELS[key] ?? key.toUpperCase();
                const isActive = (mod as any).active;
                return (
                  <div key={key} className={`${statBox} flex flex-col gap-1`}>
                    <div className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${isActive ? "bg-[#4ade80]" : "bg-[#fb7185]"}`} />
                      <span className="text-[11px] font-semibold text-white">{key.toUpperCase()}</span>
                    </div>
                    <span className="text-[10px] text-[#6B6F76]">{label}</span>
                    {key === "p2" && (
                      <span className="text-[10px] text-[#BFC2C7]">{(mod as any).trades ?? 0} trades · {(mod as any).wins ?? 0}W/{(mod as any).losses ?? 0}L</span>
                    )}
                    {key === "p4" && (
                      <span className="text-[10px] text-[#BFC2C7]">Regime: {(mod as any).regime ?? "—"}</span>
                    )}
                    {key === "p6" && (
                      <span className={`text-[10px] ${(mod as any).calibrated ? "text-[#4ade80]" : "text-[#F5C542]"}`}>
                        {(mod as any).calibrated ? "Well Calibrated" : "Uncalibrated"}
                      </span>
                    )}
                    {key === "p7" && (
                      <span className="text-[10px] text-[#BFC2C7]">
                        Throttle: {(mod as any).throttle ?? 0} · Boost: {(mod as any).boost ?? 0}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* 2. Mode Performance */}
        {modes && modes.modes.length > 0 && (
          <section className={panel}>
            <h2 className="text-sm font-semibold text-white mb-3">Mode Performance</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {modes.modes.map((m) => {
                const wr = m.totalTrades > 0 ? ((m.wins / m.totalTrades) * 100).toFixed(1) : "0.0";
                const wrColor = Number(wr) >= 60 ? "text-[#4ade80]" : Number(wr) >= 45 ? "text-[#F5C542]" : "text-[#fb7185]";
                return (
                  <div key={m.mode} className={statBox}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-white">{m.mode}</span>
                      {m.throttled && <span className="rounded-full bg-[#704844] px-1.5 py-px text-[9px] text-[#fb7185]">THROTTLED</span>}
                    </div>
                    <p className={`mt-1 text-2xl font-bold ${wrColor}`}>{wr}%</p>
                    <p className="text-[11px] text-[#6B6F76]">{m.totalTrades} trades · {m.wins}W / {m.losses}L</p>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* 3. Trade Attribution */}
        {attribution && (
          <section className={panel}>
            <h2 className="text-sm font-semibold text-white mb-3">Trade Attribution <span className="text-[#6B6F76] font-normal">({attribution.hours}h)</span></h2>
            <div className="grid gap-3 sm:grid-cols-4">
              <div className={statBox}>
                <span className={labelCls}>Total Trades</span>
                <p className={valCls}>{attribution.total}</p>
              </div>
              <div className={statBox}>
                <span className={labelCls}>Wins</span>
                <p className="text-sm font-semibold text-[#4ade80]">{attribution.wins}</p>
              </div>
              <div className={statBox}>
                <span className={labelCls}>Losses</span>
                <p className="text-sm font-semibold text-[#fb7185]">{attribution.losses}</p>
              </div>
              <div className={statBox}>
                <span className={labelCls}>Win Rate</span>
                <p className={valCls}>{attribution.total > 0 ? ((attribution.wins / attribution.total) * 100).toFixed(1) : "0.0"}%</p>
              </div>
            </div>
          </section>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          {/* 4. SL/TP Optimizer */}
          {sltp && (
            <section className={panel}>
              <h2 className="text-sm font-semibold text-white mb-3">Dynamic SL/TP Parameters</h2>
              <p className="text-[11px] text-[#6B6F76] mb-2">Last optimized: {fmtTs(sltp.lastOptimized)}</p>
              {sltp.params.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[10px] text-[#6B6F76] uppercase">
                        <th className="pb-1.5 text-left">Regime</th>
                        <th className="pb-1.5 text-right">SL Distance</th>
                        <th className="pb-1.5 text-right">TP Distance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sltp.params.map((p, i) => (
                        <tr key={i} className="border-t border-white/5">
                          <td className="py-1.5 text-white font-medium">{p.regime}</td>
                          <td className="py-1.5 text-right text-[#fb7185]">{typeof p.slDistance === "number" ? p.slDistance.toFixed(4) : String(p.slDistance)}</td>
                          <td className="py-1.5 text-right text-[#4ade80]">{typeof p.tpDistance === "number" ? p.tpDistance.toFixed(4) : String(p.tpDistance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-[#6B6F76]">No parameters available yet.</p>
              )}
            </section>
          )}

          {/* 5. Regime Engine */}
          {regime && (
            <section className={panel}>
              <h2 className="text-sm font-semibold text-white mb-3">Regime Engine</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className={statBox}>
                  <span className={labelCls}>Current Regime</span>
                  <p className={`text-lg font-bold ${
                    regime.currentRegime === "TREND" ? "text-[#4ade80]" :
                    regime.currentRegime === "BREAKOUT" ? "text-[#F5C542]" :
                    regime.currentRegime === "RANGE" ? "text-[#66b3ff]" : "text-[#6B6F76]"
                  }`}>
                    {regime.currentRegime}
                  </p>
                </div>
                <div className={statBox}>
                  <span className={labelCls}>Memory Size</span>
                  <p className={valCls}>{regime.memorySize}</p>
                </div>
              </div>
            </section>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* 6. Confidence Calibration */}
          {calibration && (
            <section className={panel}>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-semibold text-white">Confidence Calibration</h2>
                <span className={`rounded-full px-2 py-px text-[9px] font-semibold ${
                  calibration.wellCalibrated
                    ? "bg-[#0d2818] text-[#4ade80] border border-[#4ade80]/30"
                    : "bg-[#2a2418] text-[#F5C542] border border-[#F5C542]/30"
                }`}>
                  {calibration.wellCalibrated ? "CALIBRATED" : "UNCALIBRATED"}
                </span>
              </div>
              <p className="text-[11px] text-[#6B6F76] mb-2">Last calibrated: {fmtTs(calibration.lastCalibrated)}</p>
              {calibration.bands.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[10px] text-[#6B6F76] uppercase">
                        <th className="pb-1.5 text-left">Range</th>
                        <th className="pb-1.5 text-right">Predicted</th>
                        <th className="pb-1.5 text-right">Actual</th>
                        <th className="pb-1.5 text-right">Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {calibration.bands.map((b, i) => (
                        <tr key={i} className="border-t border-white/5">
                          <td className="py-1.5 text-white">{b.range}</td>
                          <td className="py-1.5 text-right">{fmtPct(b.predicted)}</td>
                          <td className="py-1.5 text-right">{fmtPct(b.actual)}</td>
                          <td className="py-1.5 text-right text-[#6B6F76]">{b.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-[#6B6F76]">No calibration data yet.</p>
              )}
            </section>
          )}

          {/* 7. Throttle & Feature Weights */}
          <section className={panel}>
            {/* Throttle */}
            {throttle && (
              <div className="mb-4">
                <h2 className="text-sm font-semibold text-white mb-3">Self-Throttle Engine</h2>
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className={statBox}>
                    <span className={labelCls}>Global Throttle</span>
                    <p className={`text-sm font-semibold ${throttle.globalThrottle > 0 ? "text-[#F5C542]" : "text-[#4ade80]"}`}>
                      {throttle.globalThrottle}
                    </p>
                  </div>
                  <div className={statBox}>
                    <span className={labelCls}>Score Boost</span>
                    <p className={valCls}>{throttle.scoreBoost}</p>
                  </div>
                  <div className={statBox}>
                    <span className={labelCls}>Disabled Modes</span>
                    <p className={valCls}>{throttle.disabledModes.length > 0 ? throttle.disabledModes.join(", ") : "None"}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Feature Weights */}
            {weights && (
              <div>
                <h2 className="text-sm font-semibold text-white mb-2">Feature Weights</h2>
                <p className="text-[11px] text-[#6B6F76] mb-2">Last tuned: {fmtTs(weights.lastTuned)}</p>
                {weights.weights.length > 0 ? (
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {weights.weights.map((w, i) => (
                      <div key={i} className="flex items-center justify-between rounded border border-white/5 bg-[#0F1012] px-2.5 py-1.5">
                        <span className="text-[11px] text-[#BFC2C7]">{w.feature}</span>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 rounded-full bg-white/10 overflow-hidden">
                            <div className="h-full rounded-full bg-[#F5C542]" style={{ width: `${Math.min(100, Math.abs(w.weight) * 100)}%` }} />
                          </div>
                          <span className="text-[11px] font-medium text-white w-10 text-right">{w.weight.toFixed(3)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[#6B6F76]">No weights available yet.</p>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
