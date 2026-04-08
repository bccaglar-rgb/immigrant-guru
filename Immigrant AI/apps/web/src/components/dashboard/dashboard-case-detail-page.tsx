"use client";

import { useState } from "react";

import { AIStrategyPanel } from "@/components/dashboard/ai-strategy-panel";
import { CaseWorkspaceHeader } from "@/components/dashboard/case-workspace-header";
import { CaseWorkspaceTabs } from "@/components/dashboard/case-workspace-tabs";
import { ComparisonPanel } from "@/components/dashboard/comparison-panel";
import { CopilotPanel } from "@/components/dashboard/copilot-panel";
import { CaseSimulationPanel } from "@/components/dashboard/case-simulation-panel";
import { CaseDocumentCenter } from "@/components/dashboard/case-document-center";
import { DashboardErrorState } from "@/components/dashboard/dashboard-error-state";
import { DocumentChecklistPanel } from "@/components/dashboard/document-checklist-panel";
import { RiskBreakdownPanel } from "@/components/dashboard/risk-breakdown-panel";
import { TimelineStepper } from "@/components/dashboard/timeline-stepper";
import { Card } from "@/components/ui/card";
import { MobileDashboardCaseDetailPage } from "@/components/mobile/mobile-dashboard-case-detail-page";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useCaseWorkspace } from "@/hooks/use-case-workspace";
import type { CaseWorkspaceTabId } from "@/types/case-workspace";

type DashboardCaseDetailPageProps = Readonly<{
  caseId: string;
}>;

const workspaceTabs: Array<{ id: CaseWorkspaceTabId; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "strategy", label: "Strategy" },
  { id: "timeline", label: "Timeline" },
  { id: "simulation", label: "Simulation" },
  { id: "documents", label: "Documents" },
  { id: "risks", label: "Risks" },
  { id: "copilot", label: "Copilot" },
  { id: "comparison", label: "Comparison" }
];

function WorkspaceLoadingState() {
  return (
    <div className="space-y-6">
      <div className="h-[280px] rounded-[34px] border border-line bg-white/60 anim-shimmer" />
      <div className="h-[72px] rounded-[24px] border border-line bg-white/60 anim-shimmer" />
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="h-[320px] rounded-[30px] border border-line bg-white/60 anim-shimmer" />
        <div className="h-[320px] rounded-[30px] border border-line bg-white/60 anim-shimmer" />
      </div>
    </div>
  );
}

function OverviewPanel() {
  return (
    <Card className="rounded-[30px] border border-white/80 bg-white/90 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        Overview
      </p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
        Command view
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
        This workspace is organized around decision support, not generic record keeping. Use the tabs to move from strategic clarity to evidence preparation and execution.
      </p>
    </Card>
  );
}

function EmptyWorkspaceSection({
  description,
  title
}: Readonly<{ description: string; title: string }>) {
  return (
    <Card className="rounded-[30px] border border-white/80 bg-white/90 p-8 text-sm leading-7 text-slate-600 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {title}
      </p>
      <p className="mt-3">{description}</p>
    </Card>
  );
}

function DesktopDashboardCaseDetailPage({
  caseId
}: DashboardCaseDetailPageProps) {
  const [activeTab, setActiveTab] = useState<CaseWorkspaceTabId>("overview");
  const { accessToken, caseRecord, data, error, reload, status } =
    useCaseWorkspace(caseId);

  if (status === "loading") {
    return <WorkspaceLoadingState />;
  }

  if (status === "error" || !data) {
    return (
      <DashboardErrorState
        message={error || "The case workspace could not be loaded."}
        onRetry={reload}
        title="This case workspace is unavailable."
      />
    );
  }

  return (
    <div className="space-y-6">
      <CaseWorkspaceHeader header={data.header} health={data.health} />

      <CaseWorkspaceTabs
        activeTab={activeTab}
        onChange={setActiveTab}
        tabs={workspaceTabs}
      />

      {activeTab === "overview" ? (
        <div className="space-y-6">
          <OverviewPanel />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {data.overviewMetrics.map((metric) => (
              <Card
                className="rounded-[28px] border border-white/80 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)]"
                key={metric.id}
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  {metric.label}
                </p>
                <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
                  {metric.value}
                </p>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  {metric.description}
                </p>
              </Card>
            ))}
          </div>
          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <RiskBreakdownPanel risks={data.risks.slice(0, 2)} />
            <DocumentChecklistPanel documents={data.documents} />
          </div>
        </div>
      ) : null}

      {activeTab === "strategy" ? (
        accessToken && caseRecord ? (
          <AIStrategyPanel accessToken={accessToken} caseRecord={caseRecord} />
        ) : (
          <EmptyWorkspaceSection
            description="Sign in again to generate and compare strategic pathways for this case."
            title="Strategy"
          />
        )
      ) : null}

      {activeTab === "timeline" ? (
        <TimelineStepper timeline={data.timeline} />
      ) : null}

      {activeTab === "simulation" ? (
        <CaseSimulationPanel caseId={caseId} />
      ) : null}

      {activeTab === "documents" ? (
        accessToken ? (
          <CaseDocumentCenter
            accessToken={accessToken}
            caseId={caseId}
            onDocumentsChanged={reload}
          />
        ) : (
          <EmptyWorkspaceSection
            description="Sign in again to manage documents for this case."
            title="Documents"
          />
        )
      ) : null}

      {activeTab === "risks" ? (
        data.risks.length > 0 ? (
          <RiskBreakdownPanel risks={data.risks} />
        ) : (
          <EmptyWorkspaceSection
            description="No active risks are currently surfaced for this case."
            title="Risks"
          />
        )
      ) : null}

      {activeTab === "copilot" ? (
        accessToken ? (
          <CopilotPanel
            accessToken={accessToken}
            caseId={caseId}
            suggestedPrompts={data.copilot.suggestedPrompts}
            summary={data.copilot.summary}
          />
        ) : (
          <EmptyWorkspaceSection
            description="Sign in again to use the case copilot."
            title="Copilot"
          />
        )
      ) : null}

      {activeTab === "comparison" ? (
        accessToken && caseRecord ? (
          <ComparisonPanel accessToken={accessToken} caseRecord={caseRecord} />
        ) : (
          <EmptyWorkspaceSection
            description="Sign in again to compare this case against alternative country-pathway routes."
            title="Comparison"
          />
        )
      ) : null}
    </div>
  );
}

export function DashboardCaseDetailPage({
  caseId
}: DashboardCaseDetailPageProps) {
  const isMobile = useIsMobile();

  return isMobile ? (
    <MobileDashboardCaseDetailPage caseId={caseId} />
  ) : (
    <DesktopDashboardCaseDetailPage caseId={caseId} />
  );
}
