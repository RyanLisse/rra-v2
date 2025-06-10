#!/usr/bin/env node

const puppeteer = require('puppeteer');

async function testAuthAndChat() {
  const browser = await puppeteer.launch({
    headless: false,
    devtools: true,
    slowMo: 500,
  });

  try {
    const page = await browser.newPage();

    // Listen for console logs
    page.on('console', (msg) => {
      console.log(`🌐 Browser: ${msg.text()}`);
    });

    // Listen for network requests
    page.on('response', (response) => {
      if (response.url().includes('/api/')) {
        console.log(`📡 API: ${response.status()} ${response.url()}`);
      }
    });

    console.log('🚀 Starting authentication and chat test...');

    // Step 1: Navigate to home page
    console.log('1️⃣ Navigating to home page...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });

    // Should be redirected to login
    await page.waitForSelector('input[name="email"]', { timeout: 10000 });
    console.log('✅ Redirected to login page');

    // Step 2: Login
    console.log('2️⃣ Attempting login...');
    await page.type('input[name="email"]', 'ryan@ryanlisse.com');
    await page.type('input[name="password"]', 'password123'); // Update with actual password

    await page.click('button[type="submit"]');

    // Wait for navigation after login
    await page.waitForFunction(() => window.location.pathname === '/', {
      timeout: 15000,
    });
    console.log('✅ Login successful, on home page');

    // Step 3: Test chat interface
    console.log('3️⃣ Testing chat interface...');

    // Wait for chat interface to load
    await page.waitForSelector('textarea, input[type="text"]', {
      timeout: 10000,
    });
    console.log('✅ Chat interface loaded');

    // Find the chat input
    const chatInput =
      (await page.$('textarea')) || (await page.$('input[type="text"]'));
    if (!chatInput) {
      throw new Error('Could not find chat input');
    }

    // Type a test message
    await chatInput.type('Hello, this is a test message for the chat system.');
    await page.keyboard.press('Enter');

    console.log('✅ Test message sent');

    // Wait a moment for any responses
    await page.waitForTimeout(3000);

    // Take a screenshot
    await page.screenshot({ path: 'chat-test-result.png', fullPage: true });
    console.log('📸 Screenshot saved as chat-test-result.png');

    console.log('🏁 Test completed successfully!');
  } catch (error) {
    console.error('❌ Test failed:', error.message);

    // Take error screenshot
    const page = browser.pages()[0];
    if (page) {
      await page.screenshot({ path: 'chat-test-error.png', fullPage: true });
      console.log('📸 Error screenshot saved as chat-test-error.png');
    }
  } finally {
    await browser.close();
  }
}

testAuthAndChat();
