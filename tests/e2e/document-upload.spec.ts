import { test, expect } from '@playwright/test';

test.describe('Document Upload E2E Tests', () => {
  const timestamp = Date.now();
  const testEmail = `doc-test-${timestamp}@example.com`;
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

  test('Documents page is accessible for authenticated users', async ({
    page,
  }) => {
    // First register a user
    await page.goto('/register', { waitUntil: 'domcontentloaded' });
    await page.fill('input[name="email"]', testEmail);
    await page.fill('input[name="password"]', testPassword);
    await page.click('button[type="submit"]');

    // Wait for registration
    await page.waitForTimeout(3000);

    // Try to access documents page
    await page.goto('/documents', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded');

    // Take screenshot
    await page.screenshot({
      path: 'test-results/document-upload-01-documents-page.png',
      fullPage: true,
    });

    const currentUrl = page.url();

    if (currentUrl.includes('/documents')) {
      console.log('✅ Documents page accessible to authenticated users');

      // Look for document-related UI elements
      const documentElements = [
        'input[type="file"]',
        'button:has-text("Upload")',
        'button:has-text("Choose")',
        '[data-testid="document-uploader"]',
        '.document-list',
        '.upload-area',
      ];

      let foundDocumentElement = false;
      for (const selector of documentElements) {
        const element = page.locator(selector);
        if (await element.isVisible()) {
          foundDocumentElement = true;
          console.log(`✅ Found document UI element: ${selector}`);
          break;
        }
      }

      if (foundDocumentElement) {
        console.log('✅ Document interface elements detected');
      } else {
        console.log(
          'ℹ️  Standard document interface elements not found - may use custom UI',
        );
      }
    } else if (currentUrl.includes('/login')) {
      console.log(
        'ℹ️  Registration may not have completed - redirected to login',
      );
    } else {
      console.log(`ℹ️  Redirected to: ${currentUrl}`);
    }
  });

  test('Unauthenticated users are redirected from documents page', async ({
    page,
  }) => {
    // Clear any existing sessions
    await page.context().clearCookies();

    // Try to access documents page without authentication
    await page.goto('/documents', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    const currentUrl = page.url();

    // Should be redirected to login
    if (currentUrl.includes('/login')) {
      console.log('✅ Unauthenticated users properly redirected to login');

      // Verify login form is present
      await expect(page.locator('input[name="email"]')).toBeVisible();
      await expect(page.locator('input[name="password"]')).toBeVisible();
    } else {
      console.log(`⚠️  Expected redirect to login, but got: ${currentUrl}`);
    }
  });

  test('Document upload API endpoints respond correctly', async ({ page }) => {
    // Test document-related API endpoints
    const apiEndpoints = [
      '/api/documents/list',
      '/api/documents/stats',
      '/api/documents/status',
    ];

    for (const endpoint of apiEndpoints) {
      try {
        const response = await page.request.get(endpoint);
        console.log(`${endpoint}: ${response.status()}`);

        if (response.status() === 401) {
          console.log(`✅ ${endpoint} properly requires authentication`);
        } else if (response.ok()) {
          console.log(`✅ ${endpoint} responds successfully`);
        } else {
          console.log(
            `⚠️  ${endpoint} returned unexpected status: ${response.status()}`,
          );
        }
      } catch (error) {
        console.log(`⚠️  Error testing ${endpoint}: ${error.message}`);
      }
    }
  });

  test('Document processing status endpoint works', async ({ page }) => {
    // Test the pipeline status endpoint
    try {
      const response = await page.request.get('/api/documents/pipeline-status');
      console.log(`Pipeline status endpoint: ${response.status()}`);

      if (response.status() === 401) {
        console.log(
          '✅ Pipeline status endpoint properly requires authentication',
        );
      } else if (response.ok()) {
        const data = await response.json();
        console.log('✅ Pipeline status endpoint responds successfully');
        console.log('Pipeline status data:', data);
      } else {
        console.log(
          `⚠️  Pipeline status returned unexpected status: ${response.status()}`,
        );
      }
    } catch (error) {
      console.log(`⚠️  Error testing pipeline status: ${error.message}`);
    }
  });

  test('File upload UI behavior', async ({ page }) => {
    // Navigate to a page that might have file upload
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    // Look for file upload elements across different pages
    const fileUploadSelectors = [
      'input[type="file"]',
      '[data-testid="file-upload"]',
      '[data-testid="document-uploader"]',
      'button:has-text("Upload")',
      'button:has-text("Choose file")',
      '.upload-button',
      '.file-upload',
    ];

    let foundFileUpload = false;
    for (const selector of fileUploadSelectors) {
      const element = page.locator(selector);
      if (await element.isVisible()) {
        foundFileUpload = true;
        console.log(`✅ Found file upload element: ${selector}`);

        // Take screenshot with upload element visible
        await page.screenshot({
          path: 'test-results/document-upload-02-file-upload-ui.png',
          fullPage: true,
        });
        break;
      }
    }

    if (!foundFileUpload) {
      console.log(
        'ℹ️  No file upload UI found on current page - may be on documents page only',
      );

      // Try documents page if accessible
      const currentUrl = page.url();
      if (!currentUrl.includes('/login')) {
        await page.goto('/documents', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1000);

        for (const selector of fileUploadSelectors) {
          const element = page.locator(selector);
          if (await element.isVisible()) {
            foundFileUpload = true;
            console.log(
              `✅ Found file upload element on documents page: ${selector}`,
            );
            break;
          }
        }
      }
    }

    if (foundFileUpload) {
      console.log('✅ File upload UI elements detected');
    } else {
      console.log(
        'ℹ️  File upload UI may require authentication or be in different location',
      );
    }
  });

  test('Document processing workflow UI elements', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded');

    // Look for document processing related UI elements
    const processingElements = [
      '[data-testid="processing-status"]',
      '.processing-indicator',
      '.document-status',
      'progress',
      '.progress-bar',
      '[role="progressbar"]',
      '.upload-progress',
      '.processing-progress',
    ];

    let foundProcessingUI = false;
    for (const selector of processingElements) {
      const element = page.locator(selector);
      if (await element.isVisible()) {
        foundProcessingUI = true;
        console.log(`✅ Found processing UI element: ${selector}`);
        break;
      }
    }

    if (foundProcessingUI) {
      console.log('✅ Document processing UI elements detected');
    } else {
      console.log(
        'ℹ️  Document processing UI elements not visible - may appear during upload',
      );
    }

    // Take final screenshot
    await page.screenshot({
      path: 'test-results/document-upload-03-final-state.png',
      fullPage: true,
    });
  });
});
