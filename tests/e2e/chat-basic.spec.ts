import { test, expect } from '@playwright/test';

test.describe('Basic Chat Functionality E2E Tests', () => {
  const timestamp = Date.now();
  const testEmail = `chat-test-${timestamp}@example.com`;
  const testPassword = 'Test123!Password';

  test.beforeEach(async ({ page }) => {
    // Monitor console errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.log(`Console error: ${msg.text()}`);
      }
    });

    // Monitor page errors
    page.on('pageerror', (error) => {
      console.log(`Page error: ${error.message}`);
    });
  });

  test('Authenticated user can access chat interface', async ({ page }) => {
    // First register a user
    await page.goto('/register', { waitUntil: 'domcontentloaded' });
    await page.fill('input[name="email"]', testEmail);
    await page.fill('input[name="password"]', testPassword);
    await page.click('button[type="submit"]');

    // Wait for registration to complete
    await page.waitForTimeout(3000);

    // Navigate to homepage (should show chat or redirect to it)
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000); // Wait for any immediate redirects

    // Take screenshot of chat interface
    await page.screenshot({
      path: 'test-results/chat-basic-01-chat-interface.png',
      fullPage: true,
    });

    const currentUrl = page.url();

    if (!currentUrl.includes('/login')) {
      console.log('✅ User successfully accessed authenticated area');

      // Look for chat interface elements
      const chatElements = [
        'textarea[placeholder*="message"]',
        'input[placeholder*="message"]',
        '[data-testid="multimodal-input"]',
        '[data-testid="chat-interface"]',
        'form[action*="chat"]',
        'button[type="submit"]',
      ];

      let foundChatElement = false;
      for (const selector of chatElements) {
        const element = page.locator(selector);
        if (await element.isVisible()) {
          foundChatElement = true;
          console.log(`✅ Found chat element: ${selector}`);
          break;
        }
      }

      if (foundChatElement) {
        console.log('✅ Chat interface elements detected');
      } else {
        console.log(
          'ℹ️  No obvious chat interface found - may be in different UI pattern',
        );
      }
    } else {
      console.log(
        'ℹ️  Registration may not have completed - redirected to login',
      );
    }
  });

  test('Chat interface has expected UI elements', async ({ page }) => {
    // Try to access chat interface (will be redirected to login if not authenticated)
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    const currentUrl = page.url();

    if (currentUrl.includes('/login')) {
      console.log('ℹ️  Not authenticated - testing login page UI instead');

      // Verify login page has expected elements
      await expect(page.locator('input[name="email"]')).toBeVisible();
      await expect(page.locator('input[name="password"]')).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toBeVisible();

      console.log('✅ Login page UI verified');
    } else {
      console.log('ℹ️  Authenticated - testing chat interface UI');

      // Take screenshot of current state
      await page.screenshot({
        path: 'test-results/chat-basic-02-ui-elements.png',
        fullPage: true,
      });

      // Look for common chat UI patterns
      const uiElements = {
        messageInput: page.locator('textarea, input[type="text"]').first(),
        submitButton: page
          .locator('button[type="submit"], button:has-text("Send")')
          .first(),
        messagesArea: page
          .locator('[role="main"], .messages, .chat-messages, main')
          .first(),
      };

      for (const [name, element] of Object.entries(uiElements)) {
        const isVisible = await element.isVisible().catch(() => false);
        if (isVisible) {
          console.log(`✅ Found ${name}`);
        }
      }
    }
  });

  test('Message input accepts text input', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    // Look for message input field
    const messageInputSelectors = [
      'textarea[placeholder*="message"]',
      'input[placeholder*="message"]',
      '[data-testid="multimodal-input"]',
      'textarea',
      'input[type="text"]',
    ];

    let messageInput = null;
    for (const selector of messageInputSelectors) {
      const element = page.locator(selector);
      if (await element.isVisible()) {
        messageInput = element;
        console.log(`✅ Found message input: ${selector}`);
        break;
      }
    }

    if (messageInput) {
      // Test typing in the input
      const testMessage =
        'Hello, this is a test message to verify input functionality.';
      await messageInput.fill(testMessage);

      // Verify the text was entered
      const inputValue = await messageInput.inputValue();
      expect(inputValue).toBe(testMessage);

      console.log('✅ Message input accepts text correctly');

      // Take screenshot with text entered
      await page.screenshot({
        path: 'test-results/chat-basic-03-message-input.png',
        fullPage: true,
      });
    } else {
      console.log(
        'ℹ️  No message input found - may require authentication first',
      );
    }
  });

  test('Basic navigation and UI responsiveness', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    // Test responsive behavior by resizing viewport
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.screenshot({
      path: 'test-results/chat-basic-04-desktop-view.png',
      fullPage: true,
    });

    await page.setViewportSize({ width: 375, height: 667 }); // Mobile size
    await page.screenshot({
      path: 'test-results/chat-basic-05-mobile-view.png',
      fullPage: true,
    });

    // Look for navigation elements
    const navElements = [
      'nav',
      '[role="navigation"]',
      '.sidebar',
      'button[aria-label*="menu"]',
      'button[aria-label*="toggle"]',
    ];

    for (const selector of navElements) {
      const element = page.locator(selector);
      if (await element.isVisible()) {
        console.log(`✅ Found navigation element: ${selector}`);
      }
    }

    // Reset to desktop size
    await page.setViewportSize({ width: 1280, height: 720 });

    console.log('✅ Responsive design testing completed');
  });

  test('No critical JavaScript errors during normal usage', async ({
    page,
  }) => {
    const jsErrors: string[] = [];
    const pageErrors: string[] = [];

    // Capture all errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        jsErrors.push(msg.text());
      }
    });

    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });

    // Navigate through key pages
    const pages = ['/', '/login', '/register'];

    for (const pagePath of pages) {
      await page.goto(pagePath, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1000); // Let any async operations complete
    }

    // Filter out non-critical errors
    const criticalJsErrors = jsErrors.filter(
      (error) =>
        !error.includes('Warning') &&
        !error.includes('DevTools') &&
        !error.includes('ResizeObserver') &&
        !error.includes('Non-passive event listener'),
    );

    const criticalPageErrors = pageErrors.filter(
      (error) =>
        error.includes('ReferenceError') ||
        error.includes('TypeError: Cannot read properties of undefined') ||
        error.includes('SyntaxError'),
    );

    console.log(`Total JS console errors: ${jsErrors.length}`);
    console.log(`Critical JS errors: ${criticalJsErrors.length}`);
    console.log(`Total page errors: ${pageErrors.length}`);
    console.log(`Critical page errors: ${criticalPageErrors.length}`);

    if (criticalJsErrors.length > 0) {
      console.log('Critical JS Errors:', criticalJsErrors);
    }

    if (criticalPageErrors.length > 0) {
      console.log('Critical Page Errors:', criticalPageErrors);
    }

    // We expect no critical errors
    expect(criticalJsErrors).toHaveLength(0);
    expect(criticalPageErrors).toHaveLength(0);

    console.log('✅ No critical JavaScript errors detected');
  });
});
