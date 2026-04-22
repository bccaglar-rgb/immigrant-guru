"use client";

import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import type { ImmigrationCaseStatus } from "@/types/cases";

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
  const t = useTranslations();

  const statusLabels: Record<ImmigrationCaseStatus, string> = {
    draft: t("Draft"),
    in_review: t("In review"),
    active: t("Active"),
    closed: t("Closed")
  };

  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em]",
        statusStyles[status]
      )}
    >
      {statusLabels[status]}
    </span>
  );
}
