import { test, expect } from '@playwright/test';

test.describe('Auth Flow Optimization - Critical Issues', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.log(`Console error: ${msg.text()}`);
      }
    });

    page.on('pageerror', (error) => {
      console.log(`Page error: ${error.message}`);
    });
  });

  test('Homepage redirects to Kinde auth correctly', async ({ page }) => {
    console.log('Testing homepage auth redirect...');

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Wait for any redirects to complete
    await page.waitForLoadState('networkidle', { timeout: 10000 });

    const currentUrl = page.url();
    console.log(`Current URL after redirect: ${currentUrl}`);

    // Should be redirected to Kinde auth or login page
    const isAuthRedirect =
      currentUrl.includes('kinde.com') ||
      currentUrl.includes('/login') ||
      currentUrl.includes('/api/auth/login');

    expect(isAuthRedirect).toBeTruthy();

    // Take screenshot of current state
    await page.screenshot({
      path: 'test-results/auth-opt-01-homepage-redirect.png',
      fullPage: true,
    });

    console.log('✅ Homepage correctly redirects to auth');
  });

  test('Kinde auth endpoints are accessible', async ({ page }) => {
    console.log('Testing Kinde auth endpoint accessibility...');

    // Test login endpoint
    const loginResponse = await page.goto('/api/auth/login', {
      waitUntil: 'domcontentloaded',
      timeout: 10000,
    });

    // Should redirect to Kinde (3xx) or return 200
    const loginStatus = loginResponse?.status();
    console.log(`Login endpoint status: ${loginStatus}`);

    expect(loginStatus).toBeGreaterThanOrEqual(200);
    expect(loginStatus).toBeLessThan(500);

    await page.screenshot({
      path: 'test-results/auth-opt-02-login-endpoint.png',
      fullPage: true,
    });

    console.log('✅ Auth endpoints are accessible');
  });

  test('Guest endpoint correctly redirects', async ({ page }) => {
    console.log('Testing guest endpoint behavior...');

    const guestResponse = await page.goto('/api/auth/guest', {
      waitUntil: 'domcontentloaded',
    });

    const currentUrl = page.url();
    console.log(`Guest endpoint redirected to: ${currentUrl}`);

    // Should redirect to login since we disabled guest functionality
    expect(currentUrl).toContain('login');

    await page.screenshot({
      path: 'test-results/auth-opt-03-guest-endpoint.png',
      fullPage: true,
    });

    console.log('✅ Guest endpoint correctly redirects to login');
  });

  test('API routes properly require authentication', async ({ page }) => {
    console.log('Testing API route protection...');

    // Test chat API without auth
    const chatResponse = await page.request.post('/api/chat', {
      data: {
        id: 'test',
        message: { role: 'user', content: 'test' },
        selectedChatModel: 'gpt-4o-mini',
        selectedVisibilityType: 'private',
      },
    });

    const chatStatus = chatResponse.status();
    console.log(`Chat API without auth status: ${chatStatus}`);

    // Should return 401 Unauthorized
    expect(chatStatus).toBe(401);

    // Test document upload API without auth
    const uploadResponse = await page.request.post('/api/documents/upload', {
      data: { name: 'test.txt', content: 'test' },
    });

    const uploadStatus = uploadResponse.status();
    console.log(`Upload API without auth status: ${uploadStatus}`);

    // Should return 401 Unauthorized
    expect(uploadStatus).toBe(401);

    console.log('✅ API routes properly protected');
  });

  test('Middleware error handling works', async ({ page }) => {
    console.log('Testing middleware error handling...');

    // Navigate to a protected route to trigger middleware
    const response = await page.goto('/chat', {
      waitUntil: 'domcontentloaded',
      timeout: 10000,
    });

    const currentUrl = page.url();
    console.log(`Protected route redirected to: ${currentUrl}`);

    // Should redirect to auth
    const isAuthRedirect =
      currentUrl.includes('kinde.com') ||
      currentUrl.includes('/login') ||
      currentUrl.includes('/api/auth/login');

    expect(isAuthRedirect).toBeTruthy();

    await page.screenshot({
      path: 'test-results/auth-opt-04-middleware-protection.png',
      fullPage: true,
    });

    console.log('✅ Middleware correctly protects routes');
  });

  test('Auth state consistency between client and server', async ({ page }) => {
    console.log('Testing auth state consistency...');

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    // Check if auth state is consistent in browser console
    const authState = await page.evaluate(() => {
      return {
        hasSessionCookie:
          document.cookie.includes('session') ||
          document.cookie.includes('auth') ||
          document.cookie.includes('kinde'),
        hasAuthData: !!(window as any).kindeAuth || !!(window as any).session,
      };
    });

    console.log('Client auth state:', authState);

    // Check server-side auth by making an API call
    const apiResponse = await page.request.get('/api/ping');
    const apiStatus = apiResponse.status();

    console.log(`API ping status: ${apiStatus}`);

    // Both client and server should be consistent
    if (authState.hasSessionCookie) {
      // If we have session cookies, API should work
      expect(apiStatus).toBe(200);
    } else {
      // If no session, we should be properly redirected
      expect(page.url()).not.toBe('http://localhost:3000/');
    }

    await page.screenshot({
      path: 'test-results/auth-opt-05-auth-consistency.png',
      fullPage: true,
    });

    console.log('✅ Auth state consistency verified');
  });
});
