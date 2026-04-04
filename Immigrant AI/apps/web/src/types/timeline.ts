export const immigrationTimelineStatusValues = [
  "completed",
  "current",
  "pending",
  "blocked"
] as const;

export type ImmigrationTimelineStatus =
  (typeof immigrationTimelineStatusValues)[number];

export type TimelineRiskBadge = {
  id: string;
  label: string;
  tone: "neutral" | "warning" | "critical";
};

export type ImmigrationTimelineStep = {
  id: string;
  stepName: string;
  estimatedDuration: string;
  description: string;
  status: ImmigrationTimelineStatus;
  milestone?: string | null;
  riskBadges?: TimelineRiskBadge[];
};

export type ImmigrationTimelineData = {
  eyebrow?: string;
  title: string;
  summary: string;
  totalDuration?: string | null;
  currentPhase?: string | null;
  steps: ImmigrationTimelineStep[];
};
