import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { StrategyPlan, StrategyPlanLabel } from "@/types/ai";

type StrategyPlanCardProps = Readonly<{
  emphasis?: "strong" | "balanced" | "reserve";
  plan: StrategyPlan | null;
  slotLabel: StrategyPlanLabel;
}>;

function formatValue(value: string): string {
  return value.replaceAll("_", " ");
}

function getAccentClasses(emphasis: NonNullable<StrategyPlanCardProps["emphasis"]>) {
  if (emphasis === "strong") {
    return "border-accent/20 bg-gradient-to-br from-accent/10 via-white to-white";
  }

  if (emphasis === "balanced") {
    return "border-green/20 bg-gradient-to-br from-green/10 via-white to-white";
  }

  return "border-line bg-gradient-to-br from-canvas to-white";
}

export function StrategyPlanCard({
  emphasis = "reserve",
  plan,
  slotLabel
}: StrategyPlanCardProps) {
  const accentClasses = getAccentClasses(emphasis);

  if (!plan) {
    return (
      <Card className={cn("p-6", accentClasses)}>
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm font-semibold uppercase tracking-wider text-muted">
            {slotLabel}
          </p>
          <span className="rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wider text-muted">
            Insufficient signal
          </span>
        </div>
        <h4 className="mt-4 text-xl font-semibold tracking-tight text-ink">Not enough evidence yet</h4>
        <p className="mt-3 text-sm leading-7 text-muted">
          The current profile and case context do not support a distinct additional
          plan in this slot yet.
        </p>
      </Card>
    );
  }

  return (
    <Card className={cn("p-6", accentClasses)}>
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-semibold uppercase tracking-wider text-accent">
          {plan.label}
        </p>
        <span className="rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wider text-muted">
          Suitability {Math.round(plan.suitability_score)}/100
        </span>
      </div>

      <h4 className="mt-4 text-xl font-semibold tracking-tight text-ink">{plan.pathway_name}</h4>
      <p className="mt-3 text-sm leading-7 text-muted">{plan.why_it_may_fit}</p>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-line bg-white px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            Complexity
          </p>
          <p className="mt-2 text-sm font-semibold capitalize text-ink">
            {formatValue(plan.estimated_complexity)}
          </p>
        </div>
        <div className="rounded-xl border border-line bg-white px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            Timeline
          </p>
          <p className="mt-2 text-sm font-semibold capitalize text-ink">
            {formatValue(plan.estimated_timeline_category)}
          </p>
        </div>
        <div className="rounded-xl border border-line bg-white px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            Cost
          </p>
          <p className="mt-2 text-sm font-semibold capitalize text-ink">
            {formatValue(plan.estimated_cost_category)}
          </p>
        </div>
      </div>

      <div className="mt-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">
          Major risks
        </p>
        {plan.major_risks.length > 0 ? (
          <ul className="mt-3 space-y-2 text-sm leading-7 text-muted">
            {plan.major_risks.map((risk) => (
              <li
                className="rounded-2xl border border-line bg-white px-4 py-3"
                key={risk}
              >
                {risk}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm leading-7 text-muted">
            No material plan-specific risks were highlighted yet.
          </p>
        )}
      </div>

      <div className="mt-5 rounded-xl border border-accent/10 bg-accent/5 px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-accent">
          Next action
        </p>
        <p className="mt-2 text-sm leading-7 text-ink">{plan.next_action}</p>
      </div>
    </Card>
  );
}

