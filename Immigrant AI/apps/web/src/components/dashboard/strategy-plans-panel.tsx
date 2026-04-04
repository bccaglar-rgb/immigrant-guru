import { StrategyPlanCard } from "@/components/dashboard/strategy-plan-card";
import { DashboardStatusPill } from "@/components/dashboard/dashboard-status-pill";
import { Card } from "@/components/ui/card";
import type { CaseWorkspaceStrategy } from "@/types/case-workspace";

type StrategyPlansPanelProps = Readonly<{
  strategy: CaseWorkspaceStrategy;
}>;

function confidenceTone(value: CaseWorkspaceStrategy["confidenceLabel"]) {
  if (value === "high") {
    return "positive";
  }
  if (value === "medium") {
    return "warning";
  }
  if (value === "low") {
    return "critical";
  }
  return "neutral";
}

export function StrategyPlansPanel({ strategy }: StrategyPlansPanelProps) {
  return (
    <div className="space-y-6">
      <Card className="rounded-[30px] border border-white/80 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)] md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Strategy
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
              Plan A / Plan B / Plan C
            </h2>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              {strategy.summary}
            </p>
          </div>
          <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/90 px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Confidence
            </p>
            <div className="mt-3 flex items-center gap-3">
              <DashboardStatusPill
                label={strategy.confidenceLabel.replaceAll("_", " ")}
                tone={confidenceTone(strategy.confidenceLabel)}
              />
              <span className="text-lg font-semibold text-slate-950">
                {Math.round(strategy.confidenceScore)}/100
              </span>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl bg-slate-50/90 px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Assumptions
            </p>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
              {strategy.assumptions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl bg-amber-50/80 px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-700">
              Missing information
            </p>
            {strategy.missingInformation.length > 0 ? (
              <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                {strategy.missingInformation.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm leading-6 text-slate-700">
                No major strategy gaps are surfaced right now.
              </p>
            )}
          </div>
          <div className="rounded-2xl bg-blue-50/80 px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-700">
              Next steps
            </p>
            <ol className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
              {strategy.nextSteps.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-3">
        <StrategyPlanCard emphasis="strong" plan={strategy.plans[0] ?? null} slotLabel="Plan A" />
        <StrategyPlanCard emphasis="balanced" plan={strategy.plans[1] ?? null} slotLabel="Plan B" />
        <StrategyPlanCard emphasis="reserve" plan={strategy.plans[2] ?? null} slotLabel="Plan C" />
      </div>
    </div>
  );
}
