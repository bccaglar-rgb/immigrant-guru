import type { DocumentCenterData } from "@/types/document-center";

export const documentCenterMock: DocumentCenterData = {
  summary:
    "This evidence set already covers identity and education well, but the case still needs stronger employment and language support before it feels submission-ready.",
  missingDocuments: [
    {
      category: "Language",
      id: "missing-language",
      priority: "required",
      rationale:
        "This is the highest-impact missing item for the current skilled pathway and directly affects probability confidence.",
      title: "Language test result"
    },
    {
      category: "Employment",
      id: "missing-employment-detail",
      priority: "required",
      rationale:
        "A more complete employment letter would strengthen experience verification and reduce later case friction.",
      title: "Detailed employer reference letter"
    },
    {
      category: "Funds",
      id: "missing-funds",
      priority: "recommended",
      rationale:
        "A stronger funds package improves execution confidence and gives the case more flexibility.",
      title: "Recent proof of funds"
    }
  ],
  documents: [
    {
      analysis: {
        classification: "Passport",
        completenessScore: 92,
        extractedKeyInformation: [
          "Identity page visible",
          "Passport validity extends beyond the next 12 months",
          "Nationality aligns with profile"
        ],
        improvementSuggestions: [
          "Keep a clean scan of all travel stamp pages ready if a route later requires travel history validation."
        ],
        issuesDetected: [],
        missingInformation: [],
        pathwayRelevance: {
          label: "High",
          rationale:
            "Identity evidence is foundational for any immigration route and already supports the current case well."
        }
      },
      fileName: "passport.pdf",
      id: "doc-passport",
      uploadState: "uploaded",
      uploadedAt: "2026-04-02T09:22:00.000Z"
    },
    {
      analysis: {
        classification: "Employment letter",
        completenessScore: 61,
        extractedKeyInformation: [
          "Employer name detected",
          "Role title present",
          "Employment start date detected"
        ],
        improvementSuggestions: [
          "Add role responsibilities to better support pathway-specific experience claims.",
          "Include salary and working hours if available."
        ],
        issuesDetected: [
          {
            detail:
              "The document confirms employment but does not fully describe the scope of work.",
            id: "employment-scope-gap",
            severity: "high",
            title: "Role scope is incomplete"
          }
        ],
        missingInformation: [
          "Detailed responsibilities",
          "Employer signature block"
        ],
        pathwayRelevance: {
          label: "High",
          rationale:
            "Employment proof is a core strength signal for the current case, so incompleteness here has a noticeable downstream impact."
        }
      },
      fileName: "employment-reference.pdf",
      id: "doc-employment",
      uploadState: "processing",
      uploadedAt: "2026-04-03T12:05:00.000Z"
    },
    {
      analysis: {
        classification: "Degree certificate",
        completenessScore: 84,
        extractedKeyInformation: [
          "Degree title detected",
          "Institution name present",
          "Graduation year visible"
        ],
        improvementSuggestions: [
          "Pair this with transcripts or credential evaluation if the target route becomes more education-sensitive."
        ],
        issuesDetected: [
          {
            detail:
              "The scan is usable, but one page edge is cropped and may need a cleaner replacement later.",
            id: "degree-scan-crop",
            severity: "low",
            title: "Scan quality could be cleaner"
          }
        ],
        missingInformation: [],
        pathwayRelevance: {
          label: "Medium",
          rationale:
            "Education evidence is already helping the case, though it is not the main blocker at this stage."
        }
      },
      fileName: "degree-certificate.pdf",
      id: "doc-degree",
      uploadState: "uploaded",
      uploadedAt: "2026-04-01T17:41:00.000Z"
    }
  ]
};
