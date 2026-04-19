import { expect, test } from "@playwright/test";

test.describe("Accessibility basics", () => {
  test("homepage has a single H1", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const h1s = page.locator("h1");
    expect(await h1s.count()).toBe(1);
  });

  test("all images have alt text", async ({ page }) => {
    await page.goto("/");
    const images = page.locator("img");
    const count = await images.count();
    for (let i = 0; i < count; i++) {
      const alt = await images.nth(i).getAttribute("alt");
      expect(alt, `Image ${i} missing alt text`).not.toBeNull();
    }
  });

  test("sign-in form has labelled inputs", async ({ page }) => {
    await page.goto("/sign-in");
    const emailInput = page.locator('input[type="email"]');
    // Either has aria-label or is associated with a label
    const ariaLabel = await emailInput.getAttribute("aria-label");
    const id = await emailInput.getAttribute("id");
    if (!ariaLabel && id) {
      const label = page.locator(`label[for="${id}"]`);
      expect(await label.count()).toBeGreaterThan(0);
    }
  });

  test("pricing page has no keyboard-inaccessible buttons", async ({ page }) => {
    await page.goto("/pricing");
    const buttons = page.getByRole("button");
    const count = await buttons.count();
    // All buttons should be focusable
    for (let i = 0; i < Math.min(count, 5); i++) {
      await buttons.nth(i).focus();
      const focused = await page.evaluate(() => document.activeElement?.tagName);
      expect(focused).toBe("BUTTON");
    }
  });

  test("page title is set on all key pages", async ({ page }) => {
    const pages = ["/", "/pricing", "/sign-in", "/sign-up"];
    for (const path of pages) {
      await page.goto(path);
      const title = await page.title();
      expect(title.length, `Title missing on ${path}`).toBeGreaterThan(5);
    }
  });
});

test.describe("Mobile responsiveness", () => {
  test("homepage is usable on mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    // CTA button must be visible without horizontal scroll
    const cta = page.getByRole("link", { name: /start your plan|get started|find your path/i }).first();
    await expect(cta).toBeVisible();
    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(scrollWidth).toBeLessThanOrEqual(viewportWidth + 1);
  });

  test("pricing page cards stack on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/pricing");
    await expect(page.getByText("Starter")).toBeVisible();
    await expect(page.getByText("Premium")).toBeVisible();
  });

  test("sign-in form usable on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/sign-in");
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in|log in/i })).toBeVisible();
  });
});
