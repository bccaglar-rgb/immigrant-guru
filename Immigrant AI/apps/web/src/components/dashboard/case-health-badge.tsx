import { cn } from "@/lib/utils";
import type { CaseWorkspaceHealthStatus } from "@/types/case-workspace";

type CaseHealthBadgeProps = Readonly<{
  score: number;
  status: CaseWorkspaceHealthStatus;
}>;

const toneMap: Record<CaseWorkspaceHealthStatus, string> = {
  at_risk: "border-rose-200 bg-rose-50 text-rose-700",
  incomplete: "border-slate-200 bg-slate-100 text-slate-700",
  needs_attention: "border-amber-200 bg-amber-50 text-amber-700",
  stable: "border-sky-200 bg-sky-50 text-sky-700",
  strong: "border-emerald-200 bg-emerald-50 text-emerald-700"
};

function formatStatus(status: CaseWorkspaceHealthStatus) {
  return status.replaceAll("_", " ");
}

export function CaseHealthBadge({ score, status }: CaseHealthBadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-3 rounded-full border px-4 py-2",
        toneMap[status]
      )}
    >
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em]">
        {formatStatus(status)}
      </span>
      <span className="h-1 w-1 rounded-full bg-current" />
      <span className="text-sm font-semibold">{Math.round(score)}/100</span>
    </div>
  );
}
