import { useEffect, useState } from "react";
import { getAuthToken } from "../services/authClient";

const STATUSES = ["all","open","in_progress","waiting_info","resolved","closed","reopened"];
const SEVERITIES = ["all","low","medium","high","critical"];
const MODULES = ["all","quant-engine","trade-ideas","ai-trade-ideas","ai-trader","exchanges","crypto-market","coin-universe","super-charts","indicators","bitrium-token","pricing","payments","auth","admin","system"];

const req = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAuthToken()}`, ...(init?.headers ?? {}) } });
  const body = await res.json();
  if (!res.ok || !body.ok) throw new Error(body.error ?? "failed");
  return body as T;
};

const sevColor = (s: string) => {
  if (s === "critical") return "text-red-500 bg-red-500/10";
  if (s === "high") return "text-orange-400 bg-orange-400/10";
  if (s === "medium") return "text-yellow-400 bg-yellow-400/10";
  return "text-[#6B6F76] bg-white/5";
};
const statColor = (s: string) => {
  if (s === "open") return "text-[#F5C542] bg-[#F5C542]/10";
  if (s === "in_progress") return "text-blue-400 bg-blue-400/10";
  if (s === "resolved" || s === "closed") return "text-[#4caf50] bg-[#4caf50]/10";
  if (s === "reopened") return "text-red-400 bg-red-400/10";
  return "text-[#6B6F76] bg-white/5";
};

export function BugReportsPanel() {
  const [stats, setStats] = useState<any>({});
  const [bugs, setBugs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ status: "all", severity: "all", module: "all", search: "" });
  const [selected, setSelected] = useState<any>(null);
  const [notes, setNotes] = useState<any[]>([]);
  const [newNote, setNewNote] = useState("");
  const [updating, setUpdating] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (filters.status !== "all") params.set("status", filters.status);
      if (filters.severity !== "all") params.set("severity", filters.severity);
      if (filters.module !== "all") params.set("module", filters.module);
      if (filters.search) params.set("search", filters.search);

      const [statsRes, bugsRes] = await Promise.all([
        req<{ ok: true; stats: any }>("/api/admin/bug-reports/stats"),
        req<{ ok: true; bugs: any[] }>(`/api/admin/bug-reports?${params}`),
      ]);
      setStats(statsRes.stats ?? {});
      setBugs(bugsRes.bugs ?? []);
      setError("");
    } catch (err: any) {
      setError(err?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const openDetail = async (bug: any) => {
    setSelected(bug);
    try {
      const res = await req<{ ok: true; bug: any; notes: any[] }>(`/api/admin/bug-reports/${bug.id}`);
      setSelected(res.bug);
      setNotes(res.notes ?? []);
    } catch { /* keep basic info */ }
  };

  const updateBug = async (field: string, value: string) => {
    if (!selected) return;
    setUpdating(true);
    try {
      await req(`/api/admin/bug-reports/${selected.id}`, { method: "PATCH", body: JSON.stringify({ [field]: value }) });
      setSelected((p: any) => ({ ...p, [field]: value }));
      void refresh();
    } catch { /* ignore */ }
    finally { setUpdating(false); }
  };

  const addNote = async () => {
    if (!selected || !newNote.trim()) return;
    await req(`/api/admin/bug-reports/${selected.id}/notes`, { method: "POST", body: JSON.stringify({ note: newNote }) });
    setNewNote("");
    void openDetail(selected);
  };

  return (
    <div className="space-y-4">
      {/* KPI */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Open", value: stats.open ?? 0, color: "text-[#F5C542]" },
          { label: "Critical", value: stats.critical ?? 0, color: "text-red-500" },
          { label: "In Progress", value: stats.in_progress ?? 0, color: "text-blue-400" },
          { label: "Resolved (7d)", value: stats.resolved_week ?? 0, color: "text-[#4caf50]" },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border border-white/10 bg-[#0F1012] p-3">
            <p className="text-[10px] uppercase tracking-wider text-[#6B6F76]">{k.label}</p>
            <p className={`mt-1 text-2xl font-semibold ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <select value={filters.status} onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))} className="rounded-lg border border-white/10 bg-[#0F1012] px-2 py-1.5 text-xs text-white">
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filters.severity} onChange={(e) => setFilters((p) => ({ ...p, severity: e.target.value }))} className="rounded-lg border border-white/10 bg-[#0F1012] px-2 py-1.5 text-xs text-white">
          {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filters.module} onChange={(e) => setFilters((p) => ({ ...p, module: e.target.value }))} className="rounded-lg border border-white/10 bg-[#0F1012] px-2 py-1.5 text-xs text-white">
          {MODULES.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <input type="text" placeholder="Search..." value={filters.search} onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))} className="rounded-lg border border-white/10 bg-[#0F1012] px-3 py-1.5 text-xs text-white outline-none placeholder:text-[#6B6F76] w-40" />
        <button type="button" onClick={() => void refresh()} className="rounded-lg border border-white/10 bg-[#121316] px-3 py-1.5 text-xs text-[#BFC2C7] hover:text-white">Filter</button>
      </div>

      {loading && <p className="text-xs text-[#6B6F76]">Loading...</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* Bug Table */}
      <div className="max-h-[400px] overflow-auto rounded-xl border border-white/10 bg-[#0F1012]">
        <table className="min-w-full text-left text-[11px]">
          <thead className="sticky top-0 bg-[#13151a] text-[#8e94a0]">
            <tr>
              <th className="px-2 py-2 font-medium">ID</th>
              <th className="px-2 py-2 font-medium">Title</th>
              <th className="px-2 py-2 font-medium">Module</th>
              <th className="px-2 py-2 font-medium">Severity</th>
              <th className="px-2 py-2 font-medium">Status</th>
              <th className="px-2 py-2 font-medium">Source</th>
              <th className="px-2 py-2 font-medium">Date</th>
            </tr>
          </thead>
          <tbody>
            {bugs.map((bug) => (
              <tr key={bug.id} onClick={() => void openDetail(bug)} className="cursor-pointer border-t border-white/5 text-[#d7dae0] hover:bg-white/5">
                <td className="px-2 py-1.5 font-mono text-[10px]">{bug.id?.slice(0, 12)}</td>
                <td className="px-2 py-1.5 max-w-[250px] truncate">{bug.title}</td>
                <td className="px-2 py-1.5">{bug.module}</td>
                <td className="px-2 py-1.5"><span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${sevColor(bug.severity)}`}>{bug.severity}</span></td>
                <td className="px-2 py-1.5"><span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${statColor(bug.status)}`}>{bug.status}</span></td>
                <td className="px-2 py-1.5">{bug.source}</td>
                <td className="px-2 py-1.5 text-[#6B6F76]">{new Date(bug.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {!loading && !bugs.length && <tr><td colSpan={7} className="px-3 py-6 text-center text-[#6B6F76]">No bug reports.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Bug Detail */}
      {selected && (
        <div className="rounded-xl border border-[#F5C542]/30 bg-[#1a1a0f] p-4 text-xs">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-semibold text-[#F5C542]">{selected.title}</p>
            <button type="button" onClick={() => setSelected(null)} className="text-[#6B6F76] hover:text-white">Close</button>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <p><span className="text-[#6B6F76]">Module:</span> {selected.module}</p>
            <p><span className="text-[#6B6F76]">Page:</span> {selected.page_url ?? "-"}</p>
            <p><span className="text-[#6B6F76]">Reporter:</span> {selected.reported_by?.slice(0, 12) ?? "-"}</p>
            <p><span className="text-[#6B6F76]">Browser:</span> {selected.browser_info ?? "-"}</p>
            <div className="flex items-center gap-2">
              <span className="text-[#6B6F76]">Status:</span>
              <select value={selected.status} onChange={(e) => void updateBug("status", e.target.value)} disabled={updating} className="rounded border border-white/10 bg-[#0F1012] px-1.5 py-0.5 text-xs text-white">
                {STATUSES.filter((s) => s !== "all").map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[#6B6F76]">Severity:</span>
              <select value={selected.severity} onChange={(e) => void updateBug("severity", e.target.value)} disabled={updating} className="rounded border border-white/10 bg-[#0F1012] px-1.5 py-0.5 text-xs text-white">
                {SEVERITIES.filter((s) => s !== "all").map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          {selected.description && <p className="mt-2 text-[#9ba3b4]">{selected.description}</p>}

          {/* Notes */}
          <div className="mt-3 border-t border-white/10 pt-3">
            <p className="mb-2 text-[10px] font-semibold uppercase text-[#6B6F76]">Activity</p>
            {notes.map((n) => (
              <div key={n.id} className="mb-1 rounded bg-black/20 p-2 text-[10px]">
                <span className="text-[#6B6F76]">{new Date(n.created_at).toLocaleString()}</span>
                {n.action && <span className="ml-2 text-[#F5C542]">[{n.action}]</span>}
                <span className="ml-2 text-[#d7dae0]">{n.note}</span>
              </div>
            ))}
            <div className="mt-2 flex gap-2">
              <input type="text" value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="Add note..." className="flex-1 rounded border border-white/10 bg-[#0F1012] px-2 py-1 text-xs text-white outline-none" />
              <button type="button" onClick={() => void addNote()} className="rounded bg-[#F5C542]/20 px-2 py-1 text-[10px] text-[#F5C542] hover:bg-[#F5C542]/30">Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
