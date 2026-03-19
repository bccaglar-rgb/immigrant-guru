import { useEffect, useState } from "react";
import { getAuthToken } from "../services/authClient";

const MODULES = ["all","quant-engine","trade-ideas","ai-trade-ideas","ai-trader","exchanges","crypto-market","coin-universe","super-charts","indicators","bitrium-token","pricing","payments","auth","admin","system"];
const LEVELS = ["all","info","warn","error","critical"];

const req = async <T,>(path: string): Promise<T> => {
  const res = await fetch(path, { headers: { Authorization: `Bearer ${getAuthToken()}` } });
  const body = await res.json();
  if (!res.ok || !body.ok) throw new Error(body.error ?? "failed");
  return body as T;
};

const levelColor = (l: string) => {
  if (l === "critical") return "text-red-500 bg-red-500/10";
  if (l === "error") return "text-red-400 bg-red-400/10";
  if (l === "warn" || l === "warning") return "text-yellow-400 bg-yellow-400/10";
  return "text-[#6B6F76] bg-white/5";
};

export function LogsPanel() {
  const [stats, setStats] = useState<any>({});
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ level: "all", module: "all", search: "" });
  const [selected, setSelected] = useState<any>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (filters.level !== "all") params.set("level", filters.level);
      if (filters.module !== "all") params.set("module", filters.module);
      if (filters.search) params.set("search", filters.search);

      const [statsRes, logsRes] = await Promise.all([
        req<{ ok: true; stats: any }>("/api/admin/logs/stats"),
        req<{ ok: true; logs: any[] }>(`/api/admin/logs?${params}`),
      ]);
      setStats(statsRes.stats ?? {});
      setLogs(logsRes.logs ?? []);
      setError("");
    } catch (err: any) {
      setError(err?.message ?? "Failed to load logs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const applyFilters = () => void refresh();

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Errors (24h)", value: stats.errors ?? 0, color: "text-red-400" },
          { label: "Warnings (24h)", value: stats.warnings ?? 0, color: "text-yellow-400" },
          { label: "Critical (24h)", value: stats.critical ?? 0, color: "text-red-500" },
          { label: "Total (24h)", value: stats.total ?? 0, color: "text-white" },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-xl border border-white/10 bg-[#0F1012] p-3">
            <p className="text-[10px] uppercase tracking-wider text-[#6B6F76]">{kpi.label}</p>
            <p className={`mt-1 text-2xl font-semibold ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <select value={filters.level} onChange={(e) => setFilters((p) => ({ ...p, level: e.target.value }))} className="rounded-lg border border-white/10 bg-[#0F1012] px-2 py-1.5 text-xs text-white">
          {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <select value={filters.module} onChange={(e) => setFilters((p) => ({ ...p, module: e.target.value }))} className="rounded-lg border border-white/10 bg-[#0F1012] px-2 py-1.5 text-xs text-white">
          {MODULES.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <input type="text" placeholder="Search message..." value={filters.search} onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))} className="rounded-lg border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none placeholder:text-[#6B6F76] w-48" />
        <button type="button" onClick={applyFilters} className="rounded-lg border border-white/10 bg-[#121316] px-3 py-1.5 text-xs text-[#BFC2C7] hover:text-white">Filter</button>
        <button type="button" onClick={() => { setFilters({ level: "all", module: "all", search: "" }); void refresh(); }} className="rounded-lg border border-white/10 bg-[#121316] px-3 py-1.5 text-xs text-[#6B6F76] hover:text-white">Clear</button>
      </div>

      {loading && <p className="text-xs text-[#6B6F76]">Loading...</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* Log Table */}
      <div className="max-h-[500px] overflow-auto rounded-xl border border-white/10 bg-[#0F1012]">
        <table className="min-w-full text-left text-[11px]">
          <thead className="sticky top-0 bg-[#13151a] text-[#8e94a0]">
            <tr>
              <th className="px-2 py-2 font-medium">Time</th>
              <th className="px-2 py-2 font-medium">Level</th>
              <th className="px-2 py-2 font-medium">Module</th>
              <th className="px-2 py-2 font-medium">Event</th>
              <th className="px-2 py-2 font-medium">Message</th>
              <th className="px-2 py-2 font-medium">User</th>
              <th className="px-2 py-2 font-medium">Ref</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} onClick={() => setSelected(log)} className="cursor-pointer border-t border-white/5 text-[#d7dae0] hover:bg-white/5">
                <td className="px-2 py-1.5 text-[#6B6F76]">{new Date(log.timestamp).toLocaleTimeString()}</td>
                <td className="px-2 py-1.5"><span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${levelColor(log.level)}`}>{log.level}</span></td>
                <td className="px-2 py-1.5">{log.module}</td>
                <td className="px-2 py-1.5">{log.event_type}</td>
                <td className="px-2 py-1.5 max-w-[300px] truncate">{log.message}</td>
                <td className="px-2 py-1.5 font-mono text-[10px]">{log.user_id?.slice(0, 12) ?? "-"}</td>
                <td className="px-2 py-1.5 font-mono text-[10px]">{log.invoice_id?.slice(0, 12) || log.tx_hash?.slice(0, 12) || "-"}</td>
              </tr>
            ))}
            {!loading && !logs.length && <tr><td colSpan={7} className="px-3 py-6 text-center text-[#6B6F76]">No logs found.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Detail Drawer */}
      {selected && (
        <div className="rounded-xl border border-[#F5C542]/30 bg-[#1a1a0f] p-4 text-xs">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-semibold text-[#F5C542]">Log Detail</p>
            <button type="button" onClick={() => setSelected(null)} className="text-[#6B6F76] hover:text-white">Close</button>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <p><span className="text-[#6B6F76]">Time:</span> {new Date(selected.timestamp).toLocaleString()}</p>
            <p><span className="text-[#6B6F76]">Level:</span> {selected.level}</p>
            <p><span className="text-[#6B6F76]">Module:</span> {selected.module}</p>
            <p><span className="text-[#6B6F76]">Event:</span> {selected.event_type}</p>
            <p><span className="text-[#6B6F76]">User:</span> {selected.user_id ?? "-"}</p>
            <p><span className="text-[#6B6F76]">Route:</span> {selected.route ?? "-"}</p>
            <p><span className="text-[#6B6F76]">Invoice:</span> {selected.invoice_id ?? "-"}</p>
            <p><span className="text-[#6B6F76]">Tx Hash:</span> {selected.tx_hash ?? "-"}</p>
          </div>
          <p className="mt-2"><span className="text-[#6B6F76]">Message:</span> {selected.message}</p>
          {selected.stack_trace && <pre className="mt-2 max-h-32 overflow-auto rounded bg-black/30 p-2 text-[10px] text-red-300">{selected.stack_trace}</pre>}
          {selected.metadata && <pre className="mt-2 max-h-32 overflow-auto rounded bg-black/30 p-2 text-[10px] text-[#9ba3b4]">{JSON.stringify(selected.metadata, null, 2)}</pre>}
        </div>
      )}
    </div>
  );
}
