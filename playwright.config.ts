import { defineConfig, devices } from '@playwright/test';
import { config } from 'dotenv';
import path from 'node:path';

/**
 * Enhanced Playwright configuration with Neon API client integration
 * Supports branch-based testing and improved error handling
 */

// Load environment variables in priority order
config({ path: '.env.local' });
config({ path: '.env.test' });

/* Environment-based configuration */
const isNeonEnabled = process.env.USE_NEON_BRANCHING === 'true';
const isCI = !!process.env.CI;
const PORT = process.env.PORT || 3000;
const baseURL = `http://localhost:${PORT}`;

/* Enhanced timeout configuration based on Neon usage */
const baseTimeout = isNeonEnabled
  ? Number.parseInt(process.env.PLAYWRIGHT_TIMEOUT || '180000')
  : 120000;

const expectTimeout = isNeonEnabled
  ? Number.parseInt(process.env.PLAYWRIGHT_EXPECT_TIMEOUT || '120000')
  : 60000;

/* Worker configuration with Neon API rate limiting considerations */
const getWorkerCount = () => {
  if (isNeonEnabled) {
    return Number.parseInt(process.env.PLAYWRIGHT_WORKERS || '2'); // Conservative for Neon
  }
  return isCI ? 2 : 4; // Standard configuration
};

/* Enhanced reporter configuration */
const getReporters = () => {
  const reporters: any[] = [];

  if (isCI) {
    reporters.push([
      'junit',
      {
        outputFile: path.join(
          process.env.TEST_METRICS_OUTPUT_DIR || './test-results',
          'playwright-junit.xml',
        ),
      },
    ]);
    reporters.push([
      'json',
      {
        outputFile: path.join(
          process.env.TEST_METRICS_OUTPUT_DIR || './test-results',
          'playwright-report.json',
        ),
      },
    ]);
  }

  reporters.push([
    'html',
    {
      outputFolder: path.join(
        process.env.TEST_METRICS_OUTPUT_DIR || './test-results',
        'playwright-report',
      ),
      open: !isCI ? 'on-failure' : 'never',
    },
  ]);

  if (process.env.VERBOSE_LOGGING === 'true') {
    reporters.push(['line']);
  }

  return reporters;
};

export default defineConfig({
  testDir: './tests',

  /* Enhanced parallel execution with Neon considerations */
  fullyParallel:
    process.env.PLAYWRIGHT_FULLY_PARALLEL !== 'false' && !isNeonEnabled,

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: isCI,

  /* Enhanced retry configuration */
  retries: Number.parseInt(process.env.PLAYWRIGHT_RETRIES || '0'),

  /* Dynamic worker configuration based on environment */
  workers: getWorkerCount(),

  /* Enhanced reporter configuration */
  reporter: getReporters(),

  /* Global setup with enhanced Neon integration */
  globalSetup:
    process.env.PLAYWRIGHT_USE_NEON_GLOBAL_SETUP === 'true'
      ? require.resolve('./tests/config/playwright-neon-setup.ts')
      : undefined,

  /* Enhanced global teardown */
  globalTeardown:
    process.env.PLAYWRIGHT_USE_NEON_GLOBAL_SETUP === 'true'
      ? require.resolve('./tests/config/playwright-neon-setup.ts')
      : undefined,

  /* Enhanced shared settings */
  use: {
    /* Base URL */
    baseURL,

    /* Enhanced trace collection */
    trace:
      process.env.PRESERVE_TEST_ARTIFACTS_ON_FAILURE === 'true'
        ? 'retain-on-failure'
        : 'off',

    /* Video recording for debugging */
    video:
      process.env.PRESERVE_TEST_ARTIFACTS_ON_FAILURE === 'true'
        ? 'retain-on-failure'
        : 'off',

    /* Screenshot configuration */
    screenshot: 'only-on-failure',

    /* Enhanced browser context */
    contextOptions: {
      // Ignore HTTPS errors for local development
      ignoreHTTPSErrors: true,
      // Enhanced viewport for consistent testing
      viewport: { width: 1280, height: 720 },
    },

    /* Enhanced action timeout */
    actionTimeout: 30000,

    /* Navigation timeout */
    navigationTimeout: 60000,
  },

  /* Enhanced timeout configuration */
  timeout: baseTimeout,
  expect: {
    timeout: expectTimeout,
    // Enhanced assertion timeout for Neon operations
    toHaveScreenshot: {
      threshold: 0.2,
    },
  },

  /* Enhanced output directory */
  outputDir: path.join(
    process.env.TEST_METRICS_OUTPUT_DIR || './test-results',
    'playwright-artifacts',
  ),

  /* Enhanced projects configuration */
  projects: [
    /* Setup project for authentication and state preparation */
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
      use: {
        ...devices['Desktop Chrome'],
      },
    },

    /* E2E tests project */
    {
      name: 'e2e',
      testMatch: /e2e\/.*.test.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        // Enhanced browser context for E2E tests
        contextOptions: {
          ignoreHTTPSErrors: true,
          // Enable request/response logging
          recordHar:
            process.env.ENABLE_REQUEST_LOGGING === 'true'
              ? {
                  path: path.join(
                    process.env.TEST_METRICS_OUTPUT_DIR || './test-results',
                    'network-logs.har',
                  ),
                  mode: 'minimal',
                }
              : undefined,
        },
      },
      /* Enhanced retry configuration for E2E */
      retries: isCI ? 1 : 0,
    },

    /* API routes testing project */
    {
      name: 'routes',
      testMatch: /routes\/.*.test.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        // API-focused configuration
        contextOptions: {
          ignoreHTTPSErrors: true,
          // Faster navigation for API tests
          viewport: { width: 1024, height: 768 },
        },
      },
      /* No retries for API tests */
      retries: 0,
    },

    /* Mobile testing (optional) */
    ...(process.env.ENABLE_MOBILE_TESTING === 'true'
      ? [
          {
            name: 'mobile-chrome',
            testMatch: /e2e\/.*.test.ts/,
            dependencies: ['setup'],
            use: {
              ...devices['Pixel 5'],
            },
            /* Reduced timeout for mobile */
            timeout: baseTimeout * 0.8,
          },
        ]
      : []),

    /* Cross-browser testing (optional) */
    ...(process.env.ENABLE_CROSS_BROWSER_TESTING === 'true'
      ? [
          {
            name: 'firefox',
            testMatch: /e2e\/.*.test.ts/,
            dependencies: ['setup'],
            use: {
              ...devices['Desktop Firefox'],
            },
          },
          {
            name: 'webkit',
            testMatch: /e2e\/.*.test.ts/,
            dependencies: ['setup'],
            use: {
              ...devices['Desktop Safari'],
            },
          },
        ]
      : []),
  ],

  /* Enhanced web server configuration */
  webServer: {
    command: 'bun dev',
    url: `${baseURL}/api/health`,
    timeout: 180 * 1000, // Extended timeout for Neon startup
    reuseExistingServer: !isCI,
    stdout: process.env.VERBOSE_LOGGING === 'true' ? 'pipe' : 'ignore',
    stderr: process.env.VERBOSE_LOGGING === 'true' ? 'pipe' : 'ignore',
    env: {
      // Pass through test environment variables
      ...process.env,
      NODE_ENV: 'test',
      // Ensure consistent port
      PORT: PORT.toString(),
    },
  },

  /* Enhanced metadata */
  metadata: {
    neonEnabled: isNeonEnabled,
    environment: process.env.NODE_ENV || 'test',
    ciProvider: process.env.CI ? 'ci' : 'local',
    testTimeout: baseTimeout,
    workers: getWorkerCount(),
  },
});
