"use client";

import Link from "next/link";

import { DashboardAiCopilotCtaCard } from "@/components/dashboard/dashboard-ai-copilot-cta-card";
import { DashboardDocumentStatusCard } from "@/components/dashboard/dashboard-document-status-card";
import { DashboardErrorState } from "@/components/dashboard/dashboard-error-state";
import { DashboardLoadingState } from "@/components/dashboard/dashboard-loading-state";
import { DashboardNextBestActionCard } from "@/components/dashboard/dashboard-next-best-action-card";
import { DashboardProbabilityScoreCard } from "@/components/dashboard/dashboard-probability-score-card";
import { DashboardReadinessScoreCard } from "@/components/dashboard/dashboard-readiness-score-card";
import { DashboardRecommendedPathwayCard } from "@/components/dashboard/dashboard-recommended-pathway-card";
import { DashboardSignalListCard } from "@/components/dashboard/dashboard-signal-list-card";
import { DashboardTimelinePreviewCard } from "@/components/dashboard/dashboard-timeline-preview-card";
import { MobileCardList } from "@/components/mobile/mobile-card-list";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useDashboardResources } from "@/hooks/use-dashboard-resources";

function getRiskTone(severity: string): "critical" | "warning" | "neutral" {
  if (severity === "high") {
    return "critical";
  }
  if (severity === "medium") {
    return "warning";
  }
  return "neutral";
}

function getMissingInfoTone(severity: string): "critical" | "warning" {
  return severity === "critical" ? "critical" : "warning";
}

export function MobileDashboardOverviewPage() {
  const { cases, commandCenter, error, refresh, status } = useDashboardResources();

  if (status === "loading") {
    return <DashboardLoadingState />;
  }

  if (status === "error") {
    return (
      <DashboardErrorState
        message={error}
        onRetry={refresh}
        title="The mobile command center could not be loaded."
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden rounded-[28px] border border-white/80 bg-[radial-gradient(circle_at_top_left,rgba(191,219,254,0.6),transparent_40%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.92))] p-5 shadow-soft">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-accent">
          Current focus
        </p>
        <h2 className="mt-3 text-[1.75rem] font-semibold tracking-[-0.04em] text-ink">
          {commandCenter.hero.primaryObjective}
        </h2>
        <p className="mt-3 text-sm leading-7 text-muted">
          {commandCenter.hero.description}
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white/90 px-4 py-4">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted">
              Active cases
            </p>
            <p className="mt-2 text-2xl font-semibold text-ink">
              {commandCenter.hero.activeCaseCount}
            </p>
          </div>
          <div className="rounded-2xl bg-white/90 px-4 py-4">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted">
              Status
            </p>
            <p className="mt-2 text-sm font-semibold text-ink">
              {commandCenter.hero.statusLabel}
            </p>
          </div>
        </div>

        <Link className="mt-5 block" href="/dashboard/cases">
          <Button fullWidth type="button">
            Open case portfolio
          </Button>
        </Link>
      </Card>

      <DashboardReadinessScoreCard data={commandCenter.readinessScore} />
      <DashboardProbabilityScoreCard data={commandCenter.probabilityScore} />
      <DashboardRecommendedPathwayCard data={commandCenter.recommendedPathway} />
      <DashboardNextBestActionCard data={commandCenter.nextBestAction} />
      <DashboardTimelinePreviewCard data={commandCenter.timelinePreview} />
      <DashboardDocumentStatusCard data={commandCenter.documentStatus} />
      <DashboardAiCopilotCtaCard data={commandCenter.aiCopilot} />

      <DashboardSignalListCard
        eyebrow="Top risks"
        emptyCopy="No elevated operational risks are currently blocking the leading case."
        items={commandCenter.topRisks.items.map((item) => ({
          id: item.id,
          label: item.title,
          meta: item.severity,
          supportingText: item.description,
          tone: getRiskTone(item.severity)
        }))}
        summary={commandCenter.topRisks.summary}
        title="Top risks"
      />

      <DashboardSignalListCard
        eyebrow="Missing information"
        emptyCopy="No material information gaps are blocking the current recommendation."
        items={commandCenter.missingInformation.items.map((item) => ({
          id: item.id,
          label: item.message,
          meta: item.severity,
          supportingText: `Source: ${item.source}`,
          tone: getMissingInfoTone(item.severity)
        }))}
        summary={commandCenter.missingInformation.summary}
        title="Missing information"
      />

      <Card className="rounded-[28px] p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-accent">
              Cases
            </p>
            <h3 className="mt-2 text-lg font-semibold tracking-tight text-ink">
              Active immigration plans
            </h3>
          </div>
          <Link href="/dashboard/cases">
            <Button type="button" variant="secondary">
              View all
            </Button>
          </Link>
        </div>

        <MobileCardList
          className="mt-4 space-y-3"
          emptyState={
            <div className="rounded-2xl border border-dashed border-line bg-canvas/70 px-4 py-6 text-sm leading-7 text-muted">
              Create your first case to unlock the mobile command center.
            </div>
          }
          items={cases.slice(0, 3)}
          renderItem={(item) => (
            <Link href={`/dashboard/cases/${item.id}`}>
              <div className="rounded-2xl border border-line bg-white px-4 py-4 shadow-card">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-accent">
                  {item.target_country || "Destination pending"}
                </p>
                <h4 className="mt-2 text-base font-semibold text-ink">{item.title}</h4>
                <p className="mt-2 text-sm text-muted">
                  {item.target_program || "Pathway not set"}
                </p>
              </div>
            </Link>
          )}
        />
      </Card>
    </div>
  );
}
