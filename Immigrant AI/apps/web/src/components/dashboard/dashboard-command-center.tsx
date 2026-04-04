"use client";

import type {
  DashboardCase,
  DashboardCommandCenter
} from "@/types/dashboard";

import { CaseListSection } from "@/components/dashboard/case-list-section";
import { DashboardAiCopilotCtaCard } from "@/components/dashboard/dashboard-ai-copilot-cta-card";
import { DashboardCommandCenterHero } from "@/components/dashboard/dashboard-command-center-hero";
import { DashboardDocumentStatusCard } from "@/components/dashboard/dashboard-document-status-card";
import { DashboardNextBestActionCard } from "@/components/dashboard/dashboard-next-best-action-card";
import { DashboardProbabilityScoreCard } from "@/components/dashboard/dashboard-probability-score-card";
import { DashboardReadinessScoreCard } from "@/components/dashboard/dashboard-readiness-score-card";
import { DashboardRecommendedPathwayCard } from "@/components/dashboard/dashboard-recommended-pathway-card";
import { DashboardSignalListCard } from "@/components/dashboard/dashboard-signal-list-card";
import { DashboardTimelinePreviewCard } from "@/components/dashboard/dashboard-timeline-preview-card";

type DashboardCommandCenterProps = Readonly<{
  cases: DashboardCase[];
  data: DashboardCommandCenter;
}>;

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

export function DashboardCommandCenter({
  cases,
  data
}: DashboardCommandCenterProps) {
  return (
    <div className="space-y-6">
      <DashboardCommandCenterHero hero={data.hero} />

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <DashboardReadinessScoreCard data={data.readinessScore} />
        <DashboardProbabilityScoreCard data={data.probabilityScore} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr_0.9fr]">
        <DashboardRecommendedPathwayCard data={data.recommendedPathway} />
        <DashboardNextBestActionCard data={data.nextBestAction} />
        <DashboardDocumentStatusCard data={data.documentStatus} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <DashboardTimelinePreviewCard data={data.timelinePreview} />
        <DashboardAiCopilotCtaCard data={data.aiCopilot} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <DashboardSignalListCard
          eyebrow="Top risks"
          emptyCopy="No elevated operational risks are being surfaced for the active case right now."
          items={data.topRisks.items.map((item) => ({
            id: item.id,
            label: item.title,
            meta: item.severity,
            supportingText: item.description,
            tone: getRiskTone(item.severity)
          }))}
          summary={data.topRisks.summary}
          title="Current execution risks"
        />
        <DashboardSignalListCard
          eyebrow="Missing information"
          emptyCopy="No material information gaps are currently blocking the leading case."
          items={data.missingInformation.items.map((item) => ({
            id: item.id,
            label: item.message,
            meta: item.severity,
            supportingText: `Source: ${item.source}`,
            tone: getMissingInfoTone(item.severity)
          }))}
          summary={data.missingInformation.summary}
          title="Highest-value gaps to close"
        />
      </div>

      <CaseListSection cases={cases} />
    </div>
  );
}
