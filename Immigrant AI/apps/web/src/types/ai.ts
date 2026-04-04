export const strategyContextModeValues = [
  "case-aware",
  "profile-aware",
  "full"
] as const;

export type StrategyContextMode = (typeof strategyContextModeValues)[number];

export const strategyConfidenceValues = [
  "low",
  "medium",
  "high",
  "insufficient_information"
] as const;

export type StrategyConfidenceLabel = (typeof strategyConfidenceValues)[number];

export const strategyPlanLabelValues = ["Plan A", "Plan B", "Plan C"] as const;

export type StrategyPlanLabel = (typeof strategyPlanLabelValues)[number];

export const strategyComplexityValues = ["low", "medium", "high"] as const;
export const strategyTimelineValues = [
  "short_term",
  "medium_term",
  "long_term"
] as const;
export const strategyCostValues = ["low", "medium", "high"] as const;

export type StrategyComplexity = (typeof strategyComplexityValues)[number];
export type StrategyTimelineCategory = (typeof strategyTimelineValues)[number];
export type StrategyCostCategory = (typeof strategyCostValues)[number];

export type StrategyPlan = {
  label: StrategyPlanLabel;
  pathway_name: string;
  why_it_may_fit: string;
  major_risks: string[];
  estimated_complexity: StrategyComplexity;
  estimated_timeline_category: StrategyTimelineCategory;
  estimated_cost_category: StrategyCostCategory;
  suitability_score: number;
  next_action: string;
};

export type AIStrategyRequestPayload = {
  case_id: string;
  question: string;
  context_mode: StrategyContextMode;
  use_grounding?: boolean;
};

export type AIStrategyResponse = {
  case_id: string;
  context_mode: StrategyContextMode;
  provider: string;
  model: string;
  generated_at: string;
  summary: string;
  plans: StrategyPlan[];
  missing_information: string[];
  missing_information_by_severity: {
    critical: string[];
    helpful: string[];
  };
  next_steps: string[];
  confidence_label: StrategyConfidenceLabel;
  confidence_score: number;
  confidence_reasons: string[];
  grounding_used: boolean;
  grounding_backend: string | null;
  sources_used: Array<{
    source_id: string;
    source_name: string;
    source_type: string;
    country: string | null;
    visa_type: string | null;
    language: string | null;
    authority_level: string;
    published_at: string | null;
    verified_at: string | null;
  }>;
};
