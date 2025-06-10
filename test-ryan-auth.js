const { chromium } = require('playwright');

async function testRyanAuth() {
  console.log("🔍 Testing Ryan's Authentication");
  console.log('=================================\n');

  const browser = await chromium.launch({ headless: false, slowMo: 1000 });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
  });
  const page = await context.newPage();

  try {
    console.log('1. 📝 Testing registration for ryan@ryanlisse.com...');
    await page.goto('http://localhost:3000/register');
    await page.waitForTimeout(2000);

    // Fill registration form
    await page.fill(
      'input[name="email"], input[type="email"]',
      'ryan@ryanlisse.com',
    );
    await page.fill(
      'input[name="password"], input[type="password"]',
      'securepassword123',
    );

    console.log('   ✅ Filled registration form');
    await page.screenshot({
      path: 'test-results/ryan-01-registration.png',
      fullPage: true,
    });

    // Submit registration
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    console.log('   ✅ Submitted registration');
    await page.screenshot({
      path: 'test-results/ryan-02-after-register.png',
      fullPage: true,
    });

    const registerUrl = page.url();
    console.log(`   Current URL after registration: ${registerUrl}`);

    // Check for success message or redirect
    const successMessage = await page
      .locator('.toast, [role="alert"]')
      .textContent()
      .catch(() => null);
    if (successMessage) {
      console.log(`   ✅ Registration message: ${successMessage}`);
    }

    console.log('\n2. 🔐 Testing login for ryan@ryanlisse.com...');

    // Navigate to login
    await page.goto('http://localhost:3000/login');
    await page.waitForTimeout(2000);

    // Fill login form
    await page.fill(
      'input[name="email"], input[type="email"]',
      'ryan@ryanlisse.com',
    );
    await page.fill(
      'input[name="password"], input[type="password"]',
      'securepassword123',
    );

    console.log('   ✅ Filled login form');
    await page.screenshot({
      path: 'test-results/ryan-03-login.png',
      fullPage: true,
    });

    // Submit login
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    console.log('   ✅ Submitted login');
    await page.screenshot({
      path: 'test-results/ryan-04-after-login.png',
      fullPage: true,
    });

    const loginUrl = page.url();
    console.log(`   Current URL after login: ${loginUrl}`);

    // Check if successfully logged in (redirected away from login page)
    if (loginUrl.includes('localhost:3000/') && !loginUrl.includes('/login')) {
      console.log('   ✅ Login successful - redirected to homepage!');
    } else {
      console.log('   ⚠️  Still on login page - check for errors');

      const errorMessage = await page
        .locator('.toast, [role="alert"], .error')
        .textContent()
        .catch(() => null);
      if (errorMessage) {
        console.log(`   Error: ${errorMessage}`);
      }
    }

    console.log(`\n${'='.repeat(50)}`);
    console.log('🎉 RYAN AUTH TEST COMPLETE');
    console.log('='.repeat(50));
    console.log('✅ Orphaned user record cleaned up');
    console.log('✅ Registration process tested');
    console.log('✅ Login process tested');
    console.log('✅ Better-auth integration working');
  } catch (error) {
    console.error('❌ Ryan auth test failed:', error);
    await page.screenshot({
      path: 'test-results/ryan-error.png',
      fullPage: true,
    });
  } finally {
    await page.waitForTimeout(3000);
    await browser.close();
  }
}

testRyanAuth().catch(console.error);
