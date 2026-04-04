import type { ImmigrationCaseSummary } from "@/types/cases";
import type { UserProfile } from "@/types/profile";
import type { ImmigrationScore } from "@/types/scoring";
import type { CaseWorkspace } from "@/types/workspace";

export type DashboardProfile = UserProfile;
export type DashboardCase = ImmigrationCaseSummary;

export type DashboardOverviewCards = {
  aiStrategyTeaser: {
    headline: string;
    summary: string;
  };
  caseHealth: {
    note: string;
    title: string;
    value: string;
  };
  documentStatus: {
    note: string;
    title: string;
    value: string;
  };
  immigrationScore: {
    note: string;
    title: string;
    value: string;
  };
  recommendedNextStep: {
    note: string;
    title: string;
    value: string;
  };
};

export type DashboardPrimaryCaseScore = ImmigrationScore | null;
export type DashboardPrimaryCaseWorkspace = CaseWorkspace | null;

export type DashboardDataState = "loading" | "ready" | "error";

export type DashboardCommandCenterHero = {
  eyebrow: string;
  title: string;
  description: string;
  primaryObjective: string;
  statusLabel: string;
  activeCaseCount: number;
  updatedAtLabel: string;
};

export type DashboardReadinessScoreCard = {
  score: number | null;
  label: string;
  summary: string;
  breakdown: Array<{
    label: string;
    value: number | null;
  }>;
};

export type DashboardProbabilityScoreCard = {
  score: number | null;
  confidence: string | null;
  summary: string;
  strengths: string[];
  weaknesses: string[];
};

export type DashboardRecommendedPathwayCard = {
  pathway: string | null;
  country: string | null;
  confidence: string | null;
  rationale: string;
};

export type DashboardNextBestActionCard = {
  title: string;
  reasoning: string;
  priority: string;
  timingCategory: string;
  href: string;
  ctaLabel: string;
};

export type DashboardTopRisksCard = {
  summary: string;
  items: Array<{
    id: string;
    title: string;
    severity: string;
    description: string;
    source: string;
  }>;
};

export type DashboardMissingInformationCard = {
  summary: string;
  items: Array<{
    id: string;
    severity: string;
    message: string;
    source: string;
  }>;
};

export type DashboardTimelinePreviewCard = {
  totalEstimatedDurationMonths: number | null;
  nextStep: string | null;
  nextStepDurationMonths: number | null;
  delayRisks: string[];
  accelerationTips: string[];
};

export type DashboardDocumentStatusCard = {
  readinessScore: number | null;
  summary: string;
  totalItems: number;
  requiredItems: number;
  completedItems: number;
  missingRequiredItems: number;
  processingItems: number;
  failedItems: number;
};

export type DashboardAiCopilotCard = {
  headline: string;
  summary: string;
  href: string;
  ctaLabel: string;
  suggestedPrompts: string[];
};

export type DashboardCommandCenter = {
  hero: DashboardCommandCenterHero;
  readinessScore: DashboardReadinessScoreCard;
  probabilityScore: DashboardProbabilityScoreCard;
  recommendedPathway: DashboardRecommendedPathwayCard;
  nextBestAction: DashboardNextBestActionCard;
  topRisks: DashboardTopRisksCard;
  missingInformation: DashboardMissingInformationCard;
  timelinePreview: DashboardTimelinePreviewCard;
  documentStatus: DashboardDocumentStatusCard;
  aiCopilot: DashboardAiCopilotCard;
};

export type DashboardRequestResult<T> =
  | {
      ok: true;
      data: T;
      status: number;
    }
  | {
      ok: false;
      errorMessage: string;
      status: number;
    };
