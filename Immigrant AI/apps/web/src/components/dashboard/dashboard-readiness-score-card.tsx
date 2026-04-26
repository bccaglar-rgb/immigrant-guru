"use client";

import { useTranslations } from "next-intl";

import type { DashboardReadinessScoreCard } from "@/types/dashboard";

import { DashboardCommandCard } from "@/components/dashboard/dashboard-command-card";
import { DashboardStatusPill } from "@/components/dashboard/dashboard-status-pill";

type DashboardReadinessScoreCardProps = Readonly<{
  data: DashboardReadinessScoreCard;
}>;

function formatScore(value: number | null) {
  return value === null ? "--" : `${Math.round(value)}`;
}

export function DashboardReadinessScoreCard({
  data
}: DashboardReadinessScoreCardProps) {
  const t = useTranslations();

  return (
    <DashboardCommandCard
      eyebrow={t("Readiness score")}
      title={data.label}
      value={
        <div>
          <p className="text-4xl font-semibold tracking-[-0.04em] text-slate-950">
            {formatScore(data.score)}
          </p>
          <p className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
            / 100
          </p>
        </div>
      }
    >
      <p className="text-sm leading-6 text-slate-600">{data.summary}</p>
      <div className="mt-5 space-y-3">
        {data.breakdown.map((item) => {
          const width = item.value === null ? 8 : Math.max(item.value, 8);

          return (
            <div key={item.label}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-slate-700">{item.label}</p>
                <DashboardStatusPill
                  label={item.value === null ? t("Pending") : `${Math.round(item.value)}`}
                  tone={item.value !== null && item.value >= 70 ? "positive" : "neutral"}
                />
              </div>
              <div className="mt-2 h-2.5 rounded-full bg-slate-100">
                <div
                  className="h-2.5 rounded-full bg-[linear-gradient(90deg,#0f172a,#2563eb)]"
                  style={{ width: `${width}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </DashboardCommandCard>
  );
}
