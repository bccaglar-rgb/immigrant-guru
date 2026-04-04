"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type {
  DocumentCenterData,
  DocumentCenterDocument
} from "@/types/document-center";

type UseDocumentCenterMockResult = {
  data: DocumentCenterData;
  isLoading: boolean;
  isUploading: boolean;
  uploadFile: (file: File) => void;
};

function buildMockUploadDocument(file: File): DocumentCenterDocument {
  return {
    analysis: {
      classification: "Newly uploaded file",
      completenessScore: 48,
      extractedKeyInformation: [
        "Initial upload received",
        "Awaiting detailed classification"
      ],
      improvementSuggestions: [
        "Use a cleaner scan if the document has dense text or weak contrast.",
        "Add a document type label after upload for better case mapping."
      ],
      issuesDetected: [
        {
          detail:
            "The file has been uploaded but has not been fully analyzed yet.",
          id: `issue-${Date.now()}`,
          severity: "medium",
          title: "Analysis pending"
        }
      ],
      missingInformation: [
        "Detailed extraction results",
        "Pathway-specific fit review"
      ],
      pathwayRelevance: {
        label: "Medium",
        rationale:
          "Relevance will become more precise once the document is fully classified."
      }
    },
    fileName: file.name,
    id: `uploaded-${Date.now()}`,
    uploadState: "processing",
    uploadedAt: new Date().toISOString()
  };
}

export function useDocumentCenterMock(
  initialData: DocumentCenterData
): UseDocumentCenterMockResult {
  const [documents, setDocuments] = useState(initialData.documents);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const uploadTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setDocuments(initialData.documents);
    setIsLoading(true);

    const timer = window.setTimeout(() => {
      setIsLoading(false);
    }, 450);

    return () => {
      window.clearTimeout(timer);
    };
  }, [initialData]);

  useEffect(() => {
    return () => {
      if (uploadTimerRef.current !== null) {
        window.clearTimeout(uploadTimerRef.current);
      }
    };
  }, []);

  function uploadFile(file: File) {
    setIsUploading(true);
    const mockDocument = buildMockUploadDocument(file);

    uploadTimerRef.current = window.setTimeout(() => {
      setDocuments((currentDocuments) => [mockDocument, ...currentDocuments]);
      setIsUploading(false);
      uploadTimerRef.current = null;
    }, 800);
  }

  const data = useMemo<DocumentCenterData>(
    () => ({
      ...initialData,
      documents
    }),
    [documents, initialData]
  );

  return {
    data,
    isLoading,
    isUploading,
    uploadFile
  };
}
