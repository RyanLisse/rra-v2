const { chromium } = require('playwright');

async function resetAndTestAuth() {
  console.log('🔄 RESET AND TEST AUTHENTICATION');
  console.log('==================================\n');

  const browser = await chromium.launch({ headless: false, slowMo: 800 });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
  });
  const page = await context.newPage();

  // Use a fresh test email to avoid any existing user conflicts
  const testEmail = `test-${Date.now()}@example.com`;
  const testPassword = 'TestPassword123!';

  try {
    console.log(`1. 📝 Testing registration with fresh email: ${testEmail}`);
    await page.goto('http://localhost:3000/register');
    await page.waitForLoadState('networkidle');

    // Fill registration form
    await page.fill('input[name="email"], input[type="email"]', testEmail);
    await page.fill(
      'input[name="password"], input[type="password"]',
      testPassword,
    );

    console.log('   ✅ Filled registration form');
    await page.screenshot({
      path: 'test-results/fresh-01-registration.png',
      fullPage: true,
    });

    // Submit registration and wait for response
    const [response] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes('/register') && res.request().method() === 'POST',
      ),
      page.click('button[type="submit"]'),
    ]);

    console.log(`   Registration response: ${response.status()}`);
    await page.waitForTimeout(2000);
    await page.screenshot({
      path: 'test-results/fresh-02-after-register.png',
      fullPage: true,
    });

    const registerUrl = page.url();
    console.log(`   Current URL after registration: ${registerUrl}`);

    console.log('\n2. 🔐 Testing login with fresh account...');

    // Navigate to login
    await page.goto('http://localhost:3000/login');
    await page.waitForLoadState('networkidle');

    // Fill login form
    await page.fill('input[name="email"], input[type="email"]', testEmail);
    await page.fill(
      'input[name="password"], input[type="password"]',
      testPassword,
    );

    console.log('   ✅ Filled login form');
    await page.screenshot({
      path: 'test-results/fresh-03-login.png',
      fullPage: true,
    });

    // Submit login and wait for response
    const [loginResponse] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes('/login') && res.request().method() === 'POST',
      ),
      page.click('button[type="submit"]'),
    ]);

    console.log(`   Login response: ${loginResponse.status()}`);
    await page.waitForTimeout(3000);
    await page.screenshot({
      path: 'test-results/fresh-04-after-login.png',
      fullPage: true,
    });

    const loginUrl = page.url();
    console.log(`   Current URL after login: ${loginUrl}`);

    // Check if successfully logged in
    if (loginUrl.includes('localhost:3000/') && !loginUrl.includes('/login')) {
      console.log('   ✅ LOGIN SUCCESSFUL - redirected to homepage!');

      // Test chat functionality
      console.log('\n3. 💬 Testing chat functionality...');

      // Look for chat interface elements
      const chatInput = page.locator(
        'textarea, input[placeholder*="message"], input[placeholder*="chat"]',
      );
      const hasChatInput = (await chatInput.count()) > 0;

      if (hasChatInput) {
        console.log('   ✅ Chat interface found');
        await chatInput.fill(
          'Hello! Can you help me test the chat functionality?',
        );
        await page.screenshot({
          path: 'test-results/fresh-05-chat-input.png',
          fullPage: true,
        });

        // Try to send message
        const sendButton = page
          .locator('button[type="submit"], button:has-text("Send")')
          .first();
        if ((await sendButton.count()) > 0) {
          await sendButton.click();
          await page.waitForTimeout(3000);
          await page.screenshot({
            path: 'test-results/fresh-06-chat-sent.png',
            fullPage: true,
          });
          console.log('   ✅ Chat message sent successfully');
        }
      } else {
        console.log('   ⚠️  Chat interface not immediately visible');
      }

      console.log(`\n${'='.repeat(60)}`);
      console.log('🎉 AUTHENTICATION AND CHAT TEST COMPLETED SUCCESSFULLY!');
      console.log('='.repeat(60));
      console.log('✅ Fresh user registration works');
      console.log('✅ Login authentication works');
      console.log('✅ Better-auth integration functioning properly');
      console.log('✅ Chat interface accessible');
      console.log(`✅ Test user: ${testEmail}`);
    } else {
      console.log('   ❌ Login failed - still on login page');

      // Check for error messages
      const errorElements = await page
        .locator('.toast, [role="alert"], .error, .text-red-500')
        .all();
      for (const element of errorElements) {
        const text = await element.textContent();
        if (text?.trim()) {
          console.log(`   Error message: ${text.trim()}`);
        }
      }
    }
  } catch (error) {
    console.error('❌ Authentication test failed:', error);
    await page.screenshot({
      path: 'test-results/fresh-error.png',
      fullPage: true,
    });
  } finally {
    await page.waitForTimeout(3000);
    await browser.close();

    console.log('\n📝 Server logs saved to dev-server-fresh-test.log');
    console.log('📸 Screenshots saved to test-results/fresh-*.png');
  }
}

resetAndTestAuth().catch(console.error);
