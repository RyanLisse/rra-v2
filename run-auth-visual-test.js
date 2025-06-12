const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

async function runVisualDocumentation() {
  const screenshotDir = 'test-results/auth-visual-docs';
  
  // Create screenshot directory
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 1000 // Slow down for better visibility
  });
  
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 2,
  });
  
  const page = await context.newPage();
  let step = 0;

  const captureStep = async (name, description) => {
    step++;
    const filename = `${step.toString().padStart(2, '0')}-${name}.png`;
    await page.screenshot({
      path: path.join(screenshotDir, filename),
      fullPage: true
    });
    console.log(`📸 Step ${step}: ${description}`);
    console.log(`   Screenshot: ${filename}`);
  };

  try {
    console.log('🚀 Starting Auth Flow Visual Documentation\n');

    // Step 1: Homepage
    console.log('Testing homepage redirect...');
    await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
    await captureStep('homepage-redirect', 'Homepage redirects to auth');
    console.log(`   Current URL: ${page.url()}\n`);

    // Step 2: Login endpoint
    console.log('Testing login endpoint...');
    await page.goto('http://localhost:3000/api/auth/login', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await captureStep('kinde-oauth', 'Kinde OAuth login page');
    console.log(`   Current URL: ${page.url()}\n`);

    // Step 3: Clear session
    console.log('Testing clear session...');
    await page.goto('http://localhost:3000/api/auth/clear-session', { waitUntil: 'networkidle' });
    await captureStep('clear-session', 'Session cleared and redirected');
    console.log(`   Current URL: ${page.url()}\n`);

    // Step 4: Protected routes
    console.log('Testing protected routes...');
    await page.goto('http://localhost:3000/chat', { waitUntil: 'networkidle' });
    await captureStep('chat-protected', 'Chat route requires auth');
    
    await page.goto('http://localhost:3000/documents', { waitUntil: 'networkidle' });
    await captureStep('documents-protected', 'Documents route requires auth');

    // Step 5: Error handling
    console.log('\nTesting error handling...');
    await page.goto('http://localhost:3000/api/auth/kinde_callback?state=invalid', { waitUntil: 'networkidle' });
    await captureStep('error-handling', 'Invalid state handled gracefully');
    console.log(`   Final URL: ${page.url()}\n`);

    console.log('📊 Visual Documentation Complete!');
    console.log(`✅ Captured ${step} screenshots`);
    console.log(`📁 Location: ${screenshotDir}/`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    await captureStep('error-state', 'Error occurred');
  } finally {
    await browser.close();
  }
}

// Run the test
runVisualDocumentation().catch(console.error);