"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { AIStrategyPanel } from "@/components/dashboard/ai-strategy-panel";
import { ActionRoadmapPanel } from "@/components/dashboard/action-roadmap-panel";
import { CaseHealthPanel } from "@/components/dashboard/case-health-panel";
import { CaseScorePanel } from "@/components/dashboard/case-score-panel";
import { CaseDocumentCenter } from "@/components/dashboard/case-document-center";
import { CaseForm } from "@/components/dashboard/case-form";
import { CaseStatusBadge } from "@/components/dashboard/case-status-badge";
import { DashboardErrorState } from "@/components/dashboard/dashboard-error-state";
import { DashboardPageHeader } from "@/components/dashboard/dashboard-page-header";
import { DocumentChecklistPanel } from "@/components/dashboard/document-checklist-panel";
import { NextBestActionPanel } from "@/components/dashboard/next-best-action-panel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuthSession } from "@/hooks/use-auth-session";
import {
  caseToFormValues,
  deleteImmigrationCase,
  getImmigrationCase,
  updateImmigrationCase
} from "@/lib/case-client";
import { getCaseScore } from "@/lib/score-client";
import { getCaseWorkspace } from "@/lib/workspace-client";
import type { ImmigrationCase, ImmigrationCaseWritePayload } from "@/types/cases";
import type { ImmigrationScore } from "@/types/scoring";
import type { CaseWorkspace } from "@/types/workspace";

type DashboardCaseDetailPageProps = Readonly<{
  caseId: string;
}>;

type PageStatus = "loading" | "ready" | "error";
type FeedbackState =
  | {
      message: string;
      tone: "success" | "error";
    }
  | null;

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatText(value: string | null): string {
  return value?.replaceAll("_", " ") || "Not set";
}

function formatScore(value: string | null): string {
  return value ? `${value}/100` : "Pending";
}

function DetailSkeleton() {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="h-[720px] animate-pulse p-6" />
      <div className="space-y-6">
        <Card className="h-64 animate-pulse p-6" />
        <Card className="h-52 animate-pulse p-6" />
      </div>
    </div>
  );
}

export function DashboardCaseDetailPage({
  caseId
}: DashboardCaseDetailPageProps) {
  const router = useRouter();
  const { clearSession, session, status } = useAuthSession();
  const [pageStatus, setPageStatus] = useState<PageStatus>("loading");
  const [pageError, setPageError] = useState("");
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [caseRecord, setCaseRecord] = useState<ImmigrationCase | null>(null);
  const [caseScore, setCaseScore] = useState<ImmigrationScore | null>(null);
  const [caseWorkspace, setCaseWorkspace] = useState<CaseWorkspace | null>(null);
  const [scoreStatus, setScoreStatus] = useState<"loading" | "ready" | "error">(
    "loading"
  );
  const [workspaceStatus, setWorkspaceStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const authenticatedSession = status === "authenticated" ? session : null;

  const loadScore = useCallback(
    async (accessToken: string): Promise<boolean> => {
      setScoreStatus("loading");
      setScoreError(null);

      const scoreResult = await getCaseScore(accessToken, caseId);
      if (!scoreResult.ok) {
        if (scoreResult.status === 401) {
          clearSession();
          return false;
        }

        setCaseScore(null);
        setScoreStatus("error");
        setScoreError(scoreResult.errorMessage);
        return false;
      }

      setCaseScore(scoreResult.data);
      setScoreStatus("ready");
      return true;
    },
    [caseId, clearSession]
  );

  const loadWorkspace = useCallback(
    async (accessToken: string): Promise<boolean> => {
      setWorkspaceStatus("loading");
      setWorkspaceError(null);

      const workspaceResult = await getCaseWorkspace(accessToken, caseId);
      if (!workspaceResult.ok) {
        if (workspaceResult.status === 401) {
          clearSession();
          return false;
        }

        setCaseWorkspace(null);
        setWorkspaceStatus("error");
        setWorkspaceError(workspaceResult.errorMessage);
        return false;
      }

      setCaseWorkspace(workspaceResult.data);
      setWorkspaceStatus("ready");
      return true;
    },
    [caseId, clearSession]
  );

  const loadCase = useCallback(async () => {
    if (status !== "authenticated" || !session) {
      return;
    }

    setPageStatus("loading");
    setPageError("");
    setFeedback(null);

    const caseResult = await getImmigrationCase(session.accessToken, caseId);

    if (!caseResult.ok) {
      if (caseResult.status === 401) {
        clearSession();
        return;
      }

      setPageStatus("error");
      setPageError(caseResult.errorMessage);
      return;
    }

    setCaseRecord(caseResult.data);
    setPageStatus("ready");
    await Promise.all([loadScore(session.accessToken), loadWorkspace(session.accessToken)]);
  }, [caseId, clearSession, loadScore, loadWorkspace, session, status]);

  useEffect(() => {
    if (status === "authenticated" && session) {
      const loadTimer = window.setTimeout(() => {
        void loadCase();
      }, 0);

      return () => {
        window.clearTimeout(loadTimer);
      };
    }
  }, [loadCase, session, status]);

  const handleUpdate = async (payload: ImmigrationCaseWritePayload) => {
    if (!session) {
      return {
        ok: false as const,
        errorMessage: "You are no longer authenticated."
      };
    }

    setIsSaving(true);
    setFeedback(null);

    const result = await updateImmigrationCase(
      session.accessToken,
      caseId,
      payload
    );

    setIsSaving(false);

    if (!result.ok) {
      if (result.status === 401) {
        clearSession();
      }

      return {
        ok: false as const,
        errorMessage: result.errorMessage
      };
    }

    setCaseRecord(result.data);
    await Promise.all([loadScore(session.accessToken), loadWorkspace(session.accessToken)]);
    setFeedback({
      message: "Case strategy updated successfully.",
      tone: "success"
    });
    return {
      ok: true as const
    };
  };

  const handleDelete = async () => {
    if (!session) {
      return;
    }

    setIsDeleting(true);
    setFeedback(null);

    const result = await deleteImmigrationCase(session.accessToken, caseId);
    setIsDeleting(false);

    if (!result.ok) {
      if (result.status === 401) {
        clearSession();
        return;
      }

      setFeedback({
        message: result.errorMessage,
        tone: "error"
      });
      return;
    }

    router.push("/dashboard/cases");
    router.refresh();
  };

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        actions={
          <Link href="/dashboard/cases">
            <Button type="button" variant="secondary">
              Back to cases
            </Button>
          </Link>
        }
        description="Refine the target pathway, score interpretation, and execution status for this immigration strategy case."
        eyebrow="Case detail"
        title="Immigration strategy record"
      />

      {feedback ? (
        <div
          className={`rounded-xl border px-4 py-4 text-sm ${
            feedback.tone === "success"
              ? "border-green/20 bg-green/10 text-green"
              : "border-red/20 bg-red/5 text-red"
          }`}
        >
          {feedback.message}
        </div>
      ) : null}

      {pageStatus === "loading" ? <DetailSkeleton /> : null}
      {pageStatus === "error" ? (
        <DashboardErrorState
          message={pageError}
          onRetry={() => void loadCase()}
          title="This immigration case could not be loaded."
        />
      ) : null}

      {pageStatus === "ready" && caseRecord && authenticatedSession ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-6">
            <CaseScorePanel
              errorMessage={scoreError}
              onRetry={() => {
                if (authenticatedSession) {
                  void loadScore(authenticatedSession.accessToken);
                }
              }}
              score={caseScore}
              status={scoreStatus}
            />
            <CaseHealthPanel
              errorMessage={workspaceError}
              health={caseWorkspace?.health ?? null}
              onRetry={() => {
                if (authenticatedSession) {
                  void loadWorkspace(authenticatedSession.accessToken);
                }
              }}
              status={workspaceStatus}
            />
            <NextBestActionPanel
              action={caseWorkspace?.next_best_action ?? null}
              errorMessage={workspaceError}
              missingInformation={caseWorkspace?.missing_information ?? null}
              onRetry={() => {
                if (authenticatedSession) {
                  void loadWorkspace(authenticatedSession.accessToken);
                }
              }}
              status={workspaceStatus}
            />
            <ActionRoadmapPanel
              errorMessage={workspaceError}
              items={caseWorkspace?.roadmap ?? []}
              onRetry={() => {
                if (authenticatedSession) {
                  void loadWorkspace(authenticatedSession.accessToken);
                }
              }}
              status={workspaceStatus}
            />
            <DocumentChecklistPanel
              checklist={caseWorkspace?.checklist ?? []}
              errorMessage={workspaceError}
              onRetry={() => {
                if (authenticatedSession) {
                  void loadWorkspace(authenticatedSession.accessToken);
                }
              }}
              status={workspaceStatus}
              summary={caseWorkspace?.checklist_summary ?? null}
            />
            <AIStrategyPanel
              accessToken={authenticatedSession.accessToken}
              caseRecord={caseRecord}
            />
            <CaseDocumentCenter
              accessToken={authenticatedSession.accessToken}
              caseId={caseRecord.id}
              onDocumentsChanged={() => {
                void loadWorkspace(authenticatedSession.accessToken);
              }}
            />
            <CaseForm
              key={`${caseRecord.id}:${caseRecord.updated_at}`}
              initialValues={caseToFormValues(caseRecord)}
              isSubmitting={isSaving}
              mode="edit"
              onSubmit={handleUpdate}
            />
          </div>

          <div className="space-y-6 xl:sticky xl:top-6 xl:self-start">
            <Card className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wider text-accent">
                    Case snapshot
                  </p>
                  <h3 className="mt-3 text-xl font-semibold tracking-tight text-ink">
                    {caseRecord.title}
                  </h3>
                </div>
                <CaseStatusBadge status={caseRecord.status} />
              </div>

              <dl className="mt-6 space-y-5">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wider text-muted">
                    Target country
                  </dt>
                  <dd className="mt-2 text-sm text-ink">
                    {caseRecord.target_country || "Not set"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wider text-muted">
                    Pathway
                  </dt>
                  <dd className="mt-2 text-sm text-ink">
                    {caseRecord.target_program || "Not set"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wider text-muted">
                    Stage
                  </dt>
                  <dd className="mt-2 text-sm text-ink">
                    {formatText(caseRecord.current_stage)}
                  </dd>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-line bg-canvas/50 px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                      Score
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-ink">
                      {formatScore(caseRecord.latest_score)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-line bg-canvas/50 px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                      Risk
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-ink">
                      {formatScore(caseRecord.risk_score)}
                    </p>
                  </div>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wider text-muted">
                    Last updated
                  </dt>
                  <dd className="mt-2 text-sm text-ink">
                    {formatDate(caseRecord.updated_at)}
                  </dd>
                </div>
              </dl>
            </Card>

            <Card className="p-6">
              <p className="text-sm font-semibold uppercase tracking-wider text-red">
                Delete case
              </p>
              <p className="mt-3 text-sm leading-7 text-muted">
                Remove this strategy record if it was created in error or is no
                longer relevant to the migration plan.
              </p>

              {confirmDelete ? (
                <div className="mt-5 rounded-xl border border-red/20 bg-red/5 px-4 py-4 text-sm text-red">
                  This permanently removes the case record. Continue only if you are
                  sure.
                </div>
              ) : null}

              <div className="mt-5 flex flex-col gap-3">
                {confirmDelete ? (
                  <>
                    <Button
                      disabled={isDeleting}
                      onClick={handleDelete}
                      type="button"
                    >
                      {isDeleting ? "Deleting case..." : "Confirm deletion"}
                    </Button>
                    <Button
                      disabled={isDeleting}
                      onClick={() => setConfirmDelete(false)}
                      type="button"
                      variant="secondary"
                    >
                      Keep case
                    </Button>
                  </>
                ) : (
                  <Button
                    onClick={() => setConfirmDelete(true)}
                    type="button"
                    variant="secondary"
                  >
                    Delete case
                  </Button>
                )}
              </div>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
}
