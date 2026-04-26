"use client";

import { useTranslations } from "next-intl";

import type { DashboardDocumentStatusCard } from "@/types/dashboard";

import { DashboardCommandCard } from "@/components/dashboard/dashboard-command-card";

type DashboardDocumentStatusCardProps = Readonly<{
  data: DashboardDocumentStatusCard;
}>;

export function DashboardDocumentStatusCard({
  data
}: DashboardDocumentStatusCardProps) {
  const t = useTranslations();
  const width = data.readinessScore === null ? 8 : Math.max(data.readinessScore, 8);

  return (
    <DashboardCommandCard
      eyebrow={t("Document status")}
      title={t("Evidence coverage")}
      value={
        <div>
          <p className="text-4xl font-semibold tracking-[-0.04em] text-slate-950">
            {data.readinessScore === null ? "--" : Math.round(data.readinessScore)}
          </p>
          <p className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
            / 100
          </p>
        </div>
      }
    >
      <p className="text-sm leading-6 text-slate-600">{data.summary}</p>
      <div className="mt-4 h-2.5 rounded-full bg-slate-100">
        <div
          className="h-2.5 rounded-full bg-[linear-gradient(90deg,#0f172a,#2563eb)]"
          style={{ width: `${width}%` }}
        />
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[
          [t("Required items"), data.requiredItems],
          [t("Completed"), data.completedItems],
          [t("Missing required"), data.missingRequiredItems],
          [t("Processing"), data.processingItems],
          [t("Failed"), data.failedItems],
          [t("Total tracked"), data.totalItems]
        ].map(([label, value]) => (
          <div className="rounded-2xl bg-slate-50/90 px-4 py-4" key={label}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              {label}
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
              {value}
            </p>
          </div>
        ))}
      </div>
    </DashboardCommandCard>
  );
}
