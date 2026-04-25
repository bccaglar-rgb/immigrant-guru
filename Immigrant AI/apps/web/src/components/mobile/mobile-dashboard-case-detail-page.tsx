"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { AIStrategyPanel } from "@/components/dashboard/ai-strategy-panel";
import { CaseSimulationPanel } from "@/components/dashboard/case-simulation-panel";
import { CaseDocumentCenter } from "@/components/dashboard/case-document-center";
import { ComparisonPanel } from "@/components/dashboard/comparison-panel";
import { CopilotPanel } from "@/components/dashboard/copilot-panel";
import { DashboardErrorState } from "@/components/dashboard/dashboard-error-state";
import { DocumentChecklistPanel } from "@/components/dashboard/document-checklist-panel";
import { RiskBreakdownPanel } from "@/components/dashboard/risk-breakdown-panel";
import { TimelineStepper } from "@/components/dashboard/timeline-stepper";
import { MobileCardList } from "@/components/mobile/mobile-card-list";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useCaseWorkspace } from "@/hooks/use-case-workspace";
import type { CaseWorkspaceTabId } from "@/types/case-workspace";

type MobileDashboardCaseDetailPageProps = Readonly<{
  caseId: string;
}>;

function getStickyAction(
  activeTab: CaseWorkspaceTabId,
  t: ReturnType<typeof useTranslations>
) {
  if (activeTab === "overview" || activeTab === "risks") {
    return {
      label: t("Review strategy"),
      targetTab: "strategy" as CaseWorkspaceTabId
    };
  }

  if (activeTab === "strategy" || activeTab === "simulation") {
    return {
      label: t("Open documents"),
      targetTab: "documents" as CaseWorkspaceTabId
    };
  }

  if (activeTab === "documents") {
    return {
      label: t("Ask copilot"),
      targetTab: "copilot" as CaseWorkspaceTabId
    };
  }

  return {
    label: t("Back to overview"),
    targetTab: "overview" as CaseWorkspaceTabId
  };
}

export function MobileDashboardCaseDetailPage({
  caseId
}: MobileDashboardCaseDetailPageProps) {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState<CaseWorkspaceTabId>("overview");
  const { accessToken, caseRecord, data, error, reload, status } =
    useCaseWorkspace(caseId);

  const workspaceTabs: Array<{ id: CaseWorkspaceTabId; label: string }> = [
    { id: "overview", label: t("Overview") },
    { id: "strategy", label: t("Strategy") },
    { id: "timeline", label: t("Timeline") },
    { id: "simulation", label: t("Simulation") },
    { id: "documents", label: t("Documents") },
    { id: "risks", label: t("Risks") },
    { id: "copilot", label: t("Copilot") },
    { id: "comparison", label: t("Compare") }
  ];

  const stickyAction = getStickyAction(activeTab, t);

  if (status === "loading") {
    return (
      <div className="space-y-4">
        <Card className="h-48 animate-pulse rounded-[28px]" />
        <Card className="h-16 animate-pulse rounded-[24px]" />
        <Card className="h-72 animate-pulse rounded-[28px]" />
      </div>
    );
  }

  if (status === "error" || !data) {
    return (
      <DashboardErrorState
        message={error || t("The case workspace could not be loaded")}
        onRetry={reload}
        title={t("The mobile case workspace is unavailable")}
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden rounded-[28px] border border-white/80 bg-[radial-gradient(circle_at_top_left,rgba(191,219,254,0.55),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.97),rgba(248,250,252,0.94))] p-5 shadow-soft">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-accent">
              {t("Case workspace")}
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-ink">
              {data.header.title}
            </h2>
          </div>
          <div className="rounded-full bg-white/90 px-3 py-2 text-xs font-medium uppercase tracking-[0.08em] text-ink">
            {data.health.status.replaceAll("_", " ")}
          </div>
        </div>
        <p className="mt-3 text-sm leading-7 text-muted">{data.header.summary}</p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white/90 px-4 py-4">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted">
              {t("Target country")}
            </p>
            <p className="mt-2 text-sm font-semibold text-ink">
              {data.header.targetCountry}
            </p>
          </div>
          <div className="rounded-2xl bg-white/90 px-4 py-4">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted">
              {t("Pathway")}
            </p>
            <p className="mt-2 text-sm font-semibold text-ink">
              {data.header.targetPathway}
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-white/90 px-4 py-4">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted">
            {t("Next focus")}
          </p>
          <p className="mt-2 text-sm font-semibold text-ink">{data.health.nextFocus}</p>
        </div>
      </Card>

      <div className="overflow-x-auto">
        <div className="inline-flex min-w-full gap-2 rounded-[24px] border border-white/80 bg-white/85 p-2 shadow-soft">
          {workspaceTabs.map((tab) => (
            <button
              className={`rounded-[18px] px-4 py-3 text-sm font-semibold whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? "bg-ink text-white shadow-[0_10px_30px_rgba(15,23,42,0.18)]"
                  : "bg-transparent text-muted"
              }`}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "overview" ? (
        <div className="space-y-4">
          <MobileCardList
            className="space-y-3"
            items={data.overviewMetrics}
            renderItem={(metric) => (
              <Card className="rounded-[28px] p-5">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted">
                  {metric.label}
                </p>
                <p className="mt-3 text-2xl font-semibold tracking-tight text-ink">
                  {metric.value}
                </p>
                <p className="mt-3 text-sm leading-7 text-muted">
                  {metric.description}
                </p>
              </Card>
            )}
          />
          <RiskBreakdownPanel risks={data.risks.slice(0, 3)} />
          <DocumentChecklistPanel documents={data.documents} />
        </div>
      ) : null}

      {activeTab === "strategy" ? (
        accessToken && caseRecord ? (
          <AIStrategyPanel accessToken={accessToken} caseRecord={caseRecord} />
        ) : null
      ) : null}
      {activeTab === "timeline" ? <TimelineStepper timeline={data.timeline} /> : null}
      {activeTab === "simulation" ? <CaseSimulationPanel caseId={caseId} /> : null}
      {activeTab === "documents" ? (
        accessToken ? (
          <CaseDocumentCenter
            accessToken={accessToken}
            caseId={caseId}
            onDocumentsChanged={reload}
          />
        ) : null
      ) : null}
      {activeTab === "risks" ? <RiskBreakdownPanel risks={data.risks} /> : null}
      {activeTab === "copilot" ? (
        accessToken ? (
          <CopilotPanel
            accessToken={accessToken}
            caseId={caseId}
            suggestedPrompts={data.copilot.suggestedPrompts}
            summary={data.copilot.summary}
          />
        ) : null
      ) : null}
      {activeTab === "comparison" ? (
        accessToken && caseRecord ? (
          <ComparisonPanel accessToken={accessToken} caseRecord={caseRecord} />
        ) : null
      ) : null}

      <div
        className="sticky z-10"
        style={{ bottom: `calc(5rem + env(safe-area-inset-bottom))` }}
      >
        <Card className="rounded-[24px] border border-white/80 bg-white/95 p-3 shadow-soft backdrop-blur-xl">
          <Button
            fullWidth
            onClick={() => setActiveTab(stickyAction.targetTab)}
            type="button"
          >
            {stickyAction.label}
          </Button>
        </Card>
      </div>
    </div>
  );
}
