"use client";

import { DashboardErrorState } from "@/components/dashboard/dashboard-error-state";
import { DashboardLoadingState } from "@/components/dashboard/dashboard-loading-state";
import { DashboardPageHeader } from "@/components/dashboard/dashboard-page-header";
import { CaseListSection } from "@/components/dashboard/case-list-section";
import { OverviewCards } from "@/components/dashboard/overview-cards";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { AiStrategyTeaser } from "@/components/dashboard/ai-strategy-teaser";
import { useDashboardResources } from "@/hooks/use-dashboard-resources";

export function DashboardOverviewPage() {
  const { cases, error, overview, refresh, status } = useDashboardResources();

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        description="Track profile readiness, case activity, and your next step from one view."
        eyebrow="Overview"
        title="Decision workspace"
      />

      {status === "loading" ? <DashboardLoadingState /> : null}
      {status === "error" ? (
        <DashboardErrorState
          message={error}
          onRetry={refresh}
          title="Could not load workspace signals."
        />
      ) : null}

      {status === "ready" ? (
        <>
          <OverviewCards cases={cases} overview={overview} />
          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <CaseListSection cases={cases} />
            <div className="grid gap-6">
              <QuickActions />
              <AiStrategyTeaser overview={overview} />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
