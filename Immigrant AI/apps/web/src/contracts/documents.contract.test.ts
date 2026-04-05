import { caseDocumentSchema } from "@/lib/document-client";

describe("documents contract", () => {
  it("accepts backend document payloads used by the frontend", () => {
    const payload = {
      id: "a83bb0a8-c06e-4f8a-b972-3e5677d739f2",
      case_id: "c43fdff6-311a-4204-92ad-8c4729ce3fe0",
      filename: "stored-passport.pdf",
      original_filename: "passport.pdf",
      mime_type: "application/pdf",
      size: 248921,
      storage_path:
        "documents/c43fdff6-311a-4204-92ad-8c4729ce3fe0/stored-passport.pdf",
      upload_status: "uploaded",
      document_type: "passport",
      processing_attempts: 1,
      processed_at: "2026-04-05T00:00:00Z",
      processing_error: null,
      analysis_metadata: {
        intelligence: {
          completeness: {
            score: 82
          }
        }
      },
      created_at: "2026-04-05T00:00:00Z",
      updated_at: "2026-04-05T00:00:00Z"
    };

    expect(caseDocumentSchema.parse(payload)).toEqual(payload);
  });

  it("rejects invalid backend document payloads", () => {
    expect(() =>
      caseDocumentSchema.parse({
        id: "a83bb0a8-c06e-4f8a-b972-3e5677d739f2",
        case_id: "c43fdff6-311a-4204-92ad-8c4729ce3fe0",
        filename: "",
        original_filename: "passport.pdf",
        mime_type: "application/pdf",
        size: -1,
        storage_path: "",
        upload_status: "done",
        document_type: "passport",
        processing_attempts: 1,
        processed_at: "2026-04-05T00:00:00Z",
        processing_error: null,
        analysis_metadata: {},
        created_at: "2026-04-05T00:00:00Z",
        updated_at: "2026-04-05T00:00:00Z"
      })
    ).toThrow();
  });
});
