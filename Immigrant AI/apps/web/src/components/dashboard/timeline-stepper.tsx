"use client";

import { useTranslations } from "next-intl";

import type { CaseWorkspaceTimeline } from "@/types/case-workspace";
import type { ImmigrationTimelineData } from "@/types/timeline";

import { ImmigrationTimeline } from "@/components/dashboard/immigration-timeline";

type TimelineStepperProps = Readonly<{
  timeline: CaseWorkspaceTimeline;
}>;

function mapStatus(
  status: CaseWorkspaceTimeline["steps"][number]["status"]
): ImmigrationTimelineData["steps"][number]["status"] {
  if (status === "active") {
    return "current";
  }
  if (status === "upcoming") {
    return "pending";
  }
  return status;
}

export function TimelineStepper({ timeline }: TimelineStepperProps) {
  const t = useTranslations();

  const timelineData: ImmigrationTimelineData = {
    eyebrow: t("Timeline"),
    title: t("Case progress timeline"),
    summary: timeline.summary,
    totalDuration: timeline.totalDurationLabel,
    currentPhase: timeline.currentPhase,
    steps: timeline.steps.map((step) => ({
      id: step.id,
      stepName: step.title,
      estimatedDuration: step.durationLabel,
      description: step.description,
      status: mapStatus(step.status),
      milestone: step.status === "completed" ? t("Completed milestone") : undefined,
      riskBadges:
        step.status === "blocked"
          ? [
              {
                id: `${step.id}-blocked`,
                label: t("Blocked"),
                tone: "critical"
              }
            ]
          : undefined
    }))
  };

  return <ImmigrationTimeline timeline={timelineData} />;
}
