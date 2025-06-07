/**
 * Demo script to showcase the Enhanced Neon API Client
 * This demonstrates the capabilities without needing actual MCP tools
 */

import { EnhancedNeonApiClient } from './neon-api-client';

async function runDemo() {
  console.log('🚀 Enhanced Neon API Client Demo');
  console.log('==================================\n');

  // Create a client instance with configuration
  const client = new EnhancedNeonApiClient({
    defaultProjectId: 'yellow-tooth-01830141', // roborail-assistant project
    defaultDatabase: 'neondb',
    defaultRole: 'neondb_owner',
    rateLimitConfig: {
      maxRequestsPerMinute: 60,
      burstLimit: 10,
    },
    retryConfig: {
      maxRetries: 3,
      baseDelayMs: 1000,
      maxDelayMs: 10000,
    },
    cleanupConfig: {
      maxBranchAgeHours: 24,
      autoCleanupEnabled: true,
      preserveTaggedBranches: true,
    },
  });

  console.log('✅ Enhanced Neon API Client initialized');
  console.log(`📋 Project ID: ${client.config.defaultProjectId}`);
  console.log(`🗄️ Database: ${client.config.defaultDatabase}`);
  console.log(`👤 Role: ${client.config.defaultRole}\n`);

  try {
    // Demo 1: List Projects
    console.log('📋 Demo 1: Listing Projects');
    console.log('---------------------------');
    const projectsResult = await client.listProjects();

    if (projectsResult.success) {
      console.log(`✅ Found ${projectsResult.data?.length || 0} projects`);
      console.log(`⏱️ Operation took ${projectsResult.metadata.duration_ms}ms`);
    } else {
      console.log(`❌ Error: ${projectsResult.error}`);
    }
    console.log();

    // Demo 2: Get Project Details
    console.log('📊 Demo 2: Getting Project Details');
    console.log('----------------------------------');
    const projectResult = await client.getProject();

    if (projectResult.success) {
      console.log(`✅ Project: ${projectResult.data?.name}`);
      console.log(`📍 Region: ${projectResult.data?.region_id || 'N/A'}`);
      console.log(
        `🐘 PostgreSQL: ${projectResult.data?.pg_version || 'N/A'}`,
      );
      console.log(`⏱️ Operation took ${projectResult.metadata.duration_ms}ms`);
    } else {
      console.log(`❌ Error: ${projectResult.error}`);
    }
    console.log();

    // Demo 3: List Branches
    console.log('🌿 Demo 3: Listing Branches');
    console.log('---------------------------');
    const branchesResult = await client.listBranches();

    if (branchesResult.success) {
      console.log(`✅ Found ${branchesResult.data?.length || 0} branches`);
      branchesResult.data?.forEach((branch: any) => {
        console.log(
          `  - ${branch.name} (${branch.id}) ${branch.primary ? '[PRIMARY]' : ''}`,
        );
      });
      console.log(`⏱️ Operation took ${branchesResult.metadata.duration_ms}ms`);
    } else {
      console.log(`❌ Error: ${branchesResult.error}`);
    }
    console.log();

    // Demo 4: Branch Statistics
    console.log('📊 Demo 4: Branch Statistics');
    console.log('----------------------------');
    const statsResult = await client.getBranchStatistics();

    if (statsResult.success) {
      const stats = statsResult.data!;
      console.log(`✅ Statistics retrieved:`);
      console.log(`  📊 Total branches: ${stats.total_branches}`);
      console.log(`  🧪 Test branches: ${stats.test_branches}`);
      console.log(`  ⚡ Active branches: ${stats.active_branches}`);
      console.log(
        `  💾 Total size: ${(stats.total_size_bytes / 1024 / 1024).toFixed(2)} MB`,
      );
      if (stats.oldest_test_branch) {
        console.log(`  📅 Oldest test branch: ${stats.oldest_test_branch}`);
      }
      console.log(`⏱️ Operation took ${statsResult.metadata.duration_ms}ms`);
    } else {
      console.log(`❌ Error: ${statsResult.error}`);
    }
    console.log();

    // Demo 5: Performance Metrics
    console.log('⚡ Demo 5: Performance Metrics');
    console.log('------------------------------');
    const metrics = client.getPerformanceMetrics();

    if (metrics.length > 0) {
      console.log('✅ Performance metrics:');
      metrics.forEach((metric) => {
        console.log(`  📈 ${metric.operation}:`);
        console.log(`    🔢 Count: ${metric.count}`);
        console.log(`    ⏱️ Avg Duration: ${metric.avgDuration}ms`);
        console.log(
          `    ✅ Success Rate: ${(metric.successRate * 100).toFixed(1)}%`,
        );
        console.log(
          `    🕐 Last Executed: ${new Date(metric.lastExecuted).toLocaleTimeString()}`,
        );
      });
    } else {
      console.log('📈 No metrics available yet');
    }
    console.log();

    // Demo 6: Error Summary
    console.log('❌ Demo 6: Error Summary');
    console.log('------------------------');
    const errorSummary = client.getErrorSummary();

    if (errorSummary.totalErrors > 0) {
      console.log(`⚠️ Found ${errorSummary.totalErrors} errors`);
      console.log('📊 Errors by operation:', errorSummary.errorsByOperation);
      console.log('📝 Recent errors:');
      errorSummary.recentErrors.slice(0, 3).forEach((error, index) => {
        console.log(`  ${index + 1}. ${error.operation}: ${error.message}`);
      });
    } else {
      console.log('✅ No errors detected');
    }
    console.log();

    // Demo 7: Recent Logs
    console.log('📝 Demo 7: Recent Activity Logs');
    console.log('-------------------------------');
    const recentLogs = client.getRecentLogs(5);

    if (recentLogs.length > 0) {
      console.log('📋 Recent operations:');
      recentLogs.forEach((log, index) => {
        const duration = log.duration_ms ? ` (${log.duration_ms}ms)` : '';
        const time = new Date(log.timestamp).toLocaleTimeString();
        console.log(
          `  ${index + 1}. [${time}] ${log.operation}: ${log.message}${duration}`,
        );
      });
    } else {
      console.log('📋 No logs available');
    }
    console.log();

    // Demo 8: Export Monitoring Data
    console.log('📦 Demo 8: Export Monitoring Data');
    console.log('---------------------------------');
    const exportData = client.exportMonitoringData();

    console.log('✅ Monitoring data exported:');
    console.log(`  📋 Logs: ${exportData.logs.length} entries`);
    console.log(`  📊 Metrics: ${exportData.metrics.length} operations`);
    console.log(`  🌿 Active Branches: ${exportData.activeBranches.length}`);
    console.log(
      `  ⚙️ Configuration: ${JSON.stringify(exportData.config, null, 2)}`,
    );
    console.log(
      `  🕐 Export Time: ${new Date(exportData.exportedAt).toLocaleString()}`,
    );
    console.log();

    // Demo 9: Rate Limiting Demonstration
    console.log('🚦 Demo 9: Rate Limiting Test');
    console.log('-----------------------------');
    console.log('⏳ Testing multiple concurrent requests...');

    const start = Date.now();
    const promises = Array.from({ length: 5 }, (_, i) =>
      client.listProjects().then((result) => ({
        index: i + 1,
        success: result.success,
        duration: result.metadata.duration_ms,
      })),
    );

    const results = await Promise.all(promises);
    const totalTime = Date.now() - start;

    console.log('✅ Concurrent requests completed:');
    results.forEach((result) => {
      console.log(
        `  ${result.index}. ${result.success ? '✅' : '❌'} (${result.duration}ms)`,
      );
    });
    console.log(`🕐 Total time: ${totalTime}ms`);
    console.log('🚦 Rate limiting handled automatically');
    console.log();
  } catch (error) {
    console.error('❌ Demo failed:', error);
  }

  // Final Statistics
  console.log('📊 Final Demo Statistics');
  console.log('========================');

  const finalMetrics = client.getPerformanceMetrics();
  const finalLogs = client.getOperationLogs();
  const finalErrors = client.getErrorSummary();

  console.log(`📈 Total Operations: ${finalLogs.length}`);
  console.log(`⚡ Unique Operation Types: ${finalMetrics.length}`);
  console.log(`❌ Total Errors: ${finalErrors.totalErrors}`);

  if (finalMetrics.length > 0) {
    const avgDuration =
      finalMetrics.reduce((sum, m) => sum + m.avgDuration, 0) /
      finalMetrics.length;
    const totalSuccessRate =
      finalMetrics.reduce((sum, m) => sum + m.successRate, 0) /
      finalMetrics.length;
    console.log(`⏱️ Average Operation Duration: ${avgDuration.toFixed(1)}ms`);
    console.log(
      `✅ Overall Success Rate: ${(totalSuccessRate * 100).toFixed(1)}%`,
    );
  }

  console.log('\n🎉 Demo completed successfully!');
  console.log('\n💡 Next steps:');
  console.log('  - Run with actual MCP tools for full functionality');
  console.log('  - Try the usage examples in neon-usage-examples.ts');
  console.log('  - Integrate with your test suites');
  console.log('  - Set up monitoring and alerting');
}

// Run the demo if this file is executed directly
if (require.main === module) {
  runDemo().catch(console.error);
}

export { runDemo };
