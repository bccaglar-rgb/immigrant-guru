import { buildCaseWorkspaceData } from "@/lib/case-workspace-adapter";
import type { AuthenticatedUser } from "@/types/auth";
import type { ImmigrationCase } from "@/types/cases";
import type { CaseDocument } from "@/types/documents";
import type { CaseWorkspace } from "@/types/workspace";
import type { CaseTimeline } from "@/lib/timeline-client";

describe("buildCaseWorkspaceData", () => {
  it("maps real workspace contracts into premium case workspace data", () => {
    const caseRecord: ImmigrationCase = {
      created_at: "2026-04-01T10:00:00Z",
      current_stage: "Document collection",
      id: "11111111-1111-1111-1111-111111111111",
      latest_score: null,
      notes: "Primary skilled migration case.",
      risk_score: null,
      status: "active",
      target_country: "Canada",
      target_program: "Express Entry",
      title: "Canada skilled worker plan",
      updated_at: "2026-04-02T12:00:00Z",
      user_id: "22222222-2222-2222-2222-222222222222"
    };
    const user: AuthenticatedUser = {
      created_at: "2026-04-01T10:00:00Z",
      email: "ada@example.com",
      id: "22222222-2222-2222-2222-222222222222",
      profile: {
        available_capital: "100000",
        children_count: 0,
        criminal_record_flag: false,
        current_country: "Turkey",
        created_at: "2026-04-01T10:00:00Z",
        education_level: "master",
        english_level: "advanced",
        first_name: "Ada",
        id: "33333333-3333-3333-3333-333333333333",
        last_name: "Lovelace",
        marital_status: "single",
        nationality: "Turkish",
        preferred_language: "English",
        prior_visa_refusal_flag: false,
        profession: "Engineer",
        relocation_timeline: "within_12_months",
        target_country: "Canada",
        updated_at: "2026-04-01T10:00:00Z",
        user_id: "22222222-2222-2222-2222-222222222222",
        years_of_experience: 8
      },
      status: "active",
      updated_at: "2026-04-01T10:00:00Z"
    };
    const workspace: CaseWorkspace = {
      action_roadmap: [
        {
          dependency_notes: null,
          description: "Prepare language results.",
          id: "roadmap-1",
          priority: "immediate",
          timing_category: "now",
          title: "Book language exam"
        }
      ],
      case_health: {
        health_score: 72,
        health_status: "needs_attention",
        issues: ["Language evidence is missing."],
        recommended_next_focus: "Close the language evidence gap."
      },
      case_id: caseRecord.id,
      checklist: [
        {
          category: "Identity",
          document_name: "Passport",
          id: "checklist-1",
          matched_document_id: null,
          notes: "Upload the passport identity page.",
          requirement_level: "required",
          status: "missing"
        }
      ],
      checklist_summary: {
        completed_items: 0,
        failed_items: 0,
        missing_required_items: 1,
        processing_items: 0,
        readiness_score: 40,
        required_items: 1,
        total_items: 1,
        uploaded_items: 0
      },
      document_status_summary: {
        attention_required: true,
        completed_items: 0,
        failed_items: 0,
        missing_required_items: 1,
        processing_items: 0,
        readiness_score: 40,
        required_items: 1,
        summary: "One required item still needs coverage.",
        total_items: 1,
        uploaded_items: 0
      },
      generated_at: "2026-04-02T12:00:00Z",
      health: {
        health_score: 72,
        health_status: "needs_attention",
        issues: ["Language evidence is missing."],
        recommended_next_focus: "Close the language evidence gap."
      },
      missing_information: [
        {
          id: "missing-1",
          message: "Language evidence is required.",
          severity: "critical",
          source: "profile"
        }
      ],
      missing_information_grouped: {
        critical: ["Language evidence is required."],
        helpful: []
      },
      next_best_action: {
        priority: "immediate",
        reasoning: "Language evidence unlocks stronger ranking.",
        timing_category: "now",
        title: "Book language exam"
      },
      probability_summary: {
        confidence_level: "MEDIUM",
        probability_score: 64,
        strengths: ["Strong experience profile."],
        summary: "The profile is viable but missing one major evidence item.",
        weaknesses: ["Language evidence is missing."]
      },
      readiness_score: {
        case_readiness_score: 55,
        financial_readiness_score: 78,
        label: "On track",
        overall_score: 68,
        professional_strength_score: 82,
        profile_completeness_score: 61,
        summary: "Preparation is directionally strong but still incomplete."
      },
      recommended_pathway: {
        confidence_level: "MEDIUM",
        pathway: "Express Entry",
        rationale: "This remains the clearest route for the current profile.",
        target_country: "Canada"
      },
      roadmap: [
        {
          dependency_notes: null,
          description: "Prepare language results.",
          id: "roadmap-1",
          priority: "immediate",
          timing_category: "now",
          title: "Book language exam"
        }
      ],
      timeline_summary: {
        acceleration_tips: ["Prepare language evidence early."],
        delay_risks: ["Missing language evidence can delay filing readiness."],
        next_step: "Book language exam",
        next_step_duration_months: 1.5,
        total_estimated_duration_months: 11.5
      },
      top_risks: [
        {
          description: "Language proof is missing from the file.",
          id: "risk-1",
          severity: "high",
          source: "documents",
          title: "Language evidence gap"
        }
      ]
    };
    const documents: CaseDocument[] = [
      {
        analysis_metadata: {},
        case_id: caseRecord.id,
        created_at: "2026-04-02T12:00:00Z",
        document_type: "passport",
        filename: "passport.pdf",
        id: "44444444-4444-4444-4444-444444444444",
        mime_type: "application/pdf",
        original_filename: "passport.pdf",
        processed_at: "2026-04-02T12:30:00Z",
        processing_attempts: 1,
        processing_error: null,
        size: 1024,
        storage_path: "documents/passport.pdf",
        updated_at: "2026-04-02T12:30:00Z",
        upload_status: "uploaded"
      }
    ];
    const timeline: CaseTimeline = {
      acceleration_tips: ["Prepare language evidence early."],
      case_id: caseRecord.id,
      delay_risks: ["Missing language evidence can delay filing readiness."],
      disclaimer: "Planning estimate only.",
      generated_at: "2026-04-02T12:00:00Z",
      steps: [
        {
          description: "Confirm readiness and book the exam.",
          estimated_duration_months: 1.5,
          step_name: "Evidence preparation"
        },
        {
          description: "Submit the profile once evidence is ready.",
          estimated_duration_months: 2.5,
          step_name: "Profile submission"
        }
      ],
      target_country: "Canada",
      target_program: "Express Entry",
      timeline_version: "deterministic_v1",
      total_estimated_duration_months: 11.5
    };

    const result = buildCaseWorkspaceData({
      caseRecord,
      documents,
      timeline,
      user,
      workspace
    });

    expect(result.header.applicantName).toBe("Ada Lovelace");
    expect(result.health.status).toBe("needs_attention");
    expect(result.overviewMetrics[0].value).toBe("68/100");
    expect(result.documents.uploadedDocuments).toHaveLength(1);
    expect(result.risks[0].mitigationActions).toContain("Book language exam");
    expect(result.timeline.currentPhase).toBe("Evidence preparation");
    expect(result.timeline.steps[0]?.status).toBe("active");
  });
});
