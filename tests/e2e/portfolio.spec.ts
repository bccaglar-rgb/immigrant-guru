import { test, expect } from '@playwright/test';

test.describe('Portfolio Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="email"]', 'test@bitrium.com');
    await page.fill('input[name="password"]', 'testpass');
    await page.click('button:has-text("Sign In")');
    await page.waitForURL('/quant-engine');
    await page.goto('/portfolio');
  });

  test('shows connected exchanges with balances', async ({ page }) => {
    await expect(page.locator('text=Connected Exchanges')).toBeVisible();
    // Should show at least one exchange
    await expect(page.locator('text=/Binance|Gate\\.io|Bybit|OKX/')).toBeVisible();
  });

  test('shows spot and futures balances separately', async ({ page }) => {
    await expect(page.locator('text=Spot Balances')).toBeVisible();
    await expect(page.locator('text=Futures Balances')).toBeVisible();
  });

  test('all accounts table renders', async ({ page }) => {
    await expect(page.locator('text=All Accounts')).toBeVisible();
    await expect(page.locator('th:has-text("Exchange")')).toBeVisible();
    await expect(page.locator('th:has-text("Total Value")')).toBeVisible();
  });
});
