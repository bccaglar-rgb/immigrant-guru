export const documentUploadStatusValues = [
  "pending",
  "uploaded",
  "processing",
  "failed"
] as const;

export type DocumentUploadStatus = (typeof documentUploadStatusValues)[number];

export type CaseDocument = {
  id: string;
  case_id: string;
  filename: string;
  original_filename: string;
  mime_type: string;
  size: number;
  storage_path: string;
  upload_status: DocumentUploadStatus;
  document_type: string | null;
  processing_attempts: number;
  processed_at: string | null;
  processing_error: string | null;
  created_at: string;
  updated_at: string;
};

export type UploadCaseDocumentPayload = {
  documentType?: string | null;
  file: File;
};
