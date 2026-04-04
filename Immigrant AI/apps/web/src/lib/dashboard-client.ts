import { z } from "zod";

import { apiRequest } from "@/lib/api-client";
import { immigrationCaseSummarySchema } from "@/lib/case-client";
import { userProfileSchema } from "@/lib/profile-client";
import type {
  DashboardCase,
  DashboardProfile,
  DashboardRequestResult
} from "@/types/dashboard";

const dashboardCasesSchema = z.array(immigrationCaseSummarySchema);

function invalidPayload(message: string): DashboardRequestResult<never> {
  return {
    ok: false,
    errorMessage: message,
    status: 500
  };
}

export async function getDashboardProfile(
  accessToken: string
): Promise<DashboardRequestResult<DashboardProfile>> {
  const response = await apiRequest({
    authToken: accessToken,
    method: "GET",
    path: "/profile/me",
    retries: 0,
    timeoutMs: 5000
  });

  if (!response.ok) {
    return response;
  }

  const parsed = userProfileSchema.safeParse(response.data);
  if (!parsed.success) {
    return invalidPayload("Profile response was invalid.");
  }

  return {
    ok: true,
    data: parsed.data,
    status: response.status
  };
}

export async function getDashboardCases(
  accessToken: string
): Promise<DashboardRequestResult<DashboardCase[]>> {
  const response = await apiRequest({
    authToken: accessToken,
    method: "GET",
    path: "/cases",
    retries: 0,
    timeoutMs: 5000
  });

  if (!response.ok) {
    return response;
  }

  const parsed = dashboardCasesSchema.safeParse(response.data);
  if (!parsed.success) {
    return invalidPayload("Case list response was invalid.");
  }

  return {
    ok: true,
    data: parsed.data,
    status: response.status
  };
}
