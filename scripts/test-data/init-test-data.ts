#!/usr/bin/env bun

/**
 * Test Data Initialization Script
 * 
 * This script initializes test databases with seed data for different environments.
 * It supports both traditional PostgreSQL and Neon branching infrastructure.
 * 
 * Usage:
 *   bun run scripts/test-data/init-test-data.ts --env=unit
 *   bun run scripts/test-data/init-test-data.ts --env=e2e --branch=test-branch-123
 *   bun run scripts/test-data/init-test-data.ts --env=performance --size=large
 */

import { parseArgs } from 'util';
import { getTestBranchManager } from '@/lib/testing/neon-test-branches';
import { UnitSeeder } from '@/tests/seeds/unit-seeder';
import { E2ESeeder, BrowserTestSeeder } from '@/tests/seeds/e2e-seeder';
import { PerformanceSeeder, LoadTestSeeder, StressTestSeeder } from '@/tests/seeds/performance-seeder';
import type { SeederConfig, SeederResult } from '@/tests/factories/types';

interface InitOptions {
  environment: 'unit' | 'integration' | 'e2e' | 'performance';
  size: 'minimal' | 'standard' | 'large';
  branch?: string;
  databaseUrl?: string;
  clean: boolean;
  scenarios: string[];
  useNeonBranching: boolean;
  seedType?: 'standard' | 'browser' | 'load' | 'stress';
  verbose: boolean;
}

/**
 * Parse command line arguments
 */
function parseArguments(): InitOptions {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      env: { type: 'string', short: 'e', default: 'unit' },
      size: { type: 'string', short: 's', default: 'standard' },
      branch: { type: 'string', short: 'b' },
      database: { type: 'string', short: 'd' },
      clean: { type: 'boolean', short: 'c', default: true },
      scenarios: { type: 'string', multiple: true },
      'neon-branching': { type: 'boolean', default: false },
      'seed-type': { type: 'string', default: 'standard' },
      verbose: { type: 'boolean', short: 'v', default: false },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
  });

  if (values.help) {
    printHelp();
    process.exit(0);
  }

  return {
    environment: values.env as any || 'unit',
    size: values.size as any || 'standard',
    branch: values.branch,
    databaseUrl: values.database,
    clean: values.clean ?? true,
    scenarios: values.scenarios || [],
    useNeonBranching: values['neon-branching'] ?? false,
    seedType: values['seed-type'] as any || 'standard',
    verbose: values.verbose ?? false,
  };
}

/**
 * Print help information
 */
function printHelp(): void {
  console.log(`
Test Data Initialization Script

Usage:
  bun run scripts/test-data/init-test-data.ts [options]

Options:
  -e, --env <env>           Environment: unit, integration, e2e, performance (default: unit)
  -s, --size <size>         Data size: minimal, standard, large (default: standard)
  -b, --branch <branch>     Neon branch ID (if using branching)
  -d, --database <url>      Database URL (overrides branching)
  -c, --clean              Clean database before seeding (default: true)
  --scenarios <scenarios>   Specific scenarios to run (comma-separated)
  --neon-branching         Use Neon database branching
  --seed-type <type>       Seeder type: standard, browser, load, stress (default: standard)
  -v, --verbose            Verbose output
  -h, --help               Show this help

Examples:
  # Initialize unit test data
  bun run scripts/test-data/init-test-data.ts --env=unit

  # Initialize E2E data with browser-specific seeding
  bun run scripts/test-data/init-test-data.ts --env=e2e --seed-type=browser

  # Initialize performance test data with large dataset
  bun run scripts/test-data/init-test-data.ts --env=performance --size=large

  # Use Neon branching for isolated test environment
  bun run scripts/test-data/init-test-data.ts --env=unit --neon-branching

Environment Variables:
  DATABASE_URL              Default database URL
  TEST_DATABASE_URL         Test database URL
  NEON_API_KEY             Neon API key (for branching)
  NEON_PROJECT_ID          Neon project ID (for branching)
`);
}

/**
 * Create seeder based on options
 */
function createSeeder(options: InitOptions, config: SeederConfig) {
  switch (options.environment) {
    case 'unit':
      return new UnitSeeder(config);
    
    case 'e2e':
      return options.seedType === 'browser' 
        ? new BrowserTestSeeder(config)
        : new E2ESeeder(config);
    
    case 'performance':
      switch (options.seedType) {
        case 'load':
          return new LoadTestSeeder(config);
        case 'stress':
          return new StressTestSeeder(config);
        default:
          return new PerformanceSeeder(config);
      }
    
    default:
      throw new Error(`Unsupported environment: ${options.environment}`);
  }
}

/**
 * Setup Neon branch if requested
 */
async function setupNeonBranch(options: InitOptions): Promise<string | undefined> {
  if (!options.useNeonBranching) {
    return undefined;
  }

  if (!process.env.NEON_API_KEY || !process.env.NEON_PROJECT_ID) {
    throw new Error('NEON_API_KEY and NEON_PROJECT_ID environment variables required for branching');
  }

  console.log('🌿 Setting up Neon branch...');
  
  const branchManager = getTestBranchManager();
  const testName = `init-${options.environment}-${Date.now()}`;
  
  const branchInfo = await branchManager.createTestBranch(testName, {
    parentBranchId: options.branch,
  });

  console.log(`✓ Created branch: ${branchInfo.branchName} (${branchInfo.branchId})`);
  console.log(`  Connection: ${branchInfo.host}/${branchInfo.database}`);
  
  return branchInfo.connectionString;
}

/**
 * Print initialization summary
 */
function printSummary(options: InitOptions, result: SeederResult): void {
  console.log('\n📊 Initialization Summary:');
  console.log('=========================');
  console.log(`Environment: ${options.environment}`);
  console.log(`Size: ${options.size}`);
  console.log(`Seed Type: ${options.seedType}`);
  console.log(`Success: ${result.success ? '✅' : '❌'}`);
  console.log(`Execution Time: ${result.executionTime}ms`);
  console.log(`Memory Usage: ${Math.round(result.memoryUsage / 1024 / 1024)}MB`);
  
  if (result.branchId) {
    console.log(`Branch ID: ${result.branchId}`);
  }

  console.log('\nRows Created:');
  Object.entries(result.rowsCreated).forEach(([table, count]) => {
    console.log(`  ${table}: ${count.toLocaleString()}`);
  });

  const totalRows = Object.values(result.rowsCreated).reduce((sum, count) => sum + count, 0);
  console.log(`  Total: ${totalRows.toLocaleString()}`);

  if (result.errors && result.errors.length > 0) {
    console.log('\n⚠️  Errors:');
    result.errors.forEach((error, index) => {
      console.log(`  ${index + 1}. ${error.message}`);
    });
  }

  console.log(`\n✅ Initialization completed successfully!`);
}

/**
 * Main initialization function
 */
async function main(): Promise<void> {
  const options = parseArguments();
  
  if (options.verbose) {
    console.log('🚀 Starting test data initialization...');
    console.log('Options:', JSON.stringify(options, null, 2));
  }

  try {
    // Setup database connection
    let databaseUrl: string | undefined;
    
    if (options.useNeonBranching) {
      databaseUrl = await setupNeonBranch(options);
    } else {
      databaseUrl = options.databaseUrl || 
        process.env.TEST_DATABASE_URL || 
        process.env.DATABASE_URL;
    }

    // Create seeder configuration
    const config: SeederConfig = {
      environment: options.environment,
      branchId: options.branch,
      databaseUrl,
      clean: options.clean,
      size: options.size,
      scenarios: options.scenarios,
    };

    // Create and run seeder
    console.log(`🌱 Initializing ${options.environment} environment with ${options.size} dataset...`);
    
    const seeder = createSeeder(options, config);
    const result = await seeder.seed();
    
    // Print results
    printSummary(options, result);

    // Cleanup
    await seeder.close();

    process.exit(result.success ? 0 : 1);

  } catch (error) {
    console.error('❌ Initialization failed:', error);
    
    if (options.verbose && error instanceof Error) {
      console.error('Stack trace:', error.stack);
    }
    
    process.exit(1);
  }
}

/**
 * Handle process signals for cleanup
 */
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, cleaning up...');
  
  // Cleanup any test branches if using Neon branching
  if (process.env.NEON_API_KEY) {
    try {
      const branchManager = getTestBranchManager();
      await branchManager.cleanupOldTestBranches(0); // Cleanup all test branches
      console.log('✓ Cleaned up test branches');
    } catch (error) {
      console.warn('⚠️  Branch cleanup warning:', error);
    }
  }
  
  process.exit(0);
});

// Run the script
if (import.meta.main) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}