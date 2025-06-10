const { chromium } = require('playwright');

async function testChatInterface() {
  console.log('Starting chat interface test...');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 1000, // Slow down for visibility
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Navigate to the application
    console.log('Navigating to http://localhost:3000...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });

    // Take initial screenshot
    await page.screenshot({
      path: 'test-results/homepage.png',
      fullPage: true,
    });
    console.log('Screenshot saved: homepage.png');

    // Check page title
    const title = await page.title();
    console.log('Page title:', title);

    // Look for authentication elements
    const loginButton = await page
      .locator('text=Login')
      .first()
      .isVisible()
      .catch(() => false);
    const registerButton = await page
      .locator('text=Register')
      .first()
      .isVisible()
      .catch(() => false);
    const guestButton = await page
      .locator('text=Guest')
      .first()
      .isVisible()
      .catch(() => false);
    const chatInput = await page
      .locator(
        'input[placeholder*="message"], textarea[placeholder*="message"]',
      )
      .first()
      .isVisible()
      .catch(() => false);

    console.log('UI Elements detected:', {
      loginButton,
      registerButton,
      guestButton,
      chatInput,
    });

    // Try to access chat as guest if possible
    if (guestButton) {
      console.log('Attempting guest login...');
      await page.click('text=Guest');
      await page.waitForTimeout(2000);
      await page.screenshot({
        path: 'test-results/after-guest-login.png',
        fullPage: true,
      });
    } else if (chatInput) {
      console.log('Chat input already available');
    } else {
      console.log('Attempting to find and click chat/conversation link...');
      // Look for navigation to chat
      const chatLink = await page
        .locator(
          'a[href*="chat"], a[href*="conversation"], text=Chat, text=New Chat',
        )
        .first()
        .isVisible()
        .catch(() => false);
      if (chatLink) {
        await page.click(
          'a[href*="chat"], a[href*="conversation"], text=Chat, text=New Chat',
        );
        await page.waitForTimeout(2000);
      }
    }

    // Take screenshot after navigation
    await page.screenshot({
      path: 'test-results/chat-interface.png',
      fullPage: true,
    });

    // Try to send a test message about documents
    const messageInput = await page
      .locator(
        'input[placeholder*="message"], textarea[placeholder*="message"], input[type="text"]:visible',
      )
      .first();

    if (await messageInput.isVisible()) {
      console.log('Found message input, testing chat...');

      // Test message about documents
      await messageInput.fill(
        'Tell me about the available documents and any RoboRail information you have.',
      );
      await page.screenshot({
        path: 'test-results/message-typed.png',
        fullPage: true,
      });

      // Send message (look for send button or press Enter)
      const sendButton = await page
        .locator(
          'button[type="submit"], button:has-text("Send"), button:has(svg)',
        )
        .last()
        .isVisible()
        .catch(() => false);

      if (sendButton) {
        await page.click(
          'button[type="submit"], button:has-text("Send"), button:has(svg)',
        );
      } else {
        await messageInput.press('Enter');
      }

      console.log('Message sent, waiting for response...');

      // Wait for response
      await page.waitForTimeout(5000);
      await page.screenshot({
        path: 'test-results/chat-response.png',
        fullPage: true,
      });

      // Try to look for document features
      const documentButtons = await page
        .locator('text=Documents, text=Upload, button:has-text("Document")')
        .count();
      console.log('Document-related buttons found:', documentButtons);

      // Check for any agentic document features
      const agenticFeatures = await page
        .locator('text=Agentic, text=Analysis, text=AI Analysis')
        .count();
      console.log('Agentic features found:', agenticFeatures);

      // Look for document list or upload area
      if (documentButtons > 0) {
        console.log('Testing document features...');
        await page.click('text=Documents', { timeout: 5000 }).catch(() => {
          console.log('Documents link not clickable or not found');
        });
        await page.waitForTimeout(2000);
        await page.screenshot({
          path: 'test-results/documents-page.png',
          fullPage: true,
        });
      }
    } else {
      console.log(
        'No message input found - checking for authentication requirements',
      );

      // Check if we need to register/login first
      if (loginButton || registerButton) {
        console.log('Authentication required');
        await page.screenshot({
          path: 'test-results/auth-required.png',
          fullPage: true,
        });

        if (registerButton) {
          console.log('Attempting registration...');
          await page.click('text=Register');
          await page.waitForTimeout(2000);
          await page.screenshot({
            path: 'test-results/register-form.png',
            fullPage: true,
          });

          // Fill in registration form if present
          const emailInput = await page
            .locator('input[type="email"]')
            .first()
            .isVisible()
            .catch(() => false);
          const passwordInput = await page
            .locator('input[type="password"]')
            .first()
            .isVisible()
            .catch(() => false);

          if (emailInput && passwordInput) {
            await page.fill('input[type="email"]', 'test@example.com');
            await page.fill('input[type="password"]', 'testpassword123');
            await page
              .click('button[type="submit"]', { timeout: 5000 })
              .catch(() => {
                console.log('Submit button not found or not clickable');
              });
            await page.waitForTimeout(3000);
            await page.screenshot({
              path: 'test-results/after-registration.png',
              fullPage: true,
            });
          }
        }
      }
    }

    // Final screenshot
    await page.screenshot({
      path: 'test-results/final-state.png',
      fullPage: true,
    });

    console.log('Test completed successfully!');
  } catch (error) {
    console.error('Test failed:', error);
    await page.screenshot({
      path: 'test-results/error-state.png',
      fullPage: true,
    });
  } finally {
    await browser.close();
  }
}

// Run the test
testChatInterface().catch(console.error);
