import { z } from "zod";

import { apiRequest } from "@/lib/api-client";
import type { ApiRequestResult } from "@/types/api";
import {
  emptyImmigrationCaseFormValues,
  immigrationCaseStatusValues
} from "@/types/cases";
import type {
  ImmigrationCase,
  ImmigrationCaseFormValues,
  ImmigrationCaseSummary,
  ImmigrationCaseWritePayload
} from "@/types/cases";

export const immigrationCaseSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  target_country: z.string().nullable(),
  target_program: z.string().nullable(),
  current_stage: z.string().nullable(),
  status: z.enum(immigrationCaseStatusValues),
  notes: z.string().nullable(),
  latest_score: z.string().nullable(),
  risk_score: z.string().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

export const immigrationCaseSchema = immigrationCaseSummarySchema.extend({
  user_id: z.string().uuid()
});

function textField({
  label,
  maxLength,
  required = false
}: {
  label: string;
  maxLength: number;
  required?: boolean;
}) {
  return z
    .string()
    .trim()
    .max(maxLength, `${label} is too long.`)
    .refine((value) => !required || value.length > 0, {
      message: `${label} is required.`
    });
}

function scoreField(label: string) {
  return z
    .string()
    .trim()
    .refine((value) => value === "" || /^\d{1,3}(\.\d{1,2})?$/.test(value), {
      message: `${label} must be a number with up to 2 decimals.`
    })
    .refine((value) => value === "" || Number(value) <= 100, {
      message: `${label} must be 100 or less.`
    });
}

export const immigrationCaseFormSchema: z.ZodType<ImmigrationCaseFormValues> = z.object({
  title: textField({ label: "Case title", maxLength: 255, required: true }),
  target_country: textField({ label: "Target country", maxLength: 100 }),
  target_program: textField({ label: "Target pathway", maxLength: 120 }),
  current_stage: textField({ label: "Current stage", maxLength: 120 }),
  status: z.enum(immigrationCaseStatusValues),
  notes: z.string().trim(),
  latest_score: scoreField("Latest score"),
  risk_score: scoreField("Risk score")
});

function emptyToNull(value: string): string | null {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function caseToFormValues(
  immigrationCase: ImmigrationCase | ImmigrationCaseSummary
): ImmigrationCaseFormValues {
  return {
    title: immigrationCase.title,
    target_country:
      immigrationCase.target_country ?? emptyImmigrationCaseFormValues.target_country,
    target_program:
      immigrationCase.target_program ?? emptyImmigrationCaseFormValues.target_program,
    current_stage:
      immigrationCase.current_stage ?? emptyImmigrationCaseFormValues.current_stage,
    status: immigrationCase.status,
    notes: immigrationCase.notes ?? emptyImmigrationCaseFormValues.notes,
    latest_score:
      immigrationCase.latest_score ?? emptyImmigrationCaseFormValues.latest_score,
    risk_score:
      immigrationCase.risk_score ?? emptyImmigrationCaseFormValues.risk_score
  };
}

export function caseFormToPayload(
  values: ImmigrationCaseFormValues
): ImmigrationCaseWritePayload {
  return {
    title: values.title.trim(),
    target_country: emptyToNull(values.target_country),
    target_program: emptyToNull(values.target_program),
    current_stage: emptyToNull(values.current_stage),
    status: values.status,
    notes: emptyToNull(values.notes),
    latest_score: emptyToNull(values.latest_score),
    risk_score: emptyToNull(values.risk_score)
  };
}

function invalidPayloadResult(message: string): ApiRequestResult<never> {
  return {
    ok: false,
    errorMessage: message,
    status: 500
  };
}

export async function listImmigrationCases(
  accessToken: string
): Promise<ApiRequestResult<ImmigrationCaseSummary[]>> {
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

  const parsed = z.array(immigrationCaseSummarySchema).safeParse(response.data);
  if (!parsed.success) {
    return invalidPayloadResult("Case list response was invalid.");
  }

  return {
    ok: true,
    data: parsed.data,
    status: response.status
  };
}

export async function getImmigrationCase(
  accessToken: string,
  caseId: string
): Promise<ApiRequestResult<ImmigrationCase>> {
  const response = await apiRequest({
    authToken: accessToken,
    method: "GET",
    path: `/cases/${caseId}`,
    retries: 0,
    timeoutMs: 5000
  });

  if (!response.ok) {
    return response;
  }

  const parsed = immigrationCaseSchema.safeParse(response.data);
  if (!parsed.success) {
    return invalidPayloadResult("Case detail response was invalid.");
  }

  return {
    ok: true,
    data: parsed.data,
    status: response.status
  };
}

export async function createImmigrationCase(
  accessToken: string,
  payload: ImmigrationCaseWritePayload
): Promise<ApiRequestResult<ImmigrationCase>> {
  const response = await apiRequest({
    authToken: accessToken,
    body: payload,
    method: "POST",
    path: "/cases",
    retries: 0,
    timeoutMs: 5000
  });

  if (!response.ok) {
    return response;
  }

  const parsed = immigrationCaseSchema.safeParse(response.data);
  if (!parsed.success) {
    return invalidPayloadResult("Created case response was invalid.");
  }

  return {
    ok: true,
    data: parsed.data,
    status: response.status
  };
}

export async function updateImmigrationCase(
  accessToken: string,
  caseId: string,
  payload: ImmigrationCaseWritePayload
): Promise<ApiRequestResult<ImmigrationCase>> {
  const response = await apiRequest({
    authToken: accessToken,
    body: payload,
    method: "PUT",
    path: `/cases/${caseId}`,
    retries: 0,
    timeoutMs: 5000
  });

  if (!response.ok) {
    return response;
  }

  const parsed = immigrationCaseSchema.safeParse(response.data);
  if (!parsed.success) {
    return invalidPayloadResult("Updated case response was invalid.");
  }

  return {
    ok: true,
    data: parsed.data,
    status: response.status
  };
}

export async function deleteImmigrationCase(
  accessToken: string,
  caseId: string
): Promise<ApiRequestResult<null>> {
  const response = await apiRequest({
    authToken: accessToken,
    method: "DELETE",
    path: `/cases/${caseId}`,
    retries: 0,
    timeoutMs: 5000
  });

  if (!response.ok) {
    return response;
  }

  return {
    ok: true,
    data: null,
    status: response.status
  };
}
