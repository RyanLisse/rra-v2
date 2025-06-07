import { test, expect } from '@playwright/test';

test.describe('Dark Theme Verification', () => {
  test('should apply dark theme correctly', async ({ page }) => {
    // Navigate to the homepage
    await page.goto('/');

    // Wait for the page to load completely
    await page.waitForLoadState('networkidle');

    // Force dark theme by adding the 'dark' class to html element
    await page.addInitScript(() => {
      document.documentElement.classList.add('dark');
    });

    // Reload to apply the theme
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Wait a bit for theme to apply
    await page.waitForTimeout(1000);

    // Take screenshot with forced dark theme
    await page.screenshot({
      path: 'tests/e2e/screenshots/homepage-dark-forced.png',
      fullPage: true,
    });

    // Check that html element has dark class
    const htmlClass = await page.locator('html').getAttribute('class');
    expect(htmlClass).toContain('dark');

    // Check CSS custom properties in dark mode
    const darkModeProperties = await page.evaluate(() => {
      const root = document.documentElement;
      const computedStyle = window.getComputedStyle(root);

      return {
        background: computedStyle.getPropertyValue('--background').trim(),
        foreground: computedStyle.getPropertyValue('--foreground').trim(),
        border: computedStyle.getPropertyValue('--border').trim(),
        primary: computedStyle.getPropertyValue('--primary').trim(),
      };
    });

    console.log('Dark Mode CSS Properties:', darkModeProperties);

    // Verify dark theme background and foreground colors
    const body = page.locator('body');
    const bodyBgColor = await body.evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });

    const bodyTextColor = await body.evaluate((el) => {
      return window.getComputedStyle(el).color;
    });

    console.log('Body Background:', bodyBgColor);
    console.log('Body Text Color:', bodyTextColor);

    // Body should have dark background in dark mode
    // RGB values for hsl(240 10% 3.9%) should be around rgb(15, 15, 15)
    expect(bodyBgColor).toContain('rgb(15, 15, 15)');

    // Text should be light in dark mode
    // RGB values for hsl(0 0% 98%) should be around rgb(249, 249, 249)
    expect(bodyTextColor).toContain('rgb(249, 249, 249)');
  });

  test('should manually toggle to dark theme', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Try to find and click a theme toggle button if it exists
    const themeToggle = page.locator(
      '[data-testid="theme-toggle"], button[aria-label*="theme"], button[aria-label*="Theme"], .theme-toggle',
    );

    if ((await themeToggle.count()) > 0) {
      await themeToggle.first().click();
      await page.waitForTimeout(500);

      // Take screenshot after manual toggle
      await page.screenshot({
        path: 'tests/e2e/screenshots/homepage-manual-toggle.png',
        fullPage: true,
      });
    }
  });
});
