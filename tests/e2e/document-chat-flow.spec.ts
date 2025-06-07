import { test, expect } from '@playwright/test';

test.describe('Document Upload and Chat Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/api/auth/signin');
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');

    // Wait for redirect to dashboard after login
    await page.waitForURL('/dashboard');
  });

  test('should upload a document and ask questions about it', async ({
    page,
  }) => {
    // Navigate to documents page
    await page.goto('/documents');

    // Click upload button and select test file
    await page.setInputFiles(
      'input[type="file"]',
      './tests/fixtures/test-document.pdf',
    );

    // Wait for upload to complete
    await expect(page.getByText('Document uploaded successfully')).toBeVisible({
      timeout: 10000,
    });

    // Wait for processing to complete
    await expect(page.getByText('Processing complete')).toBeVisible({
      timeout: 30000,
    });

    // Navigate to chat with this document
    await page.getByRole('button', { name: 'Chat with Document' }).click();

    // Verify we're on the chat page
    await expect(page).toHaveURL(/\/chat\?documentId=/);

    // Type a question
    await page.fill(
      'textarea[name="message"]',
      'What are the key points in this document?',
    );
    await page.press('textarea[name="message"]', 'Enter');

    // Wait for response to appear with citations
    await expect(page.getByText(/Key points include/)).toBeVisible({
      timeout: 15000,
    });

    // Check for citation element
    await expect(page.getByText(/Source:/)).toBeVisible();
  });

  test('should show error message for unsupported file types', async ({
    page,
  }) => {
    // Navigate to documents page
    await page.goto('/documents');

    // Try to upload an unsupported file type
    await page.setInputFiles(
      'input[type="file"]',
      './tests/fixtures/unsupported.txt',
    );

    // Check for error message
    await expect(page.getByText('Unsupported file type')).toBeVisible();
  });

  test('should handle large document upload with processing feedback', async ({
    page,
  }) => {
    // Navigate to documents page
    await page.goto('/documents');

    // Upload large test document
    await page.setInputFiles(
      'input[type="file"]',
      './tests/fixtures/large-document.pdf',
    );

    // Check for upload progress indicator
    await expect(page.getByRole('progressbar')).toBeVisible();

    // Verify upload completes
    await expect(page.getByText('Document uploaded successfully')).toBeVisible({
      timeout: 20000,
    });

    // Check for processing status updates
    await expect(page.getByText('Extracting text')).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText('Creating chunks')).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByText('Generating embeddings')).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByText('Processing complete')).toBeVisible({
      timeout: 60000,
    });

    // Verify document appears in the list with correct status
    await expect(page.getByText('large-document.pdf')).toBeVisible();
    await expect(page.getByText('Ready')).toBeVisible();
  });
});
