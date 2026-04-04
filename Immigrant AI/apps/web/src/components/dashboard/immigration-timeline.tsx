import { Card } from "@/components/ui/card";
import type { ImmigrationTimelineData } from "@/types/timeline";

import { TimelineStepCard } from "@/components/dashboard/timeline-step-card";

type ImmigrationTimelineProps = Readonly<{
  timeline: ImmigrationTimelineData;
}>;

export function ImmigrationTimeline({
  timeline
}: ImmigrationTimelineProps) {
  return (
    <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
      <Card className="rounded-[30px] border border-white/80 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)] md:p-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-accent">
              {timeline.eyebrow || "Timeline"}
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
              {timeline.title}
            </h2>
          </div>
          {timeline.totalDuration ? (
            <div className="rounded-[22px] bg-slate-50/90 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted">
                Expected horizon
              </p>
              <p className="mt-2 text-sm font-semibold text-ink">
                {timeline.totalDuration}
              </p>
            </div>
          ) : null}
        </div>

        <p className="mt-4 text-sm leading-7 text-muted">
          {timeline.summary}
        </p>

        <div className="mt-8 space-y-5">
          {timeline.steps.map((step, index) => (
            <TimelineStepCard
              isLast={index === timeline.steps.length - 1}
              key={step.id}
              step={step}
            />
          ))}
        </div>
      </Card>

      <div className="space-y-6">
        <Card className="rounded-[30px] border border-white/80 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-accent">
            Current phase
          </p>
          <h3 className="mt-2 text-xl font-semibold tracking-tight text-ink">
            {timeline.currentPhase || "Timeline in preparation"}
          </h3>
          <p className="mt-3 text-sm leading-7 text-muted">
            Use the active step to focus work on the most time-sensitive milestone instead of spreading effort across the entire case.
          </p>
        </Card>

        <Card className="rounded-[30px] border border-white/80 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-accent">
            Milestones
          </p>
          <div className="mt-4 space-y-3">
            {timeline.steps
              .filter((step) => step.milestone)
              .map((step) => (
                <div
                  className="rounded-2xl bg-slate-50/90 px-4 py-4"
                  key={step.id}
                >
                  <p className="text-sm font-semibold text-ink">
                    {step.milestone}
                  </p>
                  <p className="mt-1 text-xs uppercase tracking-[0.08em] text-muted">
                    {step.stepName}
                  </p>
                </div>
              ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
