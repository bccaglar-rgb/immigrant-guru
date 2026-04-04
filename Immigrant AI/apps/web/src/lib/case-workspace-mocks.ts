import type { CaseWorkspaceData } from "@/types/case-workspace";

function buildBaseWorkspace(caseId: string): CaseWorkspaceData {
  return {
    header: {
      applicantName: "Mert Kaya",
      caseId,
      primaryGoal: "Skilled migration with a clear long-term residency path",
      status: "in_review",
      summary:
        "This workspace tracks the current immigration objective, the strongest pathway, the main blockers, and the next actions that move the case toward filing readiness.",
      targetCountry: "Canada",
      targetPathway: "Express Entry",
      title: "Canada skilled worker pathway",
      updatedAt: "2026-04-04T09:30:00.000Z"
    },
    health: {
      nextFocus: "Lock down language proof and employment evidence before expanding comparison scenarios.",
      score: 74,
      status: "needs_attention",
      summary:
        "The case direction is strong enough to operate confidently, but it still has a few execution blockers that keep it short of filing-ready."
    },
    overviewMetrics: [
      {
        description: "Deterministic readiness signal across profile, finances, profession, and case setup.",
        id: "readiness",
        label: "Readiness score",
        tone: "accent",
        value: "74/100"
      },
      {
        description: "Estimated pathway fit based on the current case and profile context.",
        id: "probability",
        label: "Probability score",
        tone: "positive",
        value: "68/100"
      },
      {
        description: "The strongest currently surfaced next move for the case.",
        id: "next-action",
        label: "Next best action",
        tone: "warning",
        value: "Finalize language evidence"
      },
      {
        description: "Current evidence coverage across required and recommended documents.",
        id: "documents",
        label: "Document readiness",
        tone: "warning",
        value: "3 of 5 required"
      }
    ],
    strategy: {
      assumptions: [
        "The applicant is targeting a skilled migration route rather than study or investor pathways.",
        "Professional experience and education remain the main strengths of the file."
      ],
      confidenceLabel: "medium",
      confidenceScore: 71,
      missingInformation: [
        "A confirmed language test result is still missing.",
        "Employment evidence is not yet strong enough to maximize profile confidence."
      ],
      nextSteps: [
        "Upload language proof and employment reference documents.",
        "Pressure-test the strongest pathway against a backup plan before investing in lower-fit options.",
        "Keep document mapping aligned to the current target pathway."
      ],
      plans: [
        {
          label: "Plan A",
          pathway_name: "Express Entry",
          why_it_may_fit:
            "The profile aligns well with a structured skilled migration route and rewards a strong mix of education, English, and work history.",
          major_risks: [
            "Language evidence is still missing from the file.",
            "Employment proof needs stronger documentary backing."
          ],
          estimated_complexity: "medium",
          estimated_timeline_category: "medium_term",
          estimated_cost_category: "medium",
          suitability_score: 81,
          next_action: "Complete language and employment documentation to make this route more competitive."
        },
        {
          label: "Plan B",
          pathway_name: "Provincial Nominee Program",
          why_it_may_fit:
            "A provincial route can provide a stronger pathway if the main profile needs additional competitiveness or targeted labor-market fit.",
          major_risks: [
            "Provincial criteria may shift and can be more document-sensitive.",
            "Some options may be occupation-specific."
          ],
          estimated_complexity: "medium",
          estimated_timeline_category: "long_term",
          estimated_cost_category: "medium",
          suitability_score: 69,
          next_action: "Identify the provinces most aligned with the profession before preparing route-specific documents."
        },
        {
          label: "Plan C",
          pathway_name: "Germany EU Blue Card",
          why_it_may_fit:
            "This route may remain viable if the case needs a faster labor-market-led option outside the primary destination.",
          major_risks: [
            "Country fit is weaker than the current primary strategy.",
            "The transition would require a different job-market positioning."
          ],
          estimated_complexity: "high",
          estimated_timeline_category: "medium_term",
          estimated_cost_category: "medium",
          suitability_score: 58,
          next_action: "Treat this as a reserve option and only invest more if the primary route weakens."
        }
      ],
      summary:
        "The case currently supports one strong skilled route, one practical backup, and one reserve alternative for geographic flexibility."
    },
    timeline: {
      accelerationTips: [
        "Collect language and work-history evidence in parallel instead of sequentially.",
        "Keep document naming and checklist mapping aligned to the target pathway to avoid rework."
      ],
      currentPhase: "Evidence preparation",
      delayRisks: [
        "A missing language result can delay both pathway confidence and document readiness.",
        "Weak employment proof may create rework late in the preparation phase."
      ],
      steps: [
        {
          description: "Clarify route fit, strengthen the case narrative, and confirm the highest-value evidence gaps.",
          durationLabel: "1-2 weeks",
          id: "timeline-assessment",
          status: "completed",
          title: "Profile and route assessment"
        },
        {
          description: "Package language, education, and employment materials into a filing-oriented evidence set.",
          durationLabel: "3-5 weeks",
          id: "timeline-docs",
          status: "active",
          title: "Evidence preparation"
        },
        {
          description: "Validate the best route against a credible backup before locking the strategy.",
          durationLabel: "1-2 weeks",
          id: "timeline-strategy",
          status: "upcoming",
          title: "Strategy validation"
        },
        {
          description: "Prepare filing-oriented forms, declarations, and pathway-specific supporting records.",
          durationLabel: "4-6 weeks",
          id: "timeline-filing",
          status: "upcoming",
          title: "Submission readiness"
        }
      ],
      summary:
        "The case is in the evidence-preparation phase, with the strongest gains coming from closing language and employment gaps now.",
      totalDurationLabel: "4 to 6 months"
    },
    risks: [
      {
        description:
          "Without a confirmed language result, the strongest pathway remains less competitive and harder to rank with confidence.",
        id: "risk-language",
        impactArea: "Eligibility strength",
        mitigationActions: [
          "Schedule or confirm the language test plan.",
          "Attach the result to the case as soon as it is available."
        ],
        severity: "high",
        title: "Language evidence gap"
      },
      {
        description:
          "Employment documentation still looks thinner than the rest of the file, which weakens both credibility and route scoring.",
        id: "risk-employment",
        impactArea: "Professional evidence",
        mitigationActions: [
          "Collect employer letters with role scope and dates.",
          "Map each work-history claim to supporting documents."
        ],
        severity: "medium",
        title: "Employment proof is underdeveloped"
      },
      {
        description:
          "The case already compares a few options, but the team should avoid over-investing in reserve routes before Plan A is stabilized.",
        id: "risk-focus",
        impactArea: "Execution focus",
        mitigationActions: [
          "Keep most preparation effort on the primary pathway.",
          "Use comparison as a decision-support layer, not a distraction."
        ],
        severity: "low",
        title: "Strategy focus could drift"
      }
    ],
    documents: {
      checklist: [
        {
          category: "identity",
          id: "doc-passport",
          mappedDocumentId: "uploaded-passport",
          name: "Passport",
          note: "Core identity record is already available and mapped.",
          requirementLevel: "required",
          status: "uploaded"
        },
        {
          category: "language",
          id: "doc-language",
          mappedDocumentId: null,
          name: "Language test result",
          note: "This is one of the highest-impact missing documents for the primary route.",
          requirementLevel: "required",
          status: "missing"
        },
        {
          category: "employment",
          id: "doc-employment",
          mappedDocumentId: "uploaded-employment",
          name: "Employment reference letter",
          note: "Uploaded, but still under review for strength and completeness.",
          requirementLevel: "required",
          status: "processing"
        },
        {
          category: "education",
          id: "doc-education",
          mappedDocumentId: "uploaded-education",
          name: "Degree certificate",
          note: "Education evidence is uploaded and supports the profile well.",
          requirementLevel: "required",
          status: "uploaded"
        },
        {
          category: "funds",
          id: "doc-funds",
          mappedDocumentId: null,
          name: "Proof of funds",
          note: "Recommended to support planning confidence and route readiness.",
          requirementLevel: "recommended",
          status: "missing"
        }
      ],
      summary:
        "The file has a credible base, but the highest-value document gaps still center on language and employment support.",
      uploadedDocuments: [
        {
          created_at: "2026-04-01T10:15:00.000Z",
          document_type: "passport",
          id: "uploaded-passport",
          original_filename: "passport.pdf",
          processed_at: "2026-04-01T10:16:10.000Z",
          processing_error: null,
          upload_status: "uploaded"
        },
        {
          created_at: "2026-04-02T13:20:00.000Z",
          document_type: "employment_letter",
          id: "uploaded-employment",
          original_filename: "employment-reference.pdf",
          processed_at: null,
          processing_error: null,
          upload_status: "processing"
        },
        {
          created_at: "2026-04-03T09:45:00.000Z",
          document_type: "degree_certificate",
          id: "uploaded-education",
          original_filename: "degree-certificate.pdf",
          processed_at: "2026-04-03T09:47:00.000Z",
          processing_error: null,
          upload_status: "uploaded"
        }
      ]
    },
    copilot: {
      messages: [
        {
          content: "What should I focus on next to make this case stronger?",
          id: "copilot-user-1",
          role: "user",
          timestamp: "2026-04-04T08:10:00.000Z"
        },
        {
          content:
            "Close the language evidence gap first, then strengthen employment proof. Those two changes will improve pathway confidence, timeline clarity, and document readiness together.",
          id: "copilot-assistant-1",
          role: "assistant",
          sourceAttributions: [
            {
              id: "copilot-source-strategy",
              label: "Strategy snapshot",
              type: "strategy"
            },
            {
              id: "copilot-source-documents",
              label: "Document readiness",
              type: "document"
            }
          ],
          timestamp: "2026-04-04T08:10:04.000Z"
        },
        {
          content: "Would comparing Germany again still be useful?",
          id: "copilot-user-2",
          role: "user",
          timestamp: "2026-04-04T08:12:00.000Z"
        },
        {
          content:
            "Yes, but only as a reserve comparison. The current file still has enough upside in the primary route that most preparation effort should stay on Canada first.",
          id: "copilot-assistant-2",
          role: "assistant",
          sourceAttributions: [
            {
              id: "copilot-source-comparison",
              label: "Country comparison",
              type: "case"
            },
            {
              id: "copilot-source-probability",
              label: "Probability signal",
              type: "score"
            }
          ],
          timestamp: "2026-04-04T08:12:05.000Z"
        }
      ],
      suggestedPrompts: [
        "What should I upload next?",
        "Why is Plan A stronger than Plan B?",
        "Which risk matters most right now?"
      ],
      summary:
        "The copilot is positioned as a case advisor: focused, contextual, and action-oriented rather than generic chat."
    },
    comparison: {
      items: [
        {
          advantages: [
            "Best overall fit for the current profile.",
            "Clearer strategic direction than reserve options."
          ],
          costLevel: "medium",
          country: "Canada",
          difficulty: "medium",
          disadvantages: [
            "Still depends heavily on language proof.",
            "Employment evidence needs strengthening."
          ],
          id: "comparison-canada",
          pathway: "Express Entry",
          probability: 68,
          recommended: true,
          timelineLabel: "4 to 6 months"
        },
        {
          advantages: [
            "Provides a stronger backup route than waiting with no alternative.",
            "Can reduce dependence on a single pathway."
          ],
          costLevel: "medium",
          country: "Germany",
          difficulty: "high",
          disadvantages: [
            "Lower direct fit than the leading route.",
            "Would require different market positioning."
          ],
          id: "comparison-germany",
          pathway: "EU Blue Card",
          probability: 57,
          recommended: false,
          timelineLabel: "5 to 7 months"
        },
        {
          advantages: [
            "Could remain viable for long-term flexibility.",
            "Keeps the case aware of an alternative high-upside route."
          ],
          costLevel: "high",
          country: "United States",
          difficulty: "high",
          disadvantages: [
            "More complex evidence burden.",
            "Not as operationally ready as the current lead option."
          ],
          id: "comparison-usa",
          pathway: "EB-2 NIW",
          probability: 51,
          recommended: false,
          timelineLabel: "8 to 12 months"
        }
      ],
      reasoning:
        "Canada remains the lead option because it offers the strongest current fit, the most coherent preparation path, and the clearest next actions. Germany is the best operational fallback. The U.S. route should stay in reserve until the file is stronger.",
      summary:
        "Comparison should sharpen the primary decision, not fragment case focus."
    }
  };
}

export function getCaseWorkspaceMock(caseId: string): CaseWorkspaceData {
  const normalizedId = caseId.toLowerCase();

  if (normalizedId.includes("empty")) {
    const base = buildBaseWorkspace(caseId);
    return {
      ...base,
      comparison: {
        items: [],
        reasoning:
          "Comparison becomes more meaningful once at least one pathway has enough evidence and timing context.",
        summary: "No comparison scenarios have been activated yet."
      },
      copilot: {
        messages: [],
        suggestedPrompts: [
          "What should I prepare first?",
          "Which pathway should I evaluate?",
          "How do I build a stronger first case?"
        ],
        summary:
          "The copilot will become more useful after the case has enough profile and pathway context."
      },
      documents: {
        checklist: [],
        summary:
          "No document checklist is active yet. Create an evidence plan to unlock preparation tracking.",
        uploadedDocuments: []
      },
      risks: [],
      strategy: {
        ...base.strategy,
        missingInformation: [
          "No active strategy snapshot exists yet.",
          "The case still needs stronger pathway-specific inputs."
        ],
        nextSteps: [
          "Define the first target pathway.",
          "Start the core document checklist."
        ],
        plans: [null, null, null],
        summary:
          "The workspace is initialized, but it does not have enough live evidence yet for a strong strategy comparison."
      }
    };
  }

  return buildBaseWorkspace(caseId);
}
