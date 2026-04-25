"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { DashboardCommandCard } from "@/components/dashboard/dashboard-command-card";
import { DashboardStatusPill } from "@/components/dashboard/dashboard-status-pill";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DashboardNextBestActionCard } from "@/types/dashboard";

type DashboardNextBestActionCardProps = Readonly<{
  data: DashboardNextBestActionCard;
}>;

function priorityTone(priority: string): "critical" | "warning" | "neutral" {
  if (priority.toLowerCase() === "immediate") {
    return "critical";
  }
  if (priority.toLowerCase() === "soon") {
    return "warning";
  }
  return "neutral";
}

export function DashboardNextBestActionCard({
  data
}: DashboardNextBestActionCardProps) {
  const t = useTranslations();

  return (
    <DashboardCommandCard
      eyebrow={t("Next best action")}
      title={data.title}
      value={<DashboardStatusPill label={data.priority} tone={priorityTone(data.priority)} />}
    >
      <p className="text-sm leading-6 text-slate-600">{data.reasoning}</p>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-slate-50/90 px-4 py-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            {t("Suggested timing")}
          </p>
          <p className="mt-2 text-sm font-semibold text-slate-950">
            {data.timingCategory}
          </p>
        </div>
        <Link
          className={cn(buttonVariants({ size: "md", variant: "primary" }), "shrink-0")}
          href={data.href}
        >
          {data.ctaLabel}
        </Link>
      </div>
    </DashboardCommandCard>
  );
}
