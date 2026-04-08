import { z } from "zod";

import { apiRequest } from "@/lib/api-client";
import type { ApiRequestResult } from "@/types/api";

export type CaseTimelineStep = {
  step_name: string;
  estimated_duration_months: number;
  description: string;
};

export type CaseTimeline = {
  case_id: string;
  target_country: string | null;
  target_program: string | null;
  timeline_version: string;
  disclaimer: string;
  total_estimated_duration_months: number;
  steps: CaseTimelineStep[];
  delay_risks: string[];
  acceleration_tips: string[];
  generated_at: string;
};

const caseTimelineStepSchema = z.object({
  step_name: z.string().min(1),
  estimated_duration_months: z.number().min(0).max(240),
  description: z.string().min(1)
});

const caseTimelineSchema = z.object({
  case_id: z.string().uuid(),
  target_country: z.string().nullable(),
  target_program: z.string().nullable(),
  timeline_version: z.string().min(1),
  disclaimer: z.string().min(1),
  total_estimated_duration_months: z.number().min(0).max(240),
  steps: z.array(caseTimelineStepSchema),
  delay_risks: z.array(z.string()),
  acceleration_tips: z.array(z.string()),
  generated_at: z.string().datetime()
});

function invalidPayloadResult(message: string): ApiRequestResult<never> {
  return {
    ok: false,
    errorMessage: message,
    status: 500
  };
}

export async function getCaseTimeline(
  accessToken: string,
  caseId: string
): Promise<ApiRequestResult<CaseTimeline>> {
  const response = await apiRequest({
    authToken: accessToken,
    method: "GET",
    path: `/cases/${caseId}/timeline`,
    retries: 0,
    timeoutMs: 10000
  });

  if (!response.ok) {
    return response;
  }

  const parsed = caseTimelineSchema.safeParse(response.data);
  if (!parsed.success) {
    return invalidPayloadResult("Case timeline response was invalid.");
  }

  return {
    ok: true,
    data: parsed.data,
    status: response.status
  };
}
