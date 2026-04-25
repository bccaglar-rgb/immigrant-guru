"use client";

import { useTranslations } from "next-intl";

import { DashboardStatusPill } from "@/components/dashboard/dashboard-status-pill";
import { Card } from "@/components/ui/card";
import type { CountryComparisonOption } from "@/types/country-comparison";

type BestOptionBannerProps = Readonly<{
  option: CountryComparisonOption | null;
  reasoning: string;
}>;

export function BestOptionBanner({
  option,
  reasoning
}: BestOptionBannerProps) {
  const t = useTranslations();

  if (!option) {
    return (
      <Card className="rounded-[32px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.88))] p-6 shadow-[0_22px_60px_rgba(15,23,42,0.07)] md:p-7">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          {t("Best option")}
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
          {t("No comparison lead yet")}
        </h2>
        <p className="mt-3 text-sm leading-7 text-slate-600">
          {t("Add at least one meaningful country-pathway scenario to surface a leading option")}
        </p>
      </Card>
    );
  }

  return (
    <Card className="rounded-[32px] border border-blue-100/80 bg-[linear-gradient(135deg,rgba(239,246,255,0.96),rgba(248,250,252,0.92))] p-6 shadow-[0_26px_70px_rgba(37,99,235,0.08)] md:p-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-700">
            {t("Best option")}
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            {option.country} · {option.pathway}
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-700">
            {reasoning}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <DashboardStatusPill label={t("Lead scenario")} tone="accent" />
          <DashboardStatusPill
            label={`${option.successProbability}/100 ${t("probability")}`}
            tone="positive"
          />
        </div>
      </div>
    </Card>
  );
}
