import type { StrategyConfidenceLabel, StrategyPlan } from "@/types/ai";
import type { ImmigrationCaseStatus } from "@/types/cases";
import type { CaseDocument } from "@/types/documents";

export const caseWorkspaceTabIds = [
  "overview",
  "strategy",
  "timeline",
  "simulation",
  "documents",
  "risks",
  "copilot",
  "comparison"
] as const;

export type CaseWorkspaceTabId = (typeof caseWorkspaceTabIds)[number];

export type CaseWorkspaceHealthStatus =
  | "strong"
  | "stable"
  | "needs_attention"
  | "at_risk";

export type CaseWorkspaceMetricTone =
  | "neutral"
  | "accent"
  | "positive"
  | "warning"
  | "critical";

export type CaseWorkspaceMetric = {
  id: string;
  label: string;
  value: string;
  description: string;
  tone: CaseWorkspaceMetricTone;
};

export type CaseWorkspaceHeaderData = {
  caseId: string;
  title: string;
  targetCountry: string;
  targetPathway: string;
  status: ImmigrationCaseStatus;
  updatedAt: string;
  summary: string;
  applicantName: string;
  primaryGoal: string;
};

export type CaseWorkspaceHealth = {
  status: CaseWorkspaceHealthStatus;
  score: number;
  summary: string;
  nextFocus: string;
};

export type CaseWorkspaceStrategy = {
  summary: string;
  confidenceLabel: StrategyConfidenceLabel;
  confidenceScore: number;
  assumptions: string[];
  missingInformation: string[];
  nextSteps: string[];
  plans: Array<StrategyPlan | null>;
};

export type CaseWorkspaceTimelineStep = {
  id: string;
  title: string;
  durationLabel: string;
  status: "completed" | "active" | "upcoming" | "blocked";
  description: string;
};

export type CaseWorkspaceTimeline = {
  totalDurationLabel: string;
  currentPhase: string;
  summary: string;
  delayRisks: string[];
  accelerationTips: string[];
  steps: CaseWorkspaceTimelineStep[];
};

export type CaseWorkspaceRiskItem = {
  id: string;
  title: string;
  severity: "high" | "medium" | "low";
  impactArea: string;
  description: string;
  mitigationActions: string[];
};

export type CaseWorkspaceChecklistItem = {
  id: string;
  name: string;
  category: string;
  requirementLevel: "required" | "recommended";
  status: "uploaded" | "missing" | "processing" | "flagged";
  note: string;
  mappedDocumentId: string | null;
};

export type CaseWorkspaceDocuments = {
  summary: string;
  checklist: CaseWorkspaceChecklistItem[];
  uploadedDocuments: Array<
    Pick<
      CaseDocument,
      | "id"
      | "original_filename"
      | "document_type"
      | "upload_status"
      | "processed_at"
      | "created_at"
      | "processing_error"
    >
  >;
};

export type CaseWorkspaceCopilotMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  sourceAttributions?: Array<{
    id: string;
    label: string;
    type: "case" | "document" | "score" | "strategy" | "timeline";
  }>;
};

export type CaseWorkspaceCopilot = {
  summary: string;
  messages: CaseWorkspaceCopilotMessage[];
  suggestedPrompts: string[];
};

export type CaseWorkspaceComparisonItem = {
  id: string;
  country: string;
  pathway: string;
  probability: number;
  timelineLabel: string;
  costLevel: "low" | "medium" | "high";
  difficulty: "low" | "medium" | "high";
  advantages: string[];
  disadvantages: string[];
  recommended: boolean;
};

export type CaseWorkspaceComparison = {
  summary: string;
  reasoning: string;
  items: CaseWorkspaceComparisonItem[];
};

export type CaseWorkspaceData = {
  header: CaseWorkspaceHeaderData;
  health: CaseWorkspaceHealth;
  overviewMetrics: CaseWorkspaceMetric[];
  strategy: CaseWorkspaceStrategy;
  timeline: CaseWorkspaceTimeline;
  risks: CaseWorkspaceRiskItem[];
  documents: CaseWorkspaceDocuments;
  copilot: CaseWorkspaceCopilot;
  comparison: CaseWorkspaceComparison;
};
