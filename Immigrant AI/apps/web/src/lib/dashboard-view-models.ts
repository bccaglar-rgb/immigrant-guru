import type {
  DashboardCase,
  DashboardPrimaryCaseScore,
  DashboardPrimaryCaseWorkspace,
  DashboardOverviewCards,
  DashboardProfile
} from "@/types/dashboard";

function getScoreCard(
  profile: DashboardProfile | null,
  cases: DashboardCase[],
  primaryCaseScore: DashboardPrimaryCaseScore
) {
  if (primaryCaseScore) {
    return {
      note:
        primaryCaseScore.overall_reasons[0] ||
        "The leading case score is being tracked from the deterministic scoring engine.",
      title: "Primary case readiness",
      value: `${Math.round(primaryCaseScore.overall_score)}/100`
    };
  }

  if (!profile || cases.length === 0) {
    return {
      note: "Complete core profile fields and create a case to unlock deterministic readiness scoring.",
      title: "Scoring not ready",
      value: "--"
    };
  }

  return {
    note:
      "A case exists, but a fresh score is not available yet. Open the case to calculate current readiness.",
    title: "Score update needed",
    value: "Pending"
  };
}

function getRecommendedNextStep(
  profile: DashboardProfile | null,
  cases: DashboardCase[],
  workspace: DashboardPrimaryCaseWorkspace
) {
  if (workspace) {
    return {
      note: workspace.next_best_action.reasoning,
      title: workspace.next_best_action.title,
      value: workspace.next_best_action.timing_category.replaceAll("_", " ")
    };
  }

  if (!profile?.nationality || !profile.target_country) {
    return {
      note:
        "Add nationality and destination details so strategy, scoring, and document guidance can align to the right path.",
      title: "Complete profile inputs",
      value: "Profile"
    };
  }

  if (cases.length === 0) {
    return {
      note: "Create the first migration case to attach pathway evaluation, scores, documents, and strategy generation.",
      title: "Open your first case",
      value: "Case"
    };
  }

  const activeCase = cases[0];
  return {
    note: `Open ${activeCase.title} to generate or refresh strategy, upload evidence, and review score drivers.`,
    title: "Open active case",
    value: "Open"
  };
}

function getDocumentStatus(cases: DashboardCase[]) {
  return {
    note:
      cases.length === 0
        ? "Document readiness activates once at least one immigration case exists."
        : "Upload evidence inside each case workspace to improve preparation visibility.",
    title: "Document readiness",
    value: cases.length === 0 ? "--" : "Case-based"
  };
}

function getDocumentStatusFromWorkspace(
  cases: DashboardCase[],
  workspace: DashboardPrimaryCaseWorkspace
) {
  if (workspace) {
    return {
      note:
        workspace.checklist_summary.missing_required_items > 0
          ? `${workspace.checklist_summary.missing_required_items} required document item${workspace.checklist_summary.missing_required_items === 1 ? "" : "s"} still need coverage.`
          : "Required evidence coverage is in a comparatively healthy state.",
      title: "Document readiness",
      value: `${Math.round(workspace.checklist_summary.readiness_score)}/100`
    };
  }

  return {
    note:
      cases.length === 0
        ? "Document readiness activates once at least one immigration case exists."
        : "Upload evidence inside each case workspace to improve preparation visibility.",
    title: "Document readiness",
    value: cases.length === 0 ? "--" : "Case-based"
  };
}

function getCaseHealth(workspace: DashboardPrimaryCaseWorkspace) {
  if (!workspace) {
    return {
      note: "Case health becomes available once a case workspace has been evaluated.",
      title: "Health pending",
      value: "--"
    };
  }

  return {
    note: workspace.health.recommended_next_focus,
    title: workspace.health.health_status.replaceAll("_", " "),
    value: `${Math.round(workspace.health.health_score)}/100`
  };
}

function getAiStrategyTeaser(
  profile: DashboardProfile | null,
  cases: DashboardCase[]
) {
  if (!profile || cases.length === 0) {
    return {
      headline: "Strategy output activates after profile and case setup are in place.",
      summary:
        "Complete core profile data and open a case to generate Plan A / Plan B / Plan C comparisons."
    };
  }

  return {
    headline: "Generate structured route comparisons from the active case workspace.",
    summary:
      "AI strategy generation is available from each case detail view, with confidence, missing information, and source-backed comparison output."
  };
}

export function createDashboardOverview(
  profile: DashboardProfile | null,
  cases: DashboardCase[],
  primaryCaseScore: DashboardPrimaryCaseScore,
  primaryCaseWorkspace: DashboardPrimaryCaseWorkspace
): DashboardOverviewCards {
  return {
    aiStrategyTeaser: getAiStrategyTeaser(profile, cases),
    caseHealth: getCaseHealth(primaryCaseWorkspace),
    documentStatus: primaryCaseWorkspace
      ? getDocumentStatusFromWorkspace(cases, primaryCaseWorkspace)
      : getDocumentStatus(cases),
    immigrationScore: getScoreCard(profile, cases, primaryCaseScore),
    recommendedNextStep: getRecommendedNextStep(
      profile,
      cases,
      primaryCaseWorkspace
    )
  };
}
