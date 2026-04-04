import { Card } from "@/components/ui/card";
import type { NextBestAction } from "@/types/workspace";

type NextBestActionPanelProps = Readonly<{
  action: NextBestAction | null;
  missingInformation?: {
    critical: string[];
    helpful: string[];
  } | null;
  status: "loading" | "ready" | "error";
  errorMessage?: string | null;
  onRetry: () => void;
}>;

function formatLabel(value: string): string {
  return value.replaceAll("_", " ");
}

export function NextBestActionPanel({
  action,
  errorMessage,
  missingInformation,
  onRetry,
  status
}: NextBestActionPanelProps) {
  if (status === "loading") {
    return <Card className="h-48 animate-pulse p-6" />;
  }

  if (status === "error") {
    return (
      <Card className="border-red/20 bg-red/5 p-6">
        <p className="text-sm font-semibold uppercase tracking-wider text-red">
          Next action unavailable
        </p>
        <p className="mt-3 text-sm leading-7 text-red">
          {errorMessage || "The next best action could not be resolved."}
        </p>
        <button
          className="mt-4 text-sm font-semibold text-red underline-offset-4 hover:underline"
          onClick={onRetry}
          type="button"
        >
          Retry action plan
        </button>
      </Card>
    );
  }

  if (!action) {
    return null;
  }

  return (
    <Card className="p-6 md:p-7">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-wider text-accent">
            Next best action
          </p>
          <h3 className="mt-3 text-xl font-semibold tracking-tight text-ink">{action.title}</h3>
          <p className="mt-3 text-sm leading-7 text-muted">{action.reasoning}</p>
        </div>
        <div className="grid gap-3 text-right">
          <div className="rounded-2xl border border-line bg-canvas/50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">
              Priority
            </p>
            <p className="mt-2 text-sm font-semibold text-ink">
              {formatLabel(action.priority)}
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-canvas/50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">
              Timing
            </p>
            <p className="mt-2 text-sm font-semibold text-ink">
              {formatLabel(action.timing_category)}
            </p>
          </div>
        </div>
      </div>

      {missingInformation &&
      (missingInformation.critical.length > 0 || missingInformation.helpful.length > 0) ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-red/20 bg-red/5 px-5 py-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-red">
              Critical missing information
            </p>
            <ul className="mt-3 space-y-2 text-sm leading-7 text-red">
              {missingInformation.critical.length > 0 ? (
                missingInformation.critical.map((item) => <li key={item}>{item}</li>)
              ) : (
                <li>No critical blockers are currently flagged.</li>
              )}
            </ul>
          </div>
          <div className="rounded-xl border border-line bg-canvas/50 px-5 py-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">
              Helpful missing information
            </p>
            <ul className="mt-3 space-y-2 text-sm leading-7 text-muted">
              {missingInformation.helpful.length > 0 ? (
                missingInformation.helpful.map((item) => <li key={item}>{item}</li>)
              ) : (
                <li>No secondary information gaps are currently flagged.</li>
              )}
            </ul>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
