"use client";

import { useCallback, useEffect, useState } from "react";

import { Card } from "@/components/ui/card";
import { getCaseAnalytics } from "@/lib/admin-client";
import { cn } from "@/lib/utils";
import type { CaseAnalytics } from "@/types/admin";

import { EmptyState, MetricCard, STATUS_COLORS, SectionTitle, fmtDate } from "./shared";

export function CasesTab({ accessToken }: { accessToken: string }) {
  const [data, setData] = useState<CaseAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const r = await getCaseAnalytics(accessToken);
    if (r.ok) setData(r.data);
    else setError(r.errorMessage);
    setLoading(false);
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="h-24 animate-pulse p-5" />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return <p className="rounded-xl border border-red/20 bg-red/5 p-4 text-sm text-red">{error || "Could not load cases."}</p>;
  }

  const completionRate = data.total_cases > 0 ? Math.round((data.active_cases / data.total_cases) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard label="Total cases" value={data.total_cases} />
        <MetricCard label="Active" value={data.active_cases} sub={`${completionRate}% of total`} tone="good" />
        <MetricCard label="Statuses" value={data.by_status.length} sub="Distinct states in use" />
      </div>

      {data.by_status.length > 0 ? (
        <Card className="p-6">
          <SectionTitle>By status</SectionTitle>
          <div className="mt-4 flex flex-wrap gap-2">
            {data.by_status.map((s) => (
              <div
                key={s.status}
                className={cn(
                  "flex items-baseline gap-2 rounded-xl border px-4 py-2.5",
                  STATUS_COLORS[s.status] ?? "bg-canvas border-line text-ink",
                )}
              >
                <p className="text-lg font-bold">{s.count}</p>
                <p className="text-xs font-semibold capitalize">{s.status.replace(/_/g, " ")}</p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card className="overflow-hidden p-0">
        <div className="border-b border-line px-6 py-4">
          <SectionTitle count={data.recent.length}>Recent cases</SectionTitle>
        </div>
        {data.recent.length === 0 ? (
          <EmptyState>No cases yet.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-canvas/50">
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-widest text-muted">Case</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-widest text-muted">User</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-widest text-muted">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-widest text-muted">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.recent.map((c) => (
                  <tr key={c.id} className="transition-colors hover:bg-canvas/40">
                    <td className="px-6 py-3.5">
                      <p className="font-semibold text-ink">{c.title ?? "—"}</p>
                      <p className="mt-0.5 font-mono text-[10px] text-muted">{c.id.slice(0, 8)}</p>
                    </td>
                    <td className="px-6 py-3.5 text-muted">{c.user_email ?? "—"}</td>
                    <td className="px-6 py-3.5">
                      <span
                        className={cn(
                          "inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold capitalize",
                          STATUS_COLORS[c.status] ?? "bg-canvas border-line text-ink",
                        )}
                      >
                        {c.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-xs text-muted">{fmtDate(c.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
