#!/usr/bin/env bun
/**
 * Enhanced Batch Test Branch Creation Script
 * Usage: bun run scripts/create-test-branches.ts [options]
 * 
 * Creates multiple test branches for different test environments with parallel execution support
 */

import { EnhancedNeonApiClient, type BranchCreationOptions } from '../lib/testing/neon-api-client';
import { config } from 'dotenv';
import { resolve } from 'path';
import { writeFile } from 'fs/promises';

// Load environment variables
config({ path: resolve(process.cwd(), '.env.test') });
config({ path: resolve(process.cwd(), '.env.local') });

interface BatchCreateConfig {
  environments: Array<'unit' | 'integration' | 'e2e'>;
  branchesPerEnv: number;
  testSuitePrefix: string;
  parallel: boolean;
  maxConcurrency: number;
  waitForReady: boolean;
  timeoutMs: number;
  outputFile?: string;
  dryRun: boolean;
  verbose: boolean;
}

interface CreatedBranch {
  environment: string;
  branchId: string;
  branchName: string;
  connectionString: string;
  host: string;
  database: string;
  role: string;
  created_at: string;
  metadata: {
    testSuite: string;
    purpose: string;
    createdBy: string;
    tags: string[];
  };
}

interface BatchResult {
  success: boolean;
  totalRequested: number;
  totalCreated: number;
  totalFailed: number;
  branches: CreatedBranch[];
  errors: Array<{ environment: string; error: string; index: number }>;
  duration: number;
  config: BatchCreateConfig;
}

function parseArgs(): Partial<BatchCreateConfig> & { help?: boolean } {
  const args = process.argv.slice(2);
  const result: Partial<BatchCreateConfig> & { help?: boolean } = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg === '--dry-run') {
      result.dryRun = true;
    } else if (arg === '--parallel') {
      result.parallel = true;
    } else if (arg === '--no-wait') {
      result.waitForReady = false;
    } else if (arg === '--verbose' || arg === '-v') {
      result.verbose = true;
    } else if (arg.startsWith('--envs=')) {
      const envs = arg.split('=')[1].split(',') as Array<'unit' | 'integration' | 'e2e'>;
      result.environments = envs.filter(env => ['unit', 'integration', 'e2e'].includes(env));
    } else if (arg.startsWith('--count=')) {
      result.branchesPerEnv = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--prefix=')) {
      result.testSuitePrefix = arg.split('=')[1];
    } else if (arg.startsWith('--concurrency=')) {
      result.maxConcurrency = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--timeout=')) {
      result.timeoutMs = parseInt(arg.split('=')[1], 10) * 1000; // Convert seconds to ms
    } else if (arg.startsWith('--output=')) {
      result.outputFile = arg.split('=')[1];
    }
  }

  return result;
}

function getDefaultConfig(): BatchCreateConfig {
  return {
    environments: ['unit', 'integration', 'e2e'],
    branchesPerEnv: 2,
    testSuitePrefix: 'batch',
    parallel: true,
    maxConcurrency: 5,
    waitForReady: true,
    timeoutMs: 120000,
    dryRun: false,
    verbose: false
  };
}

function printHelp() {
  console.log(`
Enhanced Batch Test Branch Creation

Usage: bun run scripts/create-test-branches.ts [options]

Options:
  --envs=LIST           Comma-separated list of environments: unit,integration,e2e
                        (default: unit,integration,e2e)
  --count=N            Number of branches per environment (default: 2)
  --prefix=NAME        Test suite prefix for branch names (default: batch)
  --parallel           Enable parallel branch creation (default: true)
  --concurrency=N      Max concurrent operations (default: 5)
  --timeout=SECONDS    Timeout per branch creation in seconds (default: 120)
  --no-wait           Don't wait for branches to become ready
  --output=FILE       Save results to JSON file
  --dry-run           Show what would be created without creating
  --verbose, -v       Enable verbose logging
  --help, -h          Show this help message

Examples:
  # Create 2 branches each for all environments
  bun run scripts/create-test-branches.ts

  # Create 5 unit test branches only
  bun run scripts/create-test-branches.ts --envs=unit --count=5

  # Create branches for CI with custom prefix
  bun run scripts/create-test-branches.ts --prefix=ci-run --concurrency=10

  # Dry run to see what would be created
  bun run scripts/create-test-branches.ts --dry-run --verbose

  # Create branches and save results
  bun run scripts/create-test-branches.ts --output=branches.json

Environment Variables Required:
  NEON_PROJECT_ID     Neon project ID
  
  OR use MCP-based authentication (preferred)
`);
}

/**
 * Semaphore for controlling concurrency
 */
class Semaphore {
  private permits: number;
  private waitQueue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    return new Promise((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  release(): void {
    this.permits++;
    if (this.waitQueue.length > 0) {
      const resolve = this.waitQueue.shift()!;
      this.permits--;
      resolve();
    }
  }
}

async function createBranchesForEnvironment(
  client: EnhancedNeonApiClient,
  environment: string,
  config: BatchCreateConfig,
  semaphore: Semaphore
): Promise<{ branches: CreatedBranch[]; errors: Array<{ environment: string; error: string; index: number }> }> {
  const branches: CreatedBranch[] = [];
  const errors: Array<{ environment: string; error: string; index: number }> = [];

  const createBranch = async (index: number): Promise<void> => {
    await semaphore.acquire();
    
    try {
      const options: BranchCreationOptions = {
        testSuite: `${config.testSuitePrefix}-${environment}`,
        purpose: `${environment} testing batch`,
        tags: [environment, 'batch', 'automated', 'ci'],
        waitForReady: config.waitForReady,
        timeoutMs: config.timeoutMs
      };

      if (config.verbose) {
        console.log(`   ⏳ Creating ${environment} branch ${index + 1}/${config.branchesPerEnv}...`);
      }

      const result = await client.createTestBranch(options);
      
      if (result.success && result.data) {
        const branch: CreatedBranch = {
          environment,
          branchId: result.data.branchId,
          branchName: result.data.branchName,
          connectionString: result.data.connectionString,
          host: result.data.host,
          database: result.data.database,
          role: result.data.role,
          created_at: result.data.created_at,
          metadata: result.data.metadata
        };
        
        branches.push(branch);
        console.log(`   ✅ ${environment}[${index + 1}]: ${result.data.branchName}`);
      } else {
        const error = { environment, error: result.error || 'Unknown error', index };
        errors.push(error);
        console.error(`   ❌ ${environment}[${index + 1}]: ${error.error}`);
      }
    } catch (error) {
      const errorObj = { environment, error: String(error), index };
      errors.push(errorObj);
      console.error(`   ❌ ${environment}[${index + 1}]: ${error}`);
    } finally {
      semaphore.release();
    }
  };

  if (config.dryRun) {
    console.log(`   🔍 Would create ${config.branchesPerEnv} ${environment} branches`);
    return { branches, errors };
  }

  const promises = Array.from({ length: config.branchesPerEnv }, (_, i) => createBranch(i));

  if (config.parallel) {
    await Promise.allSettled(promises);
  } else {
    for (const promise of promises) {
      await promise;
    }
  }

  return { branches, errors };
}

async function createTestBranches(config: BatchCreateConfig): Promise<BatchResult> {
  const startTime = Date.now();
  
  console.log('🌿 Creating test branches in batch...');
  console.log(`   Environments: ${config.environments.join(', ')}`);
  console.log(`   Branches per env: ${config.branchesPerEnv}`);
  console.log(`   Total branches: ${config.environments.length * config.branchesPerEnv}`);
  console.log(`   Parallel: ${config.parallel}`);
  console.log(`   Max concurrency: ${config.maxConcurrency}`);
  console.log(`   Dry run: ${config.dryRun}`);
  console.log('');

  if (config.dryRun) {
    console.log('🔍 DRY RUN MODE - No branches will be created');
    console.log('');
  }

  const client = new EnhancedNeonApiClient({
    rateLimitConfig: {
      maxRequestsPerMinute: 150,
      burstLimit: config.maxConcurrency + 5
    },
    retryConfig: {
      maxRetries: 2,
      baseDelayMs: 1000,
      maxDelayMs: 5000
    }
  });

  const semaphore = new Semaphore(config.maxConcurrency);
  const allBranches: CreatedBranch[] = [];
  const allErrors: Array<{ environment: string; error: string; index: number }> = [];

  for (const environment of config.environments) {
    console.log(`📋 Processing ${environment} environment...`);
    
    const { branches, errors } = await createBranchesForEnvironment(
      client,
      environment,
      config,
      semaphore
    );
    
    allBranches.push(...branches);
    allErrors.push(...errors);
    
    console.log(`   ${environment}: ${branches.length} created, ${errors.length} failed`);
  }

  const duration = Date.now() - startTime;
  const totalRequested = config.environments.length * config.branchesPerEnv;
  
  const result: BatchResult = {
    success: allErrors.length === 0,
    totalRequested,
    totalCreated: allBranches.length,
    totalFailed: allErrors.length,
    branches: allBranches,
    errors: allErrors,
    duration,
    config
  };

  console.log('');
  console.log('🎉 Batch creation completed:');
  console.log(`   ✅ Created: ${result.totalCreated}/${result.totalRequested} branches`);
  console.log(`   ❌ Failed: ${result.totalFailed} branches`);
  console.log(`   ⏱️  Duration: ${Math.round(duration / 1000)}s`);

  if (config.verbose && allBranches.length > 0) {
    console.log('\n📋 Created branches:');
    allBranches.forEach(branch => {
      console.log(`   ${branch.environment}: ${branch.branchName}`);
      console.log(`      ID: ${branch.branchId}`);
      console.log(`      Host: ${branch.host}`);
      console.log(`      Database: ${branch.database}`);
    });
  }

  if (allErrors.length > 0) {
    console.log('\n❌ Errors:');
    allErrors.forEach(error => {
      console.log(`   ${error.environment}[${error.index + 1}]: ${error.error}`);
    });
  }

  return result;
}

async function main() {
  const args = parseArgs();

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const config = { ...getDefaultConfig(), ...args };

  // Validation
  if (config.branchesPerEnv < 1 || config.branchesPerEnv > 20) {
    console.error('❌ Error: branchesPerEnv must be between 1 and 20');
    process.exit(1);
  }

  if (config.maxConcurrency < 1 || config.maxConcurrency > 20) {
    console.error('❌ Error: maxConcurrency must be between 1 and 20');
    process.exit(1);
  }

  if (config.environments.length === 0) {
    console.error('❌ Error: At least one environment must be specified');
    process.exit(1);
  }

  try {
    const result = await createTestBranches(config);

    if (config.outputFile) {
      await writeFile(config.outputFile, JSON.stringify(result, null, 2));
      console.log(`\n📄 Results saved to: ${config.outputFile}`);
    }

    if (!result.success) {
      console.log('\n⚠️  Some branches failed to create. Check the errors above.');
      process.exit(1);
    }

    console.log('\n💡 Next steps:');
    console.log('   • Use branches for testing');
    console.log('   • Run cleanup when done: bun run scripts/cleanup-old-branches.ts');
    console.log('   • Check status: bun run scripts/test-branch-status.ts');

  } catch (error) {
    console.error('❌ Batch creation failed:', error);
    if (config.verbose) {
      console.error(error);
    }
    process.exit(1);
  }
}

main().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});