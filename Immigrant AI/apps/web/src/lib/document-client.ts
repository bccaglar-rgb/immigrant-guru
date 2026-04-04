import { z } from "zod";

import { apiRequest } from "@/lib/api-client";
import type { ApiRequestResult } from "@/types/api";
import { documentUploadStatusValues } from "@/types/documents";
import type { CaseDocument, UploadCaseDocumentPayload } from "@/types/documents";

const caseDocumentSchema = z.object({
  id: z.string().uuid(),
  case_id: z.string().uuid(),
  filename: z.string().min(1),
  original_filename: z.string().min(1),
  mime_type: z.string().min(1),
  size: z.number().int().nonnegative(),
  storage_path: z.string().min(1),
  upload_status: z.enum(documentUploadStatusValues),
  document_type: z.string().nullable(),
  processing_attempts: z.number().int().nonnegative(),
  processed_at: z.string().datetime().nullable(),
  processing_error: z.string().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

function invalidPayloadResult(message: string): ApiRequestResult<never> {
  return {
    ok: false,
    errorMessage: message,
    status: 500
  };
}

export async function listCaseDocuments(
  accessToken: string,
  caseId: string
): Promise<ApiRequestResult<CaseDocument[]>> {
  const response = await apiRequest({
    authToken: accessToken,
    method: "GET",
    path: `/cases/${caseId}/documents`,
    retries: 0,
    timeoutMs: 7000
  });

  if (!response.ok) {
    return response;
  }

  const parsed = z.array(caseDocumentSchema).safeParse(response.data);
  if (!parsed.success) {
    return invalidPayloadResult("Document list response was invalid.");
  }

  return {
    ok: true,
    data: parsed.data,
    status: response.status
  };
}

export async function uploadCaseDocument(
  accessToken: string,
  caseId: string,
  payload: UploadCaseDocumentPayload
): Promise<ApiRequestResult<CaseDocument>> {
  const formData = new FormData();
  formData.append("file", payload.file);

  const normalizedDocumentType = payload.documentType?.trim();
  if (normalizedDocumentType) {
    formData.append("document_type", normalizedDocumentType);
  }

  const response = await apiRequest({
    authToken: accessToken,
    body: formData,
    method: "POST",
    path: `/cases/${caseId}/documents`,
    retries: 0,
    timeoutMs: 30000
  });

  if (!response.ok) {
    return response;
  }

  const parsed = caseDocumentSchema.safeParse(response.data);
  if (!parsed.success) {
    return invalidPayloadResult("Uploaded document response was invalid.");
  }

  return {
    ok: true,
    data: parsed.data,
    status: response.status
  };
}
