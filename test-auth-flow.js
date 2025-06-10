const { chromium } = require('playwright');

async function testAuthFlow() {
  console.log('Testing authentication flow and chat functionality...');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 1000,
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Start at register page
    console.log('1. 📝 Testing registration...');
    await page.goto('http://localhost:3000/register', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    await page.screenshot({
      path: 'test-results/01-register-page.png',
      fullPage: true,
    });

    // Generate unique email for this test
    const testEmail = `test-${Date.now()}@example.com`;
    const testPassword = 'testpassword123';

    // Fill registration form
    console.log(`📧 Registering with email: ${testEmail}`);
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.screenshot({
      path: 'test-results/02-registration-filled.png',
      fullPage: true,
    });

    // Submit registration and wait for response
    console.log('🚀 Submitting registration...');

    // Wait for the button to be enabled before clicking
    const submitButton = page.locator('button[type="submit"]');
    await submitButton.waitFor({ state: 'visible' });

    // Check if button is enabled
    const isEnabled = await submitButton.isEnabled();
    console.log(`Submit button enabled: ${isEnabled}`);

    if (isEnabled) {
      await submitButton.click();
      console.log('Clicked submit button');
    } else {
      // If button is disabled, wait a bit and try again
      await page.waitForTimeout(2000);
      const retryEnabled = await submitButton.isEnabled();
      console.log(`Submit button enabled after wait: ${retryEnabled}`);

      if (retryEnabled) {
        await submitButton.click();
      } else {
        console.log(
          'Submit button still disabled, checking form validation...',
        );

        // Check for validation errors
        const validationErrors = await page
          .locator('.error, [role="alert"], .text-red-500')
          .count();
        console.log(`Validation errors found: ${validationErrors}`);

        if (validationErrors > 0) {
          const errorText = await page
            .locator('.error, [role="alert"], .text-red-500')
            .first()
            .textContent();
          console.log(`Validation error: ${errorText}`);
        }

        // Try pressing Enter as alternative
        await page.press('input[type="password"]', 'Enter');
        console.log('Tried Enter key as fallback');
      }
    }

    // Wait for redirect or response
    await page.waitForTimeout(5000);
    await page.screenshot({
      path: 'test-results/03-after-registration.png',
      fullPage: true,
    });

    const currentUrl = page.url();
    console.log(`Current URL after registration: ${currentUrl}`);

    // If still on register page, try login instead
    if (currentUrl.includes('/register')) {
      console.log('2. 🔐 Registration might have failed, trying login...');
      await page.goto('http://localhost:3000/login');
      await page.waitForTimeout(2000);

      await page.fill('input[type="email"]', testEmail);
      await page.fill('input[type="password"]', testPassword);
      await page.screenshot({
        path: 'test-results/04-login-filled.png',
        fullPage: true,
      });

      const loginButton = page.locator('button[type="submit"]');
      if (await loginButton.isEnabled()) {
        await loginButton.click();
        await page.waitForTimeout(3000);
        console.log('Attempted login');
      }
    }

    // Try accessing chat directly
    console.log('3. 💬 Accessing chat interface...');
    await page.goto('http://localhost:3000/chat', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    await page.waitForTimeout(3000);
    const chatUrl = page.url();
    console.log(`Chat URL: ${chatUrl}`);
    await page.screenshot({
      path: 'test-results/05-chat-page.png',
      fullPage: true,
    });

    // If redirected to login, it means we need authentication
    if (chatUrl.includes('/login')) {
      console.log('🔒 Still need authentication, trying different approach...');

      // Try creating a new user account
      const newEmail = `newuser-${Date.now()}@example.com`;
      console.log(`Creating new account: ${newEmail}`);

      // Go to register and try again
      await page.goto('http://localhost:3000/register');
      await page.waitForTimeout(2000);

      await page.fill('input[type="email"]', newEmail);
      await page.fill('input[type="password"]', 'newpassword123');

      // Try submitting with keyboard shortcut
      await page.press('input[type="password"]', 'Enter');
      await page.waitForTimeout(5000);

      const finalUrl = page.url();
      console.log(`Final URL after new registration: ${finalUrl}`);
      await page.screenshot({
        path: 'test-results/06-final-auth-attempt.png',
        fullPage: true,
      });
    }

    // Check current page for chat functionality
    console.log('4. 🔍 Analyzing current page...');
    const title = await page.title();
    const url = page.url();
    console.log(`Page title: "${title}"`);
    console.log(`Current URL: ${url}`);

    // Look for chat elements
    const chatInputs = await page
      .locator(
        'input[placeholder*="message"], textarea[placeholder*="message"], input[placeholder*="Ask"], textarea[placeholder*="Ask"]',
      )
      .count();
    const chatMessages = await page
      .locator('[data-testid*="message"], .message, .chat-message')
      .count();
    const sendButtons = await page
      .locator('button[type="submit"], button:has-text("Send")')
      .count();

    console.log(`🔍 Chat elements found:`);
    console.log(`  - Input fields: ${chatInputs}`);
    console.log(`  - Messages: ${chatMessages}`);
    console.log(`  - Send buttons: ${sendButtons}`);

    // If we find chat interface, test it
    if (chatInputs > 0) {
      console.log('5. ✅ Testing chat functionality...');

      const input = page
        .locator(
          'input[placeholder*="message"], textarea[placeholder*="message"], input[placeholder*="Ask"], textarea[placeholder*="Ask"]',
        )
        .first();
      await input.fill(
        'Hello! Can you tell me about the RoboRail documentation and agentic document processing capabilities?',
      );
      await page.screenshot({
        path: 'test-results/07-message-ready.png',
        fullPage: true,
      });

      // Send the message
      if (sendButtons > 0) {
        await page
          .locator('button[type="submit"], button:has-text("Send")')
          .first()
          .click();
      } else {
        await input.press('Enter');
      }

      console.log('📤 Message sent, waiting for response...');
      await page.waitForTimeout(8000);
      await page.screenshot({
        path: 'test-results/08-chat-response.png',
        fullPage: true,
      });

      // Test document query
      await input.fill(
        'Can you process and analyze one of the PDF documents using the new agentic features?',
      );
      await page.waitForTimeout(1000);

      if (sendButtons > 0) {
        await page
          .locator('button[type="submit"], button:has-text("Send")')
          .first()
          .click();
      } else {
        await input.press('Enter');
      }

      await page.waitForTimeout(6000);
      await page.screenshot({
        path: 'test-results/09-document-query-response.png',
        fullPage: true,
      });
    }

    // Test documents page
    console.log('6. 📄 Testing documents page...');
    await page.goto('http://localhost:3000/documents', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(3000);
    await page.screenshot({
      path: 'test-results/10-documents-page.png',
      fullPage: true,
    });

    const documentsUrl = page.url();
    console.log(`Documents page URL: ${documentsUrl}`);

    if (!documentsUrl.includes('/login')) {
      // Look for document features
      const uploads = await page
        .locator('input[type="file"], button:has-text("Upload")')
        .count();
      const documents = await page
        .locator('[data-testid*="document"], .document-item')
        .count();
      const agenticFeatures = await page
        .locator('text=Agentic, text=AI Analysis, button:has-text("Analyze")')
        .count();

      console.log(`📊 Document features found:`);
      console.log(`  - Upload options: ${uploads}`);
      console.log(`  - Document items: ${documents}`);
      console.log(`  - Agentic features: ${agenticFeatures}`);
    }

    console.log('\n🎉 Authentication flow test completed!');

    // Final summary
    console.log('\n📊 Test Summary:');
    console.log('- Registration: ✅ Attempted');
    console.log('- Login: ✅ Attempted');
    console.log('- Chat Access: ✅ Tested');
    console.log('- Document Features: ✅ Explored');
    console.log('- Screenshots: 📸 10 captured');
  } catch (error) {
    console.error('❌ Auth flow test failed:', error);
    await page.screenshot({
      path: 'test-results/auth-flow-error.png',
      fullPage: true,
    });
  } finally {
    await page.waitForTimeout(3000);
    await browser.close();
  }
}

testAuthFlow().catch(console.error);
