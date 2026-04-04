import type { DashboardCommandCenter } from "@/types/dashboard";

export const dashboardCommandCenterMock: DashboardCommandCenter = {
  hero: {
    activeCaseCount: 2,
    description:
      "Track readiness, risks, timing, documents, and the single most important next move from one operating view.",
    eyebrow: "Immigration command center",
    primaryObjective: "Canada · Express Entry",
    statusLabel: "Needs attention",
    title: "Move from uncertainty to an organized case strategy.",
    updatedAtLabel: "Apr 4, 2026"
  },
  readinessScore: {
    score: 72,
    label: "On track",
    summary:
      "The case is directionally viable, but a few documentation and timing gaps still reduce execution confidence.",
    breakdown: [
      { label: "Profile completeness", value: 81 },
      { label: "Financial readiness", value: 64 },
      { label: "Professional strength", value: 84 },
      { label: "Case readiness", value: 69 }
    ]
  },
  probabilityScore: {
    score: 68,
    confidence: "MEDIUM",
    summary:
      "The current profile supports a workable route, but unresolved evidence and pathway-specific details still limit certainty.",
    strengths: [
      "Professional experience aligns with a structured skilled route.",
      "Target country and pathway direction are already defined."
    ],
    weaknesses: [
      "Language and credential evidence are not fully documented yet.",
      "Some financial planning details remain under-specified."
    ]
  },
  recommendedPathway: {
    confidence: "MEDIUM",
    country: "Canada",
    pathway: "Express Entry",
    rationale:
      "This pathway currently offers the best balance of probability, execution speed, and document clarity for the profile."
  },
  nextBestAction: {
    ctaLabel: "Open case workspace",
    href: "/dashboard/cases/example-case",
    priority: "Immediate",
    reasoning:
      "Clarifying language evidence and employment documentation will strengthen both score precision and pathway competitiveness.",
    timingCategory: "This week",
    title: "Finalize language and employment evidence"
  },
  topRisks: {
    summary:
      "Current blockers that most directly weaken strategy confidence or execution readiness.",
    items: [
      {
        id: "risk-language",
        title: "Language evidence is still unconfirmed",
        severity: "high",
        description:
          "Without a current language result, pathway competitiveness and timeline planning remain less reliable.",
        source: "probability"
      },
      {
        id: "risk-docs",
        title: "Employment proof is incomplete",
        severity: "medium",
        description:
          "The current case needs a stronger record of role scope and experience to support the leading pathway.",
        source: "documents"
      }
    ]
  },
  missingInformation: {
    summary:
      "Closing these information gaps will improve strategy quality, scoring precision, and document guidance.",
    items: [
      {
        id: "missing-english",
        severity: "critical",
        message: "English proficiency evidence is missing from the active case setup.",
        source: "profile"
      },
      {
        id: "missing-capital",
        severity: "helpful",
        message: "Available capital is still under-defined for planning confidence.",
        source: "profile"
      }
    ]
  },
  timelinePreview: {
    accelerationTips: [
      "Prepare language, education, and employment evidence in parallel.",
      "Resolve the highest-impact missing profile fields before new document uploads."
    ],
    delayRisks: [
      "Evidence gaps can delay case preparation and weaken pathway ranking."
    ],
    nextStep: "Document collection and profile evidence packaging",
    nextStepDurationMonths: 1.5,
    totalEstimatedDurationMonths: 11.8
  },
  documentStatus: {
    completedItems: 3,
    failedItems: 0,
    missingRequiredItems: 2,
    processingItems: 1,
    readinessScore: 58,
    requiredItems: 5,
    summary:
      "Two required document items still need coverage before the case is filing-ready.",
    totalItems: 7
  },
  aiCopilot: {
    ctaLabel: "Open case workspace",
    headline:
      "Use the copilot to pressure-test your next move and close uncertainty faster.",
    href: "/dashboard/cases/example-case",
    suggestedPrompts: [
      "What should I focus on next?",
      "Which missing documents matter most?",
      "Where is my current strategy weakest?"
    ],
    summary:
      "Ask focused case questions, clarify weak points, and turn strategy output into concrete actions."
  }
};
