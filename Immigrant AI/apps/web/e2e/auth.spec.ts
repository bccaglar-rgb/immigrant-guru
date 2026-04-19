import { expect, test } from "@playwright/test";

test.describe("Sign Up flow", () => {
  test("renders sign-up page with all required fields", async ({ page }) => {
    await page.goto("/sign-up", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /sign up|create|register/i })).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole("button", { name: /sign up|create|register/i })).toBeVisible();
  });

  test("shows validation error for invalid email", async ({ page }) => {
    await page.goto("/sign-up");
    await page.locator('input[type="email"]').fill("not-an-email");
    await page.locator('input[type="password"]').fill("ValidPass1!");
    await page.getByRole("button", { name: /sign up|create|register/i }).click();
    // Either HTML5 validation or custom error message
    const emailInput = page.locator('input[type="email"]');
    const isInvalid = await emailInput.evaluate((el: HTMLInputElement) => !el.validity.valid);
    const customError = page.getByText(/valid email|invalid email/i);
    expect(isInvalid || await customError.isVisible()).toBeTruthy();
  });

  test("shows validation error for short password", async ({ page }) => {
    await page.goto("/sign-up");
    await page.locator('input[type="email"]').fill("test@example.com");
    await page.locator('input[type="password"]').fill("abc");
    await page.getByRole("button", { name: /sign up|create|register/i }).click();
    const errorText = page.getByText(/password.*characters|too short/i);
    const isInvalid = await page.locator('input[type="password"]').evaluate(
      (el: HTMLInputElement) => !el.validity.valid
    );
    expect(isInvalid || await errorText.isVisible()).toBeTruthy();
  });

  test("link to sign-in is visible", async ({ page }) => {
    await page.goto("/sign-up");
    await expect(page.getByRole("link", { name: /sign in|log in|already have/i })).toBeVisible();
  });
});

test.describe("Sign In flow", () => {
  test("renders sign-in page", async ({ page }) => {
    await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in|log in/i })).toBeVisible();
  });

  test("shows error on wrong credentials", async ({ page }) => {
    await page.goto("/sign-in");
    await page.locator('input[type="email"]').fill("nobody@example.com");
    await page.locator('input[type="password"]').fill("WrongPassword123!");
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await expect(page.getByText(/invalid|incorrect|wrong|not found/i)).toBeVisible({ timeout: 8000 });
  });

  test("forgot password link is visible", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByRole("link", { name: /forgot/i })).toBeVisible();
  });

  test("link to sign-up is visible", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByRole("link", { name: /sign up|create account|register/i })).toBeVisible();
  });
});

test.describe("Forgot Password flow", () => {
  test("forgot password page renders email field", async ({ page }) => {
    await page.goto("/forgot-password", { waitUntil: "domcontentloaded" });
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.getByRole("button", { name: /send|reset|submit/i })).toBeVisible();
  });

  test("submitting unknown email still shows success message", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.locator('input[type="email"]').fill("doesnotexist@example.com");
    await page.getByRole("button", { name: /send|reset|submit/i }).click();
    // Should always show generic success (don't reveal if email exists)
    await expect(page.getByText(/sent|check your email|if an account/i)).toBeVisible({ timeout: 8000 });
  });
});
