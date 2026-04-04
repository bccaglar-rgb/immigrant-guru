import type {
  DashboardCase,
  DashboardCommandCenter,
  DashboardPrimaryCaseScore,
  DashboardPrimaryCaseWorkspace,
  DashboardOverviewCards,
  DashboardProfile
} from "@/types/dashboard";

function formatLabel(value: string): string {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function getUpdatedAtLabel(cases: DashboardCase[], workspace: DashboardPrimaryCaseWorkspace) {
  const updatedAt = workspace?.generated_at ?? cases[0]?.updated_at ?? null;
  if (!updatedAt) {
    return "Not updated yet";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium"
  }).format(new Date(updatedAt));
}

function getPrimaryObjective(profile: DashboardProfile | null, cases: DashboardCase[]) {
  const activeCase = cases[0];
  if (activeCase?.target_country || activeCase?.target_program) {
    return `${activeCase.target_country || "Target country pending"}${activeCase.target_program ? ` · ${activeCase.target_program}` : ""}`;
  }

  if (profile?.target_country) {
    return `Targeting ${profile.target_country}`;
  }

  return "Define your first migration objective";
}

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

function getReadinessScore(
  profile: DashboardProfile | null,
  cases: DashboardCase[],
  primaryCaseScore: DashboardPrimaryCaseScore,
  workspace: DashboardPrimaryCaseWorkspace
) {
  if (workspace) {
    return {
      breakdown: [
        {
          label: "Profile completeness",
          value: workspace.readiness_score.profile_completeness_score
        },
        {
          label: "Financial readiness",
          value: workspace.readiness_score.financial_readiness_score
        },
        {
          label: "Professional strength",
          value: workspace.readiness_score.professional_strength_score
        },
        {
          label: "Case readiness",
          value: workspace.readiness_score.case_readiness_score
        }
      ],
      label: workspace.readiness_score.label,
      score: workspace.readiness_score.overall_score,
      summary: workspace.readiness_score.summary
    };
  }

  if (primaryCaseScore) {
    return {
      breakdown: [
        {
          label: "Profile completeness",
          value: primaryCaseScore.profile_completeness.score
        },
        {
          label: "Financial readiness",
          value: primaryCaseScore.financial_readiness.score
        },
        {
          label: "Professional strength",
          value: primaryCaseScore.professional_strength.score
        },
        {
          label: "Case readiness",
          value: primaryCaseScore.case_readiness.score
        }
      ],
      label: "Primary case readiness",
      score: primaryCaseScore.overall_score,
      summary:
        primaryCaseScore.overall_reasons[0] ||
        "Deterministic readiness scoring is available for the leading case."
    };
  }

  return {
    breakdown: [
      { label: "Profile completeness", value: null },
      { label: "Financial readiness", value: null },
      { label: "Professional strength", value: null },
      { label: "Case readiness", value: null }
    ],
    label: cases.length === 0 || !profile ? "Preparation needed" : "Score pending",
    score: null,
    summary:
      cases.length === 0 || !profile
        ? "Complete your profile and open a case to unlock a full readiness view."
        : "Open the leading case to calculate the latest deterministic readiness score."
  };
}

function getProbabilityScore(
  profile: DashboardProfile | null,
  cases: DashboardCase[],
  workspace: DashboardPrimaryCaseWorkspace
) {
  if (workspace) {
    return {
      confidence: workspace.probability_summary.confidence_level,
      score: workspace.probability_summary.probability_score,
      strengths: workspace.probability_summary.strengths,
      summary: workspace.probability_summary.summary,
      weaknesses: workspace.probability_summary.weaknesses
    };
  }

  return {
    confidence: null,
    score: null,
    strengths: profile && cases.length > 0 ? ["The profile is ready to be evaluated against a specific pathway."] : [],
    summary:
      cases.length === 0
        ? "Probability becomes meaningful once a migration case and pathway are in place."
        : "Open a case workspace to evaluate pathway probability from your current profile.",
    weaknesses: cases.length === 0 ? ["No active case is available for pathway comparison yet."] : []
  };
}

function getRecommendedPathway(
  cases: DashboardCase[],
  workspace: DashboardPrimaryCaseWorkspace
) {
  if (workspace) {
    return {
      confidence: workspace.recommended_pathway.confidence_level,
      country: workspace.recommended_pathway.target_country,
      pathway: workspace.recommended_pathway.pathway,
      rationale: workspace.recommended_pathway.rationale
    };
  }

  const activeCase = cases[0];
  return {
    confidence: null,
    country: activeCase?.target_country || null,
    pathway: activeCase?.target_program || null,
    rationale:
      activeCase?.target_country || activeCase?.target_program
        ? "The active case already points to a likely direction, but the workspace has not produced a current recommendation yet."
        : "Recommended pathway guidance appears once your first case has a target destination or program."
  };
}

function getNextBestActionCard(
  cases: DashboardCase[],
  workspace: DashboardPrimaryCaseWorkspace
) {
  const activeCase = cases[0];
  if (workspace) {
    return {
      ctaLabel: activeCase ? "Open case workspace" : "Open cases",
      href: activeCase ? `/dashboard/cases/${activeCase.id}` : "/dashboard/cases",
      priority: formatLabel(workspace.next_best_action.priority),
      reasoning: workspace.next_best_action.reasoning,
      timingCategory: formatLabel(workspace.next_best_action.timing_category),
      title: workspace.next_best_action.title
    };
  }

  return {
    ctaLabel: cases.length === 0 ? "Create first case" : "Review profile",
    href: cases.length === 0 ? "/dashboard/cases" : "/dashboard/profile",
    priority: "Immediate",
    reasoning:
      cases.length === 0
        ? "A case is required before the platform can rank pathway actions, roadmap steps, and document preparation."
        : "Closing the highest-impact profile gaps makes every downstream strategy output more reliable.",
    timingCategory: "Now",
    title:
      cases.length === 0 ? "Create your first immigration case" : "Complete core profile details"
  };
}

function getTopRisks(workspace: DashboardPrimaryCaseWorkspace) {
  if (workspace) {
    return {
      items: workspace.top_risks,
      summary:
        workspace.top_risks.length > 0
          ? "Current blockers that most directly weaken strategy confidence or execution readiness."
          : "No major operational risk is currently elevated above the baseline workspace threshold."
    };
  }

  return {
    items: [],
    summary: "Top risk monitoring activates after the workspace has enough case and profile context."
  };
}

function getMissingInformation(workspace: DashboardPrimaryCaseWorkspace) {
  if (workspace) {
    return {
      items: workspace.missing_information,
      summary:
        workspace.missing_information.length > 0
          ? "Closing these information gaps will improve strategy quality, scoring precision, and document guidance."
          : "No material information gaps are currently blocking the leading case."
    };
  }

  return {
    items: [],
    summary: "Missing information guidance appears after the platform evaluates the active case workspace."
  };
}

function getTimelinePreview(
  cases: DashboardCase[],
  workspace: DashboardPrimaryCaseWorkspace
) {
  if (workspace) {
    return {
      accelerationTips: workspace.timeline_summary.acceleration_tips,
      delayRisks: workspace.timeline_summary.delay_risks,
      nextStep: workspace.timeline_summary.next_step,
      nextStepDurationMonths: workspace.timeline_summary.next_step_duration_months,
      totalEstimatedDurationMonths:
        workspace.timeline_summary.total_estimated_duration_months
    };
  }

  return {
    accelerationTips: [],
    delayRisks: [],
    nextStep: cases.length === 0 ? "Open a case to estimate timing." : "Open the active case to simulate a timeline.",
    nextStepDurationMonths: null,
    totalEstimatedDurationMonths: null
  };
}

function getDocumentStatusCard(
  cases: DashboardCase[],
  workspace: DashboardPrimaryCaseWorkspace
) {
  if (workspace) {
    return {
      completedItems: workspace.document_status_summary.completed_items,
      failedItems: workspace.document_status_summary.failed_items,
      missingRequiredItems: workspace.document_status_summary.missing_required_items,
      processingItems: workspace.document_status_summary.processing_items,
      readinessScore: workspace.document_status_summary.readiness_score,
      requiredItems: workspace.document_status_summary.required_items,
      summary: workspace.document_status_summary.summary,
      totalItems: workspace.document_status_summary.total_items
    };
  }

  return {
    completedItems: 0,
    failedItems: 0,
    missingRequiredItems: 0,
    processingItems: 0,
    readinessScore: null,
    requiredItems: 0,
    summary:
      cases.length === 0
        ? "Document readiness becomes available after a case has been created."
        : "Upload evidence inside the case workspace to see document coverage and processing status.",
    totalItems: 0
  };
}

function getAiCopilotCard(cases: DashboardCase[], workspace: DashboardPrimaryCaseWorkspace) {
  const activeCase = cases[0];
  const href = activeCase ? `/dashboard/cases/${activeCase.id}` : "/dashboard/cases";

  return {
    ctaLabel: activeCase ? "Open case workspace" : "Open cases",
    headline: activeCase
      ? "Use the copilot to pressure-test your next move and close uncertainty faster."
      : "Copilot guidance activates once you open a case workspace.",
    href,
    suggestedPrompts: activeCase
      ? [
          "What should I focus on next?",
          "Which missing documents matter most?",
          "Where is my current strategy weakest?"
        ]
      : [
          "What details should I prepare first?",
          "Which pathway should I evaluate?",
          "How do I build a stronger first case?"
        ],
    summary: workspace
      ? "Ask focused case questions, clarify weak points, and turn strategy output into concrete actions."
      : "The copilot becomes most useful when a profile and case are in place, but the workflow is already designed around decision support."
  };
}

export function createDashboardCommandCenter(
  profile: DashboardProfile | null,
  cases: DashboardCase[],
  primaryCaseScore: DashboardPrimaryCaseScore,
  primaryCaseWorkspace: DashboardPrimaryCaseWorkspace
): DashboardCommandCenter {
  return {
    aiCopilot: getAiCopilotCard(cases, primaryCaseWorkspace),
    documentStatus: getDocumentStatusCard(cases, primaryCaseWorkspace),
    hero: {
      activeCaseCount: cases.length,
      description:
        "Track readiness, risks, timing, documents, and the single most important next move from one operating view.",
      eyebrow: "Immigration command center",
      primaryObjective: getPrimaryObjective(profile, cases),
      statusLabel: primaryCaseWorkspace
        ? formatLabel(primaryCaseWorkspace.case_health.health_status)
        : cases.length > 0
          ? "Case initialized"
          : "Setup required",
      title: "Move from uncertainty to an organized case strategy.",
      updatedAtLabel: getUpdatedAtLabel(cases, primaryCaseWorkspace)
    },
    missingInformation: getMissingInformation(primaryCaseWorkspace),
    nextBestAction: getNextBestActionCard(cases, primaryCaseWorkspace),
    probabilityScore: getProbabilityScore(profile, cases, primaryCaseWorkspace),
    readinessScore: getReadinessScore(
      profile,
      cases,
      primaryCaseScore,
      primaryCaseWorkspace
    ),
    recommendedPathway: getRecommendedPathway(cases, primaryCaseWorkspace),
    timelinePreview: getTimelinePreview(cases, primaryCaseWorkspace),
    topRisks: getTopRisks(primaryCaseWorkspace)
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
