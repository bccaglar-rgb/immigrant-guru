"use client";

import { Animate } from "@/components/ui/animate";
import type { DashboardOverviewCards } from "@/types/dashboard";

type AiStrategyTeaserProps = Readonly<{
  overview: DashboardOverviewCards;
}>;

export function AiStrategyTeaser({ overview }: AiStrategyTeaserProps) {
  return (
    <Animate animation="fade-up" delay={300} duration={700}>
      <div className="glass-card rounded-2xl p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-accent">
          AI Strategy
        </p>
        <h3 className="mt-2 text-xl font-semibold tracking-tight text-ink">
          Strategic route preview
        </h3>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          {overview.aiStrategyTeaser.summary}
        </p>
        <div className="mt-4 rounded-xl border border-line bg-canvas/50 px-4 py-3 transition-colors hover:bg-white">
          <p className="text-xs font-medium text-muted">Teaser</p>
          <p className="mt-1 text-sm font-medium text-ink">
            {overview.aiStrategyTeaser.headline}
          </p>
        </div>
      </div>
    </Animate>
  );
}
