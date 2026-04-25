"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

import { Card } from "@/components/ui/card";
import { getSystemHealth } from "@/lib/admin-client";
import { cn } from "@/lib/utils";
import type { SystemHealth } from "@/types/admin";

import { MetricCard, SectionTitle, fmtDate } from "./shared";

const QUEUE_TONES: Record<string, string> = {
  pending: "bg-amber-50 border-amber-200 text-amber-700",
  uploaded: "bg-blue-50 border-blue-200 text-blue-700",
  processing: "bg-accent/10 border-accent/30 text-accent",
  failed: "bg-red/5 border-red/20 text-red",
};

export function SystemTab({ accessToken }: { accessToken: string }) {
  const t = useTranslations();
  const [data, setData] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const r = await getSystemHealth(accessToken);
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
    return (
      <p className="rounded-xl border border-red/20 bg-red/5 p-4 text-sm text-red">
        {error || t("Could not load system health")}
      </p>
    );
  }

  const queue = data.document_queue;
  const queueTotal = queue.pending + queue.uploaded + queue.processing + queue.failed;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard label={t("Total users")} value={data.total_users} tone="accent" />
        <MetricCard label={t("Total cases")} value={data.total_cases} />
        <MetricCard label={t("Total documents")} value={data.total_documents} />
      </div>

      <Card className="p-6">
        <div className="flex items-baseline justify-between">
          <SectionTitle count={queueTotal}>{t("Document processing queue")}</SectionTitle>
          <span className="text-[11px] text-muted">{t("Updated")} {fmtDate(data.generated_at)}</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(["pending", "uploaded", "processing", "failed"] as const).map((k) => (
            <div
              key={k}
              className={cn(
                "rounded-xl border p-4",
                QUEUE_TONES[k] ?? "bg-canvas border-line text-ink",
              )}
            >
              <p className="text-xs font-semibold uppercase tracking-widest opacity-70">{t(k)}</p>
              <p className="mt-1 text-2xl font-bold">{queue[k]}</p>
            </div>
          ))}
        </div>
        {queue.failed > 0 ? (
          <p className="mt-4 rounded-lg border border-red/20 bg-red/5 px-3 py-2 text-xs text-red">
            {queue.failed} {queue.failed === 1 ? t("document") : t("documents")} {t("failed processing — investigate worker logs")}
          </p>
        ) : null}
      </Card>
    </div>
  );
}
