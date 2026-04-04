"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const acceptedFileTypes = ".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx";
const allowedExtensions = new Set([
  ".doc",
  ".docx",
  ".jpeg",
  ".jpg",
  ".pdf",
  ".png",
  ".webp"
]);

type UploadResult =
  | { ok: true }
  | { ok: false; errorMessage: string };

type CaseDocumentUploadProps = Readonly<{
  isUploading: boolean;
  onUpload: (input: {
    documentType: string | null;
    file: File;
  }) => Promise<UploadResult>;
}>;

function formatFileSize(size: number): string {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (size >= 1024) {
    return `${Math.round(size / 1024)} KB`;
  }

  return `${size} B`;
}

function getExtension(filename: string): string {
  const lastDotIndex = filename.lastIndexOf(".");
  return lastDotIndex >= 0 ? filename.slice(lastDotIndex).toLowerCase() : "";
}

export function CaseDocumentUpload({
  isUploading,
  onUpload
}: CaseDocumentUploadProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  const applyFileSelection = (file: File | null) => {
    if (!file) {
      setSelectedFile(null);
      return;
    }

    if (file.size <= 0) {
      setError("Choose a non-empty file before uploading.");
      setSelectedFile(null);
      return;
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      setError("File exceeds the 25 MB upload limit.");
      setSelectedFile(null);
      return;
    }

    if (!allowedExtensions.has(getExtension(file.name))) {
      setError("This file type is not supported. Upload PDF, DOC, DOCX, JPG, PNG, or WEBP files.");
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
    setError(null);
  };

  const handleSubmit = async () => {
    if (!selectedFile) {
      setError("Select a document before uploading.");
      return;
    }

    const result = await onUpload({
      documentType: documentType.trim() || null,
      file: selectedFile
    });

    if (!result.ok) {
      setError(result.errorMessage);
      return;
    }

    setSelectedFile(null);
    setDocumentType("");
    setError(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-5">
      <div
        className={cn(
          "rounded-2xl border border-dashed bg-canvas/60 p-6 transition",
          isDragActive
            ? "border-accent/40 bg-accent/5"
            : "border-line hover:border-accent/25 hover:bg-accent/5"
        )}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragActive(true);
          setError(null);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setIsDragActive(false);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          setIsDragActive(true);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragActive(false);
          applyFileSelection(event.dataTransfer.files.item(0));
        }}
      >
        <input
          accept={acceptedFileTypes}
          className="hidden"
          disabled={isUploading}
          onChange={(event) => {
            applyFileSelection(event.target.files?.item(0) ?? null);
          }}
          ref={fileInputRef}
          type="file"
        />

        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-wider text-accent">
              Case files
            </p>
            <h4 className="mt-3 text-xl font-semibold tracking-tight text-ink">
              Upload evidence and preparation documents
            </h4>
            <p className="mt-3 text-sm leading-7 text-muted">
              Attach passports, education records, resumes, refusal letters, and
              other case materials that support pathway evaluation and later AI
              analysis.
            </p>
          </div>

          <Button
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
            type="button"
            variant="secondary"
          >
            Browse files
          </Button>
        </div>

        <div className="mt-6 rounded-[24px] border border-white/70 bg-white/80 px-5 py-8 text-center shadow-card">
          <p className="text-sm font-semibold text-ink">
            Drag and drop a document here
          </p>
          <p className="mt-2 text-sm text-muted">
            or use the file picker to attach one file at a time
          </p>
          <p className="mt-4 text-xs font-medium uppercase tracking-wider text-muted">
            PDF, PNG, JPG, WEBP, DOC, DOCX up to 25 MB
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
        <Input
          disabled={isUploading}
          helperText="Optional classification label such as Passport, Bank Statement, Resume, or Refusal Letter."
          label="Document type"
          maxLength={120}
          onChange={(event) => {
            setDocumentType(event.target.value);
            if (error) {
              setError(null);
            }
          }}
          placeholder="e.g. Passport"
          value={documentType}
        />
        <Button
          className="self-start lg:mt-[30px]"
          disabled={!selectedFile || isUploading}
          fullWidth
          onClick={handleSubmit}
          size="lg"
          type="button"
        >
          {isUploading ? "Uploading document..." : "Upload document"}
        </Button>
      </div>

      {selectedFile ? (
        <div className="rounded-xl border border-line bg-white/80 px-4 py-4 text-sm text-muted">
          <p className="text-xs font-semibold uppercase tracking-wider text-accent">
            Selected file
          </p>
          <p className="mt-2 font-semibold text-ink">{selectedFile.name}</p>
          <p className="mt-1">
            {selectedFile.type || "Unknown type"} · {formatFileSize(selectedFile.size)}
          </p>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red/20 bg-red/5 px-4 py-4 text-sm text-red">
          {error}
        </div>
      ) : null}
    </div>
  );
}
