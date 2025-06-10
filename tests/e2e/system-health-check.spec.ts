import { test, expect } from '@playwright/test';

test.describe('System Health Check', () => {
  const timestamp = Date.now();
  const testEmail = `test-user-${timestamp}@example.com`;
  const testPassword = 'Test123!Password';

  test('Basic System Health and Authentication', async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    // Monitor console errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
        console.log(`❌ Console error: ${msg.text()}`);
      }
    });

    // Monitor page errors
    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
      console.log(`❌ Page error: ${error.message}`);
    });

    // Navigate to homepage
    console.log('🚀 Navigating to homepage...');
    await page.goto('/');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Take screenshot of initial state
    await page.screenshot({
      path: 'test-results/health-01-homepage.png',
      fullPage: true,
    });

    // Check if we're redirected to dashboard or if we need to authenticate
    const currentUrl = page.url();
    console.log(`📍 Current URL: ${currentUrl}`);

    if (currentUrl.includes('/dashboard') || currentUrl.includes('/chat')) {
      console.log(
        '✅ Already authenticated, taking screenshot of main interface',
      );
      await page.screenshot({
        path: 'test-results/health-02-authenticated.png',
        fullPage: true,
      });
    } else {
      console.log('🔐 Need to authenticate, proceeding with registration...');

      // Check if we're on login page or need to navigate to register
      if (page.url().includes('/login')) {
        await page.click('text=Sign up');
      } else if (!page.url().includes('/register')) {
        await page.click('text=Sign up');
      }

      await page.waitForURL('**/register');
      await page.screenshot({
        path: 'test-results/health-02-register-page.png',
        fullPage: true,
      });

      // Fill registration form (only email and password)
      await page.fill('input[name="email"]', testEmail);
      await page.fill('input[name="password"]', testPassword);

      await page.screenshot({
        path: 'test-results/health-03-registration-filled.png',
        fullPage: true,
      });

      // Submit registration
      await page.click('button[type="submit"]');

      // Wait for redirect
      await page.waitForTimeout(3000);
      await page.screenshot({
        path: 'test-results/health-04-post-registration.png',
        fullPage: true,
      });
    }

    // Test basic navigation and interface elements
    console.log('🧪 Testing interface elements...');

    // Look for chat interface elements
    const chatElements = [
      'textarea[placeholder*="message"]',
      'textarea[placeholder*="Message"]',
      '[data-testid="chat-interface"]',
      '.chat-interface',
      'input[placeholder*="message"]',
      'input[placeholder*="Message"]',
    ];

    let chatFound = false;
    for (const selector of chatElements) {
      try {
        if (await page.locator(selector).isVisible({ timeout: 2000 })) {
          console.log(`✅ Found chat element: ${selector}`);
          chatFound = true;
          break;
        }
      } catch (error) {
        // Continue checking other selectors
      }
    }

    if (chatFound) {
      console.log('✅ Chat interface is accessible');
    } else {
      console.log('⚠️ Chat interface not immediately visible');
    }

    // Take final screenshot
    await page.screenshot({
      path: 'test-results/health-05-final-state.png',
      fullPage: true,
    });

    // Check for artifact-related errors specifically
    const artifactErrors = consoleErrors.filter(
      (error) =>
        error.toLowerCase().includes('artifact') ||
        error.includes('TypeError') ||
        error.includes('Cannot read properties of null') ||
        error.includes('useArtifact'),
    );

    // Check for authentication errors
    const authErrors = pageErrors.filter(
      (error) =>
        error.toLowerCase().includes('auth') ||
        error.toLowerCase().includes('session') ||
        error.toLowerCase().includes('redirect'),
    );

    // Log results
    console.log(`📊 Test Results:`);
    console.log(`   Total console errors: ${consoleErrors.length}`);
    console.log(`   Artifact-related errors: ${artifactErrors.length}`);
    console.log(`   Authentication errors: ${authErrors.length}`);

    if (artifactErrors.length > 0) {
      console.log(`❌ Artifact errors found:`, artifactErrors);
    }

    if (authErrors.length > 0) {
      console.log(`❌ Auth errors found:`, authErrors);
    }

    // Log all errors for debugging
    if (consoleErrors.length > 0) {
      console.log(`🐛 All console errors:`, consoleErrors);
    }

    if (pageErrors.length > 0) {
      console.log(`🐛 All page errors:`, pageErrors);
    }

    // Assertions
    expect(
      artifactErrors.length,
      `Found ${artifactErrors.length} artifact-related errors`,
    ).toBe(0);
    expect(
      authErrors.length,
      `Found ${authErrors.length} authentication errors`,
    ).toBe(0);

    console.log('✅ System health check completed successfully!');
  });
});
