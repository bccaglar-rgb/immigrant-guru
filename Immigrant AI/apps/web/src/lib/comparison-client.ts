import { z } from "zod";

import { apiRequest } from "@/lib/api-client";
import type { ApiRequestResult } from "@/types/api";
import type {
  CountryComparisonRequestPayload,
  CountryComparisonResponse
} from "@/types/comparison-api";

const comparisonResponseItemSchema = z.object({
  country: z.string().min(1),
  pathway: z.string().min(1),
  success_probability: z.number().min(0).max(100),
  estimated_time_months: z.number().min(0).max(240),
  cost_level: z.enum(["LOW", "MEDIUM", "HIGH"]),
  difficulty: z.enum(["LOW", "MEDIUM", "HIGH"]),
  key_advantages: z.array(z.string()),
  key_disadvantages: z.array(z.string())
});

const comparisonResponseSchema = z.object({
  comparison: z.array(comparisonResponseItemSchema).min(1),
  best_option: z.string().min(1),
  reasoning: z.string().min(1),
  generated_at: z.string().datetime()
});

function invalidPayloadResult(message: string): ApiRequestResult<never> {
  return {
    ok: false,
    errorMessage: message,
    status: 500
  };
}

export async function compareCountries(
  accessToken: string,
  payload: CountryComparisonRequestPayload
): Promise<ApiRequestResult<CountryComparisonResponse>> {
  const response = await apiRequest({
    authToken: accessToken,
    body: payload,
    method: "POST",
    path: "/comparison",
    retries: 0,
    timeoutMs: 15000
  });

  if (!response.ok) {
    return response;
  }

  const parsed = comparisonResponseSchema.safeParse(response.data);
  if (!parsed.success) {
    return invalidPayloadResult("Country comparison response was invalid.");
  }

  return {
    ok: true,
    data: parsed.data,
    status: response.status
  };
}
