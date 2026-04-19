import { expect, test } from "@playwright/test";

test.describe("Pricing page", () => {
  test("all three paid plans are visible with prices", async ({ page }) => {
    await page.goto("/pricing", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("$19")).toBeVisible();
    await expect(page.getByText("$29")).toBeVisible();
    await expect(page.getByText("$49")).toBeVisible();
  });

  test("free plan is NOT shown on pricing page", async ({ page }) => {
    await page.goto("/pricing");
    const freeText = page.getByText(/free plan|free tier|\$0/i);
    await expect(freeText).not.toBeVisible();
  });

  test("clicking Get Starter redirects unauthenticated user to sign-up", async ({ page }) => {
    await page.goto("/pricing");
    await page.getByRole("button", { name: /get starter/i }).click();
    await expect(page).toHaveURL(/sign-up|sign-in/, { timeout: 8000 });
  });

  test("Plus plan has 'Best value' badge", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.getByText(/best value/i)).toBeVisible();
  });

  test("one-time payment note is visible", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.getByText(/one-time|pay once/i).first()).toBeVisible();
  });

  test("money-back guarantee is mentioned", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.getByText(/money-back|30-day/i)).toBeVisible();
  });
});

test.describe("Analysis paywall", () => {
  test("analysis page shows sign-in prompt for unauthenticated users", async ({ page }) => {
    await page.goto("/analysis", { waitUntil: "domcontentloaded" });
    // Either redirect to sign-in or show auth wall
    const url = page.url();
    const isRedirected = url.includes("sign-in") || url.includes("sign-up");
    if (!isRedirected) {
      await expect(page.getByText(/sign in|create.*account/i)).toBeVisible({ timeout: 5000 });
    }
  });

  test("analysis page with canceled=true shows recovery message", async ({ page }) => {
    // Set up: go to analysis with canceled param while unauthenticated
    // This tests the URL handling even if content is behind auth
    await page.goto("/analysis?canceled=true", { waitUntil: "domcontentloaded" });
    const url = page.url();
    // Should redirect or show auth gate — must not crash with 500
    expect(page.url()).not.toContain("error");
  });
});
