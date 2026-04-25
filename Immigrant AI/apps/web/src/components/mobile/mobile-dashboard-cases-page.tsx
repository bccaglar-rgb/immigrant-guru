"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { CaseForm } from "@/components/dashboard/case-form";
import { CaseStatusBadge } from "@/components/dashboard/case-status-badge";
import { DashboardErrorState } from "@/components/dashboard/dashboard-error-state";
import { MobileCardList } from "@/components/mobile/mobile-card-list";
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

function formatCaseText(value: string | null, fallback: string): string {
  return value?.replaceAll("_", " ") || fallback;
}

function formatScore(value: string | null, pendingLabel: string): string {
  return value ? `${value}/100` : pendingLabel;
}

export function MobileDashboardCasesPage() {
  const t = useTranslations();
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
      const timer = window.setTimeout(() => {
        void loadCases();
      }, 0);

      return () => {
        window.clearTimeout(timer);
      };
    }
  }, [loadCases, session, status]);

  const handleCreate = async (payload: ImmigrationCaseWritePayload) => {
    if (!session) {
      return {
        ok: false as const,
        errorMessage: t("You are no longer authenticated")
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

    setFeedback(t("Strategy case created successfully"));
    setCases((current) => [result.data, ...current]);
    setIsCreateOpen(false);
    router.push(`/dashboard/cases/${result.data.id}`);
    router.refresh();

    return {
      ok: true as const
    };
  };

  return (
    <div className="space-y-4">
      <Card className="rounded-[28px] border border-white/80 bg-[radial-gradient(circle_at_top_left,rgba(191,219,254,0.6),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.92))] p-5 shadow-soft">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-accent">
          {t("Case portfolio")}
        </p>
        <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-ink">
          {t("Manage immigration plans from mobile")}
        </h2>
        <p className="mt-3 text-sm leading-7 text-muted">
          {t("Keep destination, pathway, score, and evidence status aligned without leaving the workspace")}
        </p>
        <div className="mt-5 flex gap-3">
          <Button
            disabled={pageStatus === "loading" || isCreating}
            fullWidth
            onClick={() => {
              void loadCases();
            }}
            type="button"
            variant="secondary"
          >
            {t("Refresh")}
          </Button>
          <Button
            fullWidth
            onClick={() => {
              setFeedback(null);
              setIsCreateOpen((current) => !current);
            }}
            type="button"
          >
            {isCreateOpen ? t("Close") : t("New case")}
          </Button>
        </div>
      </Card>

      {feedback ? (
        <div className="rounded-2xl border border-green/20 bg-green/10 px-4 py-4 text-sm text-green">
          {feedback}
        </div>
      ) : null}

      {isCreateOpen ? (
        <CaseForm
          cancelLabel={t("Close")}
          initialValues={emptyImmigrationCaseFormValues}
          isSubmitting={isCreating}
          mode="create"
          onCancel={() => setIsCreateOpen(false)}
          onSubmit={handleCreate}
        />
      ) : null}

      {pageStatus === "loading" ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Card className="h-44 animate-pulse rounded-[28px]" key={index} />
          ))}
        </div>
      ) : null}

      {pageStatus === "error" ? (
        <DashboardErrorState
          message={pageError}
          onRetry={() => void loadCases()}
          title={t("The mobile case list could not be loaded")}
        />
      ) : null}

      {pageStatus === "ready" ? (
        <MobileCardList
          className="space-y-3"
          emptyState={
            <Card className="rounded-[28px] border border-dashed border-line bg-white/90 p-5">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-accent">
                {t("No cases yet")}
              </p>
              <h3 className="mt-3 text-lg font-semibold tracking-tight text-ink">
                {t("Start a mobile case workspace")}
              </h3>
              <p className="mt-3 text-sm leading-7 text-muted">
                {t("Create a case for each migration plan you want to evaluate or execute")}
              </p>
              <Button
                className="mt-5"
                fullWidth
                onClick={() => setIsCreateOpen(true)}
                type="button"
              >
                {t("Create first case")}
              </Button>
            </Card>
          }
          items={cases}
          renderItem={(item) => (
            <Link href={`/dashboard/cases/${item.id}`}>
              <Card className="rounded-[28px] p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-[0.08em] text-accent">
                      {item.target_country || t("Destination pending")}
                    </p>
                    <h3 className="mt-2 text-lg font-semibold text-ink">{item.title}</h3>
                    <p className="mt-2 text-sm text-muted">
                      {item.target_program || t("Pathway not defined yet")}
                    </p>
                  </div>
                  <CaseStatusBadge status={item.status} />
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div className="rounded-2xl bg-canvas/80 px-3 py-3">
                    <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted">
                      {t("Stage")}
                    </p>
                    <p className="mt-2 text-xs font-medium text-ink">
                      {formatCaseText(item.current_stage, t("Not set"))}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-canvas/80 px-3 py-3">
                    <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted">
                      {t("Score")}
                    </p>
                    <p className="mt-2 text-xs font-medium text-ink">
                      {formatScore(item.latest_score, t("Pending"))}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-canvas/80 px-3 py-3">
                    <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted">
                      {t("Risk")}
                    </p>
                    <p className="mt-2 text-xs font-medium text-ink">
                      {formatScore(item.risk_score, t("Pending"))}
                    </p>
                  </div>
                </div>

                <p className="mt-4 text-sm leading-7 text-muted">
                  {item.notes || t("No strategic notes recorded yet for this migration path")}
                </p>
                <p className="mt-4 text-xs uppercase tracking-[0.08em] text-muted">
                  {t("Updated {date}", { date: formatDate(item.updated_at) })}
                </p>
              </Card>
            </Link>
          )}
        />
      ) : null}
    </div>
  );
}
