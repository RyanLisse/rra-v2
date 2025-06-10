const { chromium } = require('playwright');

async function testMiddlewareBehavior() {
  console.log('🔍 TESTING MIDDLEWARE BEHAVIOR');
  console.log('==============================\n');

  const browser = await chromium.launch({ headless: false, slowMo: 1500 });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
  });
  const page = await context.newPage();

  // Track all requests to see what's happening
  page.on('response', (response) => {
    if (
      !response.url().includes('_next') &&
      !response.url().includes('favicon')
    ) {
      console.log(
        `   → ${response.status()} ${response.request().method()} ${response.url()}`,
      );
    }
  });

  const testEmail = `middleware-test-${Date.now()}@example.com`;
  const testPassword = 'MiddlewareTest123!';

  try {
    console.log('1. 🏠 Testing homepage access (unauthenticated)...');
    await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });

    const homeUrl = page.url();
    console.log(`   Final URL: ${homeUrl}`);
    await page.screenshot({
      path: 'test-results/middleware-01-homepage.png',
      fullPage: true,
    });

    console.log('\n2. 📝 Testing registration...');
    await page.goto('http://localhost:3000/register');
    await page.waitForLoadState('networkidle');

    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.screenshot({
      path: 'test-results/middleware-02-register.png',
      fullPage: true,
    });

    console.log('   Submitting registration...');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    const afterRegisterUrl = page.url();
    console.log(`   URL after registration: ${afterRegisterUrl}`);
    await page.screenshot({
      path: 'test-results/middleware-03-after-register.png',
      fullPage: true,
    });

    console.log('\n3. 🔐 Testing login...');
    await page.goto('http://localhost:3000/login');
    await page.waitForLoadState('networkidle');

    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.screenshot({
      path: 'test-results/middleware-04-login.png',
      fullPage: true,
    });

    console.log('   Submitting login...');
    await page.click('button[type="submit"]');

    // Wait and track what happens
    await page.waitForTimeout(5000);

    const afterLoginUrl = page.url();
    console.log(`   URL after login: ${afterLoginUrl}`);
    await page.screenshot({
      path: 'test-results/middleware-05-after-login.png',
      fullPage: true,
    });

    console.log('\n4. 🏠 Testing homepage access (authenticated)...');
    await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });

    const authenticatedHomeUrl = page.url();
    console.log(`   Authenticated homepage URL: ${authenticatedHomeUrl}`);
    await page.screenshot({
      path: 'test-results/middleware-06-authenticated-home.png',
      fullPage: true,
    });

    // Check if we can see user info or authenticated content
    const userInfo = await page
      .locator('[data-testid="user-info"], .user-nav, .logout')
      .count();
    console.log(`   User navigation elements found: ${userInfo}`);

    if (
      authenticatedHomeUrl.includes('localhost:3000/') &&
      !authenticatedHomeUrl.includes('/login')
    ) {
      console.log('   ✅ Successfully accessing homepage while authenticated');
    } else {
      console.log('   ❌ Redirected away from homepage');
    }
  } catch (error) {
    console.error('❌ Middleware test failed:', error);
    await page.screenshot({
      path: 'test-results/middleware-error.png',
      fullPage: true,
    });
  } finally {
    await page.waitForTimeout(3000);
    await browser.close();

    console.log(
      '\n📝 Check dev-server-middleware-test.log for detailed server responses',
    );
  }
}

testMiddlewareBehavior().catch(console.error);
