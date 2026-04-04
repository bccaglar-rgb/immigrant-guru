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
  AdminUserDirectoryEntry,
  DatabaseCheck,
  KnowledgeChunkCreatePayload,
  KnowledgeChunkRecord,
  KnowledgeSearchPayload,
  KnowledgeSearchResponse,
  KnowledgeSourceCreatePayload,
  KnowledgeSourceSummary,
  ServiceVersion
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
  id: z.string().uuid(),
  immigration_cases: z.array(immigrationCaseSummarySchema),
  profile: userProfileSchema.nullable(),
  status: z.string().min(1),
  updated_at: z.string().datetime()
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
