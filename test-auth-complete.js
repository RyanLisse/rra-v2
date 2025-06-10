const { chromium } = require('playwright');

async function testCompleteAuthFlow() {
  console.log('🚀 Starting complete authentication flow test...');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  const testEmail = `test-${Date.now()}@example.com`;
  const testPassword = 'SecurePassword123!';

  try {
    // Step 1: Registration
    console.log('📱 Step 1: Testing Registration...');
    await page.goto('http://localhost:3000/register');
    await page.waitForLoadState('networkidle');

    console.log('📝 Filling registration form...');
    await page.fill('input[name="email"]', testEmail);
    await page.fill('input[name="password"]', testPassword);

    await page.screenshot({ path: '/tmp/1-registration-form.png' });

    console.log('✅ Submitting registration...');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    const afterRegisterUrl = page.url();
    console.log('🌐 After registration URL:', afterRegisterUrl);

    if (afterRegisterUrl.includes('/login')) {
      console.log('✅ Registration successful! Redirected to login page');
      await page.screenshot({ path: '/tmp/2-login-page.png' });

      // Step 2: Login
      console.log('📱 Step 2: Testing Login...');
      await page.fill('input[name="email"]', testEmail);
      await page.fill('input[name="password"]', testPassword);

      await page.screenshot({ path: '/tmp/3-login-form.png' });

      console.log('🔑 Submitting login...');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(5000);

      const afterLoginUrl = page.url();
      console.log('🌐 After login URL:', afterLoginUrl);

      if (
        afterLoginUrl === 'http://localhost:3000/' ||
        (afterLoginUrl.includes('localhost:3000') &&
          !afterLoginUrl.includes('/login') &&
          !afterLoginUrl.includes('/register'))
      ) {
        console.log('✅ Login successful! Redirected to homepage');
        await page.screenshot({ path: '/tmp/4-homepage-authenticated.png' });

        // Step 3: Test chat functionality
        console.log('📱 Step 3: Testing Chat Interface...');
        await page.waitForTimeout(2000);

        // Look for chat interface elements
        const chatInput = await page
          .locator(
            'textarea, input[placeholder*="message"], input[placeholder*="chat"]',
          )
          .first();
        if (await chatInput.isVisible()) {
          console.log('💬 Chat input found - testing message...');
          await chatInput.fill(
            'Hello, this is a test message for the RAG system',
          );
          await page.screenshot({ path: '/tmp/5-chat-input.png' });

          // Try to send the message
          const sendButton = await page
            .locator(
              'button[type="submit"], button[aria-label*="send"], button:has-text("Send")',
            )
            .first();
          if (await sendButton.isVisible()) {
            await sendButton.click();
            console.log('📤 Message sent, waiting for response...');
            await page.waitForTimeout(3000);
            await page.screenshot({ path: '/tmp/6-chat-response.png' });
          }
        } else {
          console.log(
            '💭 No immediate chat input found, taking screenshot of current state',
          );
          await page.screenshot({ path: '/tmp/5-homepage-state.png' });
        }

        console.log('🎉 Complete authentication flow test PASSED!');
        console.log('✅ Registration: SUCCESS');
        console.log('✅ Login: SUCCESS');
        console.log('✅ Homepage Access: SUCCESS');
      } else {
        console.log('❌ Login failed - did not redirect to homepage');
        await page.screenshot({ path: '/tmp/4-login-failed.png' });
      }
    } else {
      console.log('❌ Registration failed - did not redirect to login');
      await page.screenshot({ path: '/tmp/2-registration-failed.png' });
    }
  } catch (error) {
    console.error('❌ Test error:', error.message);
    await page.screenshot({ path: '/tmp/error-screenshot.png' });
  }

  await browser.close();
  console.log('🏁 Test completed');
}

testCompleteAuthFlow().catch(console.error);
