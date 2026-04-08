import type { AuthenticatedUser } from "@/types/auth";
import type {
  CaseWorkspaceData,
  CaseWorkspaceDocuments,
  CaseWorkspaceHealth,
  CaseWorkspaceHeaderData,
  CaseWorkspaceMetric,
  CaseWorkspaceRiskItem,
  CaseWorkspaceTimeline
} from "@/types/case-workspace";
import type { ImmigrationCase } from "@/types/cases";
import type { CaseDocument } from "@/types/documents";
import type { CaseTimeline } from "@/lib/timeline-client";
import type { CaseWorkspace } from "@/types/workspace";

function formatLabel(value: string): string {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDurationMonths(months: number | null | undefined): string {
  if (months == null) {
    return "Timing pending";
  }

  const rounded = Math.round(months * 10) / 10;
  return `${rounded} month${rounded === 1 ? "" : "s"}`;
}

function getApplicantName(user: AuthenticatedUser | null): string {
  const firstName = user?.profile?.first_name?.trim() || "";
  const lastName = user?.profile?.last_name?.trim() || "";
  const fullName = `${firstName} ${lastName}`.trim();
  if (fullName.length > 0) {
    return fullName;
  }

  return user?.email || "Applicant";
}

function createHeader(
  caseRecord: ImmigrationCase,
  user: AuthenticatedUser | null,
  workspace: CaseWorkspace
): CaseWorkspaceHeaderData {
  return {
    applicantName: getApplicantName(user),
    caseId: caseRecord.id,
    primaryGoal:
      workspace.recommended_pathway.pathway && workspace.recommended_pathway.target_country
        ? `Move ${workspace.recommended_pathway.pathway} preparation in ${workspace.recommended_pathway.target_country} from planning into execution.`
        : "Convert the current case into an execution-ready immigration plan.",
    status: caseRecord.status,
    summary:
      caseRecord.notes ||
      workspace.recommended_pathway.rationale ||
      workspace.readiness_score.summary,
    targetCountry: caseRecord.target_country || "Target country pending",
    targetPathway: caseRecord.target_program || "Pathway not defined",
    title: caseRecord.title,
    updatedAt: caseRecord.updated_at
  };
}

function createHealth(workspace: CaseWorkspace): CaseWorkspaceHealth {
  return {
    nextFocus: workspace.case_health.recommended_next_focus,
    score: workspace.case_health.health_score,
    status: workspace.case_health.health_status,
    summary:
      workspace.case_health.issues[0] ||
      workspace.recommended_pathway.rationale
  };
}

function createOverviewMetrics(workspace: CaseWorkspace): CaseWorkspaceMetric[] {
  return [
    {
      id: "readiness",
      label: "Readiness score",
      value: `${Math.round(workspace.readiness_score.overall_score)}/100`,
      description: workspace.readiness_score.summary,
      tone: "accent"
    },
    {
      id: "probability",
      label: "Probability",
      value: `${Math.round(workspace.probability_summary.probability_score)}/100`,
      description: workspace.probability_summary.summary,
      tone:
        workspace.probability_summary.confidence_level === "HIGH"
          ? "positive"
          : workspace.probability_summary.confidence_level === "MEDIUM"
            ? "warning"
            : "critical"
    },
    {
      id: "timeline",
      label: "Estimated timeline",
      value: formatDurationMonths(
        workspace.timeline_summary.total_estimated_duration_months
      ),
      description:
        workspace.timeline_summary.next_step ||
        "Timeline detail becomes clearer as execution evidence improves.",
      tone: "neutral"
    },
    {
      id: "documents",
      label: "Document readiness",
      value: `${Math.round(workspace.document_status_summary.readiness_score)}/100`,
      description: workspace.document_status_summary.summary,
      tone: workspace.document_status_summary.attention_required
        ? "warning"
        : "positive"
    }
  ];
}

function createRisks(workspace: CaseWorkspace): CaseWorkspaceRiskItem[] {
  return workspace.top_risks.map((risk) => ({
    id: risk.id,
    impactArea: formatLabel(risk.source),
    title: risk.title,
    severity: risk.severity,
    description: risk.description,
    mitigationActions: workspace.missing_information
      .filter((item) => item.severity === "critical")
      .slice(0, 2)
      .map((item) => item.message)
      .concat(workspace.next_best_action.title)
      .slice(0, 3)
  }));
}

function createDocuments(
  workspace: CaseWorkspace,
  documents: CaseDocument[]
): CaseWorkspaceDocuments {
  return {
    checklist: workspace.checklist.map((item) => ({
      id: item.id,
      category: item.category,
      mappedDocumentId: item.matched_document_id,
      name: item.document_name,
      note: item.notes,
      requirementLevel: item.requirement_level,
      status: item.status === "failed" ? "flagged" : item.status
    })),
    summary: workspace.document_status_summary.summary,
    uploadedDocuments: documents.map((document) => ({
      created_at: document.created_at,
      document_type: document.document_type,
      id: document.id,
      original_filename: document.original_filename,
      processed_at: document.processed_at,
      processing_error: document.processing_error,
      upload_status: document.upload_status
    }))
  };
}

function createTimeline(
  workspace: CaseWorkspace,
  timeline: CaseTimeline | null
): CaseWorkspaceTimeline {
  if (timeline && timeline.steps.length > 0) {
    return {
      accelerationTips: timeline.acceleration_tips,
      currentPhase: timeline.steps[0]?.step_name || "Timeline in preparation",
      delayRisks: timeline.delay_risks,
      steps: timeline.steps.map((step, index) => ({
        id: `${timeline.case_id}-${index}`,
        title: step.step_name,
        durationLabel: formatDurationMonths(step.estimated_duration_months),
        status: index === 0 ? "active" : "upcoming",
        description: step.description
      })),
      summary:
        timeline.delay_risks[0] ||
        workspace.timeline_summary.next_step ||
        "Structured timeline planning is ready for this case.",
      totalDurationLabel: formatDurationMonths(
        timeline.total_estimated_duration_months
      )
    };
  }

  return {
    accelerationTips: workspace.timeline_summary.acceleration_tips,
    currentPhase:
      workspace.timeline_summary.next_step || "Timeline in preparation",
    delayRisks: workspace.timeline_summary.delay_risks,
    steps: workspace.action_roadmap.map((item, index) => ({
      id: item.id,
      title: item.title,
      durationLabel: formatLabel(item.timing_category),
      status: index === 0 ? "active" : "upcoming",
      description: item.description
    })),
    summary:
      workspace.timeline_summary.delay_risks[0] ||
      workspace.timeline_summary.next_step ||
      "Structured timeline planning is ready for this case.",
    totalDurationLabel: formatDurationMonths(
      workspace.timeline_summary.total_estimated_duration_months
    )
  };
}

export function buildCaseWorkspaceData(args: {
  caseRecord: ImmigrationCase;
  documents: CaseDocument[];
  timeline: CaseTimeline | null;
  user: AuthenticatedUser | null;
  workspace: CaseWorkspace;
}): CaseWorkspaceData {
  const { caseRecord, documents, timeline, user, workspace } = args;

  return {
    comparison: {
      items: [],
      reasoning: "Comparison scenarios are generated from the current case context.",
      summary:
        "Compare this case against alternative country-pathway routes using your current profile."
    },
    copilot: {
      messages: [],
      suggestedPrompts: [
        "What should I focus on next for this case?",
        "Which missing document matters most right now?",
        "What weakens the current pathway the most?"
      ],
      summary:
        "Use the copilot to turn current case data into focused next actions."
    },
    documents: createDocuments(workspace, documents),
    header: createHeader(caseRecord, user, workspace),
    health: createHealth(workspace),
    overviewMetrics: createOverviewMetrics(workspace),
    risks: createRisks(workspace),
    strategy: {
      assumptions: workspace.missing_information_grouped.helpful,
      confidenceLabel:
        workspace.probability_summary.confidence_level === "HIGH"
          ? "high"
          : workspace.probability_summary.confidence_level === "MEDIUM"
            ? "medium"
            : "low",
      confidenceScore: workspace.probability_summary.probability_score,
      missingInformation: workspace.missing_information.map((item) => item.message),
      nextSteps: workspace.action_roadmap.map((item) => item.title),
      plans: [],
      summary: workspace.recommended_pathway.rationale
    },
    timeline: createTimeline(workspace, timeline)
  };
}
