import { BaseSeeder } from './base-seeder';
import { performanceFactory } from '../factories/performance-factory';
import * as schema from '@/lib/db/schema';
import type { SeederResult, PerformanceDataOptions } from '../factories/types';

/**
 * Performance test seeder - creates large-scale data for performance testing
 */
export class PerformanceSeeder extends BaseSeeder {
  async seed(): Promise<SeederResult> {
    console.log('🚀 Starting performance test seeding...');

    const startTime = Date.now();
    const rowsCreated: Record<string, number> = {};
    const errors: Error[] = [];

    try {
      // Always clean for performance tests
      await this.cleanDatabase();
      await this.runMigrations();

      // Create performance datasets based on scenarios
      await this.createPerformanceDatasets(rowsCreated);

      // Verify database integrity
      const verification = await this.verifyDatabaseState();
      if (!verification.valid) {
        verification.issues.forEach((issue) => {
          errors.push(new Error(`Performance data integrity issue: ${issue}`));
        });
      }

      const executionTime = Date.now() - startTime;
      console.log(`✅ Performance seeding completed in ${executionTime}ms`);

      // Log performance metrics
      this.logPerformanceMetrics();

      return this.generateResult(
        true,
        rowsCreated,
        errors.length > 0 ? errors : undefined,
      );
    } catch (error) {
      console.error('❌ Performance seeding failed:', error);
      errors.push(error instanceof Error ? error : new Error(String(error)));
      return this.generateResult(false, rowsCreated, errors);
    }
  }

  /**
   * Create performance datasets based on configuration
   */
  private async createPerformanceDatasets(
    rowsCreated: Record<string, number>,
  ): Promise<void> {
    const scale = this.getPerformanceScale();
    const scenarios = this.config.scenarios || ['users', 'documents', 'chats'];

    console.log(
      `Creating performance dataset at ${scale} scale with scenarios: ${scenarios.join(', ')}`,
    );

    const options: PerformanceDataOptions = {
      scale,
      scenarios,
      patterns: 'mixed',
    };

    const result = await performanceFactory.createPerformanceDataset(
      scale,
      options,
    );

    // Extract and insert the generated data
    await this.insertPerformanceData(result.dataset, rowsCreated);

    console.log(
      `✓ Performance dataset created with ${result.metrics.rowCount} total rows`,
    );
  }

  /**
   * Insert performance data in optimized batches
   */
  private async insertPerformanceData(
    dataset: any,
    rowsCreated: Record<string, number>,
  ): Promise<void> {
    // Insert users and related data
    if (dataset.users) {
      console.log('📥 Inserting performance users...');

      const users = dataset.users.map((u: any) => u.user);
      const sessions = dataset.users.flatMap((u: any) => u.sessions);
      const accounts = dataset.users.flatMap((u: any) => u.accounts);

      await this.batchInsert(schema.user, users, 2000);
      rowsCreated.users = users.length;

      if (sessions.length > 0) {
        await this.batchInsert(schema.session, sessions, 2000);
        rowsCreated.sessions = sessions.length;
      }

      if (accounts.length > 0) {
        await this.batchInsert(schema.account, accounts, 2000);
        rowsCreated.accounts = accounts.length;
      }
    }

    // Insert documents and related data
    if (dataset.documents) {
      console.log('📥 Inserting performance documents...');

      const documents = dataset.documents.map((d: any) => d.document);
      const contents = dataset.documents.map((d: any) => d.content);
      const chunks = dataset.documents.flatMap((d: any) => d.chunks);
      const embeddings = dataset.documents.flatMap((d: any) => d.embeddings);

      await this.batchInsert(schema.ragDocument, documents, 1000);
      rowsCreated.ragDocuments = documents.length;

      await this.batchInsert(schema.documentContent, contents, 1000);
      rowsCreated.documentContent = contents.length;

      await this.batchInsert(schema.documentChunk, chunks, 1000);
      rowsCreated.documentChunks = chunks.length;

      await this.batchInsert(schema.documentEmbedding, embeddings, 500); // Smaller batches for embeddings
      rowsCreated.documentEmbeddings = embeddings.length;
    }

    // Insert chats and related data
    if (dataset.chats) {
      console.log('📥 Inserting performance chats...');

      const chats = dataset.chats.map((c: any) => c.chat);
      const messages = dataset.chats.flatMap((c: any) => c.messages);
      const votes = dataset.chats.flatMap((c: any) => c.votes);
      const streams = dataset.chats.flatMap((c: any) => c.streams);

      await this.batchInsert(schema.chat, chats, 2000);
      rowsCreated.chats = chats.length;

      await this.batchInsert(schema.message, messages, 1000);
      rowsCreated.messages = messages.length;

      if (votes.length > 0) {
        await this.batchInsert(schema.vote, votes, 2000);
        rowsCreated.votes = votes.length;
      }

      if (streams.length > 0) {
        await this.batchInsert(schema.stream, streams, 2000);
        rowsCreated.streams = streams.length;
      }
    }
  }

  /**
   * Get performance scale from configuration
   */
  private getPerformanceScale(): PerformanceDataOptions['scale'] {
    switch (this.config.size) {
      case 'minimal':
        return 'small';
      case 'standard':
        return 'medium';
      case 'large':
        return 'large';
      default:
        return 'medium';
    }
  }

  /**
   * Log performance metrics for analysis
   */
  private logPerformanceMetrics(): void {
    const metrics = this.getMetrics();

    if (metrics.length === 0) return;

    console.log('\n📊 Performance Metrics Summary:');
    console.log('================================');

    const byTable = metrics.reduce(
      (acc, metric) => {
        if (!acc[metric.tableName]) {
          acc[metric.tableName] = {
            operations: 0,
            totalRows: 0,
            totalTime: 0,
            avgTime: 0,
            maxTime: 0,
          };
        }

        const table = acc[metric.tableName];
        table.operations++;
        table.totalRows += metric.rowCount;
        table.totalTime += metric.executionTime;
        table.maxTime = Math.max(table.maxTime, metric.executionTime);
        table.avgTime = table.totalTime / table.operations;

        return acc;
      },
      {} as Record<string, any>,
    );

    Object.entries(byTable).forEach(([tableName, stats]) => {
      console.log(`${tableName}:`);
      console.log(`  Operations: ${stats.operations}`);
      console.log(`  Total Rows: ${stats.totalRows.toLocaleString()}`);
      console.log(`  Total Time: ${stats.totalTime}ms`);
      console.log(`  Avg Time: ${Math.round(stats.avgTime)}ms`);
      console.log(`  Max Time: ${stats.maxTime}ms`);
      console.log(
        `  Rows/sec: ${Math.round(stats.totalRows / (stats.totalTime / 1000))}`,
      );
      console.log('');
    });

    const totalMetrics = metrics.reduce(
      (acc, metric) => ({
        rows: acc.rows + metric.rowCount,
        time: acc.time + metric.executionTime,
        memory: Math.max(acc.memory, metric.memoryUsage),
      }),
      { rows: 0, time: 0, memory: 0 },
    );

    console.log('Overall Performance:');
    console.log(`  Total Rows: ${totalMetrics.rows.toLocaleString()}`);
    console.log(
      `  Total Time: ${totalMetrics.time}ms (${Math.round(totalMetrics.time / 1000)}s)`,
    );
    console.log(
      `  Peak Memory: ${Math.round(totalMetrics.memory / 1024 / 1024)}MB`,
    );
    console.log(
      `  Overall Rate: ${Math.round(totalMetrics.rows / (totalMetrics.time / 1000))} rows/sec`,
    );
  }
}

/**
 * Load test seeder - creates specific load testing scenarios
 */
export class LoadTestSeeder extends BaseSeeder {
  async seed(): Promise<SeederResult> {
    console.log('⚡ Starting load test seeding...');

    const startTime = Date.now();
    const rowsCreated: Record<string, number> = {};

    try {
      await this.cleanDatabase();
      await this.runMigrations();

      // Create load testing scenarios
      await this.createLoadTestScenarios(rowsCreated);

      const executionTime = Date.now() - startTime;
      console.log(`✅ Load test seeding completed in ${executionTime}ms`);

      return this.generateResult(true, rowsCreated);
    } catch (error) {
      console.error('❌ Load test seeding failed:', error);
      const errors = [
        error instanceof Error ? error : new Error(String(error)),
      ];
      return this.generateResult(false, rowsCreated, errors);
    }
  }

  /**
   * Create specific load testing scenarios
   */
  private async createLoadTestScenarios(
    rowsCreated: Record<string, number>,
  ): Promise<void> {
    const scenarios = performanceFactory.createLoadTestingScenarios();

    for (const scenario of scenarios) {
      if (this.shouldRunScenario(scenario.name)) {
        console.log(`🎯 Running load test scenario: ${scenario.name}`);

        const data = await scenario.setup();
        await this.insertScenarioData(scenario.name, data, rowsCreated);

        console.log(`✓ Completed scenario: ${scenario.name}`);
      }
    }
  }

  /**
   * Check if scenario should run based on configuration
   */
  private shouldRunScenario(scenarioName: string): boolean {
    const scenarios = this.config.scenarios || [];

    if (scenarios.length === 0) {
      // Run baseline scenario by default
      return scenarioName === 'baseline-load';
    }

    return scenarios.includes(scenarioName);
  }

  /**
   * Insert scenario-specific data
   */
  private async insertScenarioData(
    scenarioName: string,
    data: any,
    rowsCreated: Record<string, number>,
  ): Promise<void> {
    const scenarioKey = `${scenarioName}_`;

    if (data.dataset) {
      await this.insertPerformanceData(data.dataset, rowsCreated);
    }

    // Track scenario-specific metrics
    const scenarioMetrics = this.getMetrics().filter(
      (m) => m.timestamp.getTime() > Date.now() - 60000, // Last minute
    );

    console.log(
      `  📊 Scenario ${scenarioName}: ${scenarioMetrics.length} operations`,
    );
  }

  /**
   * Insert performance data (reuse from PerformanceSeeder)
   */
  private async insertPerformanceData(
    dataset: any,
    rowsCreated: Record<string, number>,
  ): Promise<void> {
    const performanceSeeder = new PerformanceSeeder(this.config);
    // Use reflection to access private method
    const insertMethod = (performanceSeeder as any).insertPerformanceData.bind(
      performanceSeeder,
    );
    await insertMethod(dataset, rowsCreated);
  }
}

/**
 * Stress test seeder - creates extreme load scenarios
 */
export class StressTestSeeder extends BaseSeeder {
  async seed(): Promise<SeederResult> {
    console.log('💥 Starting stress test seeding...');

    const startTime = Date.now();
    const rowsCreated: Record<string, number> = {};

    try {
      await this.cleanDatabase();
      await this.runMigrations();

      // Create stress testing scenarios
      await this.createStressTestScenarios(rowsCreated);

      const executionTime = Date.now() - startTime;
      console.log(`✅ Stress test seeding completed in ${executionTime}ms`);

      return this.generateResult(true, rowsCreated);
    } catch (error) {
      console.error('❌ Stress test seeding failed:', error);
      const errors = [
        error instanceof Error ? error : new Error(String(error)),
      ];
      return this.generateResult(false, rowsCreated, errors);
    }
  }

  /**
   * Create stress testing scenarios
   */
  private async createStressTestScenarios(
    rowsCreated: Record<string, number>,
  ): Promise<void> {
    const scenarios = performanceFactory.createStressTestingScenarios();

    for (const scenario of scenarios) {
      if (this.shouldRunStressScenario(scenario.name)) {
        console.log(`🔥 Running stress test scenario: ${scenario.name}`);

        const startTime = Date.now();
        const startMemory = process.memoryUsage().heapUsed;

        try {
          const data = await scenario.setup();
          await this.insertStressData(scenario.name, data, rowsCreated);

          const executionTime = Date.now() - startTime;
          const memoryUsed = process.memoryUsage().heapUsed - startMemory;

          console.log(`✓ Completed stress scenario: ${scenario.name}`);
          console.log(
            `  Time: ${executionTime}ms, Memory: ${Math.round(memoryUsed / 1024 / 1024)}MB`,
          );

          // Check if we exceeded expected metrics
          if (executionTime > scenario.metrics.maxSetupTime) {
            console.warn(
              `⚠️  Scenario exceeded expected setup time: ${executionTime}ms > ${scenario.metrics.maxSetupTime}ms`,
            );
          }

          if (memoryUsed > scenario.metrics.maxMemoryUsage) {
            console.warn(
              `⚠️  Scenario exceeded expected memory usage: ${Math.round(memoryUsed / 1024 / 1024)}MB > ${Math.round(scenario.metrics.maxMemoryUsage / 1024 / 1024)}MB`,
            );
          }
        } catch (error) {
          console.error(`❌ Stress scenario ${scenario.name} failed:`, error);
          throw error;
        }
      }
    }
  }

  /**
   * Check if stress scenario should run
   */
  private shouldRunStressScenario(scenarioName: string): boolean {
    const scenarios = this.config.scenarios || [];

    if (scenarios.length === 0) {
      // Run memory stress by default
      return scenarioName === 'memory-stress';
    }

    return scenarios.includes(scenarioName);
  }

  /**
   * Insert stress test data with memory management
   */
  private async insertStressData(
    scenarioName: string,
    data: any,
    rowsCreated: Record<string, number>,
  ): Promise<void> {
    // Use smaller batch sizes for stress tests to manage memory
    const originalBatchInsert = this.batchInsert;

    this.batchInsert = async <T>(table: any, data: T[], batchSize = 500) => {
      return originalBatchInsert.call(
        this,
        table,
        data,
        Math.min(batchSize, 500),
      );
    };

    if (data.dataset) {
      const performanceSeeder = new PerformanceSeeder(this.config);
      const insertMethod = (
        performanceSeeder as any
      ).insertPerformanceData.bind(performanceSeeder);
      await insertMethod(data.dataset, rowsCreated);
    }

    // Handle scenario-specific data
    if (data.documents) {
      await this.batchInsert(
        schema.ragDocument,
        data.documents.map((d: any) => d.document),
        200,
      );
      await this.batchInsert(
        schema.documentContent,
        data.documents.map((d: any) => d.content),
        200,
      );

      const chunks = data.documents.flatMap((d: any) => d.chunks);
      await this.batchInsert(schema.documentChunk, chunks, 200);

      const embeddings = data.documents.flatMap((d: any) => d.embeddings);
      await this.batchInsert(schema.documentEmbedding, embeddings, 100);

      rowsCreated.ragDocuments =
        (rowsCreated.ragDocuments || 0) + data.documents.length;
      rowsCreated.documentContent =
        (rowsCreated.documentContent || 0) + data.documents.length;
      rowsCreated.documentChunks =
        (rowsCreated.documentChunks || 0) + chunks.length;
      rowsCreated.documentEmbeddings =
        (rowsCreated.documentEmbeddings || 0) + embeddings.length;
    }

    if (data.extraEmbeddings) {
      await this.batchInsert(
        schema.documentEmbedding,
        data.extraEmbeddings,
        100,
      );
      rowsCreated.documentEmbeddings =
        (rowsCreated.documentEmbeddings || 0) + data.extraEmbeddings.length;
    }

    if (data.concurrentSessions) {
      await this.batchInsert(schema.session, data.concurrentSessions, 1000);
      rowsCreated.sessions =
        (rowsCreated.sessions || 0) + data.concurrentSessions.length;
    }

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  }
}
