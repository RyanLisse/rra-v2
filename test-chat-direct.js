const { chromium } = require('playwright');

async function testChatDirect() {
  console.log('Testing direct chat access...');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 500,
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Try to access chat directly
    console.log('Navigating to http://localhost:3000/chat directly...');
    await page.goto('http://localhost:3000/chat', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // Wait a bit for the page to settle
    await page.waitForTimeout(3000);

    // Take screenshot
    await page.screenshot({
      path: 'test-results/chat-direct.png',
      fullPage: true,
    });
    console.log('Screenshot saved: chat-direct.png');

    // Check what's on the page
    const title = await page.title();
    console.log('Page title:', title);

    const currentUrl = page.url();
    console.log('Current URL:', currentUrl);

    // Look for any content on the page
    const bodyText = await page
      .textContent('body')
      .catch(() => 'Could not read body text');
    console.log('Page contains:', `${bodyText.substring(0, 300)}...`);

    // Look for specific elements
    const chatInput = await page
      .locator(
        'input[placeholder*="message"], textarea[placeholder*="message"]',
      )
      .count();
    console.log('Chat input fields found:', chatInput);

    const buttons = await page.locator('button').count();
    console.log('Buttons found:', buttons);

    const links = await page.locator('a').count();
    console.log('Links found:', links);

    // Try looking for New Chat or similar
    const newChatButton = await page
      .locator('text=New, text=Chat, text=Start, button')
      .count();
    console.log('Potential new chat buttons:', newChatButton);

    // If we find a chat input, try to use it
    if (chatInput > 0) {
      console.log('Found chat input, testing...');
      const input = page
        .locator(
          'input[placeholder*="message"], textarea[placeholder*="message"]',
        )
        .first();
      await input.fill('Hello! Can you tell me about the documents available?');
      await page.screenshot({
        path: 'test-results/message-entered.png',
        fullPage: true,
      });

      // Look for send button
      const sendButton = page
        .locator('button[type="submit"], button:has-text("Send")')
        .first();
      if (await sendButton.isVisible()) {
        await sendButton.click();
        console.log('Message sent, waiting for response...');
        await page.waitForTimeout(5000);
        await page.screenshot({
          path: 'test-results/response-received.png',
          fullPage: true,
        });
      } else {
        await input.press('Enter');
        console.log('Pressed Enter to send message...');
        await page.waitForTimeout(5000);
        await page.screenshot({
          path: 'test-results/response-received.png',
          fullPage: true,
        });
      }
    }

    // Try documents page
    console.log('Testing documents page...');
    await page.goto('http://localhost:3000/documents', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(2000);
    await page.screenshot({
      path: 'test-results/documents-page.png',
      fullPage: true,
    });

    const docsText = await page
      .textContent('body')
      .catch(() => 'Could not read body text');
    console.log('Documents page contains:', `${docsText.substring(0, 200)}...`);

    console.log('Direct test completed!');
  } catch (error) {
    console.error('Direct test failed:', error);
    await page.screenshot({
      path: 'test-results/direct-error.png',
      fullPage: true,
    });
  } finally {
    await browser.close();
  }
}

testChatDirect().catch(console.error);
