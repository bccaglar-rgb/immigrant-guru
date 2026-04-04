import { Card } from "@/components/ui/card";
import type { CaseWorkspaceRiskItem } from "@/types/case-workspace";

type RiskBreakdownPanelProps = Readonly<{
  risks: CaseWorkspaceRiskItem[];
}>;

const severityTone = {
  high: "border-rose-200 bg-rose-50 text-rose-700",
  low: "border-slate-200 bg-slate-100 text-slate-600",
  medium: "border-amber-200 bg-amber-50 text-amber-700"
} as const;

function formatSeverity(value: CaseWorkspaceRiskItem["severity"]) {
  return value.toUpperCase();
}

export function RiskBreakdownPanel({ risks }: RiskBreakdownPanelProps) {
  return (
    <div className="space-y-6">
      <Card className="rounded-[30px] border border-white/80 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)] md:p-7">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          Risks
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
          What could weaken this case
        </h2>
        <p className="mt-3 text-sm leading-7 text-slate-600">
          Review the issues that most directly reduce probability, slow readiness, or create avoidable rework.
        </p>
      </Card>

      {risks.length === 0 ? (
        <Card className="rounded-[30px] border border-white/80 bg-white/90 p-8 text-sm leading-7 text-slate-600 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
          No active risk items are currently surfaced for this workspace.
        </Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          {risks.map((risk) => (
            <Card
              className="rounded-[30px] border border-white/80 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)]"
              key={risk.id}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-lg font-semibold tracking-tight text-slate-950">
                  {risk.title}
                </p>
                <span
                  className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${severityTone[risk.severity]}`}
                >
                  {formatSeverity(risk.severity)}
                </span>
              </div>
              <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Impact area
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-800">
                {risk.impactArea}
              </p>
              <p className="mt-4 text-sm leading-7 text-slate-600">
                {risk.description}
              </p>
              <div className="mt-5 rounded-2xl bg-slate-50/90 px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Mitigation actions
                </p>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                  {risk.mitigationActions.map((action) => (
                    <li key={action}>{action}</li>
                  ))}
                </ul>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
