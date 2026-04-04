import type { EducationLevel, EnglishLevel } from "@/types/profile";

export type ScenarioSimulationInputs = {
  availableCapital: number;
  educationLevel: EducationLevel;
  englishLevel: EnglishLevel;
  yearsOfExperience: number;
};

export type ScenarioSimulationMetricDelta = {
  after: number;
  before: number;
  change: number;
  label: string;
};

export type ScenarioImpactTone = "positive" | "neutral" | "negative";

export type ScenarioImpactSummaryItem = {
  id: string;
  summary: string;
  tone: ScenarioImpactTone;
};

export type ScenarioRecommendation = {
  id: string;
  title: string;
  detail: string;
  impactLabel: "High impact" | "Medium impact" | "Foundational";
};

export type ScenarioSimulationResult = {
  impactSummary: ScenarioImpactSummaryItem[];
  probability: ScenarioSimulationMetricDelta;
  recommendedImprovements: ScenarioRecommendation[];
  timeline: ScenarioSimulationMetricDelta;
};

export type ScenarioSimulationState = {
  baseline: ScenarioSimulationInputs;
  current: ScenarioSimulationInputs;
  result: ScenarioSimulationResult;
};
