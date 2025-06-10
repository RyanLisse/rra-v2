const { chromium } = require('playwright');

async function quickLoginTest() {
  console.log('🔍 QUICK LOGIN DEBUG TEST');
  console.log('=========================\n');

  const browser = await chromium.launch({ headless: false, slowMo: 2000 });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
  });
  const page = await context.newPage();

  // Use the user we just created
  const testEmail = 'final-test-1749399566052@example.com';
  const testPassword = 'FinalTest123!';

  try {
    console.log('🔐 Testing login with existing user...');
    await page.goto('http://localhost:3000/login');
    await page.waitForLoadState('networkidle');

    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);

    console.log('   Form filled, submitting...');
    await page.screenshot({
      path: 'test-results/quick-login-before.png',
      fullPage: true,
    });

    // Watch for console logs from the login action
    page.on('console', (msg) => {
      if (
        msg.text().includes('🔐') ||
        msg.text().includes('✅') ||
        msg.text().includes('❌')
      ) {
        console.log(`   Console: ${msg.text()}`);
      }
    });

    await page.click('button[type="submit"]');

    // Wait longer to see what happens
    await page.waitForTimeout(8000);

    const finalUrl = page.url();
    console.log(`   Final URL: ${finalUrl}`);

    await page.screenshot({
      path: 'test-results/quick-login-after.png',
      fullPage: true,
    });

    if (finalUrl.includes('localhost:3000/') && !finalUrl.includes('/login')) {
      console.log('   ✅ Login successful!');
    } else {
      console.log('   ❌ Still on login page');
    }
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await page.waitForTimeout(2000);
    await browser.close();
  }
}

quickLoginTest().catch(console.error);
