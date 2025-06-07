import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'path';
import {
  getTestBranchManager,
  type TestBranchInfo,
} from '@/lib/testing/neon-test-branches';
import {
  getNeonApiClient,
  type EnhancedNeonApiClient,
  type TestBranchInfo as EnhancedTestBranchInfo,
  type BranchCreationOptions,
} from '@/lib/testing/neon-api-client';
import { getNeonLogger } from '@/lib/testing/neon-logger';

// Load test environment variables
config({ path: resolve(process.cwd(), '.env.test') });

// Enhanced global test branch info
let currentTestBranch: EnhancedTestBranchInfo | null = null;
let testBranchManager: ReturnType<typeof getTestBranchManager> | null = null;
let enhancedNeonClient: EnhancedNeonApiClient | null = null;
const logger = getNeonLogger();

/**
 * Determines if Neon branching is enabled for tests
 */
export function isNeonBranchingEnabled(): boolean {
  return (
    process.env.USE_NEON_BRANCHING === 'true' &&
    !!process.env.NEON_API_KEY &&
    !!process.env.NEON_PROJECT_ID
  );
}

/**
 * Gets the current test database connection string
 */
export function getTestDatabaseUrl(): string {
  if (currentTestBranch) {
    return currentTestBranch.connectionString;
  }

  // Fallback to standard test database URL
  return (
    process.env.POSTGRES_URL || 'postgresql://test:test@localhost:5432/test'
  );
}

/**
 * Gets the current pooled connection string if available
 */
export function getPooledTestDatabaseUrl(): string | undefined {
  if (currentTestBranch) {
    return currentTestBranch.pooledConnectionString;
  }

  return process.env.POSTGRES_POOLED_URL;
}

/**
 * Enhanced setup for Neon test branching using the new API client
 */
export function setupNeonTestBranching(
  suiteName: string,
  options?: {
    useEnhancedClient?: boolean;
    branchOptions?: Partial<BranchCreationOptions>;
    enableMetrics?: boolean;
  },
) {
  const {
    useEnhancedClient = true,
    branchOptions = {},
    enableMetrics = process.env.ENABLE_BRANCH_METRICS === 'true',
  } = options || {};

  if (!isNeonBranchingEnabled()) {
    logger.info(
      'neon_setup',
      'Neon branching disabled, using standard test database',
    );
    console.log('Neon branching disabled, using standard test database');
    return;
  }

  beforeAll(
    async () => {
      const startTime = Date.now();

      try {
        logger.info(
          'neon_setup',
          `Creating Neon test branch for suite: ${suiteName}`,
          {
            useEnhancedClient,
            enableMetrics,
          },
        );

        if (useEnhancedClient) {
          // Use enhanced Neon API client
          enhancedNeonClient = getNeonApiClient();

          const createOptions: BranchCreationOptions = {
            testSuite: suiteName,
            purpose: 'vitest-suite',
            tags: [
              'vitest',
              'automated',
              ...(process.env.NEON_DEFAULT_BRANCH_TAGS?.split(',') || []),
            ],
            waitForReady: true,
            timeoutMs: parseInt(process.env.NEON_BRANCH_TIMEOUT || '120000'),
            ...branchOptions,
          };

          const result =
            await enhancedNeonClient.createTestBranch(createOptions);

          if (!result.success || !result.data) {
            throw new Error(`Failed to create test branch: ${result.error}`);
          }

          currentTestBranch = result.data;

          // Update process.env with the new connection string
          process.env.POSTGRES_URL = currentTestBranch.connectionString;

          logger.info(
            'neon_setup',
            'Enhanced test branch created successfully',
            {
              branchName: currentTestBranch.branchName,
              branchId: currentTestBranch.branchId,
              duration: Date.now() - startTime,
            },
          );
        } else {
          // Use legacy test branch manager
          testBranchManager = getTestBranchManager();

          const legacyBranch = await testBranchManager.createTestBranch(
            suiteName,
            {
              pooled: process.env.NEON_USE_POOLING === 'true',
            },
          );

          // Convert to enhanced format for compatibility
          currentTestBranch = {
            ...legacyBranch,
            projectId: process.env.NEON_PROJECT_ID || '',
            created_at: new Date().toISOString(),
            metadata: {
              testSuite: suiteName,
              purpose: 'vitest-suite',
              createdBy: process.env.USER || 'unknown',
              tags: ['vitest', 'legacy'],
            },
          };

          // Update process.env with the new connection string
          process.env.POSTGRES_URL = currentTestBranch.connectionString;
          if (legacyBranch.pooledConnectionString) {
            process.env.POSTGRES_POOLED_URL =
              legacyBranch.pooledConnectionString;
          }
        }

        console.log(`Test branch created: ${currentTestBranch.branchName}`);

        if (enableMetrics) {
          logger.info('neon_setup', 'Branch creation metrics', {
            suiteName,
            branchId: currentTestBranch.branchId,
            creationTime: Date.now() - startTime,
            memoryUsage: process.memoryUsage(),
          });
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.error('neon_setup', 'Failed to create test branch', {
          suiteName,
          error: errorMessage,
          duration: Date.now() - startTime,
        });
        console.error('Failed to create test branch:', error);
        throw error;
      }
    },
    parseInt(process.env.VITEST_HOOK_TIMEOUT || '120000'),
  );

  afterAll(
    async () => {
      if (!currentTestBranch) {
        return;
      }

      const startTime = Date.now();
      const branchName = currentTestBranch.branchName;

      try {
        logger.info('neon_setup', `Deleting test branch: ${branchName}`);

        if (useEnhancedClient && enhancedNeonClient) {
          const result = await enhancedNeonClient.deleteTestBranch(branchName);
          if (!result.success) {
            throw new Error(`Failed to delete test branch: ${result.error}`);
          }
        } else if (testBranchManager) {
          await testBranchManager.deleteTestBranch(branchName);
        }

        if (enableMetrics) {
          logger.info('neon_setup', 'Branch deletion metrics', {
            branchName,
            deletionTime: Date.now() - startTime,
            memoryUsage: process.memoryUsage(),
          });
        }

        currentTestBranch = null;
        console.log(`Test branch deleted: ${branchName}`);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.error('neon_setup', 'Failed to delete test branch', {
          branchName,
          error: errorMessage,
          duration: Date.now() - startTime,
        });
        console.error('Failed to delete test branch:', error);
      }
    },
    parseInt(process.env.VITEST_TEARDOWN_TIMEOUT || '60000'),
  );
}

/**
 * Sets up per-test isolation with savepoints (if needed)
 */
export function setupTestIsolation() {
  let savepointName: string | null = null;

  beforeEach(async () => {
    if (process.env.USE_TEST_SAVEPOINTS === 'true') {
      // Generate unique savepoint name
      savepointName = `test_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

      // This would need to be integrated with your database client
      // Example: await db.execute(`SAVEPOINT ${savepointName}`);
    }
  });

  afterEach(async () => {
    if (savepointName) {
      // Rollback to savepoint
      // Example: await db.execute(`ROLLBACK TO SAVEPOINT ${savepointName}`);
      savepointName = null;
    }
  });
}

/**
 * Playwright-specific setup for Neon test branching
 */
export async function setupNeonForPlaywright(testInfo: {
  title: string;
  project: { name: string };
}) {
  if (!isNeonBranchingEnabled()) {
    return {
      databaseUrl:
        process.env.POSTGRES_URL ||
        'postgresql://test:test@localhost:5432/test',
      cleanup: async () => {},
    };
  }

  const manager = getTestBranchManager();
  const suiteName = `playwright-${testInfo.project.name}-${testInfo.title.replace(/\s+/g, '-').toLowerCase()}`;

  const branch = await manager.createTestBranch(suiteName, {
    pooled: process.env.NEON_USE_POOLING === 'true',
  });

  return {
    databaseUrl: branch.connectionString,
    pooledUrl: branch.pooledConnectionString,
    cleanup: async () => {
      await manager.deleteTestBranch(branch.branchName);
    },
  };
}

/**
 * Utility to run database migrations on test branch
 */
export async function runMigrationsOnTestBranch() {
  if (!currentTestBranch) {
    console.log('No test branch active, skipping migration');
    return;
  }

  try {
    // Import and run your migration script
    // This assumes you have a migration runner that can accept a connection string
    const { migrate } = await import('@/lib/db/migrate');

    // You might need to modify your migrate function to accept a connection string
    // For now, it should use process.env.POSTGRES_URL which we've already updated
    await migrate();

    console.log('Migrations completed on test branch');
  } catch (error) {
    console.error('Failed to run migrations on test branch:', error);
    throw error;
  }
}

/**
 * Enhanced cleanup utility for removing old test branches
 */
export async function cleanupOldTestBranches(
  maxAgeHours: number = 24,
  options?: {
    useEnhancedClient?: boolean;
    preserveTaggedBranches?: boolean;
    dryRun?: boolean;
  },
) {
  if (!isNeonBranchingEnabled()) {
    return;
  }

  const {
    useEnhancedClient = true,
    preserveTaggedBranches = process.env.NEON_PRESERVE_TAGGED_BRANCHES ===
      'true',
    dryRun = false,
  } = options || {};

  const startTime = Date.now();

  try {
    logger.info('neon_cleanup', 'Starting cleanup of old test branches', {
      maxAgeHours,
      useEnhancedClient,
      preserveTaggedBranches,
      dryRun,
    });

    if (useEnhancedClient) {
      const client = getNeonApiClient();

      const preserveTags = process.env.NEON_PRESERVE_TAGS?.split(',') || [
        'preserve',
        'keep',
      ];

      const result = await client.cleanupTestBranches({
        maxAgeHours,
        namePattern: new RegExp(process.env.NEON_BRANCH_NAME_PREFIX || 'test-'),
        excludeTags: preserveTaggedBranches ? preserveTags : [],
        preservePrimary: true,
        dryRun,
      });

      if (result.success && result.data) {
        const { deleted, failed, skipped } = result.data;

        logger.info('neon_cleanup', 'Enhanced cleanup completed', {
          deleted: deleted.length,
          failed: failed.length,
          skipped: skipped.length,
          duration: Date.now() - startTime,
        });

        console.log(
          `Old test branches cleaned up: ${deleted.length} deleted, ${failed.length} failed, ${skipped.length} skipped`,
        );

        if (failed.length > 0) {
          logger.warn('neon_cleanup', 'Some branches failed to delete', {
            failed,
          });
        }
      } else {
        throw new Error(`Cleanup failed: ${result.error}`);
      }
    } else {
      // Use legacy cleanup
      const manager = getTestBranchManager();
      await manager.cleanupOldTestBranches(maxAgeHours);

      logger.info('neon_cleanup', 'Legacy cleanup completed', {
        maxAgeHours,
        duration: Date.now() - startTime,
      });

      console.log('Old test branches cleaned up');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('neon_cleanup', 'Failed to cleanup old test branches', {
      error: errorMessage,
      duration: Date.now() - startTime,
    });
    console.error('Failed to cleanup old test branches:', error);
    throw error;
  }
}

// Export for use in test files
export { currentTestBranch, testBranchManager };
