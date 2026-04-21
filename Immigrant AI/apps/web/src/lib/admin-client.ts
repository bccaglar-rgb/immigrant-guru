import { z } from "zod";

import { apiRequest } from "@/lib/api-client";
import { immigrationCaseSummarySchema } from "@/lib/case-client";
import { userProfileSchema } from "@/lib/profile-client";
import type { ApiRequestResult } from "@/types/api";
import {
  knowledgeAuthorityLevelValues,
  knowledgeSourceTypeValues
} from "@/types/admin";
import type {
  AdminStats,
  AdminUserDirectoryEntry,
  AiFeedbackSummary,
  CaseAnalytics,
  DatabaseCheck,
  GrowthAnalytics,
  KnowledgeChunkCreatePayload,
  KnowledgeChunkRecord,
  KnowledgeSearchPayload,
  KnowledgeSearchResponse,
  KnowledgeSourceCreatePayload,
  KnowledgeSourceSummary,
  RevenueAnalytics,
  ServiceVersion,
  SystemHealth
} from "@/types/admin";

const metadataSchema = z.record(z.string(), z.unknown());

const serviceVersionSchema = z.object({
  environment: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1)
});

const databaseCheckSchema = z.object({
  database: z.string().min(1),
  status: z.string().min(1)
});

const knowledgeChunkSchema = z.object({
  chunk_index: z.number().int().min(0),
  chunk_text: z.string().min(1),
  created_at: z.string().datetime(),
  id: z.string().uuid(),
  language: z.string().nullable(),
  metadata: metadataSchema,
  source_id: z.string().uuid(),
  updated_at: z.string().datetime()
});

const knowledgeSourceSummarySchema = z.object({
  authority_level: z.enum(knowledgeAuthorityLevelValues),
  country: z.string().nullable(),
  created_at: z.string().datetime(),
  id: z.string().uuid(),
  language: z.string().nullable(),
  metadata: metadataSchema,
  published_at: z.string().datetime().nullable().optional(),
  source_name: z.string().min(1),
  source_type: z.enum(knowledgeSourceTypeValues),
  updated_at: z.string().datetime(),
  verified_at: z.string().datetime().nullable().optional(),
  visa_type: z.string().nullable()
});

const adminUserDirectoryEntrySchema = z.object({
  created_at: z.string().datetime(),
  email: z.string().email(),
  email_verified: z.boolean().optional(),
  id: z.string().uuid(),
  immigration_cases: z.array(immigrationCaseSummarySchema),
  plan: z.string().optional(),
  profile: userProfileSchema.nullable(),
  status: z.string().min(1),
  updated_at: z.string().datetime()
});

const adminStatsSchema = z.object({
  active_users: z.number().int(),
  by_plan: z.record(z.string(), z.number()),
  registered_today: z.number().int(),
  registered_this_week: z.number().int(),
  suspended_users: z.number().int(),
  total_users: z.number().int(),
  unverified_users: z.number().int(),
  verified_users: z.number().int()
});

const aiFeedbackEntrySchema = z.object({
  case_id: z.string().uuid(),
  comment: z.string().nullable(),
  created_at: z.string().datetime(),
  feature: z.string(),
  id: z.string().uuid(),
  rating: z.string(),
  target_id: z.string().nullable(),
  updated_at: z.string().datetime(),
  user_id: z.string().uuid()
});

const aiFeedbackSummarySchema = z.object({
  by_feature: z.record(z.string(), z.number()),
  generated_at: z.string().datetime(),
  negative_feedback: z.number().int(),
  positive_feedback: z.number().int(),
  recent_feedback: z.array(aiFeedbackEntrySchema),
  total_feedback: z.number().int()
});

const knowledgeSearchResultSchema = z.object({
  authority_score: z.number().min(0),
  chunk: knowledgeChunkSchema,
  freshness_score: z.number().min(0),
  lexical_score: z.number().min(0),
  match_reason: z.string().min(1),
  matched_terms: z.array(z.string()),
  score: z.number().min(0),
  source: knowledgeSourceSummarySchema
});

const knowledgeSearchResponseSchema = z.object({
  backend: z.string().min(1),
  results: z.array(knowledgeSearchResultSchema),
  total_results: z.number().int().min(0)
});

function invalidPayloadResult(message: string): ApiRequestResult<never> {
  return {
    ok: false,
    errorMessage: message,
    status: 500
  };
}

async function parseResponse<T>(
  response: Awaited<ReturnType<typeof apiRequest>>,
  schema: z.ZodType<T>,
  message: string
): Promise<ApiRequestResult<T>> {
  if (!response.ok) {
    return response;
  }

  const parsed = schema.safeParse(response.data);
  if (!parsed.success) {
    return invalidPayloadResult(message);
  }

  return {
    ok: true,
    data: parsed.data,
    status: response.status
  };
}

export async function getServiceVersion(): Promise<ApiRequestResult<ServiceVersion>> {
  return parseResponse(
    await apiRequest({
      method: "GET",
      path: "/version",
      retries: 0,
      timeoutMs: 5000
    }),
    serviceVersionSchema,
    "Version response was invalid."
  );
}

export async function getDatabaseCheck(): Promise<ApiRequestResult<DatabaseCheck>> {
  return parseResponse(
    await apiRequest({
      method: "GET",
      path: "/db-check",
      retries: 0,
      timeoutMs: 5000
    }),
    databaseCheckSchema,
    "Database check response was invalid."
  );
}

export async function listUsers(
  accessToken: string
): Promise<ApiRequestResult<AdminUserDirectoryEntry[]>> {
  return parseResponse(
    await apiRequest({
      authToken: accessToken,
      method: "GET",
      path: "/users",
      retries: 0,
      timeoutMs: 5000
    }),
    z.array(adminUserDirectoryEntrySchema),
    "User directory response was invalid."
  );
}

export async function searchKnowledgeBase(
  accessToken: string,
  payload: KnowledgeSearchPayload
): Promise<ApiRequestResult<KnowledgeSearchResponse>> {
  return parseResponse(
    await apiRequest({
      authToken: accessToken,
      body: payload,
      method: "POST",
      path: "/kb/search",
      retries: 0,
      timeoutMs: 15000
    }),
    knowledgeSearchResponseSchema,
    "Knowledge search response was invalid."
  );
}

export async function createKnowledgeSource(
  accessToken: string,
  payload: KnowledgeSourceCreatePayload
): Promise<ApiRequestResult<KnowledgeSourceSummary>> {
  return parseResponse(
    await apiRequest({
      authToken: accessToken,
      body: payload,
      method: "POST",
      path: "/admin/kb/sources",
      retries: 0,
      timeoutMs: 15000
    }),
    knowledgeSourceSummarySchema,
    "Knowledge source response was invalid."
  );
}

export async function createKnowledgeChunk(
  accessToken: string,
  payload: KnowledgeChunkCreatePayload
): Promise<ApiRequestResult<KnowledgeChunkRecord>> {
  return parseResponse(
    await apiRequest({
      authToken: accessToken,
      body: payload,
      method: "POST",
      path: "/admin/kb/chunks",
      retries: 0,
      timeoutMs: 15000
    }),
    knowledgeChunkSchema,
    "Knowledge chunk response was invalid."
  );
}

export async function getAdminStats(
  accessToken: string
): Promise<ApiRequestResult<AdminStats>> {
  return parseResponse(
    await apiRequest({
      authToken: accessToken,
      method: "GET",
      path: "/admin/stats",
      retries: 0,
      timeoutMs: 8000
    }),
    adminStatsSchema,
    "Admin stats response was invalid."
  );
}

export async function updateUser(
  accessToken: string,
  userId: string,
  payload: { plan?: string; status?: string }
): Promise<ApiRequestResult<AdminUserDirectoryEntry>> {
  return parseResponse(
    await apiRequest({
      authToken: accessToken,
      body: payload,
      method: "PATCH",
      path: `/admin/users/${userId}`,
      retries: 0,
      timeoutMs: 8000
    }),
    adminUserDirectoryEntrySchema,
    "User update response was invalid."
  );
}

export async function deleteUser(
  accessToken: string,
  userId: string
): Promise<ApiRequestResult<null>> {
  const response = await apiRequest({
    authToken: accessToken,
    method: "DELETE",
    path: `/admin/users/${userId}`,
    retries: 0,
    timeoutMs: 8000
  });
  if (!response.ok) return response;
  return { ok: true, data: null, status: response.status };
}

export async function getAiFeedback(
  accessToken: string,
  limit = 20
): Promise<ApiRequestResult<AiFeedbackSummary>> {
  return parseResponse(
    await apiRequest({
      authToken: accessToken,
      method: "GET",
      path: `/admin/ai/feedback?limit=${limit}`,
      retries: 0,
      timeoutMs: 8000
    }),
    aiFeedbackSummarySchema,
    "AI feedback response was invalid."
  );
}

// ─── Analytics ────────────────────────────────────────────────────────────────

const revenueByPlanSchema = z.object({
  plan: z.string(),
  price_usd: z.number().int(),
  user_count: z.number().int(),
  revenue_usd: z.number().int()
});

const revenueAnalyticsSchema = z.object({
  total_revenue_usd: z.number().int(),
  paid_user_count: z.number().int(),
  free_user_count: z.number().int(),
  arpu_usd: z.number(),
  by_plan: z.array(revenueByPlanSchema)
});

const caseStatusBreakdownSchema = z.object({
  status: z.string(),
  count: z.number().int()
});

const recentCaseEntrySchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  status: z.string(),
  user_email: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string()
});

const caseAnalyticsSchema = z.object({
  total_cases: z.number().int(),
  active_cases: z.number().int(),
  by_status: z.array(caseStatusBreakdownSchema),
  recent: z.array(recentCaseEntrySchema)
});

const growthAnalyticsSchema = z.object({
  range_days: z.number().int(),
  total_in_range: z.number().int(),
  daily: z.array(z.object({ date: z.string(), signups: z.number().int() }))
});

const systemHealthSchema = z.object({
  total_users: z.number().int(),
  total_cases: z.number().int(),
  total_documents: z.number().int(),
  document_queue: z.object({
    pending: z.number().int(),
    uploaded: z.number().int(),
    processing: z.number().int(),
    failed: z.number().int()
  }),
  generated_at: z.string()
});

export async function getRevenueAnalytics(
  accessToken: string
): Promise<ApiRequestResult<RevenueAnalytics>> {
  return parseResponse(
    await apiRequest({
      authToken: accessToken,
      method: "GET",
      path: "/admin/analytics/revenue",
      retries: 0,
      timeoutMs: 8000
    }),
    revenueAnalyticsSchema,
    "Revenue analytics response was invalid."
  );
}

export async function getCaseAnalytics(
  accessToken: string
): Promise<ApiRequestResult<CaseAnalytics>> {
  return parseResponse(
    await apiRequest({
      authToken: accessToken,
      method: "GET",
      path: "/admin/analytics/cases",
      retries: 0,
      timeoutMs: 8000
    }),
    caseAnalyticsSchema,
    "Case analytics response was invalid."
  );
}

export async function getGrowthAnalytics(
  accessToken: string,
  days = 30
): Promise<ApiRequestResult<GrowthAnalytics>> {
  return parseResponse(
    await apiRequest({
      authToken: accessToken,
      method: "GET",
      path: `/admin/analytics/growth?days=${days}`,
      retries: 0,
      timeoutMs: 8000
    }),
    growthAnalyticsSchema,
    "Growth analytics response was invalid."
  );
}

export async function getSystemHealth(
  accessToken: string
): Promise<ApiRequestResult<SystemHealth>> {
  return parseResponse(
    await apiRequest({
      authToken: accessToken,
      method: "GET",
      path: "/admin/analytics/system",
      retries: 0,
      timeoutMs: 8000
    }),
    systemHealthSchema,
    "System health response was invalid."
  );
}
