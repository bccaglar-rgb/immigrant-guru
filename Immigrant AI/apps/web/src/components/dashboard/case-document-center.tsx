"use client";

import { useCallback, useEffect, useState } from "react";

import { CaseDocumentList } from "@/components/dashboard/case-document-list";
import { CaseDocumentUpload } from "@/components/dashboard/case-document-upload";
import { useAuthSession } from "@/hooks/use-auth-session";
import { listCaseDocuments, uploadCaseDocument } from "@/lib/document-client";
import type { CaseDocument } from "@/types/documents";

type CaseDocumentCenterProps = Readonly<{
  accessToken: string;
  caseId: string;
  onDocumentsChanged?: () => void;
}>;

type FeedbackState =
  | {
      message: string;
      tone: "success" | "error";
    }
  | null;

export function CaseDocumentCenter({
  accessToken,
  caseId,
  onDocumentsChanged
}: CaseDocumentCenterProps) {
  const { clearSession } = useAuthSession();
  const [documents, setDocuments] = useState<CaseDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState>(null);

  const loadDocuments = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    setListError(null);

    const result = await listCaseDocuments(accessToken, caseId);
    setIsLoading(false);

    if (!result.ok) {
      if (result.status === 401) {
        clearSession();
        return false;
      }

      setListError(result.errorMessage);
      return false;
    }

    setDocuments(result.data);
    return true;
  }, [accessToken, caseId, clearSession]);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      void loadDocuments();
    }, 0);

    return () => {
      window.clearTimeout(loadTimer);
    };
  }, [loadDocuments]);

  useEffect(() => {
    const needsPolling = documents.some(
      (document) =>
        document.upload_status === "pending" || document.upload_status === "processing"
    );

    if (!needsPolling) {
      return;
    }

    const timer = window.setTimeout(() => {
      void loadDocuments();
    }, 4000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [documents, loadDocuments]);

  const handleUpload = async ({
    documentType,
    file
  }: {
    documentType: string | null;
    file: File;
  }) => {
    setIsUploading(true);
    setFeedback(null);
    setListError(null);

    const result = await uploadCaseDocument(accessToken, caseId, {
      documentType,
      file
    });

    setIsUploading(false);

    if (!result.ok) {
      if (result.status === 401) {
        clearSession();
        return {
          ok: false as const,
          errorMessage: "Your session expired. Sign in again to continue."
        };
      }

      setFeedback({
        message: result.errorMessage,
        tone: "error"
      });
      return {
        ok: false as const,
        errorMessage: result.errorMessage
      };
    }

    const refreshed = await loadDocuments();
    if (!refreshed) {
      return {
        ok: false as const,
        errorMessage: "Document uploaded, but the refreshed document list could not be loaded."
      };
    }

    setFeedback({
      message: "Document uploaded and queued for case processing.",
      tone: "success"
    });
    onDocumentsChanged?.();
    return { ok: true as const };
  };

  return (
    <div className="space-y-6">
      {feedback ? (
        <div
          className={`rounded-xl border px-4 py-4 text-sm ${
            feedback.tone === "success"
              ? "border-green/20 bg-green/10 text-green"
              : "border-red/20 bg-red/5 text-red"
          }`}
        >
          {feedback.message}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <CaseDocumentUpload isUploading={isUploading} onUpload={handleUpload} />
        <CaseDocumentList
          documents={documents}
          errorMessage={listError}
          isLoading={isLoading}
          onRetry={() => void loadDocuments()}
        />
      </div>
    </div>
  );
}
