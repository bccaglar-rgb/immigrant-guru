import { z } from "zod";

import { apiRequest } from "@/lib/api-client";
import type { ApiRequestResult } from "@/types/api";
import {
  actionPriorityValues,
  caseHealthStatusValues,
  checklistItemStatusValues,
  checklistRequirementLevelValues,
  missingInformationSeverityValues,
  probabilityConfidenceValues,
  riskSeverityValues,
  riskSourceValues,
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

const documentStatusSummarySchema = documentChecklistSummarySchema.extend({
  attention_required: z.boolean(),
  summary: z.string().min(1)
});

const caseHealthSchema = z.object({
  health_status: z.enum(caseHealthStatusValues),
  health_score: z.number().min(0).max(100),
  issues: z.array(z.string()),
  recommended_next_focus: z.string().min(1)
});

const readinessScoreSummarySchema = z.object({
  overall_score: z.number().min(0).max(100),
  label: z.string().min(1),
  summary: z.string().min(1),
  profile_completeness_score: z.number().min(0).max(100),
  financial_readiness_score: z.number().min(0).max(100),
  professional_strength_score: z.number().min(0).max(100),
  case_readiness_score: z.number().min(0).max(100)
});

const probabilitySummarySchema = z.object({
  probability_score: z.number().min(0).max(100),
  confidence_level: z.enum(probabilityConfidenceValues),
  summary: z.string().min(1),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string())
});

const timelineSummarySchema = z.object({
  total_estimated_duration_months: z.number().min(0).max(240),
  next_step: z.string().min(1).nullable(),
  next_step_duration_months: z.number().min(0).max(240).nullable(),
  delay_risks: z.array(z.string()),
  acceleration_tips: z.array(z.string())
});

const workspaceRiskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  severity: z.enum(riskSeverityValues),
  source: z.enum(riskSourceValues),
  description: z.string().min(1)
});

const missingInformationItemSchema = z.object({
  id: z.string().min(1),
  severity: z.enum(missingInformationSeverityValues),
  source: z.string().min(1),
  message: z.string().min(1)
});

const recommendedPathwaySchema = z.object({
  target_country: z.string().min(1).nullable(),
  pathway: z.string().min(1).nullable(),
  confidence_level: z.enum(probabilityConfidenceValues).nullable(),
  rationale: z.string().min(1)
});

const caseWorkspaceSchema = z.object({
  case_id: z.string().uuid(),
  generated_at: z.string().datetime(),
  readiness_score: readinessScoreSummarySchema,
  probability_summary: probabilitySummarySchema,
  timeline_summary: timelineSummarySchema,
  top_risks: z.array(workspaceRiskSchema),
  missing_information: z.array(missingInformationItemSchema),
  document_status_summary: documentStatusSummarySchema,
  recommended_pathway: recommendedPathwaySchema,
  case_health: caseHealthSchema,
  action_roadmap: z.array(actionRoadmapItemSchema),
  health: caseHealthSchema,
  next_best_action: nextBestActionSchema,
  missing_information_grouped: z.object({
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
