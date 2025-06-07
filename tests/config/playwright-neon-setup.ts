import { chromium, type FullConfig } from '@playwright/test';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import {
  isNeonBranchingEnabled,
  cleanupOldTestBranches,
} from './neon-branch-setup';
import { getNeonApiClient } from '@/lib/testing/neon-api-client';
import { getNeonLogger } from '@/lib/testing/neon-logger';

// Load test environment variables
config({ path: resolve(process.cwd(), '.env.test') });

const logger = getNeonLogger();

async function globalSetup(config: FullConfig) {
  const startTime = Date.now();
  logger.info('playwright_setup', 'Starting Playwright global setup', {
    workers: config.workers,
    projects: config.projects?.map((p) => p.name),
    neonEnabled: isNeonBranchingEnabled(),
  });

  console.log('Running enhanced Playwright global setup...');

  try {
    // Enhanced Neon cleanup with metrics
    if (isNeonBranchingEnabled()) {
      console.log('Cleaning up old Neon test branches...');

      try {
        const cleanupAge = Number.parseInt(
          process.env.PLAYWRIGHT_CLEANUP_AGE_HOURS || '12',
        );
        await cleanupOldTestBranches(cleanupAge, {
          useEnhancedClient: true,
          preserveTaggedBranches: true,
          dryRun: false,
        });

        // Get statistics after cleanup
        const neonClient = getNeonApiClient();
        const statsResult = await neonClient.getBranchStatistics();

        if (statsResult.success && statsResult.data) {
          logger.info(
            'playwright_setup',
            'Post-cleanup branch statistics',
            statsResult.data,
          );
          console.log(
            `Branch stats after cleanup: ${statsResult.data.test_branches} test branches, ${statsResult.data.total_branches} total`,
          );
        }

        console.log('Old test branches cleaned up successfully');
      } catch (error) {
        logger.error(
          'playwright_setup',
          'Failed to cleanup old test branches',
          {
            error: error instanceof Error ? error.message : String(error),
          },
        );
        console.warn('Failed to cleanup old test branches:', error);
      }
    }

    // Enhanced browser pre-warming with error handling
    if (process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD !== '1') {
      try {
        logger.info('playwright_setup', 'Pre-warming browser');
        const browser = await chromium.launch({
          headless: true,
          timeout: 30000,
        });
        await browser.close();
        logger.info('playwright_setup', 'Browser pre-warming completed');
      } catch (error) {
        logger.warn('playwright_setup', 'Browser pre-warming failed', {
          error: error instanceof Error ? error.message : String(error),
        });
        console.warn('Browser pre-warming failed:', error);
      }
    }

    // Validate test environment
    const envValidation = {
      hasNeonConfig:
        !!process.env.NEON_API_KEY && !!process.env.NEON_PROJECT_ID,
      hasAuthConfig: !!process.env.BETTER_AUTH_SECRET,
      hasBaseUrl: !!process.env.PLAYWRIGHT_BASE_URL || !!process.env.PORT,
    };

    logger.info('playwright_setup', 'Environment validation', envValidation);

    const setupDuration = Date.now() - startTime;
    logger.info('playwright_setup', 'Playwright global setup completed', {
      duration: setupDuration,
      memoryUsage: process.memoryUsage(),
    });

    console.log(`Playwright global setup completed in ${setupDuration}ms`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('playwright_setup', 'Global setup failed', {
      error: errorMessage,
      duration: Date.now() - startTime,
    });
    console.error('Playwright global setup failed:', error);
    throw error;
  }
}

async function globalTeardown() {
  const startTime = Date.now();
  logger.info('playwright_teardown', 'Starting Playwright global teardown');

  console.log('Running enhanced Playwright global teardown...');

  try {
    // Enhanced cleanup with statistics
    if (isNeonBranchingEnabled()) {
      console.log('Final cleanup of any remaining test branches...');

      try {
        const neonClient = getNeonApiClient();

        // Get pre-cleanup statistics
        const preStatsResult = await neonClient.getBranchStatistics();
        if (preStatsResult.success && preStatsResult.data) {
          logger.info(
            'playwright_teardown',
            'Pre-cleanup branch statistics',
            preStatsResult.data,
          );
        }

        // Perform aggressive cleanup
        const forceCleanup = process.env.FORCE_CLEANUP_ON_EXIT === 'true';
        await cleanupOldTestBranches(forceCleanup ? 0 : 1, {
          useEnhancedClient: true,
          preserveTaggedBranches: !forceCleanup,
          dryRun: false,
        });

        // Clean up any remaining active branches
        await neonClient.cleanupAllActiveBranches();

        // Get post-cleanup statistics
        const postStatsResult = await neonClient.getBranchStatistics();
        if (postStatsResult.success && postStatsResult.data) {
          logger.info(
            'playwright_teardown',
            'Post-cleanup branch statistics',
            postStatsResult.data,
          );
        }

        // Export monitoring data if enabled
        if (process.env.EXPORT_TEST_REPORTS === 'true') {
          const monitoringData = neonClient.exportMonitoringData();

          const outputDir =
            process.env.TEST_METRICS_OUTPUT_DIR || './test-results';
          try {
            const fs = await import('node:fs/promises');
            const path = await import('node:path');

            await fs.mkdir(outputDir, { recursive: true });
            await fs.writeFile(
              path.join(outputDir, 'playwright-neon-metrics.json'),
              JSON.stringify(monitoringData, null, 2),
            );

            logger.info('playwright_teardown', 'Neon metrics exported', {
              outputPath: path.join(outputDir, 'playwright-neon-metrics.json'),
            });
          } catch (error) {
            logger.error(
              'playwright_teardown',
              'Failed to export Neon metrics',
              {
                error: error instanceof Error ? error.message : String(error),
              },
            );
          }
        }

        console.log('Final cleanup completed successfully');
      } catch (error) {
        logger.error(
          'playwright_teardown',
          'Failed final cleanup of test branches',
          {
            error: error instanceof Error ? error.message : String(error),
          },
        );
        console.warn('Failed final cleanup of test branches:', error);
      }
    }

    const teardownDuration = Date.now() - startTime;
    logger.info('playwright_teardown', 'Playwright global teardown completed', {
      duration: teardownDuration,
      memoryUsage: process.memoryUsage(),
    });

    console.log(
      `Playwright global teardown completed in ${teardownDuration}ms`,
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('playwright_teardown', 'Global teardown failed', {
      error: errorMessage,
      duration: Date.now() - startTime,
    });
    console.error('Playwright global teardown failed:', error);
  }
}

export default globalSetup;
export { globalTeardown };
