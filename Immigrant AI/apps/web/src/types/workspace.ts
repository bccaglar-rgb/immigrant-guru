export const actionPriorityValues = ["immediate", "soon", "later"] as const;
export type ActionPriority = (typeof actionPriorityValues)[number];

export const timingCategoryValues = [
  "now",
  "this_week",
  "this_month",
  "later"
] as const;
export type TimingCategory = (typeof timingCategoryValues)[number];

export const checklistRequirementLevelValues = [
  "required",
  "recommended"
] as const;
export type ChecklistRequirementLevel =
  (typeof checklistRequirementLevelValues)[number];

export const checklistItemStatusValues = [
  "missing",
  "uploaded",
  "processing",
  "failed"
] as const;
export type ChecklistItemStatus = (typeof checklistItemStatusValues)[number];

export const caseHealthStatusValues = [
  "strong",
  "needs_attention",
  "incomplete",
  "at_risk"
] as const;
export type CaseHealthStatus = (typeof caseHealthStatusValues)[number];

export const riskSeverityValues = ["high", "medium", "low"] as const;
export type RiskSeverity = (typeof riskSeverityValues)[number];

export const riskSourceValues = [
  "probability",
  "timeline",
  "documents",
  "health"
] as const;
export type RiskSource = (typeof riskSourceValues)[number];

export const missingInformationSeverityValues = [
  "critical",
  "helpful"
] as const;
export type MissingInformationSeverity =
  (typeof missingInformationSeverityValues)[number];

export const probabilityConfidenceValues = ["LOW", "MEDIUM", "HIGH"] as const;
export type ProbabilityConfidence = (typeof probabilityConfidenceValues)[number];

export type NextBestAction = {
  title: string;
  reasoning: string;
  priority: ActionPriority;
  timing_category: TimingCategory;
};

export type ActionRoadmapItem = {
  id: string;
  title: string;
  description: string;
  priority: ActionPriority;
  timing_category: TimingCategory;
  dependency_notes: string | null;
};

export type DocumentChecklistItem = {
  id: string;
  document_name: string;
  category: string;
  requirement_level: ChecklistRequirementLevel;
  status: ChecklistItemStatus;
  notes: string;
  matched_document_id: string | null;
};

export type DocumentChecklistSummary = {
  total_items: number;
  required_items: number;
  completed_items: number;
  uploaded_items: number;
  processing_items: number;
  failed_items: number;
  missing_required_items: number;
  readiness_score: number;
};

export type DocumentStatusSummary = DocumentChecklistSummary & {
  attention_required: boolean;
  summary: string;
};

export type CaseHealth = {
  health_status: CaseHealthStatus;
  health_score: number;
  issues: string[];
  recommended_next_focus: string;
};

export type ReadinessScoreSummary = {
  overall_score: number;
  label: string;
  summary: string;
  profile_completeness_score: number;
  financial_readiness_score: number;
  professional_strength_score: number;
  case_readiness_score: number;
};

export type ProbabilitySummary = {
  probability_score: number;
  confidence_level: ProbabilityConfidence;
  summary: string;
  strengths: string[];
  weaknesses: string[];
};

export type TimelineSummary = {
  total_estimated_duration_months: number;
  next_step: string | null;
  next_step_duration_months: number | null;
  delay_risks: string[];
  acceleration_tips: string[];
};

export type WorkspaceRisk = {
  id: string;
  title: string;
  severity: RiskSeverity;
  source: RiskSource;
  description: string;
};

export type MissingInformationItem = {
  id: string;
  severity: MissingInformationSeverity;
  source: string;
  message: string;
};

export type RecommendedPathway = {
  target_country: string | null;
  pathway: string | null;
  confidence_level: ProbabilityConfidence | null;
  rationale: string;
};

export type CaseWorkspace = {
  case_id: string;
  generated_at: string;
  readiness_score: ReadinessScoreSummary;
  probability_summary: ProbabilitySummary;
  timeline_summary: TimelineSummary;
  top_risks: WorkspaceRisk[];
  missing_information: MissingInformationItem[];
  document_status_summary: DocumentStatusSummary;
  recommended_pathway: RecommendedPathway;
  case_health: CaseHealth;
  action_roadmap: ActionRoadmapItem[];
  health: CaseHealth;
  next_best_action: NextBestAction;
  missing_information_grouped: {
    critical: string[];
    helpful: string[];
  };
  checklist_summary: DocumentChecklistSummary;
  checklist: DocumentChecklistItem[];
  roadmap: ActionRoadmapItem[];
};
