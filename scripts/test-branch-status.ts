#!/usr/bin/env bun
/**
 * Test Branch Status Monitoring and Health Checks
 * Usage: bun run scripts/test-branch-status.ts [command] [options]
 *
 * Provides comprehensive monitoring, health checks, and status reporting for test branches
 */

import {
  EnhancedNeonApiClient,
  type NeonBranch,
} from '../lib/testing/neon-api-client';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';

// Load environment variables
config({ path: resolve(process.cwd(), '.env.test') });
config({ path: resolve(process.cwd(), '.env.local') });

interface BranchHealth {
  branchId: string;
  branchName: string;
  status: 'healthy' | 'warning' | 'critical' | 'unknown';
  state: string;
  age: number;
  ageCategory: 'new' | 'recent' | 'old' | 'stale';
  size: number;
  sizeCategory: 'small' | 'medium' | 'large' | 'huge';
  issues: string[];
  recommendations: string[];
  metadata?: {
    lastUsed?: string;
    estimatedCost?: number;
    testEnvironment?: string;
    tags?: string[];
  };
}

interface SystemHealth {
  overall: 'healthy' | 'warning' | 'critical';
  branchCount: {
    total: number;
    test: number;
    active: number;
    stale: number;
  };
  resourceUsage: {
    totalSize: number;
    averageSize: number;
    estimatedCost: number;
  };
  performance: {
    avgOperationTime: number;
    recentErrors: number;
    successRate: number;
  };
  issues: string[];
  recommendations: string[];
}

interface StatusReport {
  timestamp: string;
  systemHealth: SystemHealth;
  branchHealth: BranchHealth[];
  summary: {
    healthyBranches: number;
    warningBranches: number;
    criticalBranches: number;
    totalIssues: number;
    totalRecommendations: number;
  };
  config: {
    project: string;
    environment: string;
    includePrimary: boolean;
    verbose: boolean;
  };
}

interface MonitoringConfig {
  command: 'status' | 'health' | 'monitor' | 'report' | 'alerts';
  includePrimary: boolean;
  verbose: boolean;
  continuous: boolean;
  interval: number;
  format: 'table' | 'json' | 'summary' | 'detailed';
  outputFile?: string;
  alertThresholds: {
    staleBranchHours: number;
    largeBranchMB: number;
    maxTestBranches: number;
    errorRatePercent: number;
  };
  filters: {
    environment?: 'unit' | 'integration' | 'e2e';
    status?: 'healthy' | 'warning' | 'critical';
    ageCategory?: 'new' | 'recent' | 'old' | 'stale';
  };
}

const COMMANDS = {
  status: 'Show current branch status',
  health: 'Perform comprehensive health check',
  monitor: 'Continuous monitoring with alerts',
  report: 'Generate detailed report',
  alerts: 'Check for alert conditions',
} as const;

function parseArgs(): Partial<MonitoringConfig> & { help?: boolean } {
  const args = process.argv.slice(2);
  const result: Partial<MonitoringConfig> & { help?: boolean } = {
    command: 'status',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg === '--include-primary') {
      result.includePrimary = true;
    } else if (arg === '--continuous') {
      result.continuous = true;
    } else if (arg === '--verbose' || arg === '-v') {
      result.verbose = true;
    } else if (arg.startsWith('--format=')) {
      result.format = arg.split('=')[1] as any;
    } else if (arg.startsWith('--interval=')) {
      result.interval = Number.parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--output=')) {
      result.outputFile = arg.split('=')[1];
    } else if (arg.startsWith('--stale-hours=')) {
      if (!result.alertThresholds) result.alertThresholds = {} as any;
      result.alertThresholds.staleBranchHours = Number.parseInt(
        arg.split('=')[1],
        10,
      );
    } else if (arg.startsWith('--large-mb=')) {
      if (!result.alertThresholds) result.alertThresholds = {} as any;
      result.alertThresholds.largeBranchMB = Number.parseInt(
        arg.split('=')[1],
        10,
      );
    } else if (arg.startsWith('--max-branches=')) {
      if (!result.alertThresholds) result.alertThresholds = {} as any;
      result.alertThresholds.maxTestBranches = Number.parseInt(
        arg.split('=')[1],
        10,
      );
    } else if (arg.startsWith('--filter-env=')) {
      if (!result.filters) result.filters = {};
      result.filters.environment = arg.split('=')[1] as any;
    } else if (arg.startsWith('--filter-status=')) {
      if (!result.filters) result.filters = {};
      result.filters.status = arg.split('=')[1] as any;
    } else if (arg.startsWith('--filter-age=')) {
      if (!result.filters) result.filters = {};
      result.filters.ageCategory = arg.split('=')[1] as any;
    } else if (!result.command && Object.keys(COMMANDS).includes(arg)) {
      result.command = arg as any;
    }
  }

  return result;
}

function getDefaultConfig(): MonitoringConfig {
  return {
    command: 'status',
    includePrimary: false,
    verbose: false,
    continuous: false,
    interval: 30,
    format: 'table',
    alertThresholds: {
      staleBranchHours: 72,
      largeBranchMB: 500,
      maxTestBranches: 20,
      errorRatePercent: 10,
    },
    filters: {},
  };
}

function printHelp() {
  console.log(`
Test Branch Status Monitoring and Health Checks

Usage: bun run scripts/test-branch-status.ts [command] [options]

Commands:
  status           Show current branch status (default)
  health           Perform comprehensive health check
  monitor          Continuous monitoring with alerts
  report           Generate detailed report
  alerts           Check for alert conditions

Options:
  --include-primary       Include primary branches in analysis
  --continuous           Enable continuous monitoring mode
  --interval=SECONDS     Monitoring interval in seconds (default: 30)
  --format=TYPE          Output format: table|json|summary|detailed (default: table)
  --output=FILE          Save output to file
  --verbose, -v          Enable verbose logging
  --help, -h             Show this help message

Alert Thresholds:
  --stale-hours=N        Hours before branch is considered stale (default: 72)
  --large-mb=N           Size in MB before branch is considered large (default: 500)
  --max-branches=N       Max test branches before alert (default: 20)

Filters:
  --filter-env=TYPE      Filter by environment: unit|integration|e2e
  --filter-status=TYPE   Filter by health status: healthy|warning|critical
  --filter-age=TYPE      Filter by age category: new|recent|old|stale

Examples:
  # Basic status check
  bun run scripts/test-branch-status.ts status

  # Comprehensive health check with verbose output
  bun run scripts/test-branch-status.ts health --verbose

  # Continuous monitoring with alerts
  bun run scripts/test-branch-status.ts monitor --interval=60

  # Generate detailed report
  bun run scripts/test-branch-status.ts report --format=json --output=status-report.json

  # Check for stale branches
  bun run scripts/test-branch-status.ts alerts --filter-age=stale

  # Monitor integration test branches
  bun run scripts/test-branch-status.ts status --filter-env=integration --verbose

Environment Variables Required:
  NEON_PROJECT_ID     Neon project ID
  
  OR use MCP-based authentication (preferred)
`);
}

function categorizeBranchAge(
  ageHours: number,
): 'new' | 'recent' | 'old' | 'stale' {
  if (ageHours < 1) return 'new';
  if (ageHours < 24) return 'recent';
  if (ageHours < 72) return 'old';
  return 'stale';
}

function categorizeBranchSize(
  sizeMB: number,
): 'small' | 'medium' | 'large' | 'huge' {
  if (sizeMB < 10) return 'small';
  if (sizeMB < 100) return 'medium';
  if (sizeMB < 500) return 'large';
  return 'huge';
}

function analyzeBranchHealth(
  branch: NeonBranch,
  config: MonitoringConfig,
): BranchHealth {
  const ageMs = Date.now() - new Date(branch.created_at).getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  const sizeMB = (branch.logical_size || 0) / (1024 * 1024);

  const ageCategory = categorizeBranchAge(ageHours);
  const sizeCategory = categorizeBranchSize(sizeMB);

  const issues: string[] = [];
  const recommendations: string[] = [];
  let status: BranchHealth['status'] = 'healthy';

  // Check branch state
  if (branch.current_state !== 'ready') {
    if (branch.current_state === 'creating' && ageHours > 0.5) {
      issues.push('Branch stuck in creating state');
      status = 'warning';
    } else if (branch.current_state === 'deleting') {
      issues.push('Branch in deleting state');
      status = 'warning';
    } else if (branch.current_state !== 'creating') {
      issues.push(`Unexpected state: ${branch.current_state}`);
      status = 'critical';
    }
  }

  // Check age
  if (ageHours > config.alertThresholds.staleBranchHours) {
    issues.push(`Branch is stale (${Math.round(ageHours)}h old)`);
    recommendations.push('Consider cleanup if no longer needed');
    if (status === 'healthy') status = 'warning';
  }

  // Check size
  if (sizeMB > config.alertThresholds.largeBranchMB) {
    issues.push(`Large branch size (${Math.round(sizeMB)}MB)`);
    recommendations.push('Monitor resource usage and cost');
    if (status === 'healthy') status = 'warning';
  }

  // Check for naming patterns that suggest test environment
  let testEnvironment: string | undefined;
  if (branch.name.includes('-unit')) testEnvironment = 'unit';
  else if (branch.name.includes('-integration'))
    testEnvironment = 'integration';
  else if (branch.name.includes('-e2e')) testEnvironment = 'e2e';

  // Size recommendations
  if (sizeCategory === 'huge') {
    recommendations.push('Consider data cleanup or archival');
  }

  // Age recommendations
  if (ageCategory === 'stale' && branch.name.startsWith('test-')) {
    recommendations.push('Cleanup candidate for automated cleanup');
  }

  return {
    branchId: branch.id,
    branchName: branch.name,
    status,
    state: branch.current_state,
    age: Math.round(ageHours * 10) / 10,
    ageCategory,
    size: Math.round(sizeMB * 10) / 10,
    sizeCategory,
    issues,
    recommendations,
    metadata: {
      testEnvironment,
      estimatedCost: sizeMB * 0.023, // Rough estimate
      tags: testEnvironment ? [testEnvironment, 'test'] : ['test'],
    },
  };
}

function analyzeSystemHealth(
  branches: NeonBranch[],
  branchHealth: BranchHealth[],
  metrics: any[],
  config: MonitoringConfig,
): SystemHealth {
  const testBranches = branches.filter((b) => b.name.startsWith('test-'));
  const activeBranches = branches.filter((b) => b.current_state === 'ready');
  const staleBranches = testBranches.filter((b) => {
    const ageHours =
      (Date.now() - new Date(b.created_at).getTime()) / (1000 * 60 * 60);
    return ageHours > config.alertThresholds.staleBranchHours;
  });

  const totalSize = branches.reduce((sum, b) => sum + (b.logical_size || 0), 0);
  const averageSize = totalSize / Math.max(branches.length, 1);
  const estimatedCost = (totalSize / (1024 * 1024)) * 0.023; // Rough estimate

  // Performance analysis
  const recentMetrics = metrics.filter(
    (m) => Date.now() - new Date(m.timestamp).getTime() < 60 * 60 * 1000, // Last hour
  );
  const avgOperationTime =
    recentMetrics.length > 0
      ? recentMetrics.reduce((sum, m) => sum + m.duration, 0) /
        recentMetrics.length
      : 0;
  const failedOps = recentMetrics.filter((m) => !m.success);
  const successRate =
    recentMetrics.length > 0
      ? ((recentMetrics.length - failedOps.length) / recentMetrics.length) * 100
      : 100;

  const issues: string[] = [];
  const recommendations: string[] = [];
  let overall: SystemHealth['overall'] = 'healthy';

  // Check thresholds
  if (testBranches.length > config.alertThresholds.maxTestBranches) {
    issues.push(`Too many test branches: ${testBranches.length}`);
    recommendations.push('Run cleanup to reduce branch count');
    overall = 'warning';
  }

  if (staleBranches.length > 5) {
    issues.push(`Many stale branches: ${staleBranches.length}`);
    recommendations.push('Schedule regular cleanup of old branches');
    if (overall === 'healthy') overall = 'warning';
  }

  if (successRate < 100 - config.alertThresholds.errorRatePercent) {
    issues.push(
      `High error rate: ${Math.round((100 - successRate) * 10) / 10}%`,
    );
    recommendations.push('Investigate recent operation failures');
    overall = 'critical';
  }

  if (estimatedCost > 100) {
    issues.push(
      `High estimated cost: $${Math.round(estimatedCost * 100) / 100}/month`,
    );
    recommendations.push('Review resource usage and cleanup policies');
    if (overall === 'healthy') overall = 'warning';
  }

  // Critical issues from branch health
  const criticalBranches = branchHealth.filter((b) => b.status === 'critical');
  if (criticalBranches.length > 0) {
    issues.push(`${criticalBranches.length} branches in critical state`);
    overall = 'critical';
  }

  return {
    overall,
    branchCount: {
      total: branches.length,
      test: testBranches.length,
      active: activeBranches.length,
      stale: staleBranches.length,
    },
    resourceUsage: {
      totalSize: Math.round(totalSize / (1024 * 1024)),
      averageSize: Math.round(averageSize / (1024 * 1024)),
      estimatedCost: Math.round(estimatedCost * 100) / 100,
    },
    performance: {
      avgOperationTime: Math.round(avgOperationTime),
      recentErrors: failedOps.length,
      successRate: Math.round(successRate * 10) / 10,
    },
    issues,
    recommendations,
  };
}

function applyFilters(
  branchHealth: BranchHealth[],
  config: MonitoringConfig,
): BranchHealth[] {
  let filtered = branchHealth;

  if (config.filters.environment) {
    filtered = filtered.filter(
      (b) => b.metadata?.testEnvironment === config.filters.environment,
    );
  }

  if (config.filters.status) {
    filtered = filtered.filter((b) => b.status === config.filters.status);
  }

  if (config.filters.ageCategory) {
    filtered = filtered.filter(
      (b) => b.ageCategory === config.filters.ageCategory,
    );
  }

  return filtered;
}

function formatTableOutput(
  report: StatusReport,
  config: MonitoringConfig,
): void {
  const { systemHealth, branchHealth } = report;

  console.log('📊 Test Branch Status Dashboard');
  console.log(`   Timestamp: ${report.timestamp}`);
  console.log(
    `   Overall Health: ${getHealthEmoji(systemHealth.overall)} ${systemHealth.overall.toUpperCase()}`,
  );
  console.log('');

  // System overview
  console.log('🏛️  System Overview:');
  console.log(`   Total branches: ${systemHealth.branchCount.total}`);
  console.log(`   Test branches: ${systemHealth.branchCount.test}`);
  console.log(`   Active branches: ${systemHealth.branchCount.active}`);
  console.log(`   Stale branches: ${systemHealth.branchCount.stale}`);
  console.log(`   Total size: ${systemHealth.resourceUsage.totalSize}MB`);
  console.log(
    `   Estimated cost: $${systemHealth.resourceUsage.estimatedCost}/month`,
  );
  console.log('');

  if (systemHealth.performance.recentErrors > 0) {
    console.log('⚡ Performance:');
    console.log(
      `   Avg operation time: ${systemHealth.performance.avgOperationTime}ms`,
    );
    console.log(`   Success rate: ${systemHealth.performance.successRate}%`);
    console.log(`   Recent errors: ${systemHealth.performance.recentErrors}`);
    console.log('');
  }

  // Issues and recommendations
  if (systemHealth.issues.length > 0) {
    console.log('⚠️  System Issues:');
    systemHealth.issues.forEach((issue) => console.log(`   • ${issue}`));
    console.log('');
  }

  if (systemHealth.recommendations.length > 0) {
    console.log('💡 System Recommendations:');
    systemHealth.recommendations.forEach((rec) => console.log(`   • ${rec}`));
    console.log('');
  }

  // Branch details
  const filteredBranches = applyFilters(branchHealth, config);

  if (filteredBranches.length > 0) {
    console.log('🌿 Branch Details:');
    console.log(
      '   Name                                    | Status   | Age      | Size     | Issues',
    );
    console.log(
      '   ----------------------------------------|----------|----------|----------|--------',
    );

    filteredBranches.forEach((branch) => {
      const name =
        branch.branchName.length > 40
          ? `${branch.branchName.slice(0, 37)}...`
          : branch.branchName;
      const status = `${getHealthEmoji(branch.status)} ${branch.status}`;
      const age = `${branch.age}h`;
      const size = `${branch.size}MB`;
      const issues = branch.issues.length > 0 ? `${branch.issues.length}` : '-';

      console.log(
        `   ${name.padEnd(40)}| ${status.padEnd(9)}| ${age.padEnd(9)}| ${size.padEnd(9)}| ${issues}`,
      );
    });
  }

  // Summary
  console.log('');
  console.log('📈 Summary:');
  console.log(
    `   ${getHealthEmoji('healthy')} Healthy: ${report.summary.healthyBranches}`,
  );
  console.log(
    `   ${getHealthEmoji('warning')} Warning: ${report.summary.warningBranches}`,
  );
  console.log(
    `   ${getHealthEmoji('critical')} Critical: ${report.summary.criticalBranches}`,
  );
  console.log(`   Total issues: ${report.summary.totalIssues}`);
  console.log(
    `   Total recommendations: ${report.summary.totalRecommendations}`,
  );
}

function getHealthEmoji(status: string): string {
  switch (status) {
    case 'healthy':
      return '✅';
    case 'warning':
      return '⚠️';
    case 'critical':
      return '❌';
    default:
      return '❓';
  }
}

async function generateStatusReport(
  client: EnhancedNeonApiClient,
  config: MonitoringConfig,
): Promise<StatusReport> {
  // Get branches
  const branchesResult = await client.listBranches();
  if (!branchesResult.success || !branchesResult.data) {
    throw new Error(`Failed to list branches: ${branchesResult.error}`);
  }

  const allBranches = branchesResult.data;
  const branches = config.includePrimary
    ? allBranches
    : allBranches.filter((b) => !b.primary);

  // Analyze each branch
  const branchHealth = branches.map((branch) =>
    analyzeBranchHealth(branch, config),
  );

  // Get performance metrics
  const metrics = client.getPerformanceMetrics();

  // Analyze system health
  const systemHealth = analyzeSystemHealth(
    allBranches,
    branchHealth,
    metrics,
    config,
  );

  // Generate summary
  const summary = {
    healthyBranches: branchHealth.filter((b) => b.status === 'healthy').length,
    warningBranches: branchHealth.filter((b) => b.status === 'warning').length,
    criticalBranches: branchHealth.filter((b) => b.status === 'critical')
      .length,
    totalIssues:
      branchHealth.reduce((sum, b) => sum + b.issues.length, 0) +
      systemHealth.issues.length,
    totalRecommendations:
      branchHealth.reduce((sum, b) => sum + b.recommendations.length, 0) +
      systemHealth.recommendations.length,
  };

  return {
    timestamp: new Date().toISOString(),
    systemHealth,
    branchHealth,
    summary,
    config: {
      project: process.env.NEON_PROJECT_ID || 'unknown',
      environment: config.filters.environment || 'all',
      includePrimary: config.includePrimary,
      verbose: config.verbose,
    },
  };
}

async function runCommand(config: MonitoringConfig): Promise<void> {
  const client = new EnhancedNeonApiClient({
    rateLimitConfig: {
      maxRequestsPerMinute: 60,
      burstLimit: 10,
    },
  });

  switch (config.command) {
    case 'status':
    case 'health':
    case 'report': {
      const report = await generateStatusReport(client, config);

      if (config.format === 'table') {
        formatTableOutput(report, config);
      } else if (config.format === 'json') {
        console.log(JSON.stringify(report, null, 2));
      } else if (config.format === 'summary') {
        console.log(`Health: ${report.systemHealth.overall}`);
        console.log(
          `Branches: ${report.summary.healthyBranches}✅ ${report.summary.warningBranches}⚠️ ${report.summary.criticalBranches}❌`,
        );
        console.log(`Issues: ${report.summary.totalIssues}`);
      }

      if (config.outputFile) {
        await writeFile(config.outputFile, JSON.stringify(report, null, 2));
        console.log(`\n📄 Report saved to: ${config.outputFile}`);
      }
      break;
    }

    case 'monitor':
      console.log('🔄 Starting continuous monitoring...');
      console.log(`   Interval: ${config.interval}s`);
      console.log('   Press Ctrl+C to stop');
      console.log('');

      while (config.continuous) {
        try {
          const report = await generateStatusReport(client, config);

          console.clear();
          formatTableOutput(report, config);
          console.log(`\n🔄 Next update in ${config.interval}s...`);

          // Check for critical issues
          if (report.systemHealth.overall === 'critical') {
            console.log('\n🚨 CRITICAL ALERT: System health is critical!');
          }

          await new Promise((resolve) =>
            setTimeout(resolve, config.interval * 1000),
          );
        } catch (error) {
          console.error('❌ Monitoring error:', error);
          await new Promise((resolve) =>
            setTimeout(resolve, config.interval * 1000),
          );
        }
      }
      break;

    case 'alerts': {
      const alertReport = await generateStatusReport(client, config);
      const alerts = [
        ...alertReport.systemHealth.issues,
        ...alertReport.branchHealth.flatMap((b) =>
          b.issues.map((issue) => `${b.branchName}: ${issue}`),
        ),
      ];

      if (alerts.length > 0) {
        console.log('🚨 Active Alerts:');
        alerts.forEach((alert) => console.log(`   • ${alert}`));
        process.exit(1);
      } else {
        console.log('✅ No alerts detected');
      }
      break;
    }
  }
}

async function main() {
  const args = parseArgs();

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const config = { ...getDefaultConfig(), ...args };

  // Validation
  if (config.interval && (config.interval < 10 || config.interval > 3600)) {
    console.error('❌ Error: interval must be between 10 and 3600 seconds');
    process.exit(1);
  }

  try {
    await runCommand(config);
  } catch (error) {
    console.error('❌ Command failed:', error);
    if (config.verbose) {
      console.error(error);
    }
    process.exit(1);
  }
}

// Handle SIGINT for graceful shutdown in monitor mode
process.on('SIGINT', () => {
  console.log('\n\n🛑 Monitoring stopped by user');
  process.exit(0);
});

main().catch((error) => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
