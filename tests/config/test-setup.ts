import '@testing-library/jest-dom';
import { vi, beforeAll, afterAll } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import {
  isNeonBranchingEnabled,
  getTestDatabaseUrl,
  cleanupOldTestBranches,
} from './neon-branch-setup';
import {
  getNeonApiClient,
  resetNeonApiClient,
} from '@/lib/testing/neon-api-client';
import { EnvironmentUtils } from '@/lib/testing/neon-mcp-interface';
import { getNeonLogger } from '@/lib/testing/neon-logger';

// Load test environment variables in priority order
config({ path: resolve(process.cwd(), '.env.test.local') });
config({ path: resolve(process.cwd(), '.env.test') });

// Set environment for testing
process.env.NODE_ENV = 'test';

// Initialize enhanced logging
const logger = getNeonLogger();
logger.info('test_setup', 'Initializing test environment', {
  neonEnabled: process.env.USE_NEON_BRANCHING === 'true',
  environment: process.env.NODE_ENV,
  testTimeout: process.env.VITEST_TIMEOUT,
});

// Validate environment setup
const envValidation = EnvironmentUtils.validateEnvironment();
if (!envValidation.valid && process.env.USE_NEON_BRANCHING === 'true') {
  console.warn(
    'Missing Neon environment variables:',
    envValidation.missing.join(', '),
  );
  console.warn('Neon branching may not work correctly');
}

// Enhanced Neon initialization
if (isNeonBranchingEnabled()) {
  console.log('Enhanced Neon branching enabled for tests');

  // Initialize the enhanced Neon API client
  try {
    const neonClient = getNeonApiClient({
      defaultProjectId: process.env.NEON_PROJECT_ID,
      defaultDatabase: process.env.NEON_DATABASE_NAME || 'neondb',
      defaultRole: process.env.NEON_ROLE_NAME || 'neondb_owner',
      rateLimitConfig: {
        maxRequestsPerMinute: Number.parseInt(
          process.env.NEON_API_RATE_LIMIT_PER_MINUTE || '60',
        ),
        burstLimit: Number.parseInt(process.env.NEON_API_BURST_LIMIT || '10'),
      },
      retryConfig: {
        maxRetries: Number.parseInt(process.env.NEON_API_MAX_RETRIES || '3'),
        baseDelayMs: Number.parseInt(process.env.NEON_API_BASE_DELAY_MS || '1000'),
        maxDelayMs: Number.parseInt(process.env.NEON_API_MAX_DELAY_MS || '10000'),
      },
      cleanupConfig: {
        maxBranchAgeHours: Number.parseInt(
          process.env.NEON_MAX_BRANCH_AGE_HOURS || '24',
        ),
        autoCleanupEnabled: process.env.NEON_AUTO_CLEANUP_ENABLED === 'true',
        preserveTaggedBranches:
          process.env.NEON_PRESERVE_TAGGED_BRANCHES === 'true',
      },
    });

    logger.info(
      'test_setup',
      'Enhanced Neon API client initialized successfully',
    );

    // Cleanup old test branches on startup (async, don't block tests)
    if (process.env.NEON_CLEANUP_ON_STARTUP === 'true') {
      cleanupOldTestBranches().catch((error) => {
        logger.error('test_setup', 'Failed to cleanup old test branches', {
          error: error.message,
        });
        console.warn('Failed to cleanup old test branches:', error);
      });
    }
  } catch (error) {
    logger.error(
      'test_setup',
      'Failed to initialize enhanced Neon API client',
      {
        error: error instanceof Error ? error.message : String(error),
      },
    );
    console.error('Failed to initialize enhanced Neon API client:', error);
  }
}

// Enhanced environment variable setup with validation
const setupEnvironmentVariables = () => {
  // Database configuration
  if (!process.env.POSTGRES_URL) {
    process.env.POSTGRES_URL = getTestDatabaseUrl();
  }

  // Authentication configuration
  if (!process.env.BETTER_AUTH_SECRET) {
    process.env.BETTER_AUTH_SECRET =
      process.env.BETTER_AUTH_SECRET ||
      `test-secret-${Math.random().toString(36)}`;
  }
  if (!process.env.BETTER_AUTH_URL) {
    process.env.BETTER_AUTH_URL = 'http://localhost:3000';
  }

  // Test behavior configuration
  process.env.TEST_ISOLATION_MODE = process.env.TEST_ISOLATION_MODE || 'branch';
  process.env.TEST_BRANCH_REUSE = process.env.TEST_BRANCH_REUSE || 'false';
  process.env.AUTO_CLEANUP_TEST_DATA =
    process.env.AUTO_CLEANUP_TEST_DATA || 'true';

  // Performance and monitoring
  process.env.ENABLE_TEST_METRICS = process.env.ENABLE_TEST_METRICS || 'true';
  process.env.ENABLE_BRANCH_METRICS =
    process.env.ENABLE_BRANCH_METRICS || 'true';

  // Logging configuration
  process.env.TEST_LOG_LEVEL = process.env.TEST_LOG_LEVEL || 'info';
  process.env.ENABLE_CONSOLE_CAPTURE =
    process.env.ENABLE_CONSOLE_CAPTURE || 'true';

  logger.info('test_setup', 'Environment variables configured', {
    databaseUrl: process.env.POSTGRES_URL ? '[CONFIGURED]' : '[MISSING]',
    authSecret: process.env.BETTER_AUTH_SECRET ? '[CONFIGURED]' : '[MISSING]',
    testIsolationMode: process.env.TEST_ISOLATION_MODE,
    metricsEnabled: process.env.ENABLE_TEST_METRICS,
  });
};

setupEnvironmentVariables();

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

// Mock next-auth
vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: null,
    status: 'unauthenticated',
  }),
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

// Mock @/lib/auth
vi.mock('@/lib/auth', () => ({
  getServerSession: vi.fn(),
}));

// Mock database
vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    query: vi.fn(),
  },
}));

// Mock AI SDK hooks for testing
vi.mock('ai/react', () => ({
  useChat: () => ({
    messages: [],
    input: '',
    handleInputChange: vi.fn(),
    handleSubmit: vi.fn(),
    append: vi.fn(),
    reload: vi.fn(),
    stop: vi.fn(),
    isLoading: false,
  }),
  useCompletion: () => ({
    completion: '',
    input: '',
    handleInputChange: vi.fn(),
    handleSubmit: vi.fn(),
    complete: vi.fn(),
    stop: vi.fn(),
    isLoading: false,
  }),
}));

// Enhanced global lifecycle hooks
let globalMetrics: any = {};

// Export utilities for both legacy and enhanced approaches
export {
  getNeonApiClient,
  resetNeonApiClient,
} from '@/lib/testing/neon-api-client';
export { TestDataFactory } from '../utils/enhanced-test-factories';
export { NeonTestUtils } from '../utils/neon-test-utils';

beforeAll(
  async () => {
    const startTime = Date.now();
    logger.info('test_setup', 'Starting global test setup');

    // Enhanced console handling with metrics capture
    const originalWarn = console.warn;
    const originalError = console.error;
    const capturedLogs: any[] = [];

    if (process.env.ENABLE_CONSOLE_CAPTURE === 'true') {
      console.warn = (...args: any[]) => {
        capturedLogs.push({
          level: 'warn',
          args,
          timestamp: new Date().toISOString(),
        });
        if (
          typeof args[0] === 'string' &&
          args[0].includes('React Hook useEffect has missing dependencies')
        ) {
          return;
        }
        originalWarn.call(console, ...args);
      };

      console.error = (...args: any[]) => {
        capturedLogs.push({
          level: 'error',
          args,
          timestamp: new Date().toISOString(),
        });
        originalError.call(console, ...args);
      };
    }

    // Initialize test metrics if enabled
    if (process.env.ENABLE_TEST_METRICS === 'true') {
      globalMetrics = {
        setupStartTime: startTime,
        capturedLogs,
        testSuiteMetrics: {
          totalSetupTime: 0,
          totalTeardownTime: 0,
          branchOperations: 0,
          failedOperations: 0,
        },
      };
    }

    // Enhanced Neon client validation
    if (isNeonBranchingEnabled()) {
      try {
        const neonClient = getNeonApiClient();
        const projectResult = await neonClient.getProject();

        if (projectResult.success) {
          logger.info('test_setup', 'Neon connection validated successfully', {
            projectId: projectResult.data?.id,
            setupDuration: Date.now() - startTime,
          });
        } else {
          logger.warn('test_setup', 'Neon connection validation failed', {
            error: projectResult.error,
          });
        }
      } catch (error) {
        logger.error('test_setup', 'Neon validation error', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const setupDuration = Date.now() - startTime;
    if (globalMetrics.testSuiteMetrics) {
      globalMetrics.testSuiteMetrics.totalSetupTime = setupDuration;
    }

    logger.info('test_setup', 'Global test setup completed', {
      duration: setupDuration,
      neonEnabled: isNeonBranchingEnabled(),
      metricsEnabled: process.env.ENABLE_TEST_METRICS === 'true',
    });
  },
  Number.parseInt(process.env.VITEST_HOOK_TIMEOUT || '120000'),
);

afterAll(
  async () => {
    const startTime = Date.now();
    logger.info('test_setup', 'Starting global test teardown');

    try {
      // Enhanced cleanup with metrics
      if (
        isNeonBranchingEnabled() &&
        process.env.FORCE_CLEANUP_ON_EXIT === 'true'
      ) {
        const neonClient = getNeonApiClient();

        // Get cleanup statistics
        const cleanupResult = await neonClient.cleanupTestBranches({
          maxAgeHours: 0, // Cleanup all test branches
          preservePrimary: true,
          dryRun: false,
        });

        if (cleanupResult.success) {
          logger.info('test_setup', 'Final cleanup completed', {
            deleted: cleanupResult.data?.deleted.length || 0,
            failed: cleanupResult.data?.failed.length || 0,
            skipped: cleanupResult.data?.skipped.length || 0,
          });
        }

        // Clean up active branches
        await neonClient.cleanupAllActiveBranches();
      }

      // Export test metrics if enabled
      if (
        process.env.ENABLE_TEST_METRICS === 'true' &&
        process.env.EXPORT_TEST_REPORTS === 'true'
      ) {
        const neonClient = getNeonApiClient();
        const monitoringData = neonClient.exportMonitoringData();

        const teardownDuration = Date.now() - startTime;
        if (globalMetrics.testSuiteMetrics) {
          globalMetrics.testSuiteMetrics.totalTeardownTime = teardownDuration;
        }

        const finalReport = {
          ...globalMetrics,
          ...monitoringData,
          teardownCompleted: new Date().toISOString(),
          totalSuiteDuration: Date.now() - globalMetrics.setupStartTime,
        };

        // Write metrics to file if output directory is configured
        const outputDir = process.env.TEST_METRICS_OUTPUT_DIR;
        if (outputDir) {
          try {
            const fs = await import('node:fs/promises');
            const path = await import('node:path');

            await fs.mkdir(outputDir, { recursive: true });
            await fs.writeFile(
              path.join(outputDir, 'test-metrics.json'),
              JSON.stringify(finalReport, null, 2),
            );

            logger.info('test_setup', 'Test metrics exported', {
              outputPath: path.join(outputDir, 'test-metrics.json'),
            });
          } catch (error) {
            logger.error('test_setup', 'Failed to export test metrics', {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }

      // Reset Neon client to clean state
      resetNeonApiClient();

      const teardownDuration = Date.now() - startTime;
      logger.info('test_setup', 'Global test teardown completed', {
        duration: teardownDuration,
      });
    } catch (error) {
      logger.error('test_setup', 'Error during global teardown', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
  Number.parseInt(process.env.VITEST_TEARDOWN_TIMEOUT || '60000'),
);

// Process exit handler for emergency cleanup
process.on('exit', () => {
  if (
    isNeonBranchingEnabled() &&
    process.env.FORCE_CLEANUP_ON_EXIT === 'true'
  ) {
    console.log('Process exiting, attempting emergency cleanup...');
    // Note: This is synchronous cleanup only
  }
});

// Unhandled rejection handler
process.on('unhandledRejection', (reason, promise) => {
  logger.error('test_setup', 'Unhandled rejection detected', {
    reason: reason instanceof Error ? reason.message : String(reason),
    promise: String(promise),
  });
});
