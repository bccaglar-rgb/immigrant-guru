import { test, expect } from '@playwright/test';

test.describe('Pricing Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pricing');
  });

  test('shows three plans', async ({ page }) => {
    await expect(page.locator('text=Explorer')).toBeVisible();
    await expect(page.locator('text=Trader')).toBeVisible();
    await expect(page.locator('text=Titan')).toBeVisible();
  });

  test('shows correct prices', async ({ page }) => {
    await expect(page.locator('text=10')).toBeVisible();
    await expect(page.locator('text=20')).toBeVisible();
    await expect(page.locator('text=30')).toBeVisible();
  });

  test('billing period buttons work', async ({ page }) => {
    const buttons = page.locator('button:has-text("Mo")');
    const count = await buttons.count();
    expect(count).toBeGreaterThanOrEqual(3); // at least 3 billing options per plan
  });
});
