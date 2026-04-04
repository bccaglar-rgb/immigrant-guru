import { Card } from "@/components/ui/card";
import type { CaseHealth } from "@/types/workspace";

type CaseHealthPanelProps = Readonly<{
  health: CaseHealth | null;
  status: "loading" | "ready" | "error";
  errorMessage?: string | null;
  onRetry: () => void;
}>;

function getStatusLabel(value: string): string {
  return value.replaceAll("_", " ");
}

function getStatusClasses(status: string): string {
  if (status === "strong") {
    return "border-green/20 bg-green/10 text-green";
  }

  if (status === "needs_attention") {
    return "border-amber-300/30 bg-amber-50 text-amber-800";
  }

  if (status === "at_risk") {
    return "border-red/20 bg-red/5 text-red";
  }

  return "border-line bg-canvas/50 text-ink";
}

export function CaseHealthPanel({
  errorMessage,
  health,
  onRetry,
  status
}: CaseHealthPanelProps) {
  if (status === "loading") {
    return <Card className="h-56 animate-pulse p-6" />;
  }

  if (status === "error") {
    return (
      <Card className="border-red/20 bg-red/5 p-6">
        <p className="text-sm font-semibold uppercase tracking-wider text-red">
          Case health unavailable
        </p>
        <p className="mt-3 text-sm leading-7 text-red">
          {errorMessage || "The workspace health signal could not be loaded."}
        </p>
        <button
          className="mt-4 text-sm font-semibold text-red underline-offset-4 hover:underline"
          onClick={onRetry}
          type="button"
        >
          Retry health
        </button>
      </Card>
    );
  }

  if (!health) {
    return null;
  }

  return (
    <Card className="p-6 md:p-7">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-wider text-accent">
            Case health
          </p>
          <h3 className="mt-3 text-2xl font-bold tracking-tight text-ink">
            {Math.round(health.health_score)}/100
          </h3>
          <p className="mt-3 text-sm leading-7 text-muted">
            {health.recommended_next_focus}
          </p>
        </div>
        <div
          className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-wider ${getStatusClasses(health.health_status)}`}
        >
          {getStatusLabel(health.health_status)}
        </div>
      </div>

      <div className="mt-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">
          Main issues
        </p>
        {health.issues.length > 0 ? (
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {health.issues.map((issue) => (
              <li
                className="rounded-2xl border border-line bg-canvas/50 px-4 py-4 text-sm leading-7 text-muted"
                key={issue}
              >
                {issue}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm leading-7 text-muted">
            No major operational issues are currently flagged for this case.
          </p>
        )}
      </div>
    </Card>
  );
}
