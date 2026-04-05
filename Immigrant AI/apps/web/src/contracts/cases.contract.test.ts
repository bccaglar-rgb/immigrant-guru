import {
  caseFormToPayload,
  immigrationCaseFormSchema,
  immigrationCaseSchema,
  immigrationCaseSummarySchema
} from "@/lib/case-client";
import type { ImmigrationCaseFormValues } from "@/types/cases";

describe("cases contract", () => {
  it("accepts backend case summary and detail payloads used by the frontend", () => {
    const summaryPayload = {
      id: "a83bb0a8-c06e-4f8a-b972-3e5677d739f2",
      title: "U.S. employment-based migration plan",
      target_country: "United States",
      target_program: "EB-2 NIW",
      current_stage: "eligibility_review",
      status: "in_review",
      notes: "Collect recommendation letters.",
      latest_score: "78.50",
      risk_score: "22.00",
      created_at: "2026-04-05T00:00:00Z",
      updated_at: "2026-04-05T00:00:00Z"
    };
    const detailPayload = {
      ...summaryPayload,
      user_id: "4b483907-191b-4f27-a5ed-dd9837622db0"
    };

    expect(immigrationCaseSummarySchema.parse(summaryPayload)).toEqual(
      summaryPayload
    );
    expect(immigrationCaseSchema.parse(detailPayload)).toEqual(detailPayload);
  });

  it("rejects invalid backend case payloads", () => {
    expect(() =>
      immigrationCaseSummarySchema.parse({
        id: "a83bb0a8-c06e-4f8a-b972-3e5677d739f2",
        title: "",
        target_country: "United States",
        target_program: "EB-2 NIW",
        current_stage: "eligibility_review",
        status: "reviewing",
        notes: "Collect recommendation letters.",
        latest_score: 78.5,
        risk_score: "22.00",
        created_at: "2026-04-05T00:00:00Z",
        updated_at: "2026-04-05T00:00:00Z"
      })
    ).toThrow();
  });

  it("emits a payload shape the backend create/update case schemas can accept", () => {
    const values: ImmigrationCaseFormValues = {
      title: "U.S. employment-based migration plan",
      target_country: "United States",
      target_program: "EB-2 NIW",
      current_stage: "eligibility_review",
      status: "in_review",
      notes: "Collect recommendation letters.",
      latest_score: "78.50",
      risk_score: "22.00"
    };

    expect(immigrationCaseFormSchema.parse(values)).toEqual(values);
    expect(caseFormToPayload(values)).toEqual({
      title: "U.S. employment-based migration plan",
      target_country: "United States",
      target_program: "EB-2 NIW",
      current_stage: "eligibility_review",
      status: "in_review",
      notes: "Collect recommendation letters.",
      latest_score: "78.50",
      risk_score: "22.00"
    });
  });

  it("rejects invalid case form payloads before they reach the backend", () => {
    expect(() =>
      immigrationCaseFormSchema.parse({
        title: "",
        target_country: "United States",
        target_program: "EB-2 NIW",
        current_stage: "eligibility_review",
        status: "reviewing",
        notes: "Collect recommendation letters.",
        latest_score: "101",
        risk_score: "-1"
      })
    ).toThrow();
  });
});
