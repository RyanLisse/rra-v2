import { test, expect } from '@playwright/test';

test.describe('Health Check E2E Tests', () => {
  test('Server ping endpoint responds correctly', async ({ page }) => {
    // Test the ping endpoint that Playwright uses for health check
    const response = await page.request.get('/api/ping');
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.status).toBe('ok');
    expect(data.message).toBe('Server is ready');
  });

  test('Homepage loads without errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    // Monitor console and page errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });

    // Navigate to homepage
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    // Take screenshot for debugging
    await page.screenshot({
      path: 'test-results/homepage-screenshot.png',
      fullPage: true,
    });

    // Check that the page loaded (should be either login page or chat interface)
    const bodyExists = await page.locator('body').isVisible();
    expect(bodyExists).toBeTruthy();

    // Check for basic HTML structure
    const htmlElement = await page.locator('html').isVisible();
    expect(htmlElement).toBeTruthy();

    // Log any errors for debugging
    if (consoleErrors.length > 0) {
      console.log('Console errors found:', consoleErrors);
    }
    if (pageErrors.length > 0) {
      console.log('Page errors found:', pageErrors);
    }

    // Should not have critical JavaScript errors that prevent the app from loading
    const criticalErrors = pageErrors.filter(
      (error) =>
        error.includes('ReferenceError') ||
        error.includes('SyntaxError') ||
        error.includes('TypeError: Cannot read properties of undefined'),
    );

    expect(criticalErrors).toHaveLength(0);
  });

  test('Authentication page loads correctly', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    // Take screenshot
    await page.screenshot({
      path: 'test-results/login-page-screenshot.png',
      fullPage: true,
    });

    // Check for login form elements
    const emailInput = page.locator('input[type="email"], input[name="email"]');
    const passwordInput = page.locator(
      'input[type="password"], input[name="password"]',
    );
    const submitButton = page.locator(
      'button[type="submit"], input[type="submit"]',
    );

    await expect(emailInput.first()).toBeVisible();
    await expect(passwordInput.first()).toBeVisible();
    await expect(submitButton.first()).toBeVisible();
  });

  test('Registration page loads correctly', async ({ page }) => {
    await page.goto('/register', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    // Take screenshot
    await page.screenshot({
      path: 'test-results/register-page-screenshot.png',
      fullPage: true,
    });

    // Check for registration form elements
    const emailInput = page.locator('input[type="email"], input[name="email"]');
    const passwordInput = page.locator(
      'input[type="password"], input[name="password"]',
    );
    const submitButton = page.locator(
      'button[type="submit"], input[type="submit"]',
    );

    await expect(emailInput.first()).toBeVisible();
    await expect(passwordInput.first()).toBeVisible();
    await expect(submitButton.first()).toBeVisible();
  });

  test('Navigation between auth pages works', async ({ page }) => {
    // Start at login page
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/.*\/login/);

    // Find and click link to registration (common patterns)
    const signUpLink = page.locator(
      'a[href*="register"], a:has-text("Sign up"), a:has-text("Register"), button:has-text("Sign up")',
    );
    if (await signUpLink.first().isVisible()) {
      await signUpLink.first().click();
      await expect(page).toHaveURL(/.*\/register/);

      // Navigate back to login
      const signInLink = page.locator(
        'a[href*="login"], a:has-text("Sign in"), a:has-text("Login"), button:has-text("Sign in")',
      );
      if (await signInLink.first().isVisible()) {
        await signInLink.first().click();
        await expect(page).toHaveURL(/.*\/login/);
      }
    }
  });
});
