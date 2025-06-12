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
config({ path: resolve(process.cwd(), '.env.local') }); // Also load .env.local for database URL

// Set environment for testing
process.env.NODE_ENV = 'test';

// Ensure required environment variables are set for tests
if (!process.env.POSTGRES_URL) {
  console.warn('POSTGRES_URL not found in environment, setting fallback for tests');
  process.env.POSTGRES_URL = 'postgresql://test:test@localhost:5432/test_db';
}

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
        baseDelayMs: Number.parseInt(
          process.env.NEON_API_BASE_DELAY_MS || '1000',
        ),
        maxDelayMs: Number.parseInt(
          process.env.NEON_API_MAX_DELAY_MS || '10000',
        ),
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

  // Kinde Authentication configuration (primary auth system)
  if (!process.env.KINDE_CLIENT_ID) {
    process.env.KINDE_CLIENT_ID = 'test-kinde-client-id';
  }
  if (!process.env.KINDE_CLIENT_SECRET) {
    process.env.KINDE_CLIENT_SECRET = 'test-kinde-client-secret';
  }
  if (!process.env.KINDE_ISSUER_URL) {
    process.env.KINDE_ISSUER_URL = 'https://test.kinde.com';
  }
  if (!process.env.KINDE_SITE_URL) {
    process.env.KINDE_SITE_URL = 'http://localhost:3000';
  }
  if (!process.env.KINDE_POST_LOGOUT_REDIRECT_URL) {
    process.env.KINDE_POST_LOGOUT_REDIRECT_URL = 'http://localhost:3000';
  }
  if (!process.env.KINDE_POST_LOGIN_REDIRECT_URL) {
    process.env.KINDE_POST_LOGIN_REDIRECT_URL = 'http://localhost:3000';
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
    kindeClientId: process.env.KINDE_CLIENT_ID ? '[CONFIGURED]' : '[MISSING]',
    testIsolationMode: process.env.TEST_ISOLATION_MODE,
    metricsEnabled: process.env.ENABLE_TEST_METRICS,
  });
};

setupEnvironmentVariables();

// IMPORTANT: Set up mocks BEFORE any imports to avoid server-only issues

// Mock server-only modules FIRST
vi.mock('server-only', () => ({}));

// Mock database configuration to avoid server-only imports
vi.mock('@/lib/db/config', () => {
  // Provide a mock that doesn't throw database connection errors
  return {
    db: {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue({ insertId: 'test-id' }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue({ affectedRows: 1 }),
        }),
      }),
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({ affectedRows: 1 }),
      }),
    },
    validateDatabaseConfig: vi.fn().mockReturnValue(true),
    getDatabaseConfig: vi.fn().mockReturnValue({
      connection: { max: 2, idle_timeout: 5 },
      query: { queryTimeout: 10000 },
      monitoring: { enableLogging: false },
    }),
    // Mock the database connection creation
    createDatabaseInstance: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
  };
});

// Mock database index
vi.mock('@/lib/db', () => {
  const { createMockDatabase } = require('../utils/test-database');
  return {
    db: createMockDatabase(),
  };
});

// Mock the queries module to avoid server-only imports
vi.mock('@/lib/db/queries', () => ({
  getChatsByUserId: vi.fn().mockResolvedValue([]),
  getDocumentsByUserId: vi.fn().mockResolvedValue([]),
  getUserById: vi.fn().mockResolvedValue(null),
  createUser: vi.fn().mockResolvedValue({ id: 'test-user-id' }),
  createDocument: vi.fn().mockResolvedValue({ id: 'test-doc-id' }),
}));

// Mock other server-only modules
vi.mock('@/lib/monitoring/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@/lib/monitoring/metrics', () => ({
  trackRequest: vi.fn(),
  trackError: vi.fn(),
  incrementCounter: vi.fn(),
}));

vi.mock('@/lib/middleware/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/lib/middleware/response-cache', () => ({
  getCachedResponse: vi.fn().mockResolvedValue(null),
  setCachedResponse: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/middleware/compression', () => ({
  enableCompression: vi.fn(),
}));

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

// Mock Kinde auth
vi.mock('@kinde-oss/kinde-auth-nextjs/server', async () => {
  const {
    mockGetUser,
    mockIsAuthenticated,
    mockGetPermission,
    mockGetPermissions,
    mockGetOrganization,
    mockGetToken,
    mockGetUserOrganizations,
  } = await import('../mocks/kinde-auth');
  
  return {
    getKindeServerSession: vi.fn(() => ({
      getUser: mockGetUser,
      isAuthenticated: mockIsAuthenticated,
      getPermission: mockGetPermission,
      getPermissions: mockGetPermissions,
      getOrganization: mockGetOrganization,
      getToken: mockGetToken,
      getUserOrganizations: mockGetUserOrganizations,
    })),
  };
});

// Mock @/lib/auth - let it use the real implementation
vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual('@/lib/auth');
  return {
    ...actual,
    getServerSession: vi.fn(),
  };
});

// Mock AI and vector search modules
vi.mock('ai', () => ({
  streamText: vi.fn().mockResolvedValue({
    textStream: new ReadableStream(),
    finishReason: 'stop',
  }),
  createDataStream: vi.fn().mockReturnValue(new ReadableStream()),
}));

vi.mock('@/lib/search/vector-search', () => ({
  searchSimilarDocuments: vi.fn().mockResolvedValue([]),
  createEmbedding: vi.fn().mockResolvedValue([]),
}));

// Mock form data utilities
vi.mock('@/tests/fixtures/test-data', () => ({
  createMockFormDataRequest: vi.fn().mockImplementation((url, formData) => {
    return new Request(url, {
      method: 'POST',
      body: formData,
    });
  }),
  createTestFormData: vi.fn().mockImplementation(() => {
    const formData = new FormData();
    formData.append('file', new Blob(['test content'], { type: 'application/pdf' }));
    return formData;
  }),
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
