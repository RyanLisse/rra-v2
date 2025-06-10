#!/usr/bin/env bun
/**
 * Enhanced Neon Test Branch Manager - Main management script
 * Usage: bun run scripts/neon-test-branch-manager.ts <command> [options]
 *
 * Commands:
 *   create    - Create test branches
 *   cleanup   - Cleanup old branches
 *   status    - Check branch status
 *   health    - Health check
 *   list      - List branches
 *   stats     - Show statistics
 *   export    - Export monitoring data
 */

import {
  EnhancedNeonApiClient,
  type BranchCreationOptions,
  type CleanupFilters,
} from '../lib/testing/neon-api-client';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';

// Load environment variables
config({ path: resolve(process.cwd(), '.env.test') });
config({ path: resolve(process.cwd(), '.env.local') });

interface CliArgs {
  command: string;
  testSuite?: string;
  environment?: 'unit' | 'integration' | 'e2e' | 'all';
  maxAgeHours?: number;
  dryRun?: boolean;
  parallel?: boolean;
  count?: number;
  format?: 'json' | 'table' | 'summary';
  output?: string;
  help?: boolean;
  verbose?: boolean;
}

const COMMANDS = {
  create: 'Create test branches',
  cleanup: 'Cleanup old branches',
  status: 'Check branch status',
  health: 'Health check',
  list: 'List branches',
  stats: 'Show statistics',
  export: 'Export monitoring data',
} as const;

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {
    command: '',
    environment: 'unit',
    maxAgeHours: 24,
    dryRun: false,
    parallel: false,
    count: 1,
    format: 'table',
    help: false,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg === '--dry-run') {
      result.dryRun = true;
    } else if (arg === '--parallel') {
      result.parallel = true;
    } else if (arg === '--verbose' || arg === '-v') {
      result.verbose = true;
    } else if (arg.startsWith('--suite=')) {
      result.testSuite = arg.split('=')[1];
    } else if (arg.startsWith('--env=')) {
      result.environment = arg.split('=')[1] as any;
    } else if (arg.startsWith('--max-age=')) {
      result.maxAgeHours = Number.parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--count=')) {
      result.count = Number.parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--format=')) {
      result.format = arg.split('=')[1] as any;
    } else if (arg.startsWith('--output=')) {
      result.output = arg.split('=')[1];
    } else if (!result.command && !arg.startsWith('--')) {
      result.command = arg;
    }
  }

  return result;
}

function printHelp() {
  console.log(`
Enhanced Neon Test Branch Manager

Usage: bun run scripts/neon-test-branch-manager.ts <command> [options]

Commands:
  create    Create test branches for specified environment
  cleanup   Cleanup old test branches with enhanced filtering
  status    Check status of test branches
  health    Perform health check on the system
  list      List all branches with filtering options
  stats     Show detailed statistics and metrics
  export    Export monitoring data for analysis

Options:
  --suite=NAME         Test suite name (for create command)
  --env=TYPE          Environment type: unit|integration|e2e|all (default: unit)
  --count=N           Number of branches to create (default: 1)
  --max-age=HOURS     Max age for cleanup in hours (default: 24)
  --parallel          Enable parallel operations where supported
  --dry-run           Show what would be done without executing
  --format=TYPE       Output format: json|table|summary (default: table)
  --output=FILE       Save output to file
  --verbose, -v       Enable verbose logging
  --help, -h          Show this help message

Examples:
  # Create a single test branch for unit tests
  bun run scripts/neon-test-branch-manager.ts create --suite=auth-tests

  # Create multiple branches for all environments
  bun run scripts/neon-test-branch-manager.ts create --env=all --count=3 --parallel

  # Cleanup old branches with dry run
  bun run scripts/neon-test-branch-manager.ts cleanup --max-age=12 --dry-run

  # Health check with verbose output
  bun run scripts/neon-test-branch-manager.ts health --verbose

  # Export monitoring data
  bun run scripts/neon-test-branch-manager.ts export --format=json --output=monitoring.json

Environment Variables Required:
  NEON_PROJECT_ID     Neon project ID
  NEON_API_KEY        Neon API key (if using direct API)
  
  OR use MCP-based authentication (preferred)
`);
}

async function createBranches(
  client: EnhancedNeonApiClient,
  args: CliArgs,
): Promise<void> {
  if (!args.testSuite) {
    throw new Error(
      'Test suite name is required for create command. Use --suite=NAME',
    );
  }

  const environments =
    args.environment === 'all'
      ? (['unit', 'integration', 'e2e'] as const)
      : [args.environment!];

  console.log('🌿 Creating test branches...');
  console.log(`   Suite: ${args.testSuite}`);
  console.log(`   Environments: ${environments.join(', ')}`);
  console.log(`   Count per env: ${args.count}`);
  console.log(`   Parallel: ${args.parallel}`);
  console.log('');

  const results = [];

  for (const env of environments) {
    console.log(`📋 Creating branches for ${env} environment...`);

    const branchPromises = Array.from({ length: args.count! }, async (_, i) => {
      const options: BranchCreationOptions = {
        testSuite: `${args.testSuite}-${env}`,
        purpose: `${env} testing`,
        tags: [env, 'automated', 'ci'],
        waitForReady: true,
        timeoutMs: 120000,
      };

      if (args.verbose) {
        console.log(`   Creating ${env} branch ${i + 1}/${args.count}...`);
      }

      const result = await client.createTestBranch(options);

      if (result.success && result.data) {
        console.log(`   ✅ Created: ${result.data.branchName}`);
        return result.data;
      } else {
        console.error(`   ❌ Failed: ${result.error}`);
        throw new Error(result.error);
      }
    });

    if (args.parallel) {
      const envResults = await Promise.allSettled(branchPromises);
      const successful = envResults.filter((r) => r.status === 'fulfilled');
      const failed = envResults.filter((r) => r.status === 'rejected');

      console.log(
        `   ${env}: ${successful.length} created, ${failed.length} failed`,
      );
      results.push(
        ...successful.map((r) => (r as PromiseFulfilledResult<any>).value),
      );
    } else {
      for (const promise of branchPromises) {
        try {
          const branch = await promise;
          results.push(branch);
        } catch (error) {
          console.error(`   ❌ Error creating branch: ${error}`);
        }
      }
    }
  }

  console.log('');
  console.log('🎉 Branch creation summary:');
  console.log(`   ✅ Total created: ${results.length}`);

  if (args.format === 'json' || args.output) {
    const output = JSON.stringify(results, null, 2);
    if (args.output) {
      await writeFile(args.output, output);
      console.log(`   📄 Results saved to: ${args.output}`);
    } else {
      console.log(output);
    }
  }
}

async function cleanupBranches(
  client: EnhancedNeonApiClient,
  args: CliArgs,
): Promise<void> {
  console.log('🧹 Cleaning up old test branches...');
  console.log(`   Max age: ${args.maxAgeHours} hours`);
  console.log(`   Dry run: ${args.dryRun}`);
  console.log('');

  const filters: CleanupFilters = {
    maxAgeHours: args.maxAgeHours,
    namePattern: /^test-/,
    preservePrimary: true,
    dryRun: args.dryRun,
  };

  const result = await client.cleanupTestBranches(filters);

  if (result.success && result.data) {
    const { deleted, failed, skipped } = result.data;

    console.log('📊 Cleanup results:');
    console.log(`   ✅ Deleted: ${deleted.length} branches`);
    console.log(`   ❌ Failed: ${failed.length} branches`);
    console.log(`   ⏭️  Skipped: ${skipped.length} branches`);

    if (args.verbose) {
      if (deleted.length > 0) {
        console.log('\n🗑️  Deleted branches:');
        deleted.forEach((name) => console.log(`   - ${name}`));
      }

      if (failed.length > 0) {
        console.log('\n❌ Failed to delete:');
        failed.forEach((name) => console.log(`   - ${name}`));
      }

      if (skipped.length > 0) {
        console.log('\n⏭️  Skipped branches:');
        skipped.forEach((name) => console.log(`   - ${name}`));
      }
    }

    if (args.output) {
      await writeFile(args.output, JSON.stringify(result.data, null, 2));
      console.log(`   📄 Results saved to: ${args.output}`);
    }
  } else {
    console.error('❌ Cleanup failed:', result.error);
    process.exit(1);
  }
}

async function showStatus(
  client: EnhancedNeonApiClient,
  args: CliArgs,
): Promise<void> {
  console.log('📊 Branch Status Check...');
  console.log('');

  const branchesResult = await client.listBranches();

  if (!branchesResult.success || !branchesResult.data) {
    console.error('❌ Failed to list branches:', branchesResult.error);
    process.exit(1);
  }

  const branches = branchesResult.data;
  const testBranches = branches.filter((b) => b.name.startsWith('test-'));

  // Status summary
  const statusCounts = testBranches.reduce(
    (acc, branch) => {
      acc[branch.current_state] = (acc[branch.current_state] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  console.log('🔍 Status Summary:');
  console.log(`   Total branches: ${branches.length}`);
  console.log(`   Test branches: ${testBranches.length}`);
  Object.entries(statusCounts).forEach(([status, count]) => {
    const emoji =
      status === 'ready' ? '✅' : status === 'creating' ? '⏳' : '❌';
    console.log(`   ${emoji} ${status}: ${count}`);
  });

  if (args.format === 'table' && testBranches.length > 0) {
    console.log('\n📋 Test Branches:');
    console.log(
      '   Name                                    | Status    | Age      | Size',
    );
    console.log(
      '   ----------------------------------------|-----------|----------|----------',
    );

    testBranches.forEach((branch) => {
      const age = Math.round(
        (Date.now() - new Date(branch.created_at).getTime()) / (1000 * 60 * 60),
      );
      const size = branch.logical_size
        ? `${Math.round(branch.logical_size / 1024 / 1024)}MB`
        : 'Unknown';
      const name =
        branch.name.length > 40
          ? `${branch.name.slice(0, 37)}...`
          : branch.name;
      console.log(
        `${`   ${name.padEnd(40)}| ${branch.current_state.padEnd(9)}| ${age}h`.padEnd(
          9,
        )}| ${size}`,
      );
    });
  }

  if (args.format === 'json' || args.output) {
    const output = JSON.stringify(
      {
        total_branches: branches.length,
        test_branches: testBranches.length,
        status_counts: statusCounts,
        branches: args.format === 'json' ? testBranches : undefined,
      },
      null,
      2,
    );

    if (args.output) {
      await writeFile(args.output, output);
      console.log(`\n📄 Status saved to: ${args.output}`);
    } else if (args.format === 'json') {
      console.log('\n📄 JSON Output:');
      console.log(output);
    }
  }
}

async function performHealthCheck(
  client: EnhancedNeonApiClient,
  args: CliArgs,
): Promise<void> {
  console.log('🏥 Performing health check...');
  console.log('');

  const checks = [
    {
      name: 'Project Access',
      check: async () => {
        const result = await client.getProject();
        return {
          success: result.success,
          message: result.success ? 'OK' : result.error,
        };
      },
    },
    {
      name: 'Branch Listing',
      check: async () => {
        const result = await client.listBranches();
        return {
          success: result.success,
          message: result.success
            ? `Found ${result.data?.length || 0} branches`
            : result.error,
        };
      },
    },
    {
      name: 'Statistics',
      check: async () => {
        const result = await client.getBranchStatistics();
        return {
          success: result.success,
          message: result.success
            ? `${result.data?.test_branches || 0} test branches, ${result.data?.active_branches || 0} active`
            : result.error,
        };
      },
    },
    {
      name: 'Recent Operations',
      check: async () => {
        const logs = client.getOperationLogs(10);
        const recentErrors = logs.filter(
          (log) =>
            !log.success &&
            Date.now() - new Date(log.metadata.timestamp).getTime() <
              60000 * 60, // Last hour
        );
        return {
          success: recentErrors.length === 0,
          message:
            recentErrors.length === 0
              ? `${logs.length} recent operations, no errors`
              : `${recentErrors.length} errors in last hour`,
        };
      },
    },
  ];

  const results = [];
  for (const { name, check } of checks) {
    if (args.verbose) {
      console.log(`⏳ Checking ${name}...`);
    }

    try {
      const result = await check();
      const emoji = result.success ? '✅' : '❌';
      console.log(`${emoji} ${name}: ${result.message}`);
      results.push({ name, success: result.success, message: result.message });
    } catch (error) {
      console.log(`❌ ${name}: ${error}`);
      results.push({ name, success: false, message: String(error) });
    }
  }

  const allHealthy = results.every((r) => r.success);
  console.log('');
  console.log(`🏥 Health Check ${allHealthy ? 'PASSED' : 'FAILED'}`);

  if (!allHealthy) {
    console.log('❌ Issues detected. Check the failed items above.');
    process.exit(1);
  }

  if (args.output) {
    await writeFile(
      args.output,
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          healthy: allHealthy,
          checks: results,
        },
        null,
        2,
      ),
    );
    console.log(`📄 Health check saved to: ${args.output}`);
  }
}

async function showStatistics(
  client: EnhancedNeonApiClient,
  args: CliArgs,
): Promise<void> {
  console.log('📊 Gathering statistics...');
  console.log('');

  const [statsResult, metricsData, errorSummary] = await Promise.all([
    client.getBranchStatistics(),
    client.getPerformanceMetrics(),
    client.getErrorSummary(),
  ]);

  if (!statsResult.success || !statsResult.data) {
    console.error('❌ Failed to get statistics:', statsResult.error);
    process.exit(1);
  }

  const stats = statsResult.data;

  console.log('📈 Branch Statistics:');
  console.log(`   Total branches: ${stats.total_branches}`);
  console.log(`   Test branches: ${stats.test_branches}`);
  console.log(`   Active branches: ${stats.active_branches}`);
  console.log(
    `   Total size: ${Math.round(stats.total_size_bytes / 1024 / 1024)}MB`,
  );

  if (stats.oldest_test_branch) {
    console.log(`   Oldest test branch: ${stats.oldest_test_branch}`);
  }
  if (stats.newest_test_branch) {
    console.log(`   Newest test branch: ${stats.newest_test_branch}`);
  }

  if (metricsData.length > 0) {
    console.log('\n⚡ Performance Metrics:');
    const avgDuration =
      metricsData.reduce((sum, m) => sum + m.avgDuration, 0) / metricsData.length;
    console.log(`   Average operation time: ${Math.round(avgDuration)}ms`);
    console.log(`   Total operations: ${metricsData.length}`);

    const operationCounts = metricsData.reduce(
      (acc, m) => {
        acc[m.operation] = (acc[m.operation] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    Object.entries(operationCounts).forEach(([op, count]) => {
      console.log(`   ${op}: ${count}`);
    });
  }

  if (errorSummary.totalErrors > 0) {
    console.log('\n❌ Error Summary:');
    console.log(`   Total errors: ${errorSummary.totalErrors}`);
    console.log(`   Recent errors: ${errorSummary.recentErrors}`);

    const topErrors = Object.entries(errorSummary.errorsByOperation)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);
    
    if (topErrors.length > 0) {
      console.log('   Top errors:');
      topErrors.forEach(([operation, count]) => {
        console.log(`     - ${operation}: ${count}x`);
      });
    }
  }

  if (args.output || args.format === 'json') {
    const output = JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        branch_statistics: stats,
        performance_metrics: metricsData,
        error_summary: errorSummary,
      },
      null,
      2,
    );

    if (args.output) {
      await writeFile(args.output, output);
      console.log(`\n📄 Statistics saved to: ${args.output}`);
    } else {
      console.log('\n📄 JSON Output:');
      console.log(output);
    }
  }
}

async function exportMonitoringData(
  client: EnhancedNeonApiClient,
  args: CliArgs,
): Promise<void> {
  console.log('📤 Exporting monitoring data...');

  const data = client.exportMonitoringData();
  const output = JSON.stringify(data, null, 2);

  const filename =
    args.output ||
    `neon-monitoring-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;

  await writeFile(filename, output);
  console.log(`✅ Monitoring data exported to: ${filename}`);
  console.log(
    `📊 Exported ${data.operationLogs.length} operations, ${data.activeBranches.length} active branches`,
  );
}

async function main() {
  const args = parseArgs();

  if (args.help || !args.command) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  if (!(args.command in COMMANDS)) {
    console.error(`❌ Error: Unknown command '${args.command}'`);
    console.error(`Available commands: ${Object.keys(COMMANDS).join(', ')}`);
    process.exit(1);
  }

  if (args.verbose) {
    console.log('🔧 Enhanced Neon Test Branch Manager');
    console.log(`   Command: ${args.command}`);
    console.log(`   Environment: ${args.environment}`);
    console.log(`   Verbose: ${args.verbose}`);
    console.log('');
  }

  // Initialize client
  const client = new EnhancedNeonApiClient({
    rateLimitConfig: {
      maxRequestsPerMinute: 100,
      burstLimit: 15,
    },
    retryConfig: {
      maxRetries: 3,
      baseDelayMs: 1000,
      maxDelayMs: 10000,
    },
    cleanupConfig: {
      maxBranchAgeHours: args.maxAgeHours || 24,
      autoCleanupEnabled: true,
      preserveTaggedBranches: true,
    },
  });

  try {
    switch (args.command) {
      case 'create':
        await createBranches(client, args);
        break;
      case 'cleanup':
        await cleanupBranches(client, args);
        break;
      case 'status':
        await showStatus(client, args);
        break;
      case 'health':
        await performHealthCheck(client, args);
        break;
      case 'list':
        await showStatus(client, args); // Same as status for now
        break;
      case 'stats':
        await showStatistics(client, args);
        break;
      case 'export':
        await exportMonitoringData(client, args);
        break;
      default:
        console.error(`❌ Command '${args.command}' not implemented yet`);
        process.exit(1);
    }
  } catch (error) {
    console.error('❌ Operation failed:', error);
    if (args.verbose) {
      console.error(error);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
