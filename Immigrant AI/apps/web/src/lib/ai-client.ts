import { z } from "zod";

import { apiRequest } from "@/lib/api-client";
import type { ApiRequestResult } from "@/types/api";
import {
  strategyConfidenceValues,
  strategyContextModeValues,
  strategyCostValues,
  strategyPlanLabelValues,
  strategyComplexityValues,
  strategyTimelineValues
} from "@/types/ai";
import type {
  AIStrategyRequestPayload,
  AIStrategyResponse
} from "@/types/ai";

const strategyPlanSchema = z.object({
  label: z.enum(strategyPlanLabelValues),
  pathway_name: z.string().min(1),
  why_it_may_fit: z.string().min(1),
  major_risks: z.array(z.string()),
  estimated_complexity: z.enum(strategyComplexityValues),
  estimated_timeline_category: z.enum(strategyTimelineValues),
  estimated_cost_category: z.enum(strategyCostValues),
  suitability_score: z.number().min(0).max(100),
  next_action: z.string().min(1)
});

const aiStrategyResponseSchema = z.object({
  case_id: z.string().uuid(),
  context_mode: z.enum(strategyContextModeValues),
  provider: z.string().min(1),
  model: z.string().min(1),
  generated_at: z.string().datetime(),
  summary: z.string().min(1),
  plans: z.array(strategyPlanSchema).max(3),
  missing_information: z.array(z.string()),
  missing_information_by_severity: z.object({
    critical: z.array(z.string()),
    helpful: z.array(z.string())
  }),
  next_steps: z.array(z.string()),
  confidence_label: z.enum(strategyConfidenceValues),
  confidence_score: z.number().min(0).max(100),
  confidence_reasons: z.array(z.string()),
  grounding_used: z.boolean(),
  grounding_backend: z.string().nullable(),
  sources_used: z.array(
    z.object({
      source_id: z.string().uuid(),
      source_name: z.string().min(1),
      source_type: z.string().min(1),
      country: z.string().nullable(),
      visa_type: z.string().nullable(),
      language: z.string().nullable(),
      authority_level: z.string().min(1),
      published_at: z.string().datetime().nullable(),
      verified_at: z.string().datetime().nullable()
    })
  )
});

function invalidPayloadResult(message: string): ApiRequestResult<never> {
  return {
    ok: false,
    errorMessage: message,
    status: 500
  };
}

export async function generateAIStrategy(
  accessToken: string,
  payload: AIStrategyRequestPayload
): Promise<ApiRequestResult<AIStrategyResponse>> {
  const response = await apiRequest({
    authToken: accessToken,
    body: payload,
    method: "POST",
    path: "/ai/strategy",
    retries: 0,
    timeoutMs: 30000
  });

  if (!response.ok) {
    return response;
  }

  const parsed = aiStrategyResponseSchema.safeParse(response.data);
  if (!parsed.success) {
    return invalidPayloadResult("AI strategy response was invalid.");
  }

  return {
    ok: true,
    data: parsed.data,
    status: response.status
  };
}
