#!/usr/bin/env bun

/**
 * Test Data Reset Script
 *
 * This script resets test databases by cleaning all data and optionally
 * re-initializing with fresh seed data.
 *
 * Usage:
 *   bun run scripts/test-data/reset-test-data.ts --env=unit
 *   bun run scripts/test-data/reset-test-data.ts --branch=test-branch-123 --reinitialize
 *   bun run scripts/test-data/reset-test-data.ts --all-branches
 */

import { parseArgs } from 'node:util';
import { getTestBranchManager } from '@/lib/testing/neon-test-branches';
import { UnitSeeder } from '@/tests/seeds/unit-seeder';
import { E2ESeeder } from '@/tests/seeds/e2e-seeder';
import { PerformanceSeeder } from '@/tests/seeds/performance-seeder';
import type { SeederConfig } from '@/tests/factories/types';

interface ResetOptions {
  environment?: 'unit' | 'integration' | 'e2e' | 'performance';
  branch?: string;
  databaseUrl?: string;
  reinitialize: boolean;
  size: 'minimal' | 'standard' | 'large';
  allBranches: boolean;
  force: boolean;
  verbose: boolean;
}

/**
 * Parse command line arguments
 */
function parseArguments(): ResetOptions {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      env: { type: 'string', short: 'e' },
      branch: { type: 'string', short: 'b' },
      database: { type: 'string', short: 'd' },
      reinitialize: { type: 'boolean', short: 'r', default: false },
      size: { type: 'string', short: 's', default: 'minimal' },
      'all-branches': { type: 'boolean', default: false },
      force: { type: 'boolean', short: 'f', default: false },
      verbose: { type: 'boolean', short: 'v', default: false },
      help: { type: 'boolean', short: 'h' },
    },
  });

  if (values.help) {
    printHelp();
    process.exit(0);
  }

  return {
    environment: values.env as any,
    branch: values.branch,
    databaseUrl: values.database,
    reinitialize: values.reinitialize ?? false,
    size: (values.size as any) || 'minimal',
    allBranches: values['all-branches'] ?? false,
    force: values.force ?? false,
    verbose: values.verbose ?? false,
  };
}

/**
 * Print help information
 */
function printHelp(): void {
  console.log(`
Test Data Reset Script

Usage:
  bun run scripts/test-data/reset-test-data.ts [options]

Options:
  -e, --env <env>          Environment: unit, integration, e2e, performance
  -b, --branch <branch>    Specific Neon branch ID to reset
  -d, --database <url>     Database URL to reset
  -r, --reinitialize      Re-initialize with fresh data after reset
  -s, --size <size>       Data size for reinitialization: minimal, standard, large
  --all-branches          Reset all test branches
  -f, --force             Force reset without confirmation
  -v, --verbose           Verbose output
  -h, --help              Show this help

Examples:
  # Reset unit test database
  bun run scripts/test-data/reset-test-data.ts --env=unit

  # Reset and reinitialize E2E database
  bun run scripts/test-data/reset-test-data.ts --env=e2e --reinitialize

  # Reset specific branch
  bun run scripts/test-data/reset-test-data.ts --branch=br-test-123

  # Reset all test branches (dangerous!)
  bun run scripts/test-data/reset-test-data.ts --all-branches --force

  # Reset custom database URL
  bun run scripts/test-data/reset-test-data.ts --database=postgresql://...
`);
}

/**
 * Confirm dangerous operations
 */
async function confirmOperation(
  message: string,
  force: boolean,
): Promise<boolean> {
  if (force) return true;

  console.log(`⚠️  ${message}`);
  console.log('This operation cannot be undone.');

  const response = prompt('Type "yes" to continue: ');
  return response?.toLowerCase() === 'yes';
}

/**
 * Reset single database
 */
async function resetDatabase(
  databaseUrl: string,
  options: ResetOptions,
  branchId?: string,
): Promise<void> {
  console.log(`🧹 Resetting database: ${databaseUrl.split('@')[1] || 'local'}`);

  // Create a temporary seeder for cleaning
  const config: SeederConfig = {
    environment: options.environment || 'unit',
    branchId,
    databaseUrl,
    clean: true,
    size: options.size,
  };

  const seeder = new UnitSeeder(config); // Use UnitSeeder for basic operations

  try {
    // Clean the database
    console.log('  🗑️  Cleaning all tables...');
    await seeder.cleanDatabase();
    console.log('  ✓ Database cleaned');

    // Reinitialize if requested
    if (options.reinitialize) {
      console.log('  🌱 Reinitializing with fresh data...');

      let reinitSeeder;
      switch (options.environment) {
        case 'e2e':
          reinitSeeder = new E2ESeeder(config);
          break;
        case 'performance':
          reinitSeeder = new PerformanceSeeder(config);
          break;
        default:
          reinitSeeder = new UnitSeeder(config);
      }

      const result = await reinitSeeder.seed();

      if (result.success) {
        const totalRows = Object.values(result.rowsCreated).reduce(
          (sum, count) => sum + count,
          0,
        );
        console.log(
          `  ✓ Reinitialized with ${totalRows.toLocaleString()} rows`,
        );
      } else {
        console.error('  ❌ Reinitialization failed');
        if (result.errors) {
          result.errors.forEach((error) => {
            console.error(`    ${error.message}`);
          });
        }
      }

      await reinitSeeder.close();
    }
  } finally {
    await seeder.close();
  }
}

/**
 * Reset all test branches
 */
async function resetAllBranches(options: ResetOptions): Promise<void> {
  if (!process.env.NEON_API_KEY || !process.env.NEON_PROJECT_ID) {
    throw new Error(
      'NEON_API_KEY and NEON_PROJECT_ID required for branch operations',
    );
  }

  const confirmed = await confirmOperation(
    'This will reset ALL test branches in your Neon project!',
    options.force,
  );

  if (!confirmed) {
    console.log('Operation cancelled.');
    return;
  }

  console.log('🔍 Finding test branches...');

  const branchManager = getTestBranchManager();
  const branches = await branchManager.listBranches();
  const testBranches = branches.filter(
    (branch) => branch.name.startsWith('test-') && !branch.primary,
  );

  if (testBranches.length === 0) {
    console.log('No test branches found.');
    return;
  }

  console.log(`Found ${testBranches.length} test branches to reset:`);
  testBranches.forEach((branch) => {
    console.log(`  - ${branch.name} (${branch.id})`);
  });

  for (const branch of testBranches) {
    try {
      console.log(`\n🌿 Resetting branch: ${branch.name}`);

      // We can't directly reset a branch, so we'll delete and recreate it
      console.log('  🗑️  Deleting branch...');
      await branchManager.deleteTestBranch(branch.id);

      console.log('  ✓ Branch deleted');

      // If reinitialize is requested, create a new branch with the same name pattern
      if (options.reinitialize) {
        console.log('  🌱 Creating fresh branch...');
        const newBranch = await branchManager.createTestBranch(
          branch.name.replace('test-', ''),
          { parentBranchId: branch.parent_id },
        );

        // Initialize the new branch
        await resetDatabase(
          newBranch.connectionString,
          options,
          newBranch.branchId,
        );
        console.log(`  ✓ Fresh branch created: ${newBranch.branchName}`);
      }
    } catch (error) {
      console.error(`  ❌ Failed to reset branch ${branch.name}:`, error);
    }
  }
}

/**
 * Reset specific branch
 */
async function resetBranch(
  branchId: string,
  options: ResetOptions,
): Promise<void> {
  if (!process.env.NEON_API_KEY || !process.env.NEON_PROJECT_ID) {
    throw new Error(
      'NEON_API_KEY and NEON_PROJECT_ID required for branch operations',
    );
  }

  const confirmed = await confirmOperation(
    `This will reset branch: ${branchId}`,
    options.force,
  );

  if (!confirmed) {
    console.log('Operation cancelled.');
    return;
  }

  console.log(`🌿 Resetting branch: ${branchId}`);

  const branchManager = getTestBranchManager();

  try {
    // Get branch info to get connection string
    const branches = await branchManager.listBranches();
    const branch = branches.find(
      (b) => b.id === branchId || b.name === branchId,
    );

    if (!branch) {
      throw new Error(`Branch not found: ${branchId}`);
    }

    // Build connection string (this is simplified - in practice you'd need the full connection details)
    const connectionString = branchManager.getConnectionString(branch.name);

    if (!connectionString) {
      throw new Error(
        `Could not get connection string for branch: ${branchId}`,
      );
    }

    await resetDatabase(connectionString, options, branch.id);
    console.log(`✓ Branch reset completed: ${branch.name}`);
  } catch (error) {
    console.error(`❌ Failed to reset branch:`, error);
    throw error;
  }
}

/**
 * Reset default database
 */
async function resetDefaultDatabase(options: ResetOptions): Promise<void> {
  const databaseUrl =
    options.databaseUrl ||
    process.env.TEST_DATABASE_URL ||
    process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      'No database URL specified. Use --database or set TEST_DATABASE_URL/DATABASE_URL',
    );
  }

  const confirmed = await confirmOperation(
    `This will reset database: ${databaseUrl.split('@')[1] || 'local'}`,
    options.force,
  );

  if (!confirmed) {
    console.log('Operation cancelled.');
    return;
  }

  await resetDatabase(databaseUrl, options);
}

/**
 * Main reset function
 */
async function main(): Promise<void> {
  const options = parseArguments();

  if (options.verbose) {
    console.log('🔄 Starting test data reset...');
    console.log('Options:', JSON.stringify(options, null, 2));
  }

  try {
    if (options.allBranches) {
      await resetAllBranches(options);
    } else if (options.branch) {
      await resetBranch(options.branch, options);
    } else {
      await resetDefaultDatabase(options);
    }

    console.log('\n✅ Reset completed successfully!');
  } catch (error) {
    console.error('❌ Reset failed:', error);

    if (options.verbose && error instanceof Error) {
      console.error('Stack trace:', error.stack);
    }

    process.exit(1);
  }
}

/**
 * Cleanup old test branches on exit
 */
async function cleanup(): Promise<void> {
  if (process.env.NEON_API_KEY && process.env.NEON_PROJECT_ID) {
    try {
      const branchManager = getTestBranchManager();
      await branchManager.cleanupOldTestBranches(24); // Cleanup branches older than 24 hours
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}

// Handle process signals
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, cleaning up...');
  await cleanup();
  process.exit(0);
});

process.on('exit', () => {
  // Sync cleanup on exit
});

// Run the script
if (import.meta.main) {
  main()
    .then(() => cleanup())
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}
