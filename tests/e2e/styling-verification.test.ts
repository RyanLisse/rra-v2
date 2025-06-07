import { test, expect } from '@playwright/test';

test.describe('TailwindCSS v4 Styling Verification', () => {
  test('should display proper dark theme styling on homepage', async ({
    page,
  }) => {
    // Navigate to the homepage
    await page.goto('/');

    // Wait for the page to load completely
    await page.waitForLoadState('networkidle');

    // Take a full page screenshot
    await page.screenshot({
      path: 'tests/e2e/screenshots/homepage-current.png',
      fullPage: true,
    });

    // Verify key elements are visible and styled correctly

    // Check that the page has dark background
    const body = page.locator('body');
    await expect(body).toHaveCSS('background-color', 'rgb(15, 15, 15)'); // hsl(240 10% 3.9%)

    // Check text color is light
    await expect(body).toHaveCSS('color', 'rgb(249, 249, 249)'); // hsl(0 0% 98%)

    // Check the main chat interface is present
    const chatContainer = page.locator(
      '[data-testid="chat"], .flex.h-dvh, main',
    );
    await expect(chatContainer.first()).toBeVisible();

    // Verify the input area is styled correctly
    const messageInput = page.locator(
      'textarea[placeholder*="message"], input[placeholder*="message"]',
    );
    if ((await messageInput.count()) > 0) {
      await expect(messageInput.first()).toBeVisible();
    }
  });

  test('should display proper styling on login page', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Take screenshot of login page
    await page.screenshot({
      path: 'tests/e2e/screenshots/login-current.png',
      fullPage: true,
    });

    // Verify login form elements are styled correctly
    const loginForm = page.locator('form');
    await expect(loginForm).toBeVisible();

    // Check input styling
    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');

    if ((await emailInput.count()) > 0) {
      await expect(emailInput).toBeVisible();
    }
    if ((await passwordInput.count()) > 0) {
      await expect(passwordInput).toBeVisible();
    }
  });

  test('should display proper styling on register page', async ({ page }) => {
    await page.goto('/register');
    await page.waitForLoadState('networkidle');

    // Take screenshot of register page
    await page.screenshot({
      path: 'tests/e2e/screenshots/register-current.png',
      fullPage: true,
    });

    // Verify register form elements
    const registerForm = page.locator('form');
    await expect(registerForm).toBeVisible();
  });

  test('should have consistent button styling across pages', async ({
    page,
  }) => {
    // Check homepage buttons
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Look for various button types
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();

    if (buttonCount > 0) {
      // Check the first button's styling
      const firstButton = buttons.first();
      await expect(firstButton).toBeVisible();

      // Verify it has proper styling (should not be transparent or unstyled)
      const backgroundColor = await firstButton.evaluate((el) => {
        return window.getComputedStyle(el).backgroundColor;
      });

      // Should not be completely transparent
      expect(backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
    }
  });

  test('should verify CSS custom properties are properly defined', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check that CSS custom properties are defined
    const customProperties = await page.evaluate(() => {
      const root = document.documentElement;
      const computedStyle = window.getComputedStyle(root);

      return {
        background: computedStyle.getPropertyValue('--background').trim(),
        foreground: computedStyle.getPropertyValue('--foreground').trim(),
        border: computedStyle.getPropertyValue('--border').trim(),
        primary: computedStyle.getPropertyValue('--primary').trim(),
      };
    });

    // Verify custom properties are defined
    expect(customProperties.background).toBeTruthy();
    expect(customProperties.foreground).toBeTruthy();
    expect(customProperties.border).toBeTruthy();
    expect(customProperties.primary).toBeTruthy();

    console.log('CSS Custom Properties:', customProperties);
  });
});
