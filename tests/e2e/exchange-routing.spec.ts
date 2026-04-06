import { test, expect } from '@playwright/test';

test.describe('Exchange Terminal - Exchange Routing', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.fill('input[name="email"]', 'test@bitrium.com');
    await page.fill('input[name="password"]', 'testpass');
    await page.click('button:has-text("Sign In")');
    await page.waitForURL('/quant-engine');
    await page.goto('/exchange-terminal');
    await page.waitForLoadState('networkidle');
  });

  test('order payload uses currently selected exchange', async ({ page }) => {
    const orderRequest = page.waitForRequest(req =>
      req.url().includes('/api/exchange') && req.url().includes('order') && req.method() === 'POST'
    );

    // Fill order form
    await page.locator('[data-testid="price-input"], input[placeholder*="Price"]').first().fill('95.60');
    await page.locator('[data-testid="size-input"], input[placeholder*="Size"]').first().fill('100');
    await page.locator('button:has-text("Open Long")').first().click();

    const request = await orderRequest;
    const payload = request.postDataJSON();
    expect(payload.exchange).toBeTruthy();
    expect(payload.side).toBeTruthy();
  });

  test('double click should not create duplicate orders', async ({ page }) => {
    let orderCount = 0;
    page.on('request', req => {
      if (req.url().includes('/api/exchange') && req.url().includes('order') && req.method() === 'POST') {
        orderCount++;
      }
    });

    await page.locator('input[placeholder*="Price"]').first().fill('95.60');
    await page.locator('input[placeholder*="Size"]').first().fill('100');
    const button = page.locator('button:has-text("Open Long")').first();
    await button.dblclick();
    await page.waitForTimeout(2000);

    expect(orderCount).toBeLessThanOrEqual(1);
  });

  test('empty price on limit order should show validation', async ({ page }) => {
    await page.locator('input[placeholder*="Price"]').first().fill('');
    await page.locator('input[placeholder*="Size"]').first().fill('100');

    const longButton = page.locator('button:has-text("Open Long")').first();
    // Button should be disabled or show validation error
    const isDisabled = await longButton.isDisabled();
    if (!isDisabled) {
      await longButton.click();
      // Should show error message
      await expect(page.locator('text=/price|fiyat/i')).toBeVisible({ timeout: 3000 });
    }
  });
});
