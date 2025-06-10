import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { beforeEach, afterEach, beforeAll, afterAll, expect } from 'vitest';
import * as schema from '@/lib/db/schema';
import {
  getTestBranchManager,
  withTestBranch,
  type TestBranchInfo,
} from '@/lib/testing/neon-test-branches';
import { type BaseSeeder, DatabaseStateManager } from '../seeds/base-seeder';
import { UnitSeeder } from '../seeds/unit-seeder';
import { E2ESeeder } from '../seeds/e2e-seeder';
import type {
  SeederConfig,
  DatabaseState,
  PerformanceMetrics,
} from '../factories/types';

/**
 * Enhanced test database utilities with Neon branching support
 */
export interface TestDatabaseConfig {
  /** Environment type for seeding */
  environment: 'unit' | 'integration' | 'e2e' | 'performance';
  /** Use Neon branching */
  useNeonBranching?: boolean;
  /** Specific database URL (overrides branching) */
  databaseUrl?: string;
  /** Auto-seed data */
  autoSeed?: boolean;
  /** Seeder configuration */
  seederConfig?: Partial<SeederConfig>;
  /** Enable performance monitoring */
  monitoring?: boolean;
  /** Connection pool size */
  poolSize?: number;
}

export interface TestDatabaseInstance {
  db: ReturnType<typeof drizzle>;
  connection: postgres.Sql;
  branchInfo?: TestBranchInfo;
  seeder?: BaseSeeder;
  stateManager?: DatabaseStateManager;
  metrics: PerformanceMetrics[];
  config: TestDatabaseConfig;
}

/**
 * Global state for test database management
 */
const instances: Map<string, TestDatabaseInstance> = new Map();
const globalCleanupFunctions: (() => Promise<void>)[] = [];

/**
 * Create database instance
 */
async function createDatabaseInstance(
  testName: string,
  config: TestDatabaseConfig,
): Promise<TestDatabaseInstance> {
  let connection: postgres.Sql;
  let branchInfo: TestBranchInfo | undefined;

  // Setup database connection
  if (config.useNeonBranching && !config.databaseUrl) {
    const branchManager = getTestBranchManager();
    branchInfo = await branchManager.createTestBranch(testName);
    connection = postgres(branchInfo.connectionString, {
      max: config.poolSize || 5,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  } else {
    const databaseUrl =
      config.databaseUrl ||
      process.env.TEST_DATABASE_URL ||
      'postgresql://test:test@localhost:5432/test_db';

    connection = postgres(databaseUrl, {
      max: config.poolSize || 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }

  const db = drizzle(connection, { schema });

  // Run migrations
  try {
    await migrate(db, { migrationsFolder: './lib/db/migrations' });
  } catch (error) {
    console.warn('Migration warning:', error);
  }

  // Create seeder if auto-seeding is enabled
  let seeder: BaseSeeder | undefined;
  let stateManager: DatabaseStateManager | undefined;

  if (config.autoSeed) {
    const seederConfig: SeederConfig = {
      environment: config.environment,
      branchId: branchInfo?.branchId,
      databaseUrl: config.databaseUrl || branchInfo?.connectionString,
      clean: true,
      size: 'minimal',
      ...config.seederConfig,
    };

    seeder = createSeederForEnvironment(config.environment, seederConfig);
    stateManager = new DatabaseStateManager(seeder);
  }

  const instance: TestDatabaseInstance = {
    db,
    connection,
    branchInfo,
    seeder,
    stateManager,
    metrics: [],
    config,
  };

  return instance;
}

/**
 * Create appropriate seeder for environment
 */
function createSeederForEnvironment(
  environment: string,
  config: SeederConfig,
): BaseSeeder {
  switch (environment) {
    case 'unit':
      return new UnitSeeder(config);
    case 'e2e':
      return new E2ESeeder(config);
    default:
      return new UnitSeeder(config);
  }
}

/**
 * Setup test database with enhanced features
 */
export async function setupTestDatabase(
  testName: string,
  config: TestDatabaseConfig,
): Promise<TestDatabaseInstance> {
  const instance = await createDatabaseInstance(testName, config);
  instances.set(testName, instance);

  // Auto-seed if requested
  if (config.autoSeed && instance.seeder) {
    console.log(`🌱 Auto-seeding database for ${testName}...`);
    await instance.seeder.seed();
  }

  return instance;
}

/**
 * Get existing test database instance
 */
export function getTestDatabaseInstance(
  testName: string,
): TestDatabaseInstance | undefined {
  return instances.get(testName);
}

/**
 * Create database snapshot for rollback
 */
export async function createDatabaseSnapshot(
  testName: string,
  snapshotName: string,
): Promise<DatabaseState> {
  const instance = instances.get(testName);
  if (!instance?.stateManager) {
    throw new Error(`No state manager found for test ${testName}`);
  }

  return instance.stateManager.captureState(snapshotName);
}

/**
 * Restore database to snapshot
 */
export async function restoreDatabaseSnapshot(
  testName: string,
  snapshotName: string,
): Promise<void> {
  const instance = instances.get(testName);
  if (!instance?.stateManager) {
    throw new Error(`No state manager found for test ${testName}`);
  }

  await instance.stateManager.restoreState(snapshotName);
}

/**
 * Execute in transaction with automatic rollback
 */
export async function withDatabaseTransaction<T>(
  testName: string,
  callback: (db: any) => Promise<T>,
): Promise<T> {
  const instance = instances.get(testName);
  if (!instance) {
    throw new Error(`No database instance found for test ${testName}`);
  }

  return instance.db
    .transaction(async (tx) => {
      const result = await callback(tx);
      // Transaction will auto-rollback if an error is thrown
      throw new Error('TEST_ROLLBACK'); // Force rollback for testing
    })
    .catch((error) => {
      if (error.message === 'TEST_ROLLBACK') {
        // This is expected for test rollbacks
        return undefined as any;
      }
      throw error;
    });
}

/**
 * Execute with isolated test branch
 */
export async function withIsolatedTestBranch<T>(
  testName: string,
  callback: (instance: TestDatabaseInstance) => Promise<T>,
): Promise<T> {
  if (!process.env.NEON_API_KEY || !process.env.NEON_PROJECT_ID) {
    throw new Error('Neon API credentials required for branch testing');
  }

  return withTestBranch(testName, async (connectionString) => {
    const config: TestDatabaseConfig = {
      environment: 'unit',
      databaseUrl: connectionString,
      useNeonBranching: true,
      autoSeed: true,
    };

    const instance = await createDatabaseInstance(
      `${testName}-isolated`,
      config,
    );

    try {
      return await callback(instance);
    } finally {
      await instance.connection.end();
    }
  });
}

/**
 * Clean up test database instance
 */
export async function cleanupTestDatabase(testName: string): Promise<void> {
  const instance = instances.get(testName);
  if (!instance) return;

  try {
    // Close database connection
    await instance.connection.end();

    // Cleanup seeder resources
    if (instance.seeder) {
      await instance.seeder.close();
    }

    // Cleanup branch if using Neon branching
    if (instance.branchInfo && instance.config.useNeonBranching) {
      const branchManager = getTestBranchManager();
      await branchManager.deleteTestBranch(instance.branchInfo.branchId);
    }
  } catch (error) {
    console.warn(`Warning: Cleanup failed for ${testName}:`, error);
  } finally {
    instances.delete(testName);
  }
}

/**
 * Clean up all test databases
 */
export async function cleanupAllTestDatabases(): Promise<void> {
  const cleanupPromises = Array.from(instances.keys()).map((testName) =>
    cleanupTestDatabase(testName),
  );

  await Promise.allSettled(cleanupPromises);

  // Run global cleanup functions
  for (const cleanup of globalCleanupFunctions) {
    try {
      await cleanup();
    } catch (error) {
      console.warn('Global cleanup error:', error);
    }
  }

  globalCleanupFunctions.length = 0;
}

/**
 * Register global cleanup function
 */
export function registerGlobalCleanup(cleanup: () => Promise<void>): void {
  globalCleanupFunctions.push(cleanup);
}

/**
 * Get performance metrics for a test
 */
export function getTestDatabaseMetrics(testName: string): PerformanceMetrics[] {
  const instance = instances.get(testName);
  return instance?.metrics || [];
}

/**
 * Generate performance report
 */
export function generatePerformanceReport(testName: string): any {
  const metrics = getTestDatabaseMetrics(testName);

  if (metrics.length === 0) {
    return { testName, message: 'No metrics available' };
  }

  const summary = metrics.reduce(
    (acc, metric) => ({
      totalOperations: acc.totalOperations + 1,
      totalRows: acc.totalRows + metric.rowCount,
      totalTime: acc.totalTime + metric.executionTime,
      maxMemory: Math.max(acc.maxMemory, metric.memoryUsage),
    }),
    { totalOperations: 0, totalRows: 0, totalTime: 0, maxMemory: 0 },
  );

  return {
    testName,
    summary: {
      ...summary,
      averageTime: summary.totalTime / summary.totalOperations,
      rowsPerSecond: summary.totalRows / (summary.totalTime / 1000),
      memoryMB: Math.round(summary.maxMemory / 1024 / 1024),
    },
    metrics,
  };
}

/**
 * Vitest integration helpers
 */
export function setupTestDatabaseForVitest(
  config: TestDatabaseConfig = { environment: 'unit' },
) {
  let instance: TestDatabaseInstance;

  beforeAll(async () => {
    // Setup global cleanup
    registerGlobalCleanup(async () => {
      // Cleanup any remaining test branches
      if (process.env.NEON_API_KEY) {
        const branchManager = getTestBranchManager();
        await branchManager.cleanupOldTestBranches(1); // Cleanup branches older than 1 hour
      }
    });
  });

  beforeEach(async () => {
    const testName = expect.getState().currentTestName || 'unknown-test';
    instance = await setupTestDatabase(testName, config);
  });

  afterEach(async () => {
    if (instance) {
      const testName = expect.getState().currentTestName || 'unknown-test';
      await cleanupTestDatabase(testName);
    }
  });

  afterAll(async () => {
    await cleanupAllTestDatabases();
  });

  return () => instance;
}

/**
 * Helper for transaction-based tests
 */
export async function withTestTransaction<T>(
  testName: string,
  callback: (db: any) => Promise<T>,
): Promise<T> {
  return withDatabaseTransaction(testName, callback);
}

/**
 * Helper for isolated branch tests
 */
export async function withTestBranchIsolation<T>(
  testName: string,
  callback: (instance: TestDatabaseInstance) => Promise<T>,
): Promise<T> {
  return withIsolatedTestBranch(testName, callback);
}

/**
 * Helper for database state management
 */
export class TestDatabaseState {
  private testName: string;

  constructor(testName: string) {
    this.testName = testName;
  }

  async snapshot(name: string): Promise<DatabaseState> {
    return createDatabaseSnapshot(this.testName, name);
  }

  async restore(name: string): Promise<void> {
    return restoreDatabaseSnapshot(this.testName, name);
  }

  getMetrics(): PerformanceMetrics[] {
    return getTestDatabaseMetrics(this.testName);
  }

  generateReport(): any {
    return generatePerformanceReport(this.testName);
  }
}

/**
 * Performance monitoring decorator
 */
export function withPerformanceMonitoring<
  T extends (...args: any[]) => Promise<any>,
>(fn: T, testName: string): T {
  return (async (...args: any[]) => {
    const startTime = Date.now();
    const startMemory = process.memoryUsage().heapUsed;
    const result = await fn(...args);

    const executionTime = Date.now() - startTime;
    const memoryUsage = process.memoryUsage().heapUsed - startMemory;

    const instance = getTestDatabaseInstance(testName);
    if (instance) {
      instance.metrics.push({
        operationType: 'select', // or determine from function
        tableName: 'test_operation',
        rowCount: 1,
        executionTime,
        memoryUsage,
        cpuUsage: process.cpuUsage().user / 1000,
        timestamp: new Date(),
      });
    }

    return result;
  }) as T;
}
