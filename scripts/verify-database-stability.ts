#!/usr/bin/env tsx

/**
 * Database Stability and Performance Verification Script
 *
 * Comprehensive testing of database connectivity, performance, and stability
 * including connection pooling, query performance, and concurrent operations.
 */

import { db, checkDatabaseHealth } from '../lib/db';
import {
  ragDocument,
  documentChunk,
  documentEmbedding,
} from '../lib/db/schema';
import { eq, sql, desc } from 'drizzle-orm';
import { performance } from 'node:perf_hooks';

interface PerformanceMetrics {
  operation: string;
  duration: number;
  success: boolean;
  error?: string;
}

interface DatabaseHealthReport {
  overallHealth: 'healthy' | 'warning' | 'error';
  connectionTest: boolean;
  performanceMetrics: PerformanceMetrics[];
  connectionPoolStats: {
    maxConnections: number;
    activeConnections: number;
    idleConnections: number;
  };
  recommendations: string[];
}

class DatabaseVerifier {
  private metrics: PerformanceMetrics[] = [];
  private recommendations: string[] = [];

  /**
   * Run comprehensive database verification
   */
  async runVerification(): Promise<DatabaseHealthReport> {
    console.log(
      '🔍 Starting database stability and performance verification...\n',
    );

    // Basic connectivity test
    const connectionHealth = await this.testBasicConnectivity();

    // Performance tests
    await this.testQueryPerformance();
    await this.testConcurrentOperations();
    await this.testConnectionPooling();
    await this.testDataIntegrity();

    // Generate report
    const report = this.generateReport(connectionHealth);
    this.printReport(report);

    return report;
  }

  /**
   * Test basic database connectivity
   */
  private async testBasicConnectivity(): Promise<boolean> {
    console.log('📡 Testing basic database connectivity...');

    const start = performance.now();
    try {
      const isHealthy = await checkDatabaseHealth();
      const duration = performance.now() - start;

      this.metrics.push({
        operation: 'Basic Connectivity',
        duration,
        success: isHealthy,
      });

      if (isHealthy) {
        console.log(
          `✅ Database connectivity: OK (${duration.toFixed(2)}ms)\n`,
        );
      } else {
        console.log(
          `❌ Database connectivity: FAILED (${duration.toFixed(2)}ms)\n`,
        );
        this.recommendations.push(
          'Check database URL and network connectivity',
        );
      }

      return isHealthy;
    } catch (error) {
      const duration = performance.now() - start;
      this.metrics.push({
        operation: 'Basic Connectivity',
        duration,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      console.log(`❌ Database connectivity: ERROR (${duration.toFixed(2)}ms)`);
      console.log(`   Error: ${error}\n`);
      this.recommendations.push(
        'Verify POSTGRES_URL environment variable and database server status',
      );

      return false;
    }
  }

  /**
   * Test query performance for common operations
   */
  private async testQueryPerformance(): Promise<void> {
    console.log('⚡ Testing query performance...');

    const queries = [
      {
        name: 'Document Count',
        operation: async () => {
          const result = await db
            .select({ count: sql<number>`count(*)` })
            .from(ragDocument);
          return result[0]?.count || 0;
        },
      },
      {
        name: 'Recent Documents',
        operation: async () => {
          const result = await db
            .select({
              id: ragDocument.id,
              originalName: ragDocument.originalName,
              status: ragDocument.status,
              createdAt: ragDocument.createdAt,
            })
            .from(ragDocument)
            .orderBy(desc(ragDocument.createdAt))
            .limit(10);
          return result.length;
        },
      },
      {
        name: 'Chunk Count',
        operation: async () => {
          const result = await db
            .select({ count: sql<number>`count(*)` })
            .from(documentChunk);
          return result[0]?.count || 0;
        },
      },
      {
        name: 'Embedding Count',
        operation: async () => {
          const result = await db
            .select({ count: sql<number>`count(*)` })
            .from(documentEmbedding);
          return result[0]?.count || 0;
        },
      },
      {
        name: 'Complex Join Query',
        operation: async () => {
          const result = await db
            .select({
              documentId: ragDocument.id,
              chunkCount: sql<number>`count(${documentChunk.id})`,
              embeddingCount: sql<number>`count(${documentEmbedding.id})`,
            })
            .from(ragDocument)
            .leftJoin(
              documentChunk,
              eq(ragDocument.id, documentChunk.documentId),
            )
            .leftJoin(
              documentEmbedding,
              eq(documentChunk.id, documentEmbedding.chunkId),
            )
            .groupBy(ragDocument.id)
            .limit(5);
          return result.length;
        },
      },
    ];

    for (const query of queries) {
      const start = performance.now();
      try {
        const result = await query.operation();
        const duration = performance.now() - start;

        this.metrics.push({
          operation: query.name,
          duration,
          success: true,
        });

        const status = duration < 100 ? '✅' : duration < 500 ? '⚠️' : '❌';
        console.log(
          `${status} ${query.name}: ${duration.toFixed(2)}ms (${result} records)`,
        );

        if (duration > 500) {
          this.recommendations.push(
            `${query.name} query is slow (${duration.toFixed(2)}ms) - consider adding indexes`,
          );
        }
      } catch (error) {
        const duration = performance.now() - start;
        this.metrics.push({
          operation: query.name,
          duration,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        console.log(`❌ ${query.name}: FAILED (${duration.toFixed(2)}ms)`);
        console.log(`   Error: ${error}`);
        this.recommendations.push(`Fix ${query.name} query error: ${error}`);
      }
    }
    console.log('');
  }

  /**
   * Test concurrent database operations
   */
  private async testConcurrentOperations(): Promise<void> {
    console.log('🔄 Testing concurrent operations...');

    const concurrentQueries = 10;
    const start = performance.now();

    try {
      const promises = Array.from(
        { length: concurrentQueries },
        async (_, index) => {
          const queryStart = performance.now();
          const result = await db
            .select({ count: sql<number>`count(*)` })
            .from(ragDocument);
          const queryDuration = performance.now() - queryStart;

          return {
            index,
            duration: queryDuration,
            success: true,
            result: result[0]?.count || 0,
          };
        },
      );

      const results = await Promise.all(promises);
      const totalDuration = performance.now() - start;
      const avgDuration =
        results.reduce((sum, r) => sum + r.duration, 0) / results.length;
      const maxDuration = Math.max(...results.map((r) => r.duration));

      this.metrics.push({
        operation: 'Concurrent Operations',
        duration: totalDuration,
        success: true,
      });

      console.log(
        `✅ Concurrent operations: ${concurrentQueries} queries completed`,
      );
      console.log(`   Total time: ${totalDuration.toFixed(2)}ms`);
      console.log(`   Average per query: ${avgDuration.toFixed(2)}ms`);
      console.log(`   Max query time: ${maxDuration.toFixed(2)}ms`);

      if (maxDuration > 1000) {
        this.recommendations.push(
          'Some concurrent queries are slow - check connection pool configuration',
        );
      }
      if (totalDuration > concurrentQueries * 100) {
        this.recommendations.push(
          'Concurrent query performance is poor - consider increasing connection pool size',
        );
      }
    } catch (error) {
      const totalDuration = performance.now() - start;
      this.metrics.push({
        operation: 'Concurrent Operations',
        duration: totalDuration,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      console.log(
        `❌ Concurrent operations: FAILED (${totalDuration.toFixed(2)}ms)`,
      );
      console.log(`   Error: ${error}`);
      this.recommendations.push(
        'Fix concurrent operation errors - check connection limits',
      );
    }
    console.log('');
  }

  /**
   * Test connection pooling behavior
   */
  private async testConnectionPooling(): Promise<void> {
    console.log('🔗 Testing connection pooling...');

    const start = performance.now();
    try {
      // Test multiple connections with delays
      const connectionTests = Array.from({ length: 5 }, async (_, index) => {
        await new Promise((resolve) => setTimeout(resolve, index * 100)); // Stagger connections
        const queryStart = performance.now();

        const result = await db
          .select({
            connectionId: sql<string>`pg_backend_pid()`,
            currentTime: sql<Date>`now()`,
          })
          .from(ragDocument)
          .limit(1);

        return {
          index,
          duration: performance.now() - queryStart,
          connectionId: result[0]?.connectionId,
          timestamp: result[0]?.currentTime,
        };
      });

      const results = await Promise.all(connectionTests);
      const duration = performance.now() - start;

      this.metrics.push({
        operation: 'Connection Pooling',
        duration,
        success: true,
      });

      const uniqueConnections = new Set(results.map((r) => r.connectionId))
        .size;

      console.log(
        `✅ Connection pooling test completed (${duration.toFixed(2)}ms)`,
      );
      console.log(
        `   Unique connections used: ${uniqueConnections}/${results.length}`,
      );

      if (uniqueConnections === 1 && results.length > 1) {
        console.log(`   ✅ Connection reuse is working properly`);
      } else if (uniqueConnections === results.length) {
        console.log(`   ⚠️  Each query used a different connection`);
        this.recommendations.push(
          'Connection pooling may not be optimal - consider adjusting pool configuration',
        );
      } else {
        console.log(`   ✅ Good connection pooling behavior`);
      }
    } catch (error) {
      const duration = performance.now() - start;
      this.metrics.push({
        operation: 'Connection Pooling',
        duration,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      console.log(
        `❌ Connection pooling test: FAILED (${duration.toFixed(2)}ms)`,
      );
      console.log(`   Error: ${error}`);
      this.recommendations.push(
        'Connection pooling issues detected - check configuration',
      );
    }
    console.log('');
  }

  /**
   * Test data integrity and constraints
   */
  private async testDataIntegrity(): Promise<void> {
    console.log('🔒 Testing data integrity...');

    const start = performance.now();
    try {
      // Test foreign key constraints
      const integrityChecks = [
        {
          name: 'Document-Chunk Relationship',
          query: async () => {
            const result = await db
              .select({
                orphanedChunks: sql<number>`count(${documentChunk.id})`,
              })
              .from(documentChunk)
              .leftJoin(
                ragDocument,
                eq(documentChunk.documentId, ragDocument.id),
              )
              .where(sql`${ragDocument.id} IS NULL`);
            return result[0]?.orphanedChunks || 0;
          },
        },
        {
          name: 'Chunk-Embedding Relationship',
          query: async () => {
            const result = await db
              .select({
                orphanedEmbeddings: sql<number>`count(${documentEmbedding.id})`,
              })
              .from(documentEmbedding)
              .leftJoin(
                documentChunk,
                eq(documentEmbedding.chunkId, documentChunk.id),
              )
              .where(sql`${documentChunk.id} IS NULL`);
            return result[0]?.orphanedEmbeddings || 0;
          },
        },
        {
          name: 'Document Status Consistency',
          query: async () => {
            const result = await db
              .select({
                inconsistentDocs: sql<number>`count(*)`,
              })
              .from(ragDocument)
              .where(
                sql`${ragDocument.status} NOT IN ('uploaded', 'processing', 'text_extracted', 'chunked', 'embedded', 'processed', 'failed')`,
              );
            return result[0]?.inconsistentDocs || 0;
          },
        },
      ];

      for (const check of integrityChecks) {
        const checkStart = performance.now();
        try {
          const result = await check.query();
          const checkDuration = performance.now() - checkStart;

          const status = result === 0 ? '✅' : '⚠️';
          console.log(
            `${status} ${check.name}: ${result} issues found (${checkDuration.toFixed(2)}ms)`,
          );

          if (result > 0) {
            this.recommendations.push(
              `Data integrity issue: ${result} ${check.name} inconsistencies found`,
            );
          }
        } catch (error) {
          console.log(`❌ ${check.name}: FAILED`);
          console.log(`   Error: ${error}`);
          this.recommendations.push(`Fix ${check.name} integrity check error`);
        }
      }

      const duration = performance.now() - start;
      this.metrics.push({
        operation: 'Data Integrity',
        duration,
        success: true,
      });

      console.log(
        `✅ Data integrity checks completed (${duration.toFixed(2)}ms)`,
      );
    } catch (error) {
      const duration = performance.now() - start;
      this.metrics.push({
        operation: 'Data Integrity',
        duration,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      console.log(`❌ Data integrity test: FAILED (${duration.toFixed(2)}ms)`);
      console.log(`   Error: ${error}`);
      this.recommendations.push(
        'Data integrity testing failed - investigate database schema issues',
      );
    }
    console.log('');
  }

  /**
   * Generate comprehensive health report
   */
  private generateReport(connectionHealth: boolean): DatabaseHealthReport {
    const failedOperations = this.metrics.filter((m) => !m.success).length;
    const slowOperations = this.metrics.filter(
      (m) => m.success && m.duration > 500,
    ).length;

    let overallHealth: 'healthy' | 'warning' | 'error';

    if (!connectionHealth || failedOperations > 0) {
      overallHealth = 'error';
    } else if (slowOperations > 0 || this.recommendations.length > 0) {
      overallHealth = 'warning';
    } else {
      overallHealth = 'healthy';
    }

    return {
      overallHealth,
      connectionTest: connectionHealth,
      performanceMetrics: this.metrics,
      connectionPoolStats: {
        maxConnections: 20, // From connection config
        activeConnections: 0, // Would need to query this
        idleConnections: 0, // Would need to query this
      },
      recommendations: this.recommendations,
    };
  }

  /**
   * Print detailed verification report
   */
  private printReport(report: DatabaseHealthReport): void {
    console.log('📊 DATABASE HEALTH REPORT');
    console.log('='.repeat(50));

    const healthEmoji = {
      healthy: '✅',
      warning: '⚠️',
      error: '❌',
    };

    console.log(
      `Overall Health: ${healthEmoji[report.overallHealth]} ${report.overallHealth.toUpperCase()}`,
    );
    console.log(
      `Connection Test: ${report.connectionTest ? '✅ PASS' : '❌ FAIL'}`,
    );
    console.log('');

    // Performance summary
    console.log('Performance Metrics:');
    const successfulMetrics = report.performanceMetrics.filter(
      (m) => m.success,
    );
    const failedMetrics = report.performanceMetrics.filter((m) => !m.success);

    console.log(`  • Successful operations: ${successfulMetrics.length}`);
    console.log(`  • Failed operations: ${failedMetrics.length}`);

    if (successfulMetrics.length > 0) {
      const avgDuration =
        successfulMetrics.reduce((sum, m) => sum + m.duration, 0) /
        successfulMetrics.length;
      const maxDuration = Math.max(...successfulMetrics.map((m) => m.duration));
      console.log(`  • Average response time: ${avgDuration.toFixed(2)}ms`);
      console.log(`  • Max response time: ${maxDuration.toFixed(2)}ms`);
    }
    console.log('');

    // Recommendations
    if (report.recommendations.length > 0) {
      console.log('Recommendations:');
      report.recommendations.forEach((rec, index) => {
        console.log(`  ${index + 1}. ${rec}`);
      });
    } else {
      console.log('✅ No recommendations - database is performing well!');
    }
    console.log('');
  }
}

// Main execution
async function main() {
  const verifier = new DatabaseVerifier();

  try {
    const report = await verifier.runVerification();

    // Exit with appropriate code
    if (report.overallHealth === 'error') {
      console.log('❌ Database verification completed with errors');
      process.exit(1);
    } else if (report.overallHealth === 'warning') {
      console.log('⚠️  Database verification completed with warnings');
      process.exit(0);
    } else {
      console.log('✅ Database verification completed successfully');
      process.exit(0);
    }
  } catch (error) {
    console.error('❌ Database verification failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

export { DatabaseVerifier, type DatabaseHealthReport };
