import { test, expect } from '@playwright/test';

test.describe('Route Guards', () => {
  test('unauthenticated user redirected to login', async ({ page }) => {
    await page.goto('/exchange-terminal');
    await expect(page).toHaveURL(/\/login/);
  });

  test('unauthenticated user cannot access admin', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/login/);
  });

  test('unauthenticated user cannot access sniper', async ({ page }) => {
    await page.goto('/sniper');
    await expect(page).toHaveURL(/\/login/);
  });

  test('pricing page is accessible without auth', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.locator('text=Explorer')).toBeVisible();
    await expect(page.locator('text=Trader')).toBeVisible();
    await expect(page.locator('text=Titan')).toBeVisible();
  });
});
