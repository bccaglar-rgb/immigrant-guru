"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { CaseForm } from "@/components/dashboard/case-form";
import { CaseStatusBadge } from "@/components/dashboard/case-status-badge";
import { DashboardErrorState } from "@/components/dashboard/dashboard-error-state";
import { DashboardPageHeader } from "@/components/dashboard/dashboard-page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuthSession } from "@/hooks/use-auth-session";
import { createImmigrationCase, listImmigrationCases } from "@/lib/case-client";
import { emptyImmigrationCaseFormValues } from "@/types/cases";
import type {
  ImmigrationCaseSummary,
  ImmigrationCaseWritePayload
} from "@/types/cases";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium"
  }).format(new Date(value));
}

function formatCaseText(value: string | null): string {
  return value?.replaceAll("_", " ") || "Not set";
}

function formatScore(value: string | null): string {
  return value ? `${value}/100` : "Pending";
}

function CasesSkeleton() {
  return (
    <div className="space-y-6">
      <Card className="h-[560px] animate-pulse p-6" />
      <div className="grid gap-4 xl:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card className="h-64 animate-pulse p-6" key={index} />
        ))}
      </div>
    </div>
  );
}

export function DashboardCasesPage() {
  const router = useRouter();
  const { clearSession, session, status } = useAuthSession();
  const [pageStatus, setPageStatus] = useState<"loading" | "ready" | "error">(
    "loading"
  );
  const [pageError, setPageError] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [cases, setCases] = useState<ImmigrationCaseSummary[]>([]);

  const loadCases = useCallback(async () => {
    if (status !== "authenticated" || !session) {
      return;
    }

    setPageStatus("loading");
    setPageError("");
    setFeedback(null);

    const result = await listImmigrationCases(session.accessToken);
    if (!result.ok) {
      if (result.status === 401) {
        clearSession();
        return;
      }

      setPageStatus("error");
      setPageError(result.errorMessage);
      return;
    }

    setCases(result.data);
    setPageStatus("ready");
  }, [clearSession, session, status]);

  useEffect(() => {
    if (status === "authenticated" && session) {
      const loadTimer = window.setTimeout(() => {
        void loadCases();
      }, 0);

      return () => {
        window.clearTimeout(loadTimer);
      };
    }
  }, [loadCases, session, status]);

  const handleCreate = async (payload: ImmigrationCaseWritePayload) => {
    if (!session) {
      return {
        ok: false as const,
        errorMessage: "You are no longer authenticated."
      };
    }

    setIsCreating(true);

    const result = await createImmigrationCase(session.accessToken, payload);
    setIsCreating(false);

    if (!result.ok) {
      if (result.status === 401) {
        clearSession();
      }

      return {
        ok: false as const,
        errorMessage: result.errorMessage
      };
    }

    setFeedback("Strategy case created successfully.");
    setCases((current) => [result.data, ...current]);
    setIsCreateOpen(false);
    router.push(`/dashboard/cases/${result.data.id}`);
    router.refresh();

    return {
      ok: true as const
    };
  };

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        actions={
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              disabled={pageStatus === "loading" || isCreating}
              onClick={() => {
                void loadCases();
              }}
              type="button"
              variant="secondary"
            >
              Refresh cases
            </Button>
            <Button
              onClick={() => {
                setFeedback(null);
                setIsCreateOpen((current) => !current);
              }}
              type="button"
            >
              {isCreateOpen ? "Close new case" : "New case"}
            </Button>
          </div>
        }
        description="Manage immigration strategy records that anchor pathway evaluation, stage tracking, scoring, and later document workflows."
        eyebrow="Cases"
        title="Immigration strategy cases"
      />

      {feedback ? (
        <div className="rounded-xl border border-green/20 bg-green/10 px-4 py-4 text-sm text-green">
          {feedback}
        </div>
      ) : null}

      {isCreateOpen ? (
        <CaseForm
          cancelLabel="Close"
          initialValues={emptyImmigrationCaseFormValues}
          isSubmitting={isCreating}
          mode="create"
          onCancel={() => setIsCreateOpen(false)}
          onSubmit={handleCreate}
        />
      ) : null}

      {pageStatus === "loading" ? <CasesSkeleton /> : null}
      {pageStatus === "error" ? (
        <DashboardErrorState
          message={pageError}
          onRetry={() => void loadCases()}
          title="The case portfolio could not be loaded."
        />
      ) : null}

      {pageStatus === "ready" ? (
        <Card className="p-6 md:p-7">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-accent">
                Case portfolio
              </p>
              <h3 className="mt-3 text-xl font-semibold tracking-tight text-ink">
                Track every active migration path in one workspace
              </h3>
            </div>
            <p className="text-sm text-muted">
              {cases.length} {cases.length === 1 ? "case" : "cases"} on record
            </p>
          </div>

          {cases.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-line bg-canvas/50 px-5 py-10">
              <p className="text-sm font-semibold uppercase tracking-wider text-accent">
                No strategy cases yet
              </p>
              <h4 className="mt-3 text-xl font-semibold tracking-tight text-ink">
                Start with a target country and pathway
              </h4>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-muted">
                Create a case for each migration plan you want to evaluate,
                compare, or execute. Cases anchor strategy generation, scoring,
                and document collection in one workspace.
              </p>
              <Button
                className="mt-6"
                onClick={() => setIsCreateOpen(true)}
                type="button"
              >
                Create first case
              </Button>
            </div>
          ) : (
            <div className="mt-6 grid gap-4 xl:grid-cols-2">
              {cases.map((item) => (
                <div
                  className="rounded-2xl border border-line bg-canvas/50 p-5 shadow-card"
                  key={item.id}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wider text-accent">
                        {item.target_country || "Destination pending"}
                      </p>
                      <h4 className="mt-3 text-xl font-semibold text-ink">
                        {item.title}
                      </h4>
                      <p className="mt-2 text-sm text-muted">
                        {item.target_program || "Pathway not defined yet"}
                      </p>
                    </div>
                    <CaseStatusBadge status={item.status} />
                  </div>

                  <div className="mt-6 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-line bg-white px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                        Stage
                      </p>
                      <p className="mt-2 text-sm text-ink">
                        {formatCaseText(item.current_stage)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-line bg-white px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                        Score
                      </p>
                      <p className="mt-2 text-sm text-ink">
                        {formatScore(item.latest_score)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-line bg-white px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                        Risk
                      </p>
                      <p className="mt-2 text-sm text-ink">
                        {formatScore(item.risk_score)}
                      </p>
                    </div>
                  </div>

                  <p className="mt-5 text-sm leading-7 text-muted">
                    {item.notes ||
                      "No strategic notes recorded yet for this immigration path."}
                  </p>

                  <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs uppercase tracking-wider text-muted">
                      Updated {formatDate(item.updated_at)}
                    </p>
                    <Link href={`/dashboard/cases/${item.id}`}>
                      <Button type="button" variant="secondary">
                        Open case
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : null}
    </div>
  );
}
