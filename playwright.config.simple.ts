import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: false,
  retries: 0,
  workers: 1,
  reporter: 'html',

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 30000,
    navigationTimeout: 60000,
  },

  timeout: 120000,
  expect: {
    timeout: 30000,
  },

  outputDir: './test-results/artifacts',

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testMatch: [
        '**/health-check.spec.ts',
        '**/auth-flow.spec.ts',
        '**/chat-basic.spec.ts',
        '**/document-upload.spec.ts',
      ],
    },
  ],

  /* Web server configuration */
  webServer: {
    command: 'PORT=3000 bun dev',
    url: 'http://localhost:3000/api/ping',
    timeout: 120 * 1000,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      NODE_ENV: 'test',
      PORT: '3000',
      SKIP_DB_HEALTH_CHECK: 'true',
      DISABLE_TELEMETRY: 'true',
    },
  },
});
