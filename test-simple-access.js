const { chromium } = require('playwright');

async function testSimpleAccess() {
  console.log('Testing simple page access...');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 1000,
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Test different endpoints to see what works
    const endpoints = [
      '/login',
      '/register',
      '/api/health',
      '/chat/123', // Try a specific chat route
    ];

    for (const endpoint of endpoints) {
      console.log(`\n📍 Testing endpoint: ${endpoint}`);

      try {
        await page.goto(`http://localhost:3000${endpoint}`, {
          waitUntil: 'domcontentloaded',
          timeout: 15000,
        });

        await page.waitForTimeout(2000);

        const title = await page.title();
        const url = page.url();

        console.log(`✅ Success - Title: "${title}", Final URL: ${url}`);

        // Take screenshot
        const filename = `test-results/endpoint-${endpoint.replace(/[\/]/g, '-')}.png`;
        await page.screenshot({ path: filename, fullPage: true });
        console.log(`📸 Screenshot saved: ${filename}`);

        // Get some page content
        const bodyText = await page
          .textContent('body')
          .catch(() => 'Could not read body');
        console.log(`📄 Content preview: ${bodyText.substring(0, 200)}...`);

        // Check for interactive elements
        const inputs = await page.locator('input').count();
        const buttons = await page.locator('button').count();
        const forms = await page.locator('form').count();

        console.log(
          `🔍 Elements found - Inputs: ${inputs}, Buttons: ${buttons}, Forms: ${forms}`,
        );

        // Special handling for login page
        if (endpoint === '/login') {
          console.log('🔐 Testing login page functionality...');

          // Look for email and password fields
          const emailField = page.locator(
            'input[type="email"], input[name="email"]',
          );
          const passwordField = page.locator(
            'input[type="password"], input[name="password"]',
          );

          if (
            (await emailField.count()) > 0 &&
            (await passwordField.count()) > 0
          ) {
            console.log('📧 Found login form fields');

            // Try guest login approach
            const guestButtons = await page
              .locator(
                'text=Guest, text=Continue as Guest, button:has-text("Guest")',
              )
              .count();
            console.log(`👥 Guest login options: ${guestButtons}`);

            if (guestButtons > 0) {
              console.log('🎯 Attempting guest login...');
              await page.click(
                'text=Guest, text=Continue as Guest, button:has-text("Guest")',
              );
              await page.waitForTimeout(3000);

              const postGuestUrl = page.url();
              console.log(`🚀 After guest login: ${postGuestUrl}`);
              await page.screenshot({
                path: 'test-results/after-guest-login.png',
                fullPage: true,
              });
            }
          }
        }
      } catch (error) {
        console.log(`❌ Failed - Error: ${error.message}`);
        await page.screenshot({
          path: `test-results/error-${endpoint.replace(/[\/]/g, '-')}.png`,
          fullPage: true,
        });
      }
    }

    // Test API health endpoint separately (should not redirect)
    console.log('\n🏥 Testing API health endpoint directly...');
    try {
      const response = await page.request.get(
        'http://localhost:3000/api/health',
      );
      const status = response.status();
      const body = await response.text();
      console.log(`API Health - Status: ${status}, Response: ${body}`);
    } catch (error) {
      console.log(`API Health failed: ${error.message}`);
    }

    console.log('\n🎉 Simple access test completed!');
  } catch (error) {
    console.error('❌ Simple access test failed:', error);
    await page.screenshot({
      path: 'test-results/simple-access-error.png',
      fullPage: true,
    });
  } finally {
    await page.waitForTimeout(2000);
    await browser.close();
  }
}

testSimpleAccess().catch(console.error);
