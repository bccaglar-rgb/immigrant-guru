import { z } from "zod";

import { apiRequest } from "@/lib/api-client";
import type { ApiRequestResult } from "@/types/api";
import {
  actionPriorityValues,
  caseHealthStatusValues,
  checklistItemStatusValues,
  checklistRequirementLevelValues,
  timingCategoryValues
} from "@/types/workspace";
import type { CaseWorkspace } from "@/types/workspace";

const nextBestActionSchema = z.object({
  title: z.string().min(1),
  reasoning: z.string().min(1),
  priority: z.enum(actionPriorityValues),
  timing_category: z.enum(timingCategoryValues)
});

const actionRoadmapItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  priority: z.enum(actionPriorityValues),
  timing_category: z.enum(timingCategoryValues),
  dependency_notes: z.string().nullable()
});

const documentChecklistItemSchema = z.object({
  id: z.string().min(1),
  document_name: z.string().min(1),
  category: z.string().min(1),
  requirement_level: z.enum(checklistRequirementLevelValues),
  status: z.enum(checklistItemStatusValues),
  notes: z.string().min(1),
  matched_document_id: z.string().uuid().nullable()
});

const documentChecklistSummarySchema = z.object({
  total_items: z.number().int().nonnegative(),
  required_items: z.number().int().nonnegative(),
  completed_items: z.number().int().nonnegative(),
  uploaded_items: z.number().int().nonnegative(),
  processing_items: z.number().int().nonnegative(),
  failed_items: z.number().int().nonnegative(),
  missing_required_items: z.number().int().nonnegative(),
  readiness_score: z.number().min(0).max(100)
});

const caseHealthSchema = z.object({
  health_status: z.enum(caseHealthStatusValues),
  health_score: z.number().min(0).max(100),
  issues: z.array(z.string()),
  recommended_next_focus: z.string().min(1)
});

const caseWorkspaceSchema = z.object({
  case_id: z.string().uuid(),
  generated_at: z.string().datetime(),
  health: caseHealthSchema,
  next_best_action: nextBestActionSchema,
  missing_information: z.object({
    critical: z.array(z.string()),
    helpful: z.array(z.string())
  }),
  checklist_summary: documentChecklistSummarySchema,
  checklist: z.array(documentChecklistItemSchema),
  roadmap: z.array(actionRoadmapItemSchema)
});

function invalidPayloadResult(message: string): ApiRequestResult<never> {
  return {
    ok: false,
    errorMessage: message,
    status: 500
  };
}

export async function getCaseWorkspace(
  accessToken: string,
  caseId: string
): Promise<ApiRequestResult<CaseWorkspace>> {
  const response = await apiRequest({
    authToken: accessToken,
    method: "GET",
    path: `/cases/${caseId}/workspace`,
    retries: 0,
    timeoutMs: 7000
  });

  if (!response.ok) {
    return response;
  }

  const parsed = caseWorkspaceSchema.safeParse(response.data);
  if (!parsed.success) {
    return invalidPayloadResult("Case workspace response was invalid.");
  }

  return {
    ok: true,
    data: parsed.data,
    status: response.status
  };
}
