import { useState } from "react";
import { getAuthToken } from "../../services/authClient";

interface TraceEvent {
  eventId: string;
  ts: string;
  type: string;
  scope: { userId: string; exchangeAccountId: string; runId: string };
  refs: { intentId: string; orderId: string };
  data: Record<string, unknown>;
}

const authFetch = async (url: string) => {
  const token = getAuthToken();
  return fetch(url, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
};

export const TradeTracePanel = () => {
  const [intentId, setIntentId] = useState("");
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    const id = intentId.trim();
    if (!id) return;
    setLoading(true);
    setError(null);
    setEvents([]);
    try {
      const res = await authFetch(`/api/exchange-core/trace/${encodeURIComponent(id)}`);
      const body = await res.json();
      if (!res.ok) { setError(body.message ?? body.error ?? `HTTP ${res.status}`); return; }
      setEvents(body.events ?? []);
      if (!body.events?.length) setError("No events found for this intent.");
    } catch (err: any) {
      setError(err?.message ?? "Fetch failed");
    } finally {
      setLoading(false);
    }
  };

  const typeColor = (type: string) => {
    if (type.includes("error") || type.includes("reject")) return "text-red-400";
    if (type.includes("cancel")) return "text-yellow-400";
    if (type.includes("update") || type.includes("fill")) return "text-green-400";
    if (type.includes("sent")) return "text-blue-400";
    return "text-[#BFC2C7]";
  };

  return (
    <section className="space-y-4">
      <h3 className="text-sm font-semibold text-white">Trade Trace Viewer</h3>

      <div className="flex gap-2">
        <input
          value={intentId}
          onChange={(e) => setIntentId(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void search()}
          placeholder="Enter Intent ID..."
          className="flex-1 rounded bg-[#121316] px-3 py-1.5 text-sm text-white border border-white/10"
        />
        <button type="button" disabled={loading} onClick={() => void search()} className="rounded bg-[#F5C542] px-4 py-1.5 text-xs font-semibold text-black hover:opacity-90 disabled:opacity-40">
          {loading ? "..." : "Trace"}
        </button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {events.length > 0 && (
        <div className="space-y-1">
          {events.map((evt, i) => (
            <div key={evt.eventId || i} className="flex items-start gap-3 rounded border border-white/5 bg-[#1a1b1e] px-3 py-2 text-xs">
              <span className="shrink-0 text-[#6B6F76] font-mono w-20">{new Date(evt.ts).toLocaleTimeString()}</span>
              <span className={`shrink-0 font-mono w-32 ${typeColor(evt.type)}`}>{evt.type}</span>
              <span className="text-[#BFC2C7] break-all">
                {Object.entries(evt.data).map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`).join(" | ")}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
