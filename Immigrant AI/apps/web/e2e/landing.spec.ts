import { expect, test } from "@playwright/test";

test("landing page renders key trust and conversion content", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(
    page.getByRole("heading", { name: /move to a new country without confusion/i })
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /start your plan/i }).first()).toBeVisible();
});
