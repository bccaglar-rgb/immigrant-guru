import type { ImmigrationTimelineData } from "@/types/timeline";

export const immigrationTimelineMock: ImmigrationTimelineData = {
  eyebrow: "Immigration timeline",
  title: "Case progress timeline",
  summary:
    "Track the current phase, expected timing, milestone checkpoints, and the risks that could slow the case.",
  totalDuration: "4 to 6 months",
  currentPhase: "Evidence preparation",
  steps: [
    {
      id: "assessment",
      stepName: "Profile and route assessment",
      estimatedDuration: "1-2 weeks",
      description:
        "Confirm route fit, identify missing inputs, and frame the evidence strategy before investing in document-heavy work.",
      status: "completed",
      milestone: "Route direction confirmed"
    },
    {
      id: "evidence",
      stepName: "Evidence preparation",
      estimatedDuration: "3-5 weeks",
      description:
        "Package language, education, and employment materials into a filing-oriented evidence set.",
      status: "current",
      milestone: "Core evidence pack ready",
      riskBadges: [
        {
          id: "language-gap",
          label: "Language gap",
          tone: "critical"
        },
        {
          id: "employment-proof",
          label: "Employment proof",
          tone: "warning"
        }
      ]
    },
    {
      id: "strategy-validation",
      stepName: "Strategy validation",
      estimatedDuration: "1-2 weeks",
      description:
        "Pressure-test the leading route against one backup option before locking the execution plan.",
      status: "pending",
      milestone: "Plan A approved"
    },
    {
      id: "submission",
      stepName: "Submission readiness",
      estimatedDuration: "4-6 weeks",
      description:
        "Prepare forms, declarations, and pathway-specific records so the case can move toward filing readiness.",
      status: "blocked",
      milestone: "Submission-ready dossier",
      riskBadges: [
        {
          id: "missing-language-result",
          label: "Blocked by language result",
          tone: "critical"
        }
      ]
    }
  ]
};
