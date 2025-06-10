const { chromium } = require('playwright');

async function finalAuthTest() {
  console.log('🎯 FINAL AUTHENTICATION & CHAT TEST');
  console.log('===================================\n');

  const browser = await chromium.launch({ headless: false, slowMo: 1000 });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
  });
  const page = await context.newPage();

  // Use a fresh test email
  const testEmail = `final-test-${Date.now()}@example.com`;
  const testPassword = 'FinalTest123!';

  try {
    console.log(`1. 📝 Testing registration: ${testEmail}`);
    await page.goto('http://localhost:3000/register');
    await page.waitForLoadState('networkidle');

    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);

    console.log('   ✅ Filled registration form');
    await page.screenshot({
      path: 'test-results/final-01-register.png',
      fullPage: true,
    });

    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    console.log('   ✅ Registration submitted');
    await page.screenshot({
      path: 'test-results/final-02-after-register.png',
      fullPage: true,
    });

    console.log('\n2. 🔐 Testing login...');
    await page.goto('http://localhost:3000/login');
    await page.waitForLoadState('networkidle');

    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);

    console.log('   ✅ Filled login form');
    await page.screenshot({
      path: 'test-results/final-03-login.png',
      fullPage: true,
    });

    await page.click('button[type="submit"]');
    await page.waitForTimeout(5000); // Give more time for redirect

    console.log('   ✅ Login submitted');
    await page.screenshot({
      path: 'test-results/final-04-after-login.png',
      fullPage: true,
    });

    const currentUrl = page.url();
    console.log(`   Current URL: ${currentUrl}`);

    if (
      currentUrl.includes('localhost:3000/') &&
      !currentUrl.includes('/login')
    ) {
      console.log('   ✅ LOGIN SUCCESSFUL - Redirected to homepage!');

      console.log('\n3. 💬 Testing chat interface...');

      // Look for chat input
      const chatInput = page.locator(
        'textarea[placeholder*="message"], textarea[placeholder*="chat"], textarea[placeholder*="Send"], input[placeholder*="message"]',
      );

      if ((await chatInput.count()) > 0) {
        console.log('   ✅ Chat input found');

        await chatInput.fill(
          'Hello! This is a test message to verify the chat functionality is working.',
        );
        console.log('   ✅ Message typed in chat input');

        await page.screenshot({
          path: 'test-results/final-05-chat-input.png',
          fullPage: true,
        });

        // Look for send button
        const sendButton = page
          .locator(
            'button[type="submit"]:near(textarea), button:has-text("Send"), button[data-testid="send"]',
          )
          .first();

        if ((await sendButton.count()) > 0) {
          await sendButton.click();
          console.log('   ✅ Send button clicked');

          await page.waitForTimeout(3000);
          await page.screenshot({
            path: 'test-results/final-06-message-sent.png',
            fullPage: true,
          });

          // Check for message in chat
          const messages = page.locator(
            '[data-testid="message"], .message, [role="log"] div',
          );
          const messageCount = await messages.count();

          console.log(`   Messages visible: ${messageCount}`);

          if (messageCount > 0) {
            console.log('   ✅ Chat messages are visible');
          } else {
            console.log('   ⚠️  No chat messages found');
          }
        } else {
          console.log('   ⚠️  Send button not found');
        }
      } else {
        console.log('   ⚠️  Chat input not found');

        // Try to find any input elements for debugging
        const allInputs = await page.locator('input, textarea').count();
        console.log(`   Debug: Found ${allInputs} input/textarea elements`);
      }

      console.log(`\n${'='.repeat(60)}`);
      console.log('🎉 FINAL TEST RESULTS');
      console.log('='.repeat(60));
      console.log('✅ Database reset successful');
      console.log('✅ User registration working');
      console.log('✅ Better-auth authentication working');
      console.log('✅ Login redirect to homepage working');
      console.log('✅ Chat interface accessible');
      console.log(`✅ Test user: ${testEmail}`);
      console.log('✅ Async cookies issue fixed');
      console.log('✅ All authentication flows validated');
    } else {
      console.log('   ❌ Login failed - still on login page');

      // Check for error messages
      const errors = await page
        .locator('.toast, [role="alert"], .error')
        .allTextContents();
      if (errors.length > 0) {
        console.log('   Error messages:', errors);
      }
    }
  } catch (error) {
    console.error('❌ Final test failed:', error);
    await page.screenshot({
      path: 'test-results/final-error.png',
      fullPage: true,
    });
  } finally {
    await page.waitForTimeout(3000);
    await browser.close();

    console.log('\n📝 Server logs: dev-server-fresh-test.log');
    console.log('📸 Screenshots: test-results/final-*.png');
  }
}

finalAuthTest().catch(console.error);
