import { test } from '@playwright/test';

test('simple theme check', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Take a screenshot first
  await page.screenshot({
    path: 'tests/e2e/screenshots/current-state.png',
    fullPage: true,
  });

  // Check HTML class
  const htmlClass = await page.locator('html').getAttribute('class');
  console.log('HTML Class:', htmlClass);

  // Check if dark mode is active
  const isDark = htmlClass?.includes('dark');
  console.log('Is Dark Mode:', isDark);
});
