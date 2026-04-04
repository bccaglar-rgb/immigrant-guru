import Link from "next/link";

import { CaseHealthBadge } from "@/components/dashboard/case-health-badge";
import { CaseStatusBadge } from "@/components/dashboard/case-status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type {
  CaseWorkspaceHeaderData,
  CaseWorkspaceHealth
} from "@/types/case-workspace";

type CaseWorkspaceHeaderProps = Readonly<{
  header: CaseWorkspaceHeaderData;
  health: CaseWorkspaceHealth;
}>;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function CaseWorkspaceHeader({
  header,
  health
}: CaseWorkspaceHeaderProps) {
  return (
    <Card className="overflow-hidden rounded-[34px] border border-white/80 bg-[radial-gradient(circle_at_top_left,rgba(219,234,254,0.55),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.97),rgba(248,250,252,0.94))] p-7 shadow-[0_24px_72px_rgba(15,23,42,0.08)] md:p-8">
      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Case workspace
            </p>
            <CaseStatusBadge status={header.status} />
            <CaseHealthBadge score={health.score} status={health.status} />
          </div>

          <h1 className="mt-4 text-3xl font-semibold tracking-[-0.035em] text-slate-950 md:text-[2.6rem] md:leading-[1.02]">
            {header.title}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
            {header.summary}
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-slate-50/90 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Applicant
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-950">
                {header.applicantName}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50/90 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Target country
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-950">
                {header.targetCountry}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50/90 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Pathway
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-950">
                {header.targetPathway}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-white/80 bg-white/85 p-5 shadow-[0_12px_42px_rgba(15,23,42,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Operational snapshot
          </p>
          <p className="mt-3 text-lg font-semibold tracking-tight text-slate-950">
            {header.primaryGoal}
          </p>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {health.summary}
          </p>

          <div className="mt-5 rounded-2xl bg-slate-50/90 px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Next focus
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-950">
              {health.nextFocus}
            </p>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link
              className={cn(buttonVariants({ variant: "secondary" }))}
              href="/dashboard/cases"
            >
              Back to cases
            </Link>
            <p className="text-xs text-slate-500">
              Updated {formatDate(header.updatedAt)}
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}
