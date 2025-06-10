import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Opt out of parallel tests on CI */
  workers: process.env.CI ? 1 : undefined,

  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',

  /* Shared settings for all the projects below */
  use: {
    /* Screenshot configuration */
    screenshot: 'only-on-failure',

    /* Video recording */
    video: 'retain-on-failure',

    /* Trace recording */
    trace: 'retain-on-failure',

    /* Enhanced browser context */
    contextOptions: {
      // Ignore HTTPS errors for local development
      ignoreHTTPSErrors: true,
      // Enhanced viewport for consistent testing
      viewport: { width: 1280, height: 720 },
    },

    /* Action timeout */
    actionTimeout: 30000,

    /* Navigation timeout */
    navigationTimeout: 30000,
  },

  /* Enhanced timeout configuration */
  timeout: 60000,
  expect: {
    timeout: 30000,
  },

  /* Enhanced output directory */
  outputDir: './test-results/playwright-artifacts',

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Don't start a web server - we assume it's already running */
  // webServer: undefined,
});
