/**
 * Enhanced Test Template
 *
 * Copy this template to create new tests using the enhanced Neon infrastructure.
 * Replace the template placeholders with your specific test requirements.
 *
 * Template placeholders:
 * - TEST_SUITE_NAME: Name of your test suite (e.g., 'user-management', 'document-processing')
 * - TEST_PURPOSE: Brief description of what you're testing (e.g., 'api-endpoints', 'business-logic')
 * - TEST_TAGS: Array of tags for categorization (e.g., ['api', 'integration', 'performance'])
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getNeonApiClient } from '@/lib/testing/neon-api-client';
import { TestDataFactory } from '../utils/enhanced-test-factories';
import { NeonTestUtils } from '../utils/neon-test-utils';
import { measurePerformance } from '../utils/test-helpers';
import type { TestBranchInfo } from '@/lib/testing/neon-api-client';

/**
 * [TEMPLATE] Replace with your test suite description
 * Enhanced Test Suite: TEST_SUITE_NAME
 * Purpose: TEST_PURPOSE
 * Tags: TEST_TAGS
 */
describe('TEST_SUITE_NAME (Enhanced)', () => {
  // Test infrastructure
  let testBranch: TestBranchInfo | null = null;
  let neonClient: ReturnType<typeof getNeonApiClient>;
  let testUtils: NeonTestUtils;
  let factory: TestDataFactory;

  beforeEach(async () => {
    // Initialize enhanced testing infrastructure
    neonClient = getNeonApiClient();
    testUtils = new NeonTestUtils(neonClient);
    factory = new TestDataFactory();

    // Create isolated test branch for each test
    const branchResult = await neonClient.createTestBranch({
      testSuite: 'TEST_SUITE_NAME',
      purpose: 'TEST_PURPOSE',
      tags: ['TEST_TAGS'], // Replace with actual tags
      waitForReady: true,
      timeoutMs: 60000, // Adjust timeout as needed
    });

    if (branchResult.success && branchResult.data) {
      testBranch = branchResult.data;

      // Set up database connection for this test
      process.env.POSTGRES_URL = testBranch.connectionString;

      // Initialize test schema and seed data
      await testUtils.setupTestSchema(testBranch.branchId);
      await testUtils.seedBasicData(testBranch.branchId);
    } else {
      throw new Error(`Failed to create test branch: ${branchResult.error}`);
    }
  });

  afterEach(async () => {
    // Cleanup test branch
    if (testBranch) {
      await neonClient
        .deleteTestBranch(testBranch.branchName)
        .catch((error) =>
          console.warn('Failed to cleanup test branch:', error),
        );
      testBranch = null;
    }

    // Reset factory to clear internal state
    factory.reset();
  });

  describe('Basic Functionality Tests', () => {
    it('should demonstrate basic test patterns', async () => {
      if (!testBranch) throw new Error('Test branch not available');

      // 1. Create test data using factory
      const user = factory.createUser({
        email: 'test@example.com',
        name: 'Test User',
      });

      // 2. Insert data into isolated test database
      const insertResult = await testUtils.insertUser(
        user,
        testBranch.branchId,
      );
      expect(insertResult.success).toBe(true);

      // 3. Test your business logic here
      // ... your test code ...

      // 4. Verify database state
      const verifyResult = await neonClient.executeSql(
        `SELECT id, email, name FROM users WHERE email = '${user.email}'`,
        testBranch.branchId,
      );

      expect(verifyResult.success).toBe(true);
      expect(verifyResult.data?.results).toHaveLength(1);
      expect(verifyResult.data?.results?.[0]?.email).toBe(user.email);
    });

    it('should handle error conditions gracefully', async () => {
      if (!testBranch) throw new Error('Test branch not available');

      // Test error handling with invalid operations
      const errorResult = await neonClient.executeSql(
        'SELECT * FROM non_existent_table',
        testBranch.branchId,
      );

      expect(errorResult.success).toBe(false);
      expect(errorResult.error).toContain('does not exist');

      // Verify system recovery
      const recoveryResult = await neonClient.executeSql(
        'SELECT 1 as test_value',
        testBranch.branchId,
      );

      expect(recoveryResult.success).toBe(true);
      expect(recoveryResult.data?.results?.[0]?.test_value).toBe(1);
    });
  });

  describe('Performance and Scaling Tests', () => {
    it('should measure operation performance', async () => {
      if (!testBranch) throw new Error('Test branch not available');

      // Measure performance of operations
      const { result, duration, memoryUsage } = await measurePerformance(
        async () => {
          // Create and insert test data
          const users = factory.createUsers(10);
          return testUtils.insertUsers(users, testBranch!.branchId);
        },
      );

      // Performance assertions
      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(10000); // Under 10 seconds
      expect(memoryUsage.heapUsed).toBeLessThan(100 * 1024 * 1024); // Under 100MB

      // Store performance metrics
      await neonClient.executeSql(
        `INSERT INTO performance_metrics 
         (test_suite, operation, avg_duration_ms, success_rate, sample_size, created_at)
         VALUES 
         ('TEST_SUITE_NAME', 'batch_user_insert', ${duration}, 1.0, 10, NOW())`,
        testBranch.branchId,
      );
    });

    it('should handle concurrent operations', async () => {
      if (!testBranch) throw new Error('Test branch not available');

      const user = factory.createUser();
      await testUtils.insertUser(user, testBranch.branchId);

      // Test concurrent operations
      const { duration } = await measurePerformance(async () => {
        const operations = Array.from({ length: 5 }, (_, i) =>
          neonClient.executeSql(
            `INSERT INTO rag_documents (id, user_id, name, original_name, mime_type, size, checksum, created_at, updated_at)
             VALUES ('${factory.createDocument(user.id).id}', '${user.id}', 'Doc ${i}', 'doc${i}.pdf', 'application/pdf', 1000, 'hash${i}', NOW(), NOW())`,
            testBranch!.branchId,
          ),
        );

        const results = await Promise.all(operations);
        return results.every((r) => r.success);
      });

      expect(duration).toBeLessThan(15000); // Concurrent operations under 15 seconds

      // Verify all operations succeeded
      const countResult = await neonClient.executeSql(
        `SELECT COUNT(*) as count FROM rag_documents WHERE user_id = '${user.id}'`,
        testBranch.branchId,
      );

      expect(parseInt(countResult.data?.results?.[0]?.count || '0')).toBe(5);
    });
  });

  describe('Data Integrity Tests', () => {
    it('should maintain referential integrity', async () => {
      if (!testBranch) throw new Error('Test branch not available');

      // Create complete test dataset with relationships
      const testData = factory.createTestDataSet({
        userCount: 2,
        documentsPerUser: 3,
        chunksPerDocument: 10,
        withEmbeddings: true,
        withSessions: true,
      });

      // Insert all related data
      await testUtils.insertTestDataSet(testData, testBranch.branchId);

      // Verify data integrity
      const integrityResult = await testUtils.verifyDataIntegrity(
        testBranch.branchId,
      );
      expect(integrityResult.success).toBe(true);

      // All integrity checks should pass
      const checks = integrityResult.data?.results || [];
      checks.forEach((check: any) => {
        expect(check.status).toBe('PASS');
        expect(parseInt(check.count)).toBe(0);
      });

      // Test cascading deletes
      const firstUser = testData.users[0];
      await neonClient.executeSql(
        `DELETE FROM users WHERE id = '${firstUser.id}'`,
        testBranch.branchId,
      );

      // Verify cascade worked
      const remainingDocsResult = await neonClient.executeSql(
        `SELECT COUNT(*) as count FROM rag_documents WHERE user_id = '${firstUser.id}'`,
        testBranch.branchId,
      );

      expect(
        parseInt(remainingDocsResult.data?.results?.[0]?.count || '0'),
      ).toBe(0);
    });

    it('should handle transaction rollbacks properly', async () => {
      if (!testBranch) throw new Error('Test branch not available');

      const user = factory.createUser();
      await testUtils.insertUser(user, testBranch.branchId);

      // Attempt transaction with intentional error
      const transactionResult = await neonClient.executeTransaction(
        [
          `INSERT INTO rag_documents (id, user_id, name, original_name, mime_type, size, checksum, created_at, updated_at)
         VALUES ('${factory.createDocument(user.id).id}', '${user.id}', 'Doc 1', 'doc1.pdf', 'application/pdf', 1000, 'hash1', NOW(), NOW())`,
          'INSERT INTO invalid_table (id) VALUES (1)', // This will fail
          `INSERT INTO rag_documents (id, user_id, name, original_name, mime_type, size, checksum, created_at, updated_at)
         VALUES ('${factory.createDocument(user.id).id}', '${user.id}', 'Doc 2', 'doc2.pdf', 'application/pdf', 2000, 'hash2', NOW(), NOW())`,
        ],
        testBranch.branchId,
      );

      expect(transactionResult.success).toBe(false);

      // Verify rollback - no documents should exist
      const countResult = await neonClient.executeSql(
        `SELECT COUNT(*) as count FROM rag_documents WHERE user_id = '${user.id}'`,
        testBranch.branchId,
      );

      expect(parseInt(countResult.data?.results?.[0]?.count || '0')).toBe(0);
    });
  });

  describe('Resource Management Tests', () => {
    it('should manage memory efficiently', async () => {
      if (!testBranch) throw new Error('Test branch not available');

      // Test memory usage with large operations
      const { memoryUsage } = await measurePerformance(async () => {
        const user = factory.createUser();
        await testUtils.insertUser(user, testBranch!.branchId);

        // Create large dataset
        for (let i = 0; i < 10; i++) {
          const document = factory.createDocument(user.id, {
            name: `Doc ${i}`,
          });
          await testUtils.insertDocument(document, testBranch!.branchId);

          const chunks = factory.createDocumentChunks(document.id, 50);
          await testUtils.insertDocumentChunks(chunks, testBranch!.branchId);
        }
      });

      // Memory should stay within reasonable bounds
      expect(memoryUsage.heapUsed).toBeLessThan(200 * 1024 * 1024); // Under 200MB
    });

    it('should clean up resources properly', async () => {
      if (!testBranch) throw new Error('Test branch not available');

      const user = factory.createUser();
      await testUtils.insertUser(user, testBranch.branchId);

      // Create test data
      const document = factory.createDocument(user.id);
      await testUtils.insertDocument(document, testBranch.branchId);

      // Verify data exists
      const initialCount = await neonClient.executeSql(
        'SELECT COUNT(*) as count FROM rag_documents',
        testBranch.branchId,
      );
      expect(parseInt(initialCount.data?.results?.[0]?.count || '0')).toBe(1);

      // Clean up test data
      await testUtils.cleanupTestData(testBranch.branchId);

      // Verify cleanup
      const finalCount = await neonClient.executeSql(
        'SELECT COUNT(*) as count FROM rag_documents',
        testBranch.branchId,
      );
      expect(parseInt(finalCount.data?.results?.[0]?.count || '0')).toBe(0);
    });
  });

  describe('Advanced Usage Patterns', () => {
    it('should use the withTestBranch utility for automatic cleanup', async () => {
      // This pattern automatically creates and cleans up a test branch
      const result = await neonClient.withTestBranch(
        {
          testSuite: 'advanced-usage',
          purpose: 'utility-pattern-demo',
          tags: ['utility', 'advanced'],
        },
        async (branchInfo) => {
          // Set up schema in the temporary branch
          await testUtils.setupTestSchema(branchInfo.branchId);

          // Create and test with data
          const user = factory.createUser();
          await testUtils.insertUser(user, branchInfo.branchId);

          const userCheck = await neonClient.executeSql(
            `SELECT COUNT(*) as count FROM users WHERE id = '${user.id}'`,
            branchInfo.branchId,
          );

          return {
            branchId: branchInfo.branchId,
            userExists:
              parseInt(userCheck.data?.results?.[0]?.count || '0') === 1,
          };
        },
      );

      expect(result.userExists).toBe(true);
      // Branch is automatically cleaned up after the function completes
    });

    it('should collect and analyze performance metrics', async () => {
      if (!testBranch) throw new Error('Test branch not available');

      const user = factory.createUser();
      await testUtils.insertUser(user, testBranch.branchId);

      // Perform multiple operations and collect metrics
      const operations = ['insert', 'select', 'update', 'delete'];
      const metrics = [];

      for (const operation of operations) {
        const { duration } = await measurePerformance(async () => {
          switch (operation) {
            case 'insert':
              const doc = factory.createDocument(user.id);
              return testUtils.insertDocument(doc, testBranch!.branchId);

            case 'select':
              return neonClient.executeSql(
                `SELECT * FROM rag_documents WHERE user_id = '${user.id}'`,
                testBranch!.branchId,
              );

            case 'update':
              return neonClient.executeSql(
                `UPDATE rag_documents SET name = 'Updated' WHERE user_id = '${user.id}'`,
                testBranch!.branchId,
              );

            case 'delete':
              return neonClient.executeSql(
                `DELETE FROM rag_documents WHERE user_id = '${user.id}'`,
                testBranch!.branchId,
              );
          }
        });

        metrics.push({
          operation,
          duration,
          timestamp: new Date().toISOString(),
        });
      }

      // Analyze metrics
      const avgDuration =
        metrics.reduce((sum, m) => sum + m.duration, 0) / metrics.length;
      const maxDuration = Math.max(...metrics.map((m) => m.duration));

      expect(avgDuration).toBeLessThan(5000); // Average under 5 seconds
      expect(maxDuration).toBeLessThan(10000); // Max under 10 seconds

      // Store metrics for reporting
      for (const metric of metrics) {
        await neonClient.executeSql(
          `INSERT INTO performance_metrics 
           (test_suite, operation, avg_duration_ms, success_rate, sample_size, metadata, created_at)
           VALUES 
           ('TEST_SUITE_NAME', '${metric.operation}', ${metric.duration}, 1.0, 1, '${JSON.stringify(metric)}', NOW())`,
          testBranch.branchId,
        );
      }
    });
  });
});

/**
 * Template Usage Instructions:
 *
 * 1. Copy this file to your test directory
 * 2. Replace all template placeholders:
 *    - TEST_SUITE_NAME → your actual test suite name
 *    - TEST_PURPOSE → description of what you're testing
 *    - TEST_TAGS → relevant tags as array
 *
 * 3. Customize the test cases for your specific needs:
 *    - Add your business logic tests
 *    - Modify performance expectations
 *    - Add domain-specific test patterns
 *
 * 4. Configure environment variables if needed:
 *    - Set appropriate timeouts
 *    - Adjust performance thresholds
 *    - Configure cleanup settings
 *
 * 5. Run your tests:
 *    npm test your-test-file.test.ts
 *
 * Example customizations:
 *
 * For API tests:
 * - Add HTTP request testing
 * - Test authentication flows
 * - Validate response formats
 *
 * For business logic tests:
 * - Test domain rules and validations
 * - Test state transitions
 * - Test edge cases and error conditions
 *
 * For integration tests:
 * - Test component interactions
 * - Test data flow between layers
 * - Test external service integration
 *
 * For performance tests:
 * - Add load testing scenarios
 * - Test memory usage patterns
 * - Test concurrent operation handling
 */
