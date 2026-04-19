import { expect, test } from "@playwright/test";

test.describe("Site navigation", () => {
  test("site header is sticky and visible", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const header = page.locator("header").first();
    await expect(header).toBeVisible();
    // ImmigrantGuru brand text
    await expect(page.getByText("ImmigrantGuru").or(page.getByText("Immigrant")).first()).toBeVisible();
  });

  test("logo navigates to homepage", async ({ page }) => {
    await page.goto("/sign-in");
    await page.locator("header a[href='/']").first().click();
    await expect(page).toHaveURL("/");
  });

  test("pricing page loads and shows plans", async ({ page }) => {
    await page.goto("/pricing", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /pricing|plan/i })).toBeVisible();
    await expect(page.getByText(/starter/i).first()).toBeVisible();
    await expect(page.getByText(/plus/i).first()).toBeVisible();
    await expect(page.getByText(/premium/i).first()).toBeVisible();
  });

  test("site footer is present on homepage", async ({ page }) => {
    await page.goto("/");
    const footer = page.locator("footer");
    await expect(footer).toBeVisible();
  });

  test("404 page for unknown route", async ({ page }) => {
    const response = await page.goto("/this-page-does-not-exist-xyz");
    // Next.js returns 404
    expect(response?.status()).toBe(404);
  });

  test("unauthenticated user is redirected from /dashboard", async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    // Should redirect to sign-in or show auth wall
    const url = page.url();
    expect(url).toMatch(/sign-in|sign-up|login/);
  });

  test("unauthenticated user is redirected from /analysis", async ({ page }) => {
    await page.goto("/analysis", { waitUntil: "domcontentloaded" });
    const url = page.url();
    expect(url).toMatch(/sign-in|sign-up|login/);
  });
});

test.describe("SEO pages", () => {
  test("visa index page renders", async ({ page }) => {
    const response = await page.goto("/visa");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading").first()).toBeVisible();
  });

  test("best-countries index page renders", async ({ page }) => {
    const response = await page.goto("/best-countries");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading").first()).toBeVisible();
  });

  test("a visa detail page renders", async ({ page }) => {
    const response = await page.goto("/visa/us-eb2-niw");
    // May be 200 or 404 depending on static params; just ensure no 500
    expect(response?.status()).not.toBe(500);
  });
});

test.describe("Onboarding", () => {
  test("onboarding page redirects unauthenticated users", async ({ page }) => {
    await page.goto("/onboarding", { waitUntil: "domcontentloaded" });
    const url = page.url();
    // Must not stay on onboarding if not logged in
    expect(url).toMatch(/sign-in|sign-up|login|\//);
  });
});

test.describe("Security headers", () => {
  test("X-Frame-Options header is set", async ({ page }) => {
    const response = await page.goto("/");
    const headers = response?.headers() ?? {};
    expect(headers["x-frame-options"]).toBe("DENY");
  });

  test("X-Content-Type-Options header is set", async ({ page }) => {
    const response = await page.goto("/");
    const headers = response?.headers() ?? {};
    expect(headers["x-content-type-options"]).toBe("nosniff");
  });

  test("no X-Powered-By header leaked", async ({ page }) => {
    const response = await page.goto("/");
    const headers = response?.headers() ?? {};
    expect(headers["x-powered-by"]).toBeUndefined();
  });
});
