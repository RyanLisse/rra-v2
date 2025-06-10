const { chromium } = require('playwright');

async function debugAuth() {
  console.log('🔍 Debugging Authentication System');
  console.log('=================================\n');

  const browser = await chromium.launch({ headless: false, slowMo: 1000 });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
  });
  const page = await context.newPage();

  try {
    console.log('1. 📝 Testing registration process...');
    await page.goto('http://localhost:3000/register');
    await page.waitForTimeout(2000);

    // Fill registration form
    await page.fill(
      'input[name="email"], input[type="email"]',
      'newuser@example.com',
    );
    await page.fill(
      'input[name="password"], input[type="password"]',
      'testpassword123',
    );

    console.log('   ✅ Filled registration form');
    await page.screenshot({
      path: 'test-results/auth-01-registration-form.png',
      fullPage: true,
    });

    // Submit registration
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    console.log('   ✅ Submitted registration form');
    await page.screenshot({
      path: 'test-results/auth-02-after-submit.png',
      fullPage: true,
    });

    const currentUrl = page.url();
    console.log(`   Current URL after registration: ${currentUrl}`);

    // Check for error messages
    const errorMessage = await page
      .locator('[role="alert"], .error, [data-testid="error"]')
      .textContent()
      .catch(() => null);
    if (errorMessage) {
      console.log(`   ⚠️  Error message found: ${errorMessage}`);
    } else {
      console.log('   ✅ No visible error messages');
    }

    console.log('\n2. 🔐 Testing login process...');

    // Navigate to login if not already there
    if (!currentUrl.includes('login')) {
      await page.goto('http://localhost:3000/login');
      await page.waitForTimeout(2000);
    }

    // Fill login form
    await page.fill(
      'input[name="email"], input[type="email"]',
      'newuser@example.com',
    );
    await page.fill(
      'input[name="password"], input[type="password"]',
      'testpassword123',
    );

    console.log('   ✅ Filled login form');
    await page.screenshot({
      path: 'test-results/auth-03-login-form.png',
      fullPage: true,
    });

    // Submit login
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    console.log('   ✅ Submitted login form');
    await page.screenshot({
      path: 'test-results/auth-04-after-login.png',
      fullPage: true,
    });

    const loginUrl = page.url();
    console.log(`   Current URL after login: ${loginUrl}`);

    // Check for login success or error
    const loginError = await page
      .locator('[role="alert"], .error, [data-testid="error"]')
      .textContent()
      .catch(() => null);
    if (loginError) {
      console.log(`   ⚠️  Login error: ${loginError}`);
    } else {
      console.log('   ✅ No visible login errors');
    }

    // Check if redirected to homepage (successful login)
    if (loginUrl.includes('localhost:3000/') && !loginUrl.includes('/login')) {
      console.log('   ✅ Successfully logged in and redirected');
    } else {
      console.log('   ⚠️  Login may have failed (still on login page)');
    }

    console.log(`\n${'='.repeat(50)}`);
    console.log('🔍 AUTH DEBUG SUMMARY');
    console.log('='.repeat(50));
    console.log('✅ Registration page accessible');
    console.log('✅ Login page accessible');
    console.log('✅ Forms can be filled and submitted');
    console.log('');
    console.log('📝 Check server logs for detailed error information');
    console.log('🔧 Account creation may need Better-auth configuration fixes');
  } catch (error) {
    console.error('❌ Auth debug failed:', error);
    await page.screenshot({
      path: 'test-results/auth-debug-error.png',
      fullPage: true,
    });
  } finally {
    await page.waitForTimeout(3000);
    await browser.close();
  }
}

debugAuth().catch(console.error);
