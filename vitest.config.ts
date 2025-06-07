import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vitest/config';

export default defineConfig(({ mode }) => {
  // Load environment variables
  const env = loadEnv(mode, process.cwd(), '');

  // Configure timeouts based on environment
  const isNeonEnabled = env.USE_NEON_BRANCHING === 'true';
  const baseTimeout = isNeonEnabled ? 120000 : 60000;
  const hookTimeout = isNeonEnabled ? 120000 : 60000;
  const teardownTimeout = isNeonEnabled
    ? parseInt(env.VITEST_TEARDOWN_TIMEOUT || '60000')
    : 30000;

  // Configure thread pool based on environment
  const minThreads = parseInt(env.VITEST_POOL_THREADS_MIN || '1');
  const maxThreads = isNeonEnabled
    ? Math.min(parseInt(env.VITEST_POOL_THREADS_MAX || '2'), 4)
    : parseInt(env.VITEST_POOL_THREADS_MAX || '4');

  return {
    plugins: [react()],
    test: {
      environment: 'jsdom',
      include: [
        'tests/**/*.{test,spec}.{js,jsx,ts,tsx}',
        '!tests/e2e/**',
        '!tests/routes/**',
      ],
      exclude: [
        'node_modules/**',
        '.next/**',
        'lib/ai/models.mock.ts',
        'tests/e2e/**',
        'tests/routes/**',
      ],
      setupFiles: ['./tests/config/test-setup.ts'],
      globals: true,
      testTimeout: parseInt(env.VITEST_TIMEOUT) || baseTimeout,
      hookTimeout: parseInt(env.VITEST_HOOK_TIMEOUT) || hookTimeout,
      teardownTimeout: teardownTimeout,

      // Enhanced configuration for Neon branching
      sequence: {
        concurrent:
          env.VITEST_SEQUENCE_CONCURRENT !== 'false' && !isNeonEnabled,
      },
      isolate: env.VITEST_ISOLATE === 'true' || isNeonEnabled,

      // Test file patterns and metadata
      testNamePattern: env.VITEST_NAME_PATTERN,

      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html'],
        reportsDirectory: env.TEST_METRICS_OUTPUT_DIR || './coverage',
        exclude: [
          'node_modules/**',
          '.next/**',
          'tests/**',
          '**/*.d.ts',
          '**/*.config.{js,ts}',
          '**/generated/**',
          'lib/ai/models.mock.ts',
          'lib/testing/**', // Exclude testing utilities from coverage
        ],
        thresholds: {
          global: {
            branches: 80,
            functions: 80,
            lines: 80,
            statements: 80,
          },
        },
        // Enable source maps for better debugging
        skipFull: false,
        clean: true,
      },

      pool: 'threads',
      poolOptions: {
        threads: {
          minThreads,
          maxThreads,
          useAtomics: true,
          isolate: env.VITEST_ISOLATE === 'true' || isNeonEnabled,
        },
      },

      // Enhanced logging and debugging
      logHeapUsage: env.VERBOSE_LOGGING === 'true',
      outputFile: {
        json: path.join(
          env.TEST_METRICS_OUTPUT_DIR || './test-results',
          'vitest-report.json',
        ),
        junit: path.join(
          env.TEST_METRICS_OUTPUT_DIR || './test-results',
          'vitest-junit.xml',
        ),
      },

      // Reporter configuration
      reporter: env.CI
        ? ['verbose', 'json', 'junit']
        : ['verbose', env.VERBOSE_LOGGING === 'true' ? 'verbose' : 'basic'],

      // Enhanced environment setup
      env: {
        ...env,
        // Ensure test environment is properly set
        NODE_ENV: 'test',
        // Pass through Neon configuration
        USE_NEON_BRANCHING: env.USE_NEON_BRANCHING || 'false',
        NEON_PROJECT_ID: env.NEON_PROJECT_ID,
        NEON_API_KEY: env.NEON_API_KEY,
        // Enhanced logging
        TEST_LOG_LEVEL: env.TEST_LOG_LEVEL || 'info',
        ENABLE_TEST_METRICS: env.ENABLE_TEST_METRICS || 'true',
        ENABLE_BRANCH_METRICS: env.ENABLE_BRANCH_METRICS || 'true',
      },

      // Retry configuration
      retry: env.CI ? 1 : 0,

      // Watch configuration for development
      watch: false,
      watchExclude: [
        '**/node_modules/**',
        '**/.next/**',
        '**/coverage/**',
        '**/test-results/**',
      ],
    },

    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },

    // Define constants for tests
    define: {
      __TEST_ENV__: JSON.stringify(mode),
      __NEON_ENABLED__: JSON.stringify(isNeonEnabled),
      __TEST_TIMEOUT__: JSON.stringify(baseTimeout),
    },
  };
});
