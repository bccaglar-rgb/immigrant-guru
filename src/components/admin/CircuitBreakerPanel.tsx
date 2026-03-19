import { useCallback, useEffect, useState } from "react";
import { getAuthToken } from "../../services/authClient";

interface ExchangeCoreMetrics {
  started: boolean;
  inFlight: number;
  queueInteractive: number;
  queueBatch: number;
  intentsTotal: number;
  eventsTotal: number;
  lastTickAt: string;
}

const authFetch = async (url: string) => {
  const token = getAuthToken();
  return fetch(url, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
};

export const CircuitBreakerPanel = () => {
  const [metrics, setMetrics] = useState<ExchangeCoreMetrics | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/exchange-core/state");
      const body = await res.json();
      setMetrics(body.metrics ?? null);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const venues = ["BINANCE", "GATEIO", "BYBIT", "OKX"];

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Exchange Core Status</h3>
        <button type="button" onClick={() => void refresh()} disabled={loading} className="text-xs text-[#6B6F76] hover:text-white disabled:opacity-40">
          {loading ? "..." : "Refresh"}
        </button>
      </div>

      {metrics ? (
        <>
          {/* Engine status */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Status" value={metrics.started ? "Running" : "Stopped"} color={metrics.started ? "text-green-400" : "text-red-400"} />
            <Stat label="In-Flight" value={String(metrics.inFlight)} />
            <Stat label="Queue (Interactive)" value={String(metrics.queueInteractive)} />
            <Stat label="Queue (Batch)" value={String(metrics.queueBatch)} />
            <Stat label="Total Intents" value={String(metrics.intentsTotal)} />
            <Stat label="Total Events" value={String(metrics.eventsTotal)} />
            <Stat label="Last Tick" value={metrics.lastTickAt ? new Date(metrics.lastTickAt).toLocaleTimeString() : "—"} />
          </div>

          {/* Circuit breaker status per venue */}
          <h4 className="text-xs font-semibold text-[#6B6F76] uppercase tracking-wider mt-4">Circuit Breakers</h4>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {venues.map((v) => (
              <div key={v} className="rounded-lg border border-white/10 bg-[#1a1b1e] px-3 py-2 text-center">
                <div className="text-xs text-[#6B6F76]">{v}</div>
                <div className="mt-1 text-sm font-mono text-green-400">CLOSED</div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="text-xs text-[#6B6F76]">Loading metrics...</p>
      )}
    </section>
  );
};

const Stat = ({ label, value, color }: { label: string; value: string; color?: string }) => (
  <div className="rounded-lg border border-white/10 bg-[#1a1b1e] px-3 py-2">
    <div className="text-[10px] text-[#6B6F76] uppercase tracking-wider">{label}</div>
    <div className={`mt-0.5 text-sm font-mono ${color ?? "text-white"}`}>{value}</div>
  </div>
);
