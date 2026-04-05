import { expect, test } from "@playwright/test";

test("landing page renders key trust and conversion content", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: /navigate immigration/i })
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /get started free/i })).toBeVisible();
  await expect(
    page
      .getByRole("main")
      .getByText(/compare visa pathways, build your immigration profile/i)
      .first()
  ).toBeVisible();
});
