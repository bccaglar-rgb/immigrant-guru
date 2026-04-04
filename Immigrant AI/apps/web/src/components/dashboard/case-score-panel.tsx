"use client";

import { Card } from "@/components/ui/card";
import type { ImmigrationScore } from "@/types/scoring";

type CaseScorePanelProps = Readonly<{
  score: ImmigrationScore | null;
  status: "loading" | "ready" | "error";
  errorMessage?: string | null;
  onRetry: () => void;
}>;

function formatScore(value: number): string {
  return `${Math.round(value)}/100`;
}

export function CaseScorePanel({
  errorMessage,
  onRetry,
  score,
  status
}: CaseScorePanelProps) {
  if (status === "loading") {
    return <Card className="h-72 animate-pulse p-6" />;
  }

  if (status === "error") {
    return (
      <Card className="border-red/20 bg-red/5 p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.08em] text-red">
          Score unavailable
        </p>
        <p className="mt-3 text-sm leading-7 text-red">
          {errorMessage || "The scoring service could not be reached for this case."}
        </p>
        <button
          className="mt-4 text-sm font-semibold text-red underline-offset-4 hover:underline"
          onClick={onRetry}
          type="button"
        >
          Retry score
        </button>
      </Card>
    );
  }

  if (!score) {
    return (
      <Card className="border-line bg-white/90 p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.08em] text-accent">
          Immigration score
        </p>
        <h3 className="mt-3 text-xl font-semibold tracking-tight text-ink">
          Score not available yet
        </h3>
        <p className="mt-3 text-sm leading-7 text-muted">
          This case does not have a usable score response yet. Refresh the score after
          the latest profile and case details are saved.
        </p>
        <button
          className="mt-4 text-sm font-semibold text-accent underline-offset-4 hover:underline"
          onClick={onRetry}
          type="button"
        >
          Retry score
        </button>
      </Card>
    );
  }

  const breakdowns = [
    ["Profile completeness", score.profile_completeness],
    ["Financial readiness", score.financial_readiness],
    ["Professional strength", score.professional_strength],
    ["Case readiness", score.case_readiness]
  ] as const;

  return (
    <Card className="p-6 md:p-7">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-accent">
            Immigration score
          </p>
          <h3 className="mt-3 text-2xl font-semibold tracking-tight text-ink">
            {formatScore(score.overall_score)}
          </h3>
          <p className="mt-3 text-sm leading-7 text-muted">{score.disclaimer}</p>
        </div>
        <div className="rounded-xl border border-line bg-canvas/50 px-4 py-4 text-sm text-muted">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-accent">
            Scoring version
          </p>
          <p className="mt-2 font-semibold text-ink">{score.scoring_version}</p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {breakdowns.map(([label, breakdown]) => (
          <div
            className="rounded-xl border border-line bg-canvas/50 px-4 py-4"
            key={label}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
              {label}
            </p>
            <p className="mt-2 text-2xl font-semibold text-ink">
              {formatScore(breakdown.score)}
            </p>
            <p className="mt-2 text-sm leading-7 text-muted">{breakdown.summary}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-line bg-canvas/50 px-5 py-5">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
          Key reasons
        </p>
        {score.overall_reasons.length > 0 ? (
          <ul className="mt-3 space-y-2 text-sm leading-7 text-muted">
            {score.overall_reasons.map((reason) => (
              <li
                className="rounded-2xl border border-line bg-white px-4 py-3"
                key={reason}
              >
                {reason}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm leading-7 text-muted">
            No summary reasons were generated for this score yet.
          </p>
        )}
      </div>
    </Card>
  );
}
