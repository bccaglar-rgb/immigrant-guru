export const scoreImpactValues = ["positive", "neutral", "negative"] as const;

export type ScoreImpact = (typeof scoreImpactValues)[number];

export type ScoreContribution = {
  label: string;
  points: number;
  impact: ScoreImpact;
  explanation: string;
};

export type ScoreBreakdown = {
  score: number;
  weight: number;
  summary: string;
  contributions: ScoreContribution[];
};

export type ImmigrationScore = {
  case_id: string;
  scoring_version: string;
  disclaimer: string;
  overall_score: number;
  profile_completeness: ScoreBreakdown;
  financial_readiness: ScoreBreakdown;
  professional_strength: ScoreBreakdown;
  case_readiness: ScoreBreakdown;
  overall_reasons: string[];
  generated_at: string;
};
