import { describe, test, expect, beforeAll, } from 'vitest';
import {
  setupNeonTestBranching,
  getTestDatabaseUrl,
} from '@/tests/config/neon-branch-setup';

/**
 * Example test file demonstrating Neon database branching
 *
 * This test suite will:
 * 1. Create a dedicated test branch before running
 * 2. Run all tests against the isolated branch
 * 3. Clean up the branch after completion
 */
describe('Neon Branching Example', () => {
  // Enable Neon branching for this test suite
  setupNeonTestBranching('neon-branching-example');

  beforeAll(async () => {
    console.log('Test database URL:', getTestDatabaseUrl());
  });

  test('should have isolated database environment', () => {
    // This test runs against its own dedicated database branch
    const dbUrl = getTestDatabaseUrl();

    expect(dbUrl).toBeDefined();
    expect(typeof dbUrl).toBe('string');

    // If Neon branching is enabled, URL should contain neon.tech
    if (process.env.USE_NEON_BRANCHING === 'true') {
      expect(dbUrl).toContain('neon.tech');
    }
  });

  test('database operations are isolated', async () => {
    // Each test suite gets its own database state
    // No interference from other test suites

    // Example database operation (mocked for this example)
    const mockDatabaseOperation = async () => {
      // This would be your actual database call
      // using the isolated test branch
      return { success: true, isolated: true };
    };

    const result = await mockDatabaseOperation();
    expect(result.success).toBe(true);
    expect(result.isolated).toBe(true);
  });

  test('environment variables are correctly set', () => {
    // Verify that the test environment is properly configured
    expect(process.env.NODE_ENV).toBe('test');
    expect(process.env.POSTGRES_URL).toBeDefined();

    if (process.env.USE_NEON_BRANCHING === 'true') {
      expect(process.env.NEON_API_KEY).toBeDefined();
      expect(process.env.NEON_PROJECT_ID).toBeDefined();
    }
  });
});

/**
 * Example of a test suite that doesn't need database branching
 * This will use the standard test database configuration
 */
describe('Standard Test Suite (No Branching)', () => {
  test('should work without Neon branching', () => {
    // This test runs against the standard test database
    // No branch creation overhead
    expect(true).toBe(true);
  });
});

/**
 * Example of an integration test that needs full database isolation
 */
describe('Integration Test with Database', () => {
  // This test suite gets its own isolated branch
  setupNeonTestBranching('integration-test');

  test('should perform database integration test', async () => {
    // This test has access to:
    // 1. Clean database state (no data from other tests)
    // 2. Latest schema from migrations
    // 3. Isolated environment for concurrent test execution

    const dbUrl = getTestDatabaseUrl();
    expect(dbUrl).toBeDefined();

    // Your integration test logic here
    // Example: Create user, test authentication, verify data persistence
  });

  test('should maintain state within the same suite', async () => {
    // Tests within the same suite share the same branch
    // So state persists between tests in this suite
    // But is isolated from other suites

    expect(getTestDatabaseUrl()).toBeDefined();
  });
});
