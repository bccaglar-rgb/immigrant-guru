import { Card } from "@/components/ui/card";
import type { CaseWorkspaceDocuments } from "@/types/case-workspace";

type DocumentChecklistPanelProps = Readonly<{
  documents: CaseWorkspaceDocuments;
}>;

const statusTone = {
  flagged: "border-rose-200 bg-rose-50 text-rose-700",
  missing: "border-amber-200 bg-amber-50 text-amber-700",
  processing: "border-sky-200 bg-sky-50 text-sky-700",
  uploaded: "border-emerald-200 bg-emerald-50 text-emerald-700"
} as const;

function formatLabel(value: string) {
  return value.replaceAll("_", " ");
}

export function DocumentChecklistPanel({
  documents
}: DocumentChecklistPanelProps) {
  return (
    <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
      <Card className="rounded-[30px] border border-white/80 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)] md:p-7">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          Documents
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
          Document checklist
        </h2>
        <p className="mt-3 text-sm leading-7 text-slate-600">
          {documents.summary}
        </p>

        {documents.checklist.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-5 py-8 text-sm leading-7 text-slate-600">
            No checklist items are active yet.
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {documents.checklist.map((item) => (
              <div
                className="rounded-[24px] border border-slate-200/80 bg-slate-50/80 px-5 py-5"
                key={item.id}
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-base font-semibold text-slate-950">
                      {item.name}
                    </p>
                    <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                      {item.category} · {item.requirementLevel}
                    </p>
                  </div>
                  <span
                    className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${statusTone[item.status]}`}
                  >
                    {formatLabel(item.status)}
                  </span>
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-600">
                  {item.note}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="rounded-[30px] border border-white/80 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          Uploaded files
        </p>
        <h3 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
          Case document registry
        </h3>

        {documents.uploadedDocuments.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-5 py-8 text-sm leading-7 text-slate-600">
            No uploaded documents are linked to this case yet.
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {documents.uploadedDocuments.map((document) => (
              <div
                className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-4"
                key={document.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">
                      {document.original_filename}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {document.document_type || "Document type pending"}
                    </p>
                  </div>
                  <span
                    className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${statusTone[document.upload_status === "failed" ? "flagged" : document.upload_status === "pending" ? "processing" : document.upload_status]}`}
                  >
                    {formatLabel(document.upload_status)}
                  </span>
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  Added{" "}
                  {new Intl.DateTimeFormat("en-US", {
                    dateStyle: "medium"
                  }).format(new Date(document.created_at))}
                </p>
                {document.processing_error ? (
                  <p className="mt-2 text-sm text-rose-700">
                    {document.processing_error}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
