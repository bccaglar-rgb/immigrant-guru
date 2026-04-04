"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DocumentUploadZoneProps = Readonly<{
  isUploading: boolean;
  onUpload: (file: File) => void;
}>;

export function DocumentUploadZone({
  isUploading,
  onUpload
}: DocumentUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);

  function handleFile(file: File | null) {
    if (!file) {
      return;
    }

    setSelectedFileName(file.name);
    onUpload(file);
  }

  return (
    <div
      className={cn(
        "rounded-[32px] border border-dashed p-6 transition-all md:p-7",
        isDragActive
          ? "border-blue-300 bg-blue-50/60 shadow-[0_18px_40px_rgba(37,99,235,0.12)]"
          : "border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.82))]"
      )}
      onDragEnter={(event) => {
        event.preventDefault();
        setIsDragActive(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        setIsDragActive(false);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragActive(true);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragActive(false);
        handleFile(event.dataTransfer.files.item(0));
      }}
    >
      <input
        className="hidden"
        onChange={(event) => handleFile(event.target.files?.item(0) ?? null)}
        ref={inputRef}
        type="file"
      />

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Document intake
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            Upload case evidence for analysis
          </h2>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            Bring passports, employment letters, degree records, bank documents, and refusal letters into one evidence workspace that can be reviewed and improved.
          </p>
        </div>

        <Button
          disabled={isUploading}
          onClick={() => inputRef.current?.click()}
          type="button"
          variant="secondary"
        >
          Browse files
        </Button>
      </div>

      <div className="mt-6 rounded-[28px] border border-white/80 bg-white/80 px-6 py-10 text-center shadow-[0_18px_40px_rgba(15,23,42,0.05)]">
        <p className="text-lg font-semibold tracking-tight text-slate-950">
          Drag and drop a document here
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Premium review starts with clean identity, education, employment, and funds evidence.
        </p>
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          PDF, PNG, JPG, DOC, DOCX
        </p>
        {selectedFileName ? (
          <p className="mt-5 text-sm font-medium text-slate-700">
            Latest selection: {selectedFileName}
          </p>
        ) : null}
      </div>
    </div>
  );
}
