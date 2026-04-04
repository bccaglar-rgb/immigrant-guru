"use client";

import Link from "next/link";

import { Animate } from "@/components/ui/animate";
import type { DashboardCase } from "@/types/dashboard";

type CaseListSectionProps = Readonly<{
  cases: DashboardCase[];
}>;

function formatUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium"
  }).format(new Date(value));
}

export function CaseListSection({ cases }: CaseListSectionProps) {
  return (
    <Animate animation="fade-up" delay={100} duration={700}>
      <div className="glass-card rounded-2xl p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-accent">
              Case List
            </p>
            <h3 className="mt-2 text-xl font-semibold tracking-tight text-ink">
              Active migration goals
            </h3>
          </div>
          <Link className="text-sm font-semibold text-accent hover:text-accent-hover transition-colors" href="/dashboard/cases">
            View all
          </Link>
        </div>

        {cases.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-line bg-canvas/50 px-5 py-6">
            <p className="text-sm font-medium text-ink">No cases yet</p>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Create your first case to connect pathway evaluation, scoring,
              documents, and AI strategy in one workspace.
            </p>
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {cases.slice(0, 4).map((item, index) => (
              <div
                className="rounded-xl border border-line bg-white/60 px-5 py-4 transition-all duration-300 hover:bg-white hover:shadow-card hover:-translate-y-0.5"
                key={item.id}
                style={{ animationDelay: `${index * 80}ms` }}
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-ink">{item.title}</p>
                    <p className="mt-1 text-xs text-muted">
                      {item.target_country || "Target country pending"}{" "}
                      {item.target_program ? `\u00b7 ${item.target_program}` : ""}
                    </p>
                  </div>
                  <span className="inline-flex w-fit rounded-full bg-accent/8 px-3 py-1 text-xs font-semibold text-accent">
                    {item.status.replaceAll("_", " ")}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted">
                  <span>
                    Stage: {item.current_stage?.replaceAll("_", " ") || "Not set"}
                  </span>
                  <span>Updated: {formatUpdatedAt(item.updated_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Animate>
  );
}
