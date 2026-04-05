import { apiRequest } from "@/lib/api-client";
import type { ApiRequestResult } from "@/types/api";
import type { ProfileAnalysisResult } from "@/types/analysis";

export async function getProfileAnalysis(
  accessToken: string
): Promise<ApiRequestResult<ProfileAnalysisResult>> {
  const response = await apiRequest({
    authToken: accessToken,
    method: "POST",
    path: "/ai/profile-analysis",
    retries: 0,
    timeoutMs: 10000,
  });

  if (!response.ok) {
    return {
      ok: false,
      errorMessage: response.errorMessage,
      status: response.status,
    };
  }

  return {
    ok: true,
    data: response.data as ProfileAnalysisResult,
    status: response.status,
  };
}
