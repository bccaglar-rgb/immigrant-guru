import { cn } from "@/lib/utils";
import type { ImmigrationCaseStatus } from "@/types/cases";

const statusLabels: Record<ImmigrationCaseStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  active: "Active",
  closed: "Closed"
};

const statusStyles: Record<ImmigrationCaseStatus, string> = {
  draft: "border-line bg-white text-muted",
  in_review: "border-amber-200 bg-amber-50 text-amber-800",
  active: "border-green/20 bg-green/10 text-green",
  closed: "border-slate-200 bg-slate-100 text-slate-700"
};

type CaseStatusBadgeProps = Readonly<{
  status: ImmigrationCaseStatus;
}>;

export function CaseStatusBadge({ status }: CaseStatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider",
        statusStyles[status]
      )}
    >
      {statusLabels[status]}
    </span>
  );
}

