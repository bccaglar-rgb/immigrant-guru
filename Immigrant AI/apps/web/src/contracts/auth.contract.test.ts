import {
  authenticatedUserSchema,
  tokenResponseSchema
} from "@/lib/auth-client";

describe("auth contract", () => {
  it("accepts backend token response payloads used by the frontend", () => {
    const payload = {
      access_token: "test-token",
      token_type: "bearer",
      expires_in: 1800
    };

    expect(tokenResponseSchema.parse(payload)).toEqual(payload);
  });

  it("rejects invalid backend token payloads", () => {
    expect(() =>
      tokenResponseSchema.parse({
        access_token: "",
        token_type: "bearer"
      })
    ).toThrow();
  });

  it("accepts backend authenticated-user payloads used by the frontend", () => {
    const payload = {
      id: "0d22dcc8-a730-4ff6-bf0f-af83579f9e0a",
      email: "ada@example.com",
      status: "active",
      created_at: "2026-04-05T00:00:00Z",
      updated_at: "2026-04-05T00:00:00Z",
      profile: null
    };

    expect(authenticatedUserSchema.parse(payload)).toEqual(payload);
  });

  it("rejects invalid backend authenticated-user payloads", () => {
    expect(() =>
      authenticatedUserSchema.parse({
        id: "not-a-uuid",
        email: "bad-email",
        status: "",
        created_at: "2026-04-05T00:00:00Z",
        updated_at: "2026-04-05T00:00:00Z",
        profile: null
      })
    ).toThrow();
  });
});
