import type { DashboardTimelinePreviewCard } from "@/types/dashboard";

import { DashboardCommandCard } from "@/components/dashboard/dashboard-command-card";

type DashboardTimelinePreviewCardProps = Readonly<{
  data: DashboardTimelinePreviewCard;
}>;

export function DashboardTimelinePreviewCard({
  data
}: DashboardTimelinePreviewCardProps) {
  return (
    <DashboardCommandCard
      eyebrow="Timeline preview"
      title={data.nextStep || "Timeline planning pending"}
      value={
        <div>
          <p className="text-4xl font-semibold tracking-[-0.04em] text-ink">
            {data.totalEstimatedDurationMonths === null
              ? "--"
              : data.totalEstimatedDurationMonths.toFixed(1)}
          </p>
          <p className="mt-1 text-xs font-medium uppercase tracking-[0.08em] text-muted">
            months
          </p>
        </div>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-2xl bg-slate-50/80 px-4 py-4">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted">
            Immediate phase
          </p>
          <p className="mt-2 text-sm font-semibold text-ink">
            {data.nextStep || "Open a case workspace to estimate the next stage."}
          </p>
          <p className="mt-2 text-sm leading-6 text-muted">
            {data.nextStepDurationMonths === null
              ? "A step duration will appear once the active case has enough pathway context."
              : `Expected preparation time: ${data.nextStepDurationMonths.toFixed(1)} months.`}
          </p>
        </div>
        <div className="rounded-2xl bg-blue-50/80 px-4 py-4">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-accent">
            Acceleration tip
          </p>
          <p className="mt-2 text-sm leading-6 text-muted">
            {data.accelerationTips[0] ||
              "Parallelize profile cleanup and document collection to shorten the first preparation phase."}
          </p>
        </div>
      </div>
      <div className="mt-4 rounded-2xl border border-amber-200/80 bg-amber-50/70 px-4 py-4">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-amber-700">
          Delay risk
        </p>
        <p className="mt-2 text-sm leading-6 text-muted">
          {data.delayRisks[0] ||
            "No elevated delay signal is surfaced yet, but timeline precision improves with stronger case data."}
        </p>
      </div>
    </DashboardCommandCard>
  );
}
