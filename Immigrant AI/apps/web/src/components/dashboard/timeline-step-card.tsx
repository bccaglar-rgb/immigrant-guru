import { DashboardStatusPill } from "@/components/dashboard/dashboard-status-pill";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ImmigrationTimelineStep } from "@/types/timeline";

type TimelineStepCardProps = Readonly<{
  isLast: boolean;
  step: ImmigrationTimelineStep;
}>;

const statusNodeTone: Record<ImmigrationTimelineStep["status"], string> = {
  blocked: "bg-rose-500 ring-rose-100",
  completed: "bg-emerald-500 ring-emerald-100",
  current: "bg-blue-600 ring-blue-100",
  pending: "bg-slate-300 ring-slate-100"
};

const statusCardTone: Record<ImmigrationTimelineStep["status"], string> = {
  blocked: "border-rose-200/80 bg-rose-50/55",
  completed: "border-emerald-200/80 bg-emerald-50/45",
  current: "border-blue-200/80 bg-blue-50/55",
  pending: "border-slate-200/80 bg-slate-50/75"
};

const statusLabelMap: Record<ImmigrationTimelineStep["status"], string> = {
  blocked: "Blocked",
  completed: "Completed",
  current: "Current",
  pending: "Pending"
};

function riskToneToPillTone(
  tone: NonNullable<ImmigrationTimelineStep["riskBadges"]>[number]["tone"]
): "neutral" | "warning" | "critical" {
  return tone;
}

export function TimelineStepCard({ isLast, step }: TimelineStepCardProps) {
  return (
    <div className="grid grid-cols-[auto_1fr] gap-4">
      <div className="flex flex-col items-center">
        <div
          className={cn(
            "h-4 w-4 rounded-full ring-4",
            statusNodeTone[step.status]
          )}
        />
        {!isLast ? <div className="mt-2 h-full w-px bg-slate-200" /> : null}
      </div>

      <Card
        className={cn(
          "rounded-[26px] border p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)] hover:shadow-[0_18px_48px_rgba(15,23,42,0.08)]",
          statusCardTone[step.status]
        )}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <DashboardStatusPill
                label={statusLabelMap[step.status]}
                tone={
                  step.status === "completed"
                    ? "positive"
                    : step.status === "current"
                      ? "accent"
                      : step.status === "blocked"
                        ? "critical"
                        : "neutral"
                }
              />
              {step.milestone ? (
                <span className="inline-flex rounded-full bg-white/80 px-3 py-1 text-xs font-medium uppercase tracking-[0.08em] text-muted ring-1 ring-inset ring-slate-200">
                  Milestone · {step.milestone}
                </span>
              ) : null}
            </div>

            <h3 className="mt-4 text-lg font-semibold tracking-tight text-ink">
              {step.stepName}
            </h3>
            <p className="mt-3 text-sm leading-7 text-muted">
              {step.description}
            </p>
          </div>

          <div className="rounded-[20px] bg-white/80 px-4 py-3 ring-1 ring-inset ring-slate-200/80">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted">
              Estimated duration
            </p>
            <p className="mt-2 text-sm font-semibold text-ink">
              {step.estimatedDuration}
            </p>
          </div>
        </div>

        {step.riskBadges && step.riskBadges.length > 0 ? (
          <div className="mt-5 flex flex-wrap gap-2">
            {step.riskBadges.map((badge) => (
              <DashboardStatusPill
                key={badge.id}
                label={badge.label}
                tone={riskToneToPillTone(badge.tone)}
              />
            ))}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
