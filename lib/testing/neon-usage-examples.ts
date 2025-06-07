/**
 * Usage examples and integration guide for Enhanced Neon API Client
 * 
 * This file demonstrates how to use the enhanced Neon API client
 * in various scenarios including testing, development, and production.
 */

import { 
  EnhancedNeonApiClient, 
  getNeonApiClient,
  type BranchCreationOptions,
  type CleanupFilters 
} from './neon-api-client';
import { getNeonLogger } from './neon-logger';

/**
 * Example 1: Basic Setup and Project Information
 */
export async function basicUsageExample() {
  // Get the global client instance (singleton)
  const client = getNeonApiClient({
    defaultProjectId: 'yellow-tooth-01830141', // roborail-assistant project
    defaultDatabase: 'neondb',
    defaultRole: 'neondb_owner',
    rateLimitConfig: {
      maxRequestsPerMinute: 60,
      burstLimit: 10
    }
  });

  console.log('🚀 Enhanced Neon API Client - Basic Usage Example');

  try {
    // List all available projects
    const projectsResult = await client.listProjects();
    if (projectsResult.success) {
      console.log('📋 Available Projects:');
      projectsResult.data?.forEach(project => {
        console.log(`  - ${project.name} (${project.id}) - ${project.platform_id}/${project.region_id}`);
      });
    }

    // Get detailed project information
    const projectResult = await client.getProject();
    if (projectResult.success) {
      console.log(`📊 Project Details: ${projectResult.data?.name}`);
      console.log(`  PostgreSQL Version: ${projectResult.data?.pg_version}`);
      console.log(`  Region: ${projectResult.data?.region_id}`);
    }

    // List branches
    const branchesResult = await client.listBranches();
    if (branchesResult.success) {
      console.log('🌿 Available Branches:');
      branchesResult.data?.forEach(branch => {
        console.log(`  - ${branch.name} (${branch.id}) - ${branch.current_state} ${branch.primary ? '[PRIMARY]' : ''}`);
      });
    }
  } catch (error) {
    console.error('❌ Error in basic usage:', error);
  }
}

/**
 * Example 2: Test Branch Management for Unit Tests
 */
export async function testBranchExample() {
  const client = getNeonApiClient();
  
  console.log('🧪 Enhanced Neon API Client - Test Branch Example');

  try {
    // Create a test branch for unit tests
    const branchOptions: BranchCreationOptions = {
      testSuite: 'user-authentication',
      purpose: 'unit-testing',
      tags: ['auth', 'users', 'ci'],
      database: 'neondb',
      role: 'neondb_owner',
      waitForReady: true,
      timeoutMs: 60000
    };

    const branchResult = await client.createTestBranch(branchOptions);
    if (branchResult.success) {
      const branch = branchResult.data!;
      console.log(`✅ Created test branch: ${branch.branchName}`);
      console.log(`🔗 Connection: ${branch.connectionString}`);
      console.log(`🏷️ Tags: ${branch.metadata.tags.join(', ')}`);

      // Run some test operations
      const sqlResult = await client.executeSql(
        'SELECT current_database(), current_user, version()',
        branch.branchId,
        branch.database
      );

      if (sqlResult.success) {
        console.log('📊 Database info retrieved successfully');
      }

      // Cleanup when done
      const deleteResult = await client.deleteTestBranch(branch.branchName);
      if (deleteResult.success) {
        console.log('🧹 Test branch cleaned up successfully');
      }
    }
  } catch (error) {
    console.error('❌ Error in test branch example:', error);
  }
}

/**
 * Example 3: Automated Test with Branch Cleanup
 */
export async function withTestBranchExample() {
  const client = getNeonApiClient();
  
  console.log('🔄 Enhanced Neon API Client - Automated Test Example');

  try {
    // Use the withTestBranch utility for automatic cleanup
    const testResult = await client.withTestBranch(
      {
        testSuite: 'integration-test',
        purpose: 'schema-migration',
        tags: ['migration', 'schema', 'integration']
      },
      async (branchInfo) => {
        console.log(`🚀 Running tests on branch: ${branchInfo.branchName}`);
        
        // Create test tables
        const createTableResult = await client.executeTransaction([
          'CREATE TABLE test_users (id SERIAL PRIMARY KEY, name VARCHAR(100), email VARCHAR(255) UNIQUE)',
          'CREATE INDEX idx_test_users_email ON test_users(email)',
          'INSERT INTO test_users (name, email) VALUES (\'Test User\', \'test@example.com\')'
        ], branchInfo.branchId);

        if (!createTableResult.success) {
          throw new Error(`Failed to create test tables: ${createTableResult.error}`);
        }

        // Run test queries
        const queryResult = await client.executeSql(
          'SELECT COUNT(*) as user_count FROM test_users',
          branchInfo.branchId
        );

        if (!queryResult.success) {
          throw new Error(`Failed to query test data: ${queryResult.error}`);
        }

        console.log('✅ Schema migration tests completed');
        return { success: true, userCount: 1 };
      }
    );

    console.log(`🎉 Test completed: ${JSON.stringify(testResult)}`);
  } catch (error) {
    console.error('❌ Error in automated test example:', error);
  }
}

/**
 * Example 4: Branch Cleanup and Maintenance
 */
export async function cleanupMaintenanceExample() {
  const client = getNeonApiClient();
  
  console.log('🧹 Enhanced Neon API Client - Cleanup & Maintenance Example');

  try {
    // Get branch statistics
    const statsResult = await client.getBranchStatistics();
    if (statsResult.success) {
      const stats = statsResult.data!;
      console.log('📊 Branch Statistics:');
      console.log(`  Total branches: ${stats.total_branches}`);
      console.log(`  Test branches: ${stats.test_branches}`);
      console.log(`  Active branches: ${stats.active_branches}`);
      console.log(`  Total size: ${(stats.total_size_bytes / 1024 / 1024).toFixed(2)} MB`);
      
      if (stats.oldest_test_branch) {
        console.log(`  Oldest test branch: ${stats.oldest_test_branch}`);
      }
    }

    // Cleanup old test branches
    const cleanupFilters: CleanupFilters = {
      maxAgeHours: 24, // Cleanup branches older than 24 hours
      namePattern: /^test-/, // Only test branches
      excludeTags: ['preserve'], // Don't delete branches with 'preserve' tag
      preservePrimary: true, // Never delete primary branches
      dryRun: false // Set to true to see what would be deleted without actually deleting
    };

    const cleanupResult = await client.cleanupTestBranches(cleanupFilters);
    if (cleanupResult.success) {
      const cleanup = cleanupResult.data!;
      console.log('🧹 Cleanup Results:');
      console.log(`  Deleted: ${cleanup.deleted.length} branches`);
      console.log(`  Failed: ${cleanup.failed.length} branches`);
      console.log(`  Skipped: ${cleanup.skipped.length} branches`);
      
      if (cleanup.deleted.length > 0) {
        console.log(`  Deleted branches: ${cleanup.deleted.join(', ')}`);
      }
    }
  } catch (error) {
    console.error('❌ Error in cleanup example:', error);
  }
}

/**
 * Example 5: Monitoring and Performance Analysis
 */
export async function monitoringExample() {
  const client = getNeonApiClient();
  const logger = getNeonLogger();
  
  console.log('📈 Enhanced Neon API Client - Monitoring Example');

  try {
    // Perform some operations to generate metrics
    await client.listProjects();
    await client.listBranches();
    await client.getBranchStatistics();

    // Get performance metrics
    const metrics = client.getPerformanceMetrics();
    console.log('⚡ Performance Metrics:');
    metrics.forEach(metric => {
      console.log(`  ${metric.operation}:`);
      console.log(`    Count: ${metric.count}`);
      console.log(`    Avg Duration: ${metric.avgDuration}ms`);
      console.log(`    Success Rate: ${(metric.successRate * 100).toFixed(1)}%`);
      console.log(`    Last Executed: ${metric.lastExecuted}`);
    });

    // Get recent logs
    const recentLogs = client.getRecentLogs(10);
    console.log(`📝 Recent Logs (${recentLogs.length}):`);
    recentLogs.forEach(log => {
      const duration = log.duration_ms ? ` (${log.duration_ms}ms)` : '';
      console.log(`  ${log.timestamp} [${log.level.toUpperCase()}] ${log.operation}: ${log.message}${duration}`);
    });

    // Get error summary
    const errorSummary = client.getErrorSummary();
    if (errorSummary.totalErrors > 0) {
      console.log('❌ Error Summary:');
      console.log(`  Total Errors: ${errorSummary.totalErrors}`);
      console.log(`  Errors by Operation:`, errorSummary.errorsByOperation);
    } else {
      console.log('✅ No errors detected');
    }

    // Export monitoring data
    const exportData = client.exportMonitoringData();
    console.log('📦 Exported monitoring data:');
    console.log(`  Logs: ${exportData.logs.length} entries`);
    console.log(`  Metrics: ${exportData.metrics.length} operations`);
    console.log(`  Active Branches: ${exportData.activeBranches.length}`);
    console.log(`  Export Timestamp: ${exportData.exportedAt}`);
  } catch (error) {
    console.error('❌ Error in monitoring example:', error);
  }
}

/**
 * Example 6: Database Migration Testing
 */
export async function migrationTestingExample() {
  const client = getNeonApiClient();
  
  console.log('🔄 Enhanced Neon API Client - Migration Testing Example');

  try {
    await client.withTestBranch(
      {
        testSuite: 'migration-testing',
        purpose: 'schema-validation',
        tags: ['migration', 'schema', 'validation'],
        timeoutMs: 120000
      },
      async (branchInfo) => {
        console.log(`🚀 Testing migration on branch: ${branchInfo.branchName}`);
        
        // Step 1: Create initial schema
        console.log('📝 Step 1: Creating initial schema...');
        const initialSchema = await client.executeTransaction([
          `CREATE SCHEMA IF NOT EXISTS migration_test`,
          `CREATE TABLE migration_test.users (
            id SERIAL PRIMARY KEY,
            email VARCHAR(255) UNIQUE NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
          )`,
          `INSERT INTO migration_test.users (email) VALUES ('test1@example.com'), ('test2@example.com')`
        ], branchInfo.branchId);

        if (!initialSchema.success) {
          throw new Error(`Initial schema creation failed: ${initialSchema.error}`);
        }

        // Step 2: Run migration
        console.log('🔄 Step 2: Running migration...');
        const migration = await client.executeTransaction([
          `ALTER TABLE migration_test.users ADD COLUMN name VARCHAR(100)`,
          `ALTER TABLE migration_test.users ADD COLUMN updated_at TIMESTAMP`,
          `CREATE INDEX idx_users_name ON migration_test.users(name)`,
          `UPDATE migration_test.users SET name = 'User ' || id, updated_at = NOW()`
        ], branchInfo.branchId);

        if (!migration.success) {
          throw new Error(`Migration failed: ${migration.error}`);
        }

        // Step 3: Validate migration
        console.log('✅ Step 3: Validating migration...');
        const validation = await client.executeSql(`
          SELECT 
            column_name, 
            data_type, 
            is_nullable 
          FROM information_schema.columns 
          WHERE table_schema = 'migration_test' 
            AND table_name = 'users'
          ORDER BY ordinal_position
        `, branchInfo.branchId);

        if (!validation.success) {
          throw new Error(`Validation failed: ${validation.error}`);
        }

        console.log('🎉 Migration testing completed successfully');
        return { 
          success: true, 
          branchId: branchInfo.branchId,
          migrationApplied: true 
        };
      }
    );
  } catch (error) {
    console.error('❌ Error in migration testing:', error);
  }
}

/**
 * Example 7: Parallel Test Execution
 */
export async function parallelTestingExample() {
  const client = getNeonApiClient();
  
  console.log('🔀 Enhanced Neon API Client - Parallel Testing Example');

  try {
    // Create multiple test branches in parallel
    const testSuites = ['auth-tests', 'user-tests', 'product-tests'];
    
    const parallelTests = testSuites.map(async (suiteName) => {
      return client.withTestBranch(
        {
          testSuite: suiteName,
          purpose: 'parallel-testing',
          tags: ['parallel', 'isolated'],
          waitForReady: true
        },
        async (branchInfo) => {
          console.log(`🚀 Running ${suiteName} on branch: ${branchInfo.branchName}`);
          
          // Simulate test operations specific to each suite
          const testQueries = [
            `SELECT '${suiteName}' as test_suite, current_database() as database`,
            `SELECT NOW() as test_timestamp`,
            `SELECT pg_backend_pid() as connection_pid`
          ];

          for (const query of testQueries) {
            const result = await client.executeSql(query, branchInfo.branchId);
            if (!result.success) {
              throw new Error(`Query failed in ${suiteName}: ${result.error}`);
            }
          }

          // Simulate some processing time
          await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));
          
          console.log(`✅ ${suiteName} completed successfully`);
          return { 
            suite: suiteName, 
            branch: branchInfo.branchName,
            success: true 
          };
        }
      );
    });

    // Wait for all tests to complete
    const results = await Promise.allSettled(parallelTests);
    
    console.log('📊 Parallel Test Results:');
    results.forEach((result, index) => {
      const suiteName = testSuites[index];
      if (result.status === 'fulfilled') {
        console.log(`  ✅ ${suiteName}: Success`);
      } else {
        console.log(`  ❌ ${suiteName}: Failed - ${result.reason}`);
      }
    });

    const successCount = results.filter(r => r.status === 'fulfilled').length;
    console.log(`🎉 Parallel testing completed: ${successCount}/${testSuites.length} suites passed`);
  } catch (error) {
    console.error('❌ Error in parallel testing:', error);
  }
}

/**
 * Run all examples
 */
export async function runAllExamples() {
  console.log('🚀 Running all Enhanced Neon API Client examples...\n');

  const examples = [
    { name: 'Basic Usage', fn: basicUsageExample },
    { name: 'Test Branch Management', fn: testBranchExample },
    { name: 'Automated Testing', fn: withTestBranchExample },
    { name: 'Cleanup & Maintenance', fn: cleanupMaintenanceExample },
    { name: 'Monitoring & Analytics', fn: monitoringExample },
    { name: 'Migration Testing', fn: migrationTestingExample },
    { name: 'Parallel Testing', fn: parallelTestingExample },
  ];

  for (const example of examples) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Running: ${example.name}`);
    console.log('='.repeat(60));
    
    try {
      await example.fn();
    } catch (error) {
      console.error(`❌ Failed to run ${example.name}:`, error);
    }
    
    // Wait a bit between examples
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n🎉 All examples completed!');
}

// Export for direct usage
export default {
  basicUsageExample,
  testBranchExample,
  withTestBranchExample,
  cleanupMaintenanceExample,
  monitoringExample,
  migrationTestingExample,
  parallelTestingExample,
  runAllExamples
};