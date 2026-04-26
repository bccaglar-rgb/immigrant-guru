"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { CaseDocument, DocumentUploadStatus } from "@/types/documents";

type CaseDocumentListProps = Readonly<{
  documents: CaseDocument[];
  errorMessage?: string | null;
  isLoading: boolean;
  onRetry: () => void;
}>;

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatFileSize(size: number): string {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (size >= 1024) {
    return `${Math.round(size / 1024)} KB`;
  }

  return `${size} B`;
}

function formatStatus(status: DocumentUploadStatus): string {
  return status.replaceAll("_", " ");
}

function statusClasses(status: DocumentUploadStatus): string {
  if (status === "uploaded") {
    return "border-green/20 bg-green/10 text-green";
  }

  if (status === "processing" || status === "pending") {
    return "border-green/20 bg-green/10 text-accent";
  }

  return "border-red/20 bg-red/5 text-red";
}

export function CaseDocumentList({
  documents,
  errorMessage,
  isLoading,
  onRetry
}: CaseDocumentListProps) {
  const t = useTranslations();

  return (
    <Card className="p-6 md:p-7">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-accent">
            {t("Document registry")}
          </p>
          <h4 className="mt-3 text-xl font-semibold tracking-tight text-ink">
            {t("Case preparation file trail")}
          </h4>
        </div>
        <p className="text-sm text-muted">
          {documents.length} {documents.length === 1 ? t("document") : t("documents")}
        </p>
      </div>

      {errorMessage ? (
        <div className="mt-6 rounded-xl border border-red/20 bg-red/5 px-4 py-4">
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-red">
            {t("Document list unavailable")}
          </p>
          <p className="mt-3 text-sm leading-7 text-red">{errorMessage}</p>
          <Button className="mt-4" onClick={onRetry} type="button" variant="secondary">
            {t("Retry")}
          </Button>
        </div>
      ) : null}

      {isLoading ? (
        <div className="mt-6 space-y-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <div className="h-28 animate-pulse rounded-[24px] border border-line bg-canvas/50" key={index} />
          ))}
        </div>
      ) : null}

      {!isLoading && !errorMessage && documents.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-line bg-canvas/50 px-5 py-10">
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-accent">
            {t("No documents yet")}
          </p>
          <h5 className="mt-3 text-xl font-semibold tracking-tight text-ink">
            {t("Build the evidence base for this case")}
          </h5>
          <p className="mt-3 text-sm leading-7 text-muted">
            {t("Upload identity, financial, academic, or employment records so the case workspace reflects what is already prepared and what is still missing")}
          </p>
        </div>
      ) : null}

      {!isLoading && !errorMessage && documents.length > 0 ? (
        <div className="mt-6 space-y-4">
          {documents.map((document) => (
            <div
              className="rounded-[24px] border border-line bg-canvas/50 px-5 py-5"
              key={document.id}
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-accent">
                    {document.document_type || t("Unclassified case file")}
                  </p>
                  <h5 className="mt-3 truncate text-lg font-semibold text-ink">
                    {document.original_filename}
                  </h5>
                  <p className="mt-2 text-sm text-muted">
                    {document.mime_type} · {formatFileSize(document.size)}
                  </p>
                </div>

                <div
                  className={cn(
                    "inline-flex rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em]",
                    statusClasses(document.upload_status)
                  )}
                >
                  {formatStatus(document.upload_status)}
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <div className="rounded-xl border border-line bg-white px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                    {t("Uploaded")}
                  </p>
                  <p className="mt-2 text-sm text-ink">{formatDate(document.created_at)}</p>
                </div>
                <div className="rounded-xl border border-line bg-white px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                    {t("Processed")}
                  </p>
                  <p className="mt-2 truncate text-sm text-ink">
                    {document.processed_at ? formatDate(document.processed_at) : t("Not yet")}
                  </p>
                </div>
                <div className="rounded-xl border border-line bg-white px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                    {t("Processing")}
                  </p>
                  <p className="mt-2 truncate text-sm text-ink">
                    {t("Attempt")} {document.processing_attempts}
                  </p>
                </div>
              </div>

              {document.processing_error ? (
                <div className="mt-4 rounded-2xl border border-red/20 bg-red/5 px-4 py-3 text-sm text-red">
                  {document.processing_error}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
