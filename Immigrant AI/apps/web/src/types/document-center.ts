export const documentCenterUploadStateValues = [
  "uploaded",
  "processing",
  "flagged",
  "missing"
] as const;

export type DocumentCenterUploadState =
  (typeof documentCenterUploadStateValues)[number];

export type DocumentCenterIssueSeverity = "low" | "medium" | "high";

export type DocumentCenterIssue = {
  id: string;
  severity: DocumentCenterIssueSeverity;
  title: string;
  detail: string;
};

export type DocumentCenterAnalysis = {
  classification: string;
  completenessScore: number;
  extractedKeyInformation: string[];
  improvementSuggestions: string[];
  issuesDetected: DocumentCenterIssue[];
  missingInformation: string[];
  pathwayRelevance: {
    label: "High" | "Medium" | "Low";
    rationale: string;
  };
};

export type DocumentCenterDocument = {
  id: string;
  fileName: string;
  uploadedAt: string;
  uploadState: DocumentCenterUploadState;
  analysis: DocumentCenterAnalysis;
};

export type MissingDocumentItem = {
  id: string;
  title: string;
  category: string;
  priority: "required" | "recommended";
  rationale: string;
};

export type DocumentCenterData = {
  documents: DocumentCenterDocument[];
  missingDocuments: MissingDocumentItem[];
  summary: string;
};
