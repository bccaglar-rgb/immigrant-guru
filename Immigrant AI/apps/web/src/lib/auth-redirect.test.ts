import { resolveSafeAuthRedirectPath } from "@/lib/auth-redirect";

describe("resolveSafeAuthRedirectPath", () => {
  it("returns the fallback for empty values", () => {
    expect(resolveSafeAuthRedirectPath(null)).toBe("/dashboard");
    expect(resolveSafeAuthRedirectPath("")).toBe("/dashboard");
  });

  it("keeps safe internal paths", () => {
    expect(resolveSafeAuthRedirectPath("/dashboard/cases/123")).toBe(
      "/dashboard/cases/123"
    );
    expect(resolveSafeAuthRedirectPath("/dashboard?tab=profile")).toBe(
      "/dashboard?tab=profile"
    );
  });

  it("rejects external or malformed paths", () => {
    expect(resolveSafeAuthRedirectPath("https://example.com")).toBe("/dashboard");
    expect(resolveSafeAuthRedirectPath("//example.com")).toBe("/dashboard");
    expect(resolveSafeAuthRedirectPath(" dashboard")).toBe("/dashboard");
  });

  it("rejects redirects back to auth forms", () => {
    expect(resolveSafeAuthRedirectPath("/sign-in")).toBe("/dashboard");
    expect(resolveSafeAuthRedirectPath("/sign-up?next=/dashboard")).toBe(
      "/dashboard"
    );
  });
});
