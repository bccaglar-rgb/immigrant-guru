import { Card } from "@/components/ui/card";
import type {
  DocumentChecklistItem,
  DocumentChecklistSummary
} from "@/types/workspace";

type DocumentChecklistPanelProps = Readonly<{
  checklist: DocumentChecklistItem[];
  summary: DocumentChecklistSummary | null;
  status: "loading" | "ready" | "error";
  errorMessage?: string | null;
  onRetry: () => void;
}>;

function formatLabel(value: string): string {
  return value.replaceAll("_", " ");
}

function getStatusClasses(status: string): string {
  if (status === "uploaded") {
    return "border-green/20 bg-green/10 text-green";
  }

  if (status === "processing") {
    return "border-amber-300/30 bg-amber-50 text-amber-800";
  }

  if (status === "failed") {
    return "border-red/20 bg-red/5 text-red";
  }

  return "border-line bg-white text-muted";
}

export function DocumentChecklistPanel({
  checklist,
  errorMessage,
  onRetry,
  status,
  summary
}: DocumentChecklistPanelProps) {
  if (status === "loading") {
    return <Card className="h-80 animate-pulse p-6" />;
  }

  if (status === "error") {
    return (
      <Card className="border-red/20 bg-red/5 p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.08em] text-red">
          Checklist unavailable
        </p>
        <p className="mt-3 text-sm leading-7 text-red">
          {errorMessage || "The document checklist could not be loaded."}
        </p>
        <button
          className="mt-4 text-sm font-semibold text-red underline-offset-4 hover:underline"
          onClick={onRetry}
          type="button"
        >
          Retry checklist
        </button>
      </Card>
    );
  }

  return (
    <Card className="p-6 md:p-7">
      <p className="text-sm font-semibold uppercase tracking-[0.08em] text-accent">
        Document checklist
      </p>
      <h3 className="mt-3 text-xl font-semibold tracking-tight text-ink">
        Evidence preparation board
      </h3>
      <p className="mt-3 text-sm leading-7 text-muted">
        Track likely required and recommended documents before the case moves toward filing readiness.
      </p>

      {summary ? (
        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <div className="rounded-xl border border-line bg-canvas/50 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
              Readiness
            </p>
            <p className="mt-2 text-2xl font-semibold text-ink">
              {Math.round(summary.readiness_score)}/100
            </p>
          </div>
          <div className="rounded-xl border border-line bg-canvas/50 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
              Required
            </p>
            <p className="mt-2 text-2xl font-semibold text-ink">
              {summary.required_items}
            </p>
          </div>
          <div className="rounded-xl border border-line bg-canvas/50 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
              Uploaded
            </p>
            <p className="mt-2 text-2xl font-semibold text-ink">
              {summary.uploaded_items}
            </p>
          </div>
          <div className="rounded-xl border border-line bg-canvas/50 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
              Missing required
            </p>
            <p className="mt-2 text-2xl font-semibold text-ink">
              {summary.missing_required_items}
            </p>
          </div>
        </div>
      ) : null}

      {checklist.length > 0 ? (
        <div className="mt-6 grid gap-4">
          {checklist.map((item) => (
            <div
              className="rounded-xl border border-line bg-canvas/50 px-5 py-5"
              key={item.id}
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-lg font-semibold text-ink">{item.document_name}</p>
                  <p className="mt-2 text-sm text-muted">
                    {formatLabel(item.category)} · {formatLabel(item.requirement_level)}
                  </p>
                </div>
                <div
                  className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] ${getStatusClasses(item.status)}`}
                >
                  {formatLabel(item.status)}
                </div>
              </div>
              <p className="mt-4 text-sm leading-7 text-muted">{item.notes}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-6 text-sm leading-7 text-muted">
          No checklist items are available for this case yet.
        </p>
      )}
    </Card>
  );
}
