import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { eq, isNull } from 'drizzle-orm';
import * as schema from '@/lib/db/schema';
import type {
  SeederConfig,
  SeederResult,
  DatabaseSnapshot,
  DatabaseState,
  PerformanceMetrics,
} from '../factories/types';

/**
 * Base seeder class providing common functionality for all seeders
 */
export abstract class BaseSeeder {
  protected db!: ReturnType<typeof drizzle>;
  protected connection!: postgres.Sql;
  protected config: SeederConfig;
  protected metrics: PerformanceMetrics[] = [];

  constructor(config: SeederConfig) {
    this.config = config;
    this.initializeDatabase();
  }

  /**
   * Abstract method to be implemented by specific seeders
   */
  abstract seed(): Promise<SeederResult>;

  /**
   * Run migrations on the database
   */
  async runMigrations(): Promise<void> {
    const startTime = Date.now();

    try {
      await migrate(this.db, { migrationsFolder: './lib/db/migrations' });

      const executionTime = Date.now() - startTime;
      this.recordMetrics('migration', 'schema', 0, executionTime);

      console.log(`✓ Migrations completed in ${executionTime}ms`);
    } catch (error) {
      console.error('✗ Migration failed:', error);
      throw error;
    }
  }

  /**
   * Clean database by truncating all tables in correct order
   */
  async cleanDatabase(): Promise<void> {
    const startTime = Date.now();

    try {
      // Order matters due to foreign key constraints
      const tablesToClean = [
        'DocumentEmbedding',
        'DocumentChunk',
        'DocumentContent',
        'DocumentImage',
        'RAGDocument',
        'RateLimitLog',
        'Suggestion',
        'Document',
        'Vote_v2',
        'Vote',
        'Message_v2',
        'Message',
        'Stream',
        'Chat',
        'Session',
        'Account',
        'User',
      ];

      for (const tableName of tablesToClean) {
        const table = schema[tableName.toLowerCase() as keyof typeof schema];
        if (table) {
          await this.db.delete(table as any);
        }
      }

      const executionTime = Date.now() - startTime;
      this.recordMetrics(
        'delete',
        'all_tables',
        tablesToClean.length,
        executionTime,
      );

      console.log(`✓ Database cleaned in ${executionTime}ms`);
    } catch (error) {
      console.error('✗ Database cleanup failed:', error);
      throw error;
    }
  }

  /**
   * Create a database snapshot for rollback purposes
   */
  async createSnapshot(): Promise<DatabaseSnapshot> {
    const startTime = Date.now();

    try {
      const tables = await this.getTableCounts();

      const snapshot: DatabaseSnapshot = {
        id: `snapshot_${Date.now()}`,
        branchId: this.config.branchId,
        timestamp: new Date(),
        tables,
        metadata: {
          environment: this.config.environment,
          size: this.config.size,
          scenarios: this.config.scenarios,
        },
      };

      const executionTime = Date.now() - startTime;
      this.recordMetrics(
        'select',
        'snapshot',
        Object.keys(tables).length,
        executionTime,
      );

      console.log(`✓ Snapshot created: ${snapshot.id}`);
      return snapshot;
    } catch (error) {
      console.error('✗ Snapshot creation failed:', error);
      throw error;
    }
  }

  /**
   * Restore database to a specific snapshot state
   */
  async restoreSnapshot(snapshot: DatabaseSnapshot): Promise<void> {
    console.log(`🔄 Restoring to snapshot: ${snapshot.id}`);

    // For now, we'll clean and re-seed
    // In a production system, you might want to implement point-in-time recovery
    await this.cleanDatabase();

    console.log(`✓ Restored to snapshot: ${snapshot.id}`);
  }

  /**
   * Get row counts for all tables
   */
  async getTableCounts(): Promise<Record<string, number>> {
    const tables = {
      users: schema.user,
      sessions: schema.session,
      accounts: schema.account,
      chats: schema.chat,
      messages: schema.message,
      votes: schema.vote,
      documents: schema.document,
      suggestions: schema.suggestion,
      streams: schema.stream,
      ragDocuments: schema.ragDocument,
      documentContent: schema.documentContent,
      documentChunks: schema.documentChunk,
      documentImages: schema.documentImage,
      documentEmbeddings: schema.documentEmbedding,
      rateLimitLogs: schema.rateLimitLog,
    };

    const counts: Record<string, number> = {};

    for (const [name, table] of Object.entries(tables)) {
      try {
        const result = await this.db.select().from(table as any);
        counts[name] = result.length;
      } catch (error) {
        console.warn(`Could not count table ${name}:`, error);
        counts[name] = 0;
      }
    }

    return counts;
  }

  /**
   * Verify database state and constraints
   */
  async verifyDatabaseState(): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];

    try {
      // Check foreign key constraints
      const orphanedChunks = await this.db
        .select({ 
          chunkId: schema.documentChunk.id,
          documentId: schema.ragDocument.id
        })
        .from(schema.documentChunk)
        .leftJoin(
          schema.ragDocument, 
          eq(schema.documentChunk.documentId, schema.ragDocument.id)
        )
        .where(isNull(schema.ragDocument.id));

      if (orphanedChunks.length > 0) {
        issues.push(`Found ${orphanedChunks.length} orphaned document chunks`);
      }

      // Check for missing embeddings
      const chunksWithoutEmbeddings = await this.db
        .select({ 
          chunkId: schema.documentChunk.id,
          embeddingId: schema.documentEmbedding.id
        })
        .from(schema.documentChunk)
        .leftJoin(
          schema.documentEmbedding, 
          eq(schema.documentChunk.id, schema.documentEmbedding.chunkId)
        )
        .where(isNull(schema.documentEmbedding.id));

      if (chunksWithoutEmbeddings.length > 0) {
        issues.push(
          `Found ${chunksWithoutEmbeddings.length} chunks without embeddings`,
        );
      }

      // Check for invalid data
      const users = await this.db.select().from(schema.user).limit(10);
      const invalidUsers = users.filter(
        (user) => !user.email && !user.isAnonymous,
      );

      if (invalidUsers.length > 0) {
        issues.push(
          `Found ${invalidUsers.length} invalid users (no email and not anonymous)`,
        );
      }
    } catch (error) {
      issues.push(`Database verification failed: ${error}`);
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * Get database connection info
   */
  getDatabaseInfo(): { url: string; branchId?: string; environment: string } {
    return {
      url: this.config.databaseUrl || 'default',
      branchId: this.config.branchId,
      environment: this.config.environment,
    };
  }

  /**
   * Get seeding metrics
   */
  getMetrics(): PerformanceMetrics[] {
    return [...this.metrics];
  }

  /**
   * Clear metrics
   */
  clearMetrics(): void {
    this.metrics = [];
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    if (this.connection) {
      await this.connection.end();
    }
  }

  /**
   * Initialize database connection
   */
  protected initializeDatabase(): void {
    const databaseUrl =
      this.config.databaseUrl ||
      process.env.TEST_DATABASE_URL ||
      process.env.DATABASE_URL ||
      'postgresql://test:test@localhost:5432/test_db';

    this.connection = postgres(databaseUrl, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });

    this.db = drizzle(this.connection, { schema });

    console.log(
      `📊 Database initialized: ${this.config.environment} environment`,
    );
    if (this.config.branchId) {
      console.log(`🌿 Branch ID: ${this.config.branchId}`);
    }
  }

  /**
   * Record performance metrics
   */
  protected recordMetrics(
    operationType: PerformanceMetrics['operationType'] | 'migration',
    tableName: string,
    rowCount: number,
    executionTime: number,
  ): void {
    const metrics: PerformanceMetrics = {
      operationType: operationType as PerformanceMetrics['operationType'],
      tableName,
      rowCount,
      executionTime,
      memoryUsage: process.memoryUsage().heapUsed,
      cpuUsage: process.cpuUsage().user / 1000, // Convert to milliseconds
      timestamp: new Date(),
    };

    this.metrics.push(metrics);
  }

  /**
   * Batch insert with performance monitoring
   */
  protected async batchInsert<T>(
    table: any,
    data: T[],
    batchSize = 1000,
  ): Promise<void> {
    const tableName = table._.name || 'unknown';
    const totalRows = data.length;
    let insertedRows = 0;

    console.log(
      `📥 Inserting ${totalRows} rows into ${tableName} (batch size: ${batchSize})`,
    );

    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);
      const startTime = Date.now();

      try {
        await this.db.insert(table).values(batch);
        const executionTime = Date.now() - startTime;

        insertedRows += batch.length;
        this.recordMetrics('insert', tableName, batch.length, executionTime);

        console.log(
          `  ✓ Inserted batch ${Math.ceil((i + 1) / batchSize)}/${Math.ceil(totalRows / batchSize)} (${insertedRows}/${totalRows} rows)`,
        );
      } catch (error) {
        console.error(`  ✗ Batch insert failed for ${tableName}:`, error);
        throw error;
      }
    }

    console.log(
      `✅ Completed inserting ${insertedRows} rows into ${tableName}`,
    );
  }

  /**
   * Helper to generate seeder result
   */
  protected generateResult(
    success: boolean,
    rowsCreated: Record<string, number>,
    errors?: Error[],
  ): SeederResult {
    const totalTime = this.metrics.reduce((sum, m) => sum + m.executionTime, 0);
    const peakMemory = Math.max(...this.metrics.map((m) => m.memoryUsage));

    return {
      success,
      environment: this.config.environment,
      branchId: this.config.branchId,
      rowsCreated,
      executionTime: totalTime,
      memoryUsage: peakMemory,
      errors,
    };
  }
}

/**
 * Database state manager for test lifecycle
 */
export class DatabaseStateManager {
  private snapshots: Map<string, DatabaseSnapshot> = new Map();
  private seeder: BaseSeeder;

  constructor(seeder: BaseSeeder) {
    this.seeder = seeder;
  }

  /**
   * Create and store a database state
   */
  async captureState(name: string): Promise<DatabaseState> {
    const snapshot = await this.seeder.createSnapshot();
    this.snapshots.set(name, snapshot);

    return {
      snapshot,
      restore: async () => {
        await this.seeder.restoreSnapshot(snapshot);
      },
      cleanup: async () => {
        this.snapshots.delete(name);
      },
    };
  }

  /**
   * Restore to a named state
   */
  async restoreState(name: string): Promise<void> {
    const snapshot = this.snapshots.get(name);
    if (!snapshot) {
      throw new Error(`State '${name}' not found`);
    }
    await this.seeder.restoreSnapshot(snapshot);
  }

  /**
   * List all captured states
   */
  listStates(): string[] {
    return Array.from(this.snapshots.keys());
  }

  /**
   * Clear all captured states
   */
  clearStates(): void {
    this.snapshots.clear();
  }
}
