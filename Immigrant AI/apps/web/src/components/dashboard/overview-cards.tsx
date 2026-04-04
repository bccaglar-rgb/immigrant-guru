"use client";

import { Stagger } from "@/components/ui/animate";
import type { DashboardCase, DashboardOverviewCards } from "@/types/dashboard";

type OverviewCardsProps = Readonly<{
  cases: DashboardCase[];
  overview: DashboardOverviewCards;
}>;

type MetricCardProps = Readonly<{
  eyebrow: string;
  note: string;
  title: string;
  value: string;
}>;

function MetricCard({ eyebrow, note, title, value }: MetricCardProps) {
  return (
    <div className="glass-card rounded-2xl p-5 transition-all duration-300 hover:shadow-soft hover:-translate-y-0.5">
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-accent">
        {eyebrow}
      </p>
      <h3 className="mt-3 text-3xl font-semibold tracking-tight text-ink anim-count">{value}</h3>
      <p className="mt-1 text-sm font-medium text-ink">{title}</p>
      <p className="mt-2 text-xs leading-relaxed text-muted">{note}</p>
    </div>
  );
}

export function OverviewCards({ cases, overview }: OverviewCardsProps) {
  return (
    <Stagger
      className="grid gap-4 md:grid-cols-2 xl:grid-cols-5"
      animation="fade-up"
      staggerDelay={80}
      duration={600}
    >
      {[
        <MetricCard
          key="score"
          eyebrow="Immigration Score"
          note={overview.immigrationScore.note}
          title={overview.immigrationScore.title}
          value={overview.immigrationScore.value}
        />,
        <MetricCard
          key="health"
          eyebrow="Case Health"
          note={overview.caseHealth.note}
          title={overview.caseHealth.title}
          value={overview.caseHealth.value}
        />,
        <MetricCard
          key="cases"
          eyebrow="Active Cases"
          note={
            cases.length > 0
              ? `${cases.length} migration objective${cases.length === 1 ? "" : "s"} currently tracked.`
              : "No immigration cases have been created yet."
          }
          title="Current case activity"
          value={String(cases.length)}
        />,
        <MetricCard
          key="next"
          eyebrow="Next Step"
          note={overview.recommendedNextStep.note}
          title={overview.recommendedNextStep.title}
          value={overview.recommendedNextStep.value}
        />,
        <MetricCard
          key="docs"
          eyebrow="Documents"
          note={overview.documentStatus.note}
          title={overview.documentStatus.title}
          value={overview.documentStatus.value}
        />
      ]}
    </Stagger>
  );
}
