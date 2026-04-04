import { z } from "zod";

import { apiRequest } from "@/lib/api-client";
import type { ApiRequestResult } from "@/types/api";
import {
  educationLevelValues,
  englishLevelValues,
  type EducationLevel,
  type EnglishLevel
} from "@/types/profile";
import type {
  CaseSimulationInputs,
  CaseSimulationResponse
} from "@/types/case-simulation";

const simulationImpactSchema = z.object({
  id: z.string().min(1),
  summary: z.string().min(1),
  tone: z.enum(["positive", "neutral", "negative"])
});

const simulationRecommendationSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  detail: z.string().min(1),
  impact_label: z.enum(["High impact", "Medium impact", "Foundational"])
});

const simulationSnapshotSchema = z.object({
  readiness_score: z.number().min(0).max(100),
  probability_score: z.number().min(0).max(100),
  timeline_months: z.number().min(0).max(240),
  confidence_level: z.enum(["LOW", "MEDIUM", "HIGH"]),
  summary: z.string().min(1)
});

const caseSimulationSchema = z.object({
  case_id: z.string().uuid(),
  disclaimer: z.string().min(1),
  current: simulationSnapshotSchema,
  simulated: simulationSnapshotSchema,
  delta: z.object({
    readiness_score_change: z.number(),
    probability_score_change: z.number(),
    timeline_months_change: z.number()
  }),
  impact_summary: z.array(simulationImpactSchema),
  recommended_improvements: z.array(simulationRecommendationSchema),
  generated_at: z.string().datetime()
});

function invalidPayloadResult(message: string): ApiRequestResult<never> {
  return {
    ok: false,
    errorMessage: message,
    status: 500
  };
}

type CaseSimulationRequestPayload = {
  profile_overrides: {
    education_level: EducationLevel;
    english_level: EnglishLevel;
    available_capital: string;
    years_of_experience: number;
  };
};

export async function simulateCaseScenario(
  accessToken: string,
  caseId: string,
  inputs: CaseSimulationInputs
): Promise<ApiRequestResult<CaseSimulationResponse>> {
  const payload: CaseSimulationRequestPayload = {
    profile_overrides: {
      education_level: inputs.educationLevel,
      english_level: inputs.englishLevel,
      available_capital: inputs.availableCapital.toFixed(2),
      years_of_experience: inputs.yearsOfExperience
    }
  };

  const response = await apiRequest({
    authToken: accessToken,
    body: payload,
    method: "POST",
    path: `/cases/${caseId}/simulation`,
    retries: 0,
    timeoutMs: 7000
  });

  if (!response.ok) {
    return response;
  }

  const parsed = caseSimulationSchema.safeParse(response.data);
  if (!parsed.success) {
    return invalidPayloadResult("Case simulation response was invalid.");
  }

  return {
    ok: true,
    data: parsed.data,
    status: response.status
  };
}

export function buildCaseSimulationInputs(input?: Partial<{
  availableCapital: number | string | null;
  educationLevel: EducationLevel | null;
  englishLevel: EnglishLevel | null;
  yearsOfExperience: number | null;
}>): CaseSimulationInputs {
  const safeEducation = educationLevelValues.includes(
    (input?.educationLevel ?? "bachelor") as EducationLevel
  )
    ? (input?.educationLevel as EducationLevel)
    : "bachelor";
  const safeEnglish = englishLevelValues.includes(
    (input?.englishLevel ?? "intermediate") as EnglishLevel
  )
    ? (input?.englishLevel as EnglishLevel)
    : "intermediate";

  const capitalValue =
    typeof input?.availableCapital === "string"
      ? Number.parseFloat(input.availableCapital)
      : input?.availableCapital ?? 45000;

  return {
    availableCapital:
      Number.isFinite(capitalValue) && capitalValue >= 0 ? capitalValue : 45000,
    educationLevel: safeEducation,
    englishLevel: safeEnglish,
    yearsOfExperience:
      typeof input?.yearsOfExperience === "number" && input.yearsOfExperience >= 0
        ? input.yearsOfExperience
        : 4
  };
}
