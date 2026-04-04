"use client";

import { DocumentAnalysisCard } from "@/components/dashboard/document-analysis-card";
import { DocumentIssuesList } from "@/components/dashboard/document-issues-list";
import { DocumentUploadZone } from "@/components/dashboard/document-upload-zone";
import { MissingDocumentsPanel } from "@/components/dashboard/missing-documents-panel";
import { Card } from "@/components/ui/card";
import { useDocumentCenterMock } from "@/hooks/use-document-center-mock";
import type { DocumentCenterData } from "@/types/document-center";

type DocumentCenterPanelProps = Readonly<{
  data: DocumentCenterData;
}>;

function LoadingState() {
  return (
    <div className="space-y-6">
      <div className="h-[260px] rounded-[32px] border border-slate-200 bg-white/60 anim-shimmer" />
      <div className="grid gap-6 xl:grid-cols-[0.86fr_1.14fr]">
        <div className="h-[320px] rounded-[30px] border border-slate-200 bg-white/60 anim-shimmer" />
        <div className="h-[320px] rounded-[30px] border border-slate-200 bg-white/60 anim-shimmer" />
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <Card className="rounded-[32px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.86))] p-8 text-center shadow-[0_22px_60px_rgba(15,23,42,0.07)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        Document center
      </p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
        Start the case evidence workspace
      </h2>
      <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-600">
        Upload the first core document to activate analysis, checklist guidance, pathway relevance, and evidence quality signals.
      </p>
    </Card>
  );
}

export function DocumentCenterPanel({
  data: initialData
}: DocumentCenterPanelProps) {
  const { data, isLoading, isUploading, uploadFile } =
    useDocumentCenterMock(initialData);

  if (isLoading) {
    return <LoadingState />;
  }

  return (
    <div className="space-y-6">
      <DocumentUploadZone isUploading={isUploading} onUpload={uploadFile} />

      <div className="grid gap-6 xl:grid-cols-[0.86fr_1.14fr]">
        <MissingDocumentsPanel items={data.missingDocuments} />
        <DocumentIssuesList documents={data.documents} />
      </div>

      {data.documents.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Document registry
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
              Intelligence-ready case files
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
              {data.summary}
            </p>
          </div>

          <div className="grid gap-5">
            {data.documents.map((document) => (
              <DocumentAnalysisCard document={document} key={document.id} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
