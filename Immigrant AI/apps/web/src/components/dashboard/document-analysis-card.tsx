import { DashboardStatusPill } from "@/components/dashboard/dashboard-status-pill";
import { Card } from "@/components/ui/card";
import type { DocumentCenterDocument } from "@/types/document-center";

type DocumentAnalysisCardProps = Readonly<{
  document: DocumentCenterDocument;
}>;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium"
  }).format(new Date(value));
}

function getUploadTone(
  state: DocumentCenterDocument["uploadState"]
): "neutral" | "positive" | "warning" | "critical" {
  if (state === "uploaded") {
    return "positive";
  }
  if (state === "processing") {
    return "neutral";
  }
  if (state === "flagged") {
    return "critical";
  }
  return "warning";
}

function getRelevanceTone(
  relevance: DocumentCenterDocument["analysis"]["pathwayRelevance"]["label"]
): "neutral" | "positive" | "warning" {
  if (relevance === "High") {
    return "positive";
  }
  if (relevance === "Medium") {
    return "warning";
  }
  return "neutral";
}

export function DocumentAnalysisCard({
  document
}: DocumentAnalysisCardProps) {
  return (
    <Card className="rounded-[30px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.88))] p-6 shadow-[0_22px_60px_rgba(15,23,42,0.07)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            {document.analysis.classification}
          </p>
          <h3 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
            {document.fileName}
          </h3>
          <p className="mt-2 text-sm text-slate-500">
            Added {formatDate(document.uploadedAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <DashboardStatusPill
            label={document.uploadState}
            tone={getUploadTone(document.uploadState)}
          />
          <DashboardStatusPill
            label={`${document.analysis.completenessScore}% complete`}
            tone={
              document.analysis.completenessScore >= 75 ? "positive" : "warning"
            }
          />
          <DashboardStatusPill
            label={`${document.analysis.pathwayRelevance.label} relevance`}
            tone={getRelevanceTone(document.analysis.pathwayRelevance.label)}
          />
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-[24px] border border-slate-200/80 bg-white/80 px-4 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Key information
          </p>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
            {document.analysis.extractedKeyInformation.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="rounded-[24px] border border-slate-200/80 bg-white/80 px-4 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Pathway relevance
          </p>
          <p className="mt-3 text-sm leading-6 text-slate-700">
            {document.analysis.pathwayRelevance.rationale}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-[24px] border border-amber-200/70 bg-amber-50/70 px-4 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-700">
            Missing information
          </p>
          {document.analysis.missingInformation.length > 0 ? (
            <ul className="mt-3 space-y-2 text-sm leading-6 text-amber-950">
              {document.analysis.missingInformation.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm leading-6 text-amber-950">
              No material gaps were detected in this document snapshot.
            </p>
          )}
        </div>

        <div className="rounded-[24px] border border-blue-200/70 bg-blue-50/70 px-4 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-700">
            Improvement suggestions
          </p>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-blue-950">
            {document.analysis.improvementSuggestions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}
