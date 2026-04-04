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

export type CaseHealth = {
  health_status: CaseHealthStatus;
  health_score: number;
  issues: string[];
  recommended_next_focus: string;
};

export type CaseWorkspace = {
  case_id: string;
  generated_at: string;
  health: CaseHealth;
  next_best_action: NextBestAction;
  missing_information: {
    critical: string[];
    helpful: string[];
  };
  checklist_summary: DocumentChecklistSummary;
  checklist: DocumentChecklistItem[];
  roadmap: ActionRoadmapItem[];
};
