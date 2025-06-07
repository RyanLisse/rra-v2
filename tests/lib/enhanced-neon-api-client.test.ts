import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Create mock functions outside of the mock to ensure they're available
const mockListProjects = vi.fn();
const mockDescribeProject = vi.fn();
const mockCreateBranch = vi.fn();
const mockDeleteBranch = vi.fn();
const mockGetConnectionString = vi.fn();
const mockRunSql = vi.fn();
const mockRunSqlTransaction = vi.fn();
const mockGetEnvironmentConfig = vi.fn();
const mockValidateEnvironment = vi.fn();
const mockIsMCPAvailable = vi.fn();

// Mock the MCP interface
vi.mock('../../lib/testing/neon-mcp-interface', () => ({
  NeonMCPInterface: {
    listProjects: mockListProjects,
    describeProject: mockDescribeProject,
    createBranch: mockCreateBranch,
    deleteBranch: mockDeleteBranch,
    getConnectionString: mockGetConnectionString,
    runSql: mockRunSql,
    runSqlTransaction: mockRunSqlTransaction,
  },
  EnvironmentUtils: {
    getEnvironmentConfig: mockGetEnvironmentConfig,
    validateEnvironment: mockValidateEnvironment,
    isMCPAvailable: mockIsMCPAvailable,
  },
}));

import {
  EnhancedNeonApiClient,
  getNeonApiClient,
  resetNeonApiClient,
  type BranchCreationOptions,
  type CleanupFilters,
} from '../../lib/testing/neon-api-client';
import { resetNeonLogger } from '../../lib/testing/neon-logger';

describe('EnhancedNeonApiClient', () => {
  let client: EnhancedNeonApiClient;

  beforeEach(() => {
    // Reset singletons
    resetNeonApiClient();
    resetNeonLogger();

    // Reset and setup mocks
    vi.clearAllMocks();

    // Setup default mock implementations
    mockListProjects.mockResolvedValue({
      projects: [
        {
          id: 'test-project-123',
          name: 'test-project',
          platform_id: 'aws',
          region_id: 'us-east-1',
          pg_version: 17,
          proxy_host: 'test.neon.tech',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
          owner_id: 'test-owner',
        },
      ],
    });

    mockDescribeProject.mockResolvedValue({
      id: 'test-project-123',
      name: 'test-project',
      branches: [
        {
          id: 'br-main-123',
          project_id: 'test-project-123',
          name: 'main',
          current_state: 'ready',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
          primary: true,
        },
      ],
    });

    mockCreateBranch.mockResolvedValue({
      branch: {
        id: 'br-test-456',
        project_id: 'test-project-123',
        name: 'test-branch',
        current_state: 'ready',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        primary: false,
      },
    });

    mockDeleteBranch.mockResolvedValue(undefined);

    mockGetConnectionString.mockResolvedValue({
      connection_string:
        'postgresql://user:pass@test.neon.tech/testdb?sslmode=require',
    });

    mockRunSql.mockResolvedValue({
      query: 'SELECT 1',
      result: 'Success',
      rows_affected: 1,
    });

    mockRunSqlTransaction.mockResolvedValue({
      statements: ['SELECT 1', 'SELECT 2'],
      results: [{ rows_affected: 1 }, { rows_affected: 1 }],
      transaction_status: 'committed',
    });

    mockGetEnvironmentConfig.mockReturnValue({
      isBrowser: false,
      isTest: true,
      isProduction: false,
      hasNeonCredentials: true,
    });

    mockValidateEnvironment.mockReturnValue({
      valid: true,
      missing: [],
    });

    mockIsMCPAvailable.mockReturnValue(true);

    // Create fresh client for each test
    client = new EnhancedNeonApiClient({
      defaultProjectId: 'test-project-123',
      defaultDatabase: 'testdb',
      defaultRole: 'testuser',
      rateLimitConfig: {
        maxRequestsPerMinute: 100,
        burstLimit: 20,
      },
      retryConfig: {
        maxRetries: 2,
        baseDelayMs: 100,
        maxDelayMs: 1000,
      },
      cleanupConfig: {
        maxBranchAgeHours: 1,
        autoCleanupEnabled: true,
        preserveTaggedBranches: true,
      },
    });
  });

  afterEach(() => {
    // Clean up any active branches
    client.cleanupAllActiveBranches().catch(() => {
      // Ignore cleanup errors in tests
    });
  });

  describe('Project Management', () => {
    it('should list projects successfully', async () => {
      const result = await client.listProjects();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data?.[0].id).toBe('test-project-123');
      expect(result.metadata.operation).toBe('list_projects');
      expect(result.metadata.duration_ms).toBeGreaterThan(0);
    });

    it('should get project details successfully', async () => {
      const result = await client.getProject('test-project-123');

      expect(result.success).toBe(true);
      expect(result.data?.id).toBe('test-project-123');
      expect(result.data?.name).toBe('test-project');
      expect(result.metadata.operation).toBe('get_project');
    });

    it('should list branches for a project', async () => {
      const result = await client.listBranches('test-project-123');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data?.[0].name).toBe('main');
      expect(result.data?.[0].primary).toBe(true);
    });
  });

  describe('Branch Management', () => {
    it('should create a test branch successfully', async () => {
      const options: BranchCreationOptions = {
        testSuite: 'unit-test',
        purpose: 'testing',
        tags: ['automated', 'ci'],
        database: 'testdb',
        role: 'testuser',
        waitForReady: false,
        timeoutMs: 30000,
      };

      const result = await client.createTestBranch(options);

      expect(result.success).toBe(true);
      expect(result.data?.branchName).toMatch(/^test-unit-test-/);
      expect(result.data?.connectionString).toContain('postgresql://');
      expect(result.data?.metadata.testSuite).toBe('unit-test');
      expect(result.data?.metadata.purpose).toBe('testing');
      expect(result.data?.metadata.tags).toContain('automated');
      expect(result.data?.metadata.tags).toContain('ci');
      expect(result.data?.metadata.tags).toContain('test');
    });

    it('should delete a test branch successfully', async () => {
      // First create a branch
      const createResult = await client.createTestBranch({
        testSuite: 'delete-test',
        waitForReady: false,
      });

      expect(createResult.success).toBe(true);
      const branchName = createResult.data?.branchName;

      // Then delete it
      const deleteResult = await client.deleteTestBranch(branchName);

      expect(deleteResult.success).toBe(true);
      expect(client.getActiveBranches()).toHaveLength(0);
    });

    it('should handle branch creation with automatic cleanup', async () => {
      const testData = { value: 'test' };

      const result = await client.withTestBranch(
        {
          testSuite: 'with-test-branch',
          purpose: 'temporary-testing',
        },
        async (branchInfo) => {
          expect(branchInfo.branchName).toMatch(/^test-with-test-branch-/);
          expect(branchInfo.connectionString).toContain('postgresql://');
          return testData;
        },
      );

      expect(result).toEqual(testData);
      expect(client.getActiveBranches()).toHaveLength(0);
    });
  });

  describe('Database Operations', () => {
    it('should execute SQL successfully', async () => {
      const sql = 'SELECT * FROM users LIMIT 10';
      const result = await client.executeSql(sql, 'br-test-456', 'testdb');

      expect(result.success).toBe(true);
      expect(result.data?.query).toBe(sql);
      expect(result.data?.result).toBe('Success');
      expect(result.metadata.operation).toBe('execute_sql');
    });

    it('should execute SQL transaction successfully', async () => {
      const statements = [
        'BEGIN',
        "INSERT INTO users (name) VALUES ('test')",
        'COMMIT',
      ];

      const result = await client.executeTransaction(statements, 'br-test-456');

      expect(result.success).toBe(true);
      expect(result.data?.statements).toEqual(statements);
      expect(result.data?.transaction_status).toBe('committed');
    });

    it('should get connection string successfully', async () => {
      const result = await client.getConnectionString(
        'br-test-456',
        'testdb',
        'testuser',
      );

      expect(result.success).toBe(true);
      expect(result.data).toContain('postgresql://');
      expect(result.data).toContain('testdb');
    });
  });

  describe('Monitoring and Analytics', () => {
    it('should track operation logs', async () => {
      await client.listProjects();
      await client.getProject();

      const logs = client.getOperationLogs();
      expect(logs).toHaveLength(2);
      expect(logs[0].metadata.operation).toBe('list_projects');
      expect(logs[1].metadata.operation).toBe('get_project');
    });

    it('should provide performance metrics', async () => {
      // Perform some operations
      await client.listProjects();
      await client.listBranches();

      const metrics = client.getPerformanceMetrics();
      expect(metrics.length).toBeGreaterThan(0);

      const listProjectsMetric = metrics.find(
        (m) => m.operation === 'list_projects',
      );
      expect(listProjectsMetric).toBeDefined();
      expect(listProjectsMetric?.count).toBe(1);
      expect(listProjectsMetric?.avgDuration).toBeGreaterThan(0);
      expect(listProjectsMetric?.successRate).toBe(1);
    });

    it('should track errors and provide error summary', async () => {
      // Mock an error using our mock function
      mockListProjects.mockRejectedValueOnce(new Error('Test error'));

      const result = await client.listProjects();
      expect(result.success).toBe(false);

      const errorSummary = client.getErrorSummary();
      expect(errorSummary.totalErrors).toBe(1);
      expect(errorSummary.errorsByOperation.list_projects).toBe(1);
      expect(errorSummary.recentErrors).toHaveLength(1);
    });

    it('should export monitoring data', async () => {
      await client.listProjects();
      await client.createTestBranch({
        testSuite: 'export-test',
        waitForReady: false,
      });

      const exportData = client.exportMonitoringData();

      expect(exportData.logs).toBeDefined();
      expect(exportData.metrics).toBeDefined();
      expect(exportData.operationLogs).toBeDefined();
      expect(exportData.activeBranches).toHaveLength(1);
      expect(exportData.config.defaultProjectId).toBe('test-project-123');
      expect(exportData.exportedAt).toBeDefined();
    });
  });

  describe('Branch Statistics and Cleanup', () => {
    it('should get branch statistics', async () => {
      const stats = await client.getBranchStatistics();

      expect(stats.success).toBe(true);
      expect(stats.data?.total_branches).toBe(1);
      expect(stats.data?.test_branches).toBe(0);
      expect(stats.data?.active_branches).toBe(1);
      expect(stats.data?.total_size_bytes).toBeGreaterThanOrEqual(0);
    });

    it('should cleanup test branches with filters', async () => {
      // Create some test branches first
      await client.createTestBranch({
        testSuite: 'cleanup-test-1',
        waitForReady: false,
      });
      await client.createTestBranch({
        testSuite: 'cleanup-test-2',
        waitForReady: false,
      });

      const filters: CleanupFilters = {
        maxAgeHours: 0, // Very short age to trigger cleanup
        namePattern: /^test-cleanup-/,
        dryRun: true,
      };

      const result = await client.cleanupTestBranches(filters);

      expect(result.success).toBe(true);
      expect(result.data?.skipped.length).toBeGreaterThan(0);
    });
  });

  describe('Rate Limiting and Retry Logic', () => {
    it('should handle rate limiting gracefully', async () => {
      // Create a client with very restrictive rate limits
      const restrictedClient = new EnhancedNeonApiClient({
        rateLimitConfig: {
          maxRequestsPerMinute: 1,
          burstLimit: 1,
        },
      });

      // First request should succeed immediately
      const start = Date.now();
      const result1 = await restrictedClient.listProjects();
      const firstRequestTime = Date.now() - start;

      expect(result1.success).toBe(true);
      expect(firstRequestTime).toBeLessThan(100); // Should be fast
    });

    it('should retry failed operations', async () => {
      // Mock to fail twice then succeed
      mockListProjects
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          projects: [
            {
              id: 'test-project-123',
              name: 'test-project',
              platform_id: 'aws',
              region_id: 'us-east-1',
              pg_version: 17,
              proxy_host: 'test.neon.tech',
              created_at: '2025-01-01T00:00:00Z',
              updated_at: '2025-01-01T00:00:00Z',
              owner_id: 'test-owner',
            },
          ],
        });

      const result = await client.listProjects();

      expect(result.success).toBe(true);
      expect(mockListProjects).toHaveBeenCalledTimes(3);
    });
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance when using getNeonApiClient', () => {
      const client1 = getNeonApiClient();
      const client2 = getNeonApiClient();

      expect(client1).toBe(client2);
    });

    it('should create new instance after reset', () => {
      const client1 = getNeonApiClient();
      resetNeonApiClient();
      const client2 = getNeonApiClient();

      expect(client1).not.toBe(client2);
    });
  });

  describe('Error Handling', () => {
    it('should handle MCP interface errors gracefully', async () => {
      mockListProjects.mockRejectedValueOnce(new Error('MCP error'));

      const result = await client.listProjects();

      expect(result.success).toBe(false);
      expect(result.error).toContain('MCP error');
      expect(result.metadata.operation).toBe('list_projects');
      expect(result.metadata.duration_ms).toBeGreaterThan(0);
    });

    it('should handle branch creation failures', async () => {
      mockCreateBranch.mockRejectedValueOnce(
        new Error('Branch creation failed'),
      );

      const result = await client.createTestBranch({
        testSuite: 'failing-test',
        waitForReady: false,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Branch creation failed');
      expect(client.getActiveBranches()).toHaveLength(0);
    });
  });
});
