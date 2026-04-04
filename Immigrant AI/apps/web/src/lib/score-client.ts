import { z } from "zod";

import { apiRequest } from "@/lib/api-client";
import type { ApiRequestResult } from "@/types/api";
import { scoreImpactValues } from "@/types/scoring";
import type { ImmigrationScore } from "@/types/scoring";

const scoreContributionSchema = z.object({
  label: z.string().min(1),
  points: z.number(),
  impact: z.enum(scoreImpactValues),
  explanation: z.string().min(1)
});

const scoreBreakdownSchema = z.object({
  score: z.number().min(0).max(100),
  weight: z.number().gt(0).max(1),
  summary: z.string().min(1),
  contributions: z.array(scoreContributionSchema)
});

const immigrationScoreSchema = z.object({
  case_id: z.string().uuid(),
  scoring_version: z.string().min(1),
  disclaimer: z.string().min(1),
  overall_score: z.number().min(0).max(100),
  profile_completeness: scoreBreakdownSchema,
  financial_readiness: scoreBreakdownSchema,
  professional_strength: scoreBreakdownSchema,
  case_readiness: scoreBreakdownSchema,
  overall_reasons: z.array(z.string()),
  generated_at: z.string().datetime()
});

function invalidPayloadResult(message: string): ApiRequestResult<never> {
  return {
    ok: false,
    errorMessage: message,
    status: 500
  };
}

export async function getCaseScore(
  accessToken: string,
  caseId: string
): Promise<ApiRequestResult<ImmigrationScore>> {
  const response = await apiRequest({
    authToken: accessToken,
    method: "GET",
    path: `/cases/${caseId}/score`,
    retries: 0,
    timeoutMs: 7000
  });

  if (!response.ok) {
    return response;
  }

  const parsed = immigrationScoreSchema.safeParse(response.data);
  if (!parsed.success) {
    return invalidPayloadResult("Case score response was invalid.");
  }

  return {
    ok: true,
    data: parsed.data,
    status: response.status
  };
}
