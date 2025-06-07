import { defineConfig, loadEnv } from 'vitest/config';
import path from 'node:path';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load environment variables
  const env = loadEnv(mode, process.cwd(), '');
  
  // Configure for minimal test suite with enhanced Neon support
  const isNeonEnabled = env.USE_NEON_BRANCHING === 'true';
  const baseTimeout = isNeonEnabled ? 180000 : 120000; // Even longer for integration tests
  const hookTimeout = isNeonEnabled ? 180000 : 120000;
  const teardownTimeout = isNeonEnabled ? 90000 : 60000;
  
  // Very conservative thread limits for integration tests
  const maxThreads = isNeonEnabled ? 1 : 2; // Sequential for Neon to avoid conflicts

  return {
    plugins: [react()],
    test: {
      environment: 'jsdom',
      include: [
        'tests/integration/**/*.{test,spec}.{js,jsx,ts,tsx}',
        'tests/lib/ade-*.{test,spec}.{js,jsx,ts,tsx}',
        'tests/lib/neon-*.{test,spec}.{js,jsx,ts,tsx}',
      ],
      exclude: [
        'node_modules/**',
        '.next/**',
        'tests/e2e/**',
        'tests/components/**',
        'tests/api/**',
      ],
      setupFiles: ['./tests/config/test-setup.ts'],
      globals: true,
      testTimeout: parseInt(env.VITEST_TIMEOUT) || baseTimeout,
      hookTimeout: parseInt(env.VITEST_HOOK_TIMEOUT) || hookTimeout,
      teardownTimeout: teardownTimeout,
      
      // Conservative configuration for integration tests
      pool: 'threads',
      poolOptions: {
        threads: {
          minThreads: 1,
          maxThreads: maxThreads,
          useAtomics: true,
          isolate: true, // Always isolate for integration tests
        },
      },
      
      // Always run sequentially for integration tests to avoid conflicts
      sequence: {
        concurrent: false,
        shuffle: false,
        setupTimeout: hookTimeout,
      },
      
      // Force isolation for clean database state
      isolate: true,
      
      // Enhanced reporting for integration tests
      reporter: env.CI 
        ? ['verbose', 'json']
        : ['verbose'],
      
      outputFile: {
        json: path.join(env.TEST_METRICS_OUTPUT_DIR || './test-results', 'vitest-minimal-report.json'),
      },
      
      // Enhanced environment setup for integration tests
      env: {
        ...env,
        NODE_ENV: 'test',
        // Force Neon configuration for integration tests
        USE_NEON_BRANCHING: env.USE_NEON_BRANCHING || 'false',
        NEON_PROJECT_ID: env.NEON_PROJECT_ID,
        NEON_API_KEY: env.NEON_API_KEY,
        // Integration test specific settings
        TEST_ISOLATION_MODE: 'branch',
        TEST_BRANCH_REUSE: 'false',
        // Enhanced logging for debugging
        TEST_LOG_LEVEL: env.TEST_LOG_LEVEL || 'debug',
        VERBOSE_LOGGING: env.VERBOSE_LOGGING || 'true',
        ENABLE_TEST_METRICS: 'true',
        ENABLE_BRANCH_METRICS: 'true',
        ENABLE_REQUEST_LOGGING: env.ENABLE_REQUEST_LOGGING || 'true',
      },
      
      // No retries for integration tests to avoid cascading failures
      retry: 0,
      
      // Enhanced logging
      logHeapUsage: true,
      
      // Coverage configuration for integration tests
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json'],
        reportsDirectory: path.join(env.TEST_METRICS_OUTPUT_DIR || './test-results', 'coverage-minimal'),
        exclude: [
          'node_modules/**',
          '.next/**',
          'tests/**',
          '**/*.d.ts',
          '**/*.config.{js,ts}',
          '**/generated/**',
          'lib/ai/models.mock.ts',
        ],
        thresholds: {
          global: {
            branches: 70, // Slightly lower for integration tests
            functions: 70,
            lines: 70,
            statements: 70,
          },
        },
        // Include specific areas for integration coverage
        include: [
          'lib/testing/**',
          'lib/ade/**',
          'lib/db/**',
          'lib/document-processing/**',
        ],
      },
    },
    
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    
    // Define constants for integration tests
    define: {
      __TEST_ENV__: JSON.stringify('integration'),
      __NEON_ENABLED__: JSON.stringify(isNeonEnabled),
      __TEST_TIMEOUT__: JSON.stringify(baseTimeout),
      __INTEGRATION_MODE__: JSON.stringify(true),
    },
  };
});