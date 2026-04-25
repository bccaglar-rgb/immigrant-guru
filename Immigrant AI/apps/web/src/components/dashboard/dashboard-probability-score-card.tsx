"use client";

import { useTranslations } from "next-intl";

import type { DashboardProbabilityScoreCard } from "@/types/dashboard";

import { DashboardCommandCard } from "@/components/dashboard/dashboard-command-card";
import { DashboardStatusPill } from "@/components/dashboard/dashboard-status-pill";

type DashboardProbabilityScoreCardProps = Readonly<{
  data: DashboardProbabilityScoreCard;
}>;

function getConfidenceTone(
  confidence: string | null
): "positive" | "warning" | "critical" | "neutral" {
  if (confidence === "HIGH") {
    return "positive";
  }
  if (confidence === "MEDIUM") {
    return "warning";
  }
  if (confidence === "LOW") {
    return "critical";
  }
  return "neutral";
}

export function DashboardProbabilityScoreCard({
  data
}: DashboardProbabilityScoreCardProps) {
  const t = useTranslations();

  return (
    <DashboardCommandCard
      eyebrow={t("Probability score")}
      title={t("Pathway success estimate")}
      value={
        <div className="space-y-2">
          <p className="text-4xl font-semibold tracking-[-0.04em] text-ink">
            {data.score === null ? "--" : Math.round(data.score)}
          </p>
          <DashboardStatusPill
            label={data.confidence || t("Pending")}
            tone={getConfidenceTone(data.confidence)}
          />
        </div>
      }
    >
      <p className="text-sm leading-6 text-muted">{data.summary}</p>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl bg-emerald-50/80 px-4 py-4">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-emerald-700">
            {t("Strength signals")}
          </p>
          <ul className="mt-3 space-y-2">
            {(data.strengths.length > 0
              ? data.strengths.slice(0, 2)
              : [t("A stronger probability view appears once a case is evaluated")]
            ).map((item) => (
              <li className="text-sm leading-6 text-emerald-950" key={item}>
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl bg-amber-50/80 px-4 py-4">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-amber-700">
            {t("Limiting factors")}
          </p>
          <ul className="mt-3 space-y-2">
            {(data.weaknesses.length > 0
              ? data.weaknesses.slice(0, 2)
              : [t("No major weaknesses are surfaced yet")]
            ).map((item) => (
              <li className="text-sm leading-6 text-amber-950" key={item}>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </DashboardCommandCard>
  );
}
