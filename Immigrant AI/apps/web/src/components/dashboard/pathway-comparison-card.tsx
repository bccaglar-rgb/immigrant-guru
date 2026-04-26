"use client";

import { useTranslations } from "next-intl";

import { DashboardStatusPill } from "@/components/dashboard/dashboard-status-pill";
import { Card } from "@/components/ui/card";
import type { CountryComparisonOption } from "@/types/country-comparison";

type PathwayComparisonCardProps = Readonly<{
  option: CountryComparisonOption;
}>;

function formatLevel(value: CountryComparisonOption["costLevel"]) {
  return value.toUpperCase();
}

function difficultyTone(
  value: CountryComparisonOption["difficulty"]
): "neutral" | "warning" | "critical" {
  if (value === "high") {
    return "critical";
  }
  if (value === "medium") {
    return "warning";
  }
  return "neutral";
}

export function PathwayComparisonCard({
  option
}: PathwayComparisonCardProps) {
  const t = useTranslations();

  return (
    <Card className="rounded-[30px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.88))] p-6 shadow-[0_22px_60px_rgba(15,23,42,0.07)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-accent">
            {option.country}
          </p>
          <h3 className="mt-2 text-xl font-semibold tracking-tight text-ink">
            {option.pathway}
          </h3>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {option.recommended ? (
            <DashboardStatusPill label={t("Best fit")} tone="positive" />
          ) : null}
          <DashboardStatusPill
            label={`${option.successProbability}/100`}
            tone={option.successProbability >= 65 ? "positive" : "warning"}
          />
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-[22px] bg-slate-50/90 px-4 py-4">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted">
            {t("Estimated time")}
          </p>
          <p className="mt-2 text-sm font-semibold text-ink">
            {option.estimatedTime}
          </p>
        </div>
        <div className="rounded-[22px] bg-slate-50/90 px-4 py-4">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted">
            {t("Cost level")}
          </p>
          <p className="mt-2 text-sm font-semibold text-ink">
            {formatLevel(option.costLevel)}
          </p>
        </div>
        <div className="rounded-[22px] bg-slate-50/90 px-4 py-4">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted">
            {t("Difficulty")}
          </p>
          <div className="mt-2">
            <DashboardStatusPill
              label={formatLevel(option.difficulty)}
              tone={difficultyTone(option.difficulty)}
            />
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-[24px] border border-emerald-200/80 bg-emerald-50/65 px-4 py-4">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-emerald-700">
            {t("Key advantages")}
          </p>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-emerald-950">
            {option.keyAdvantages.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-[24px] border border-amber-200/80 bg-amber-50/65 px-4 py-4">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-amber-700">
            {t("Key disadvantages")}
          </p>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-amber-950">
            {option.keyDisadvantages.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}
