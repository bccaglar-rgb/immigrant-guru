import type { DashboardRecommendedPathwayCard } from "@/types/dashboard";

import { DashboardCommandCard } from "@/components/dashboard/dashboard-command-card";
import { DashboardStatusPill } from "@/components/dashboard/dashboard-status-pill";

type DashboardRecommendedPathwayCardProps = Readonly<{
  data: DashboardRecommendedPathwayCard;
}>;

export function DashboardRecommendedPathwayCard({
  data
}: DashboardRecommendedPathwayCardProps) {
  return (
    <DashboardCommandCard
      eyebrow="Recommended pathway"
      title={data.pathway || "Pathway not established yet"}
      value={
        <DashboardStatusPill
          label={data.confidence || "Pending"}
          tone={data.confidence === "HIGH" ? "positive" : data.confidence === "MEDIUM" ? "warning" : "neutral"}
        />
      }
    >
      <div className="rounded-[24px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(241,245,249,0.68),rgba(255,255,255,0.92))] px-5 py-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          Destination
        </p>
        <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
          {data.country || "Target country pending"}
        </p>
        <p className="mt-4 text-sm leading-6 text-slate-600">{data.rationale}</p>
      </div>
    </DashboardCommandCard>
  );
}
