import { DashboardStatusPill } from "@/components/dashboard/dashboard-status-pill";
import { Card } from "@/components/ui/card";
import type { DocumentCenterDocument } from "@/types/document-center";

type DocumentIssuesListProps = Readonly<{
  documents: DocumentCenterDocument[];
}>;

function flattenIssues(documents: DocumentCenterDocument[]) {
  return documents.flatMap((document) =>
    document.analysis.issuesDetected.map((issue) => ({
      documentId: document.id,
      documentName: document.fileName,
      issue
    }))
  );
}

function issueTone(
  severity: "low" | "medium" | "high"
): "neutral" | "warning" | "critical" {
  if (severity === "high") {
    return "critical";
  }
  if (severity === "medium") {
    return "warning";
  }
  return "neutral";
}

export function DocumentIssuesList({
  documents
}: DocumentIssuesListProps) {
  const issues = flattenIssues(documents);

  return (
    <Card className="rounded-[30px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.88))] p-6 shadow-[0_22px_60px_rgba(15,23,42,0.07)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        Detected issues
      </p>
      <h3 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
        Documents that still need attention
      </h3>

      {issues.length === 0 ? (
        <div className="mt-6 rounded-[24px] border border-dashed border-slate-200 bg-slate-50/70 px-5 py-8 text-sm leading-7 text-slate-600">
          No material document issues are currently surfaced.
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {issues.map(({ documentId, documentName, issue }) => (
            <div
              className="rounded-[24px] border border-slate-200/80 bg-white/80 px-5 py-5"
              key={`${documentId}-${issue.id}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-base font-semibold text-slate-950">
                    {issue.title}
                  </p>
                  <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    {documentName}
                  </p>
                </div>
                <DashboardStatusPill
                  label={issue.severity}
                  tone={issueTone(issue.severity)}
                />
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-600">
                {issue.detail}
              </p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
