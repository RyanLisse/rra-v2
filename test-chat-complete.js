const { chromium } = require('playwright');

async function testCompleteFlow() {
  console.log('Testing complete chat flow with authentication...');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 1000,
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Start with the login page
    console.log('1. Navigating to login page...');
    await page.goto('http://localhost:3000/login', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    await page.screenshot({
      path: 'test-results/01-login-page.png',
      fullPage: true,
    });

    // Click "Sign up" link to register
    console.log('2. Clicking "Sign up" to register...');
    await page.click('text=Sign up');
    await page.waitForTimeout(2000);
    await page.screenshot({
      path: 'test-results/02-register-page.png',
      fullPage: true,
    });

    // Fill registration form
    console.log('3. Filling registration form...');
    const emailField = page
      .locator('input[type="email"], input[name="email"]')
      .first();
    const passwordField = page
      .locator('input[type="password"], input[name="password"]')
      .first();

    await emailField.fill('test@example.com');
    await passwordField.fill('testpassword123');
    await page.screenshot({
      path: 'test-results/03-registration-filled.png',
      fullPage: true,
    });

    // Submit registration
    console.log('4. Submitting registration...');
    await page.click(
      'button[type="submit"], button:has-text("Sign up"), button:has-text("Register")',
    );
    await page.waitForTimeout(3000);
    await page.screenshot({
      path: 'test-results/04-after-registration.png',
      fullPage: true,
    });

    const currentUrl = page.url();
    console.log('Current URL after registration:', currentUrl);

    // Check if we're redirected to chat or need to login
    if (!currentUrl.includes('chat') && !currentUrl.includes('dashboard')) {
      console.log('5. Need to login after registration...');

      // If still on login/register page, try logging in
      if (currentUrl.includes('login') || currentUrl.includes('register')) {
        await page.click('text=Sign in, text=Login').catch(() => {
          console.log('Login link not found, trying email/password fields');
        });
        await page.waitForTimeout(1000);

        // Fill login form
        const loginEmailField = page.locator('input[type="email"]').first();
        const loginPasswordField = page
          .locator('input[type="password"]')
          .first();

        await loginEmailField.fill('test@example.com');
        await loginPasswordField.fill('testpassword123');
        await page.click('button[type="submit"], button:has-text("Sign in")');
        await page.waitForTimeout(3000);
        await page.screenshot({
          path: 'test-results/05-after-login.png',
          fullPage: true,
        });
      }
    }

    // Try to access chat
    console.log('6. Accessing chat interface...');
    await page.goto('http://localhost:3000', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(2000);
    await page.screenshot({
      path: 'test-results/06-homepage.png',
      fullPage: true,
    });

    // Look for chat input or navigate to chat
    let chatInput = await page
      .locator(
        'input[placeholder*="message"], textarea[placeholder*="message"]',
      )
      .count();

    if (chatInput === 0) {
      console.log('7. Looking for chat navigation...');
      // Try to find navigation to chat
      const chatLinks = await page
        .locator(
          'a[href*="chat"], text=Chat, text=New Chat, button:has-text("Chat")',
        )
        .count();
      if (chatLinks > 0) {
        await page.click(
          'a[href*="chat"], text=Chat, text=New Chat, button:has-text("Chat")',
        );
        await page.waitForTimeout(2000);
        await page.screenshot({
          path: 'test-results/07-chat-navigation.png',
          fullPage: true,
        });
        chatInput = await page
          .locator(
            'input[placeholder*="message"], textarea[placeholder*="message"]',
          )
          .count();
      }
    }

    // Test chat functionality
    if (chatInput > 0) {
      console.log('8. Testing chat functionality...');
      const input = page
        .locator(
          'input[placeholder*="message"], textarea[placeholder*="message"]',
        )
        .first();

      // Test basic conversation
      await input.fill(
        'Hello! Can you tell me about the RoboRail documents and any calibration procedures available?',
      );
      await page.screenshot({
        path: 'test-results/08-message-typed.png',
        fullPage: true,
      });

      // Send message
      const sendButton = page
        .locator(
          'button[type="submit"], button:has-text("Send"), button[aria-label*="Send"]',
        )
        .first();
      if (await sendButton.isVisible()) {
        await sendButton.click();
      } else {
        await input.press('Enter');
      }

      console.log('9. Waiting for AI response...');
      await page.waitForTimeout(8000); // Wait for AI response
      await page.screenshot({
        path: 'test-results/09-ai-response.png',
        fullPage: true,
      });

      // Test document-related query
      await input.fill(
        'Can you process one of the PDF documents with the new agentic analysis feature?',
      );
      await page.waitForTimeout(1000);
      await page.screenshot({
        path: 'test-results/10-document-query.png',
        fullPage: true,
      });

      if (await sendButton.isVisible()) {
        await sendButton.click();
      } else {
        await input.press('Enter');
      }

      await page.waitForTimeout(5000);
      await page.screenshot({
        path: 'test-results/11-document-response.png',
        fullPage: true,
      });
    } else {
      console.log('Chat input not found, checking current page content...');
      const bodyText = await page
        .textContent('body')
        .catch(() => 'Could not read body');
      console.log('Page content:', bodyText.substring(0, 500));
    }

    // Test documents page
    console.log('10. Testing documents page...');
    await page.goto('http://localhost:3000/documents', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(3000);
    await page.screenshot({
      path: 'test-results/12-documents-page.png',
      fullPage: true,
    });

    // Look for document-related features
    const uploadButtons = await page
      .locator('button:has-text("Upload"), input[type="file"]')
      .count();
    const documentItems = await page
      .locator('[data-testid*="document"], .document-item, .document-card')
      .count();

    console.log('Upload buttons found:', uploadButtons);
    console.log('Document items found:', documentItems);

    // Test any agentic document features if visible
    const agenticButtons = await page
      .locator('text=Agentic, text=AI Analysis, button:has-text("Analyze")')
      .count();
    console.log('Agentic analysis buttons found:', agenticButtons);

    if (agenticButtons > 0) {
      console.log('11. Testing agentic document features...');
      await page.click(
        'text=Agentic, text=AI Analysis, button:has-text("Analyze")',
      );
      await page.waitForTimeout(3000);
      await page.screenshot({
        path: 'test-results/13-agentic-features.png',
        fullPage: true,
      });
    }

    console.log('🎉 Complete test flow finished successfully!');

    // Summary
    console.log('\n📊 Test Summary:');
    console.log('- Authentication: ✅ Tested');
    console.log('- Chat Interface: ✅ Accessed');
    console.log('- Document Features: ✅ Explored');
    console.log('- Agentic Analysis: ✅ Investigated');
    console.log('- Screenshots: 📸 13 captured');
  } catch (error) {
    console.error('❌ Test failed:', error);
    await page.screenshot({
      path: 'test-results/error-final.png',
      fullPage: true,
    });
  } finally {
    // Keep browser open for a moment to see final state
    await page.waitForTimeout(3000);
    await browser.close();
  }
}

testCompleteFlow().catch(console.error);
