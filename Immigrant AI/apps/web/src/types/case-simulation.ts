import type { EducationLevel, EnglishLevel } from "@/types/profile";

export type CaseSimulationInputs = {
  availableCapital: number;
  educationLevel: EducationLevel;
  englishLevel: EnglishLevel;
  yearsOfExperience: number;
};

export type CaseSimulationImpactTone = "positive" | "neutral" | "negative";

export type CaseSimulationImpactItem = {
  id: string;
  summary: string;
  tone: CaseSimulationImpactTone;
};

export type CaseSimulationRecommendation = {
  id: string;
  title: string;
  detail: string;
  impact_label: "High impact" | "Medium impact" | "Foundational";
};

export type CaseSimulationSnapshot = {
  readiness_score: number;
  probability_score: number;
  timeline_months: number;
  confidence_level: "LOW" | "MEDIUM" | "HIGH";
  summary: string;
};

export type CaseSimulationDelta = {
  readiness_score_change: number;
  probability_score_change: number;
  timeline_months_change: number;
};

export type CaseSimulationResponse = {
  case_id: string;
  disclaimer: string;
  current: CaseSimulationSnapshot;
  simulated: CaseSimulationSnapshot;
  delta: CaseSimulationDelta;
  impact_summary: CaseSimulationImpactItem[];
  recommended_improvements: CaseSimulationRecommendation[];
  generated_at: string;
};
