import { useCallback, useEffect, useState } from "react";
import { getAuthToken } from "../../services/authClient";

interface KillSwitchState {
  level: string;
  target: string;
  activatedBy: string;
  reason: string;
  activatedAt: string;
  auto: boolean;
}

const LEVELS = ["GLOBAL", "EXCHANGE", "USER", "SYMBOL", "AI_ONLY"] as const;

const authFetch = async (url: string, init?: RequestInit) => {
  const token = getAuthToken();
  return fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init?.headers } });
};

export const KillSwitchPanel = () => {
  const [states, setStates] = useState<KillSwitchState[]>([]);
  const [loading, setLoading] = useState(false);
  const [level, setLevel] = useState<string>("GLOBAL");
  const [target, setTarget] = useState("ALL");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await authFetch("/api/exchange-core/kill-switch/status");
      const body = await res.json();
      setStates(body.activeKillSwitches ?? []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const activate = async () => {
    if (!reason.trim()) { setError("Reason required."); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch("/api/exchange-core/kill-switch/activate", {
        method: "POST",
        body: JSON.stringify({ level, target: target.trim() || "ALL", reason: reason.trim() }),
      });
      if (!res.ok) {
        const body = await res.json();
        setError(body.message ?? body.error ?? `HTTP ${res.status}`);
      } else {
        setReason("");
        await refresh();
      }
    } catch (err: any) {
      setError(err?.message ?? "Failed");
    } finally {
      setLoading(false);
    }
  };

  const deactivate = async (ks: KillSwitchState) => {
    try {
      await authFetch("/api/exchange-core/kill-switch/deactivate", {
        method: "POST",
        body: JSON.stringify({ level: ks.level, target: ks.target }),
      });
      await refresh();
    } catch { /* ignore */ }
  };

  return (
    <section className="space-y-4">
      <h3 className="text-sm font-semibold text-white">Kill Switch Management</h3>

      {/* Active switches */}
      {states.length > 0 ? (
        <div className="space-y-2">
          {states.map((ks, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs">
              <div>
                <span className="font-mono text-red-400">{ks.level}:{ks.target}</span>
                <span className="ml-2 text-[#6B6F76]">{ks.reason}</span>
                <span className="ml-2 text-[#6B6F76]">by {ks.activatedBy}</span>
              </div>
              <button type="button" onClick={() => void deactivate(ks)} className="rounded border border-red-500/40 px-2 py-0.5 text-red-400 hover:bg-red-500/20">
                Deactivate
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-[#6B6F76]">No active kill switches.</p>
      )}

      {/* Activate form */}
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-white/10 bg-[#1a1b1e] p-3">
        <label className="flex flex-col gap-1 text-xs text-[#6B6F76]">
          Level
          <select value={level} onChange={(e) => setLevel(e.target.value)} className="rounded bg-[#121316] px-2 py-1 text-white border border-white/10">
            {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-[#6B6F76]">
          Target
          <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="ALL / BINANCE / user_id / BTCUSDT" className="rounded bg-[#121316] px-2 py-1 text-white border border-white/10 w-48" />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-xs text-[#6B6F76]">
          Reason
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why activate?" className="rounded bg-[#121316] px-2 py-1 text-white border border-white/10" />
        </label>
        <button type="button" disabled={loading} onClick={() => void activate()} className="rounded bg-red-600 px-3 py-1 text-xs text-white hover:bg-red-700 disabled:opacity-40">
          {loading ? "..." : "Activate"}
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </section>
  );
};
