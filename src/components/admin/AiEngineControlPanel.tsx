import { useCallback, useEffect, useState } from "react";
import { getAuthToken } from "../../services/authClient";

interface EngineHealth {
  aiEngine: { enabled: boolean; lastCycle: Record<string, unknown>; state: Record<string, unknown> | null };
  scanner: { running: boolean };
}

const authFetch = async (url: string, init?: RequestInit) => {
  const token = getAuthToken();
  return fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init?.headers } });
};

export const AiEngineControlPanel = () => {
  const [health, setHealth] = useState<EngineHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState("");

  const refresh = useCallback(async () => {
    try {
      const res = await authFetch("/api/ai-engine-v2/health");
      const body = await res.json();
      if (body.ok) setHealth(body);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const control = async (action: "start" | "stop") => {
    setLoading(true);
    setActionMsg("");
    try {
      const res = await authFetch("/api/ai-engine-v2/control", {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      const body = await res.json();
      setActionMsg(body.message ?? (body.ok ? "Done" : body.error));
      await refresh();
    } catch {
      setActionMsg("Network error");
    } finally {
      setLoading(false);
    }
  };

  const aiRunning = health?.aiEngine?.enabled ?? false;
  const scannerRunning = health?.scanner?.running ?? false;
  const anyRunning = aiRunning || scannerRunning;

  return (
    <section className="space-y-4">
      <h3 className="text-sm font-semibold text-white">AI Trade Engine Control</h3>

      <div className="grid grid-cols-2 gap-3">
        <div className={`rounded-lg border p-3 ${aiRunning ? "border-green-500/30 bg-green-500/10" : "border-white/10 bg-[#1a1b1e]"}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#6B6F76]">AI Trade Idea Engine</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${aiRunning ? "bg-green-500/20 text-green-400" : "bg-[#1a1b1e] text-[#6B6F76]"}`}>
              {aiRunning ? "RUNNING" : "STOPPED"}
            </span>
          </div>
        </div>
        <div className={`rounded-lg border p-3 ${scannerRunning ? "border-green-500/30 bg-green-500/10" : "border-white/10 bg-[#1a1b1e]"}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#6B6F76]">System Scanner</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${scannerRunning ? "bg-green-500/20 text-green-400" : "bg-[#1a1b1e] text-[#6B6F76]"}`}>
              {scannerRunning ? "RUNNING" : "STOPPED"}
            </span>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={loading || anyRunning}
          onClick={() => void control("start")}
          className="rounded bg-green-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-40"
        >
          {loading ? "..." : "Start All"}
        </button>
        <button
          type="button"
          disabled={loading || !anyRunning}
          onClick={() => void control("stop")}
          className="rounded bg-red-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-40"
        >
          {loading ? "..." : "Stop All"}
        </button>
      </div>

      {actionMsg && <p className="text-xs text-[#BFC2C7]">{actionMsg}</p>}
    </section>
  );
};
