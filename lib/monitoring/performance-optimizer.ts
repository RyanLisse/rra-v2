/**
 * Performance Optimization Utility
 *
 * Provides utilities for identifying and fixing performance bottlenecks,
 * including database query optimization, memory usage tracking, and cache analysis.
 */

import { performance } from 'node:perf_hooks';

/**
 * Performance metrics collection
 */
interface PerformanceMetrics {
  timestamp: number;
  operation: string;
  duration: number;
  memory: {
    used: number;
    total: number;
    gc?: boolean;
  };
  database?: {
    activeConnections: number;
    queryCount: number;
    slowQueries: number;
  };
  cache?: {
    hitRate: number;
    size: number;
  };
}

/**
 * Performance monitoring class
 */
export class PerformanceOptimizer {
  private metrics: PerformanceMetrics[] = [];
  private slowQueryThreshold = Number.parseInt(
    process.env.PERFORMANCE_SLOW_QUERY_THRESHOLD || '1000',
  );
  private memoryThreshold = Number.parseInt(
    process.env.PERFORMANCE_MEMORY_THRESHOLD || '500000000',
  ); // 500MB

  /**
   * Start performance monitoring for an operation
   */
  startOperation(operationName: string): PerformanceTracker {
    return new PerformanceTracker(operationName, this);
  }

  /**
   * Record performance metrics
   */
  recordMetrics(metrics: PerformanceMetrics): void {
    this.metrics.push(metrics);

    // Keep only last 1000 metrics to prevent memory growth
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-1000);
    }

    // Check for performance issues
    this.checkPerformanceThresholds(metrics);
  }

  /**
   * Check if performance metrics exceed thresholds
   */
  private checkPerformanceThresholds(metrics: PerformanceMetrics): void {
    // Check slow operations
    if (metrics.duration > this.slowQueryThreshold) {
      console.warn(
        `🐌 Slow operation detected: ${metrics.operation} took ${metrics.duration}ms`,
      );
    }

    // Check memory usage
    if (metrics.memory.used > this.memoryThreshold) {
      console.warn(
        `🧠 High memory usage: ${Math.round(metrics.memory.used / 1024 / 1024)}MB`,
      );
      this.triggerGarbageCollection();
    }

    // Check database performance
    if (metrics.database?.slowQueries && metrics.database.slowQueries > 5) {
      console.warn(
        `🗃️ Multiple slow database queries detected: ${metrics.database.slowQueries}`,
      );
    }
  }

  /**
   * Get performance analytics
   */
  getAnalytics(): {
    averageOperationTime: number;
    slowestOperations: { operation: string; duration: number }[];
    memoryTrend: number[];
    totalOperations: number;
    performanceScore: number;
  } {
    if (this.metrics.length === 0) {
      return {
        averageOperationTime: 0,
        slowestOperations: [],
        memoryTrend: [],
        totalOperations: 0,
        performanceScore: 100,
      };
    }

    const avgTime =
      this.metrics.reduce((sum, m) => sum + m.duration, 0) /
      this.metrics.length;

    const slowest = [...this.metrics]
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10)
      .map((m) => ({ operation: m.operation, duration: m.duration }));

    const memoryTrend = this.metrics
      .slice(-20) // Last 20 measurements
      .map((m) => m.memory.used);

    // Calculate performance score (0-100)
    const baseScore = 100;
    const slowOperationPenalty = Math.min(
      40,
      (avgTime / this.slowQueryThreshold) * 20,
    );
    const memoryPenalty = Math.min(
      30,
      (this.getAverageMemoryUsage() / this.memoryThreshold) * 15,
    );

    const performanceScore = Math.max(
      0,
      baseScore - slowOperationPenalty - memoryPenalty,
    );

    return {
      averageOperationTime: Math.round(avgTime),
      slowestOperations: slowest,
      memoryTrend,
      totalOperations: this.metrics.length,
      performanceScore: Math.round(performanceScore),
    };
  }

  /**
   * Get database performance statistics
   */
  async getDatabasePerformanceStats(): Promise<{
    connectionCount: number;
    activeQueries: number;
    cacheHitRatio: number;
    indexUsage: Array<{ table: string; index: string; usage: number }>;
  }> {
    try {
      const { db } = await import('@/lib/db');
      const { sql } = await import('drizzle-orm');

      // Get connection count (PostgreSQL specific)
      const connectionResult = await db.execute(sql`
        SELECT count(*) as connection_count 
        FROM pg_stat_activity 
        WHERE state = 'active'
      `);

      // Get cache hit ratio
      const cacheResult = await db.execute(sql`
        SELECT 
          round(
            (sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read))) * 100, 
            2
          ) as cache_hit_ratio
        FROM pg_statio_user_tables
      `);

      // Get index usage statistics
      const indexResult = await db.execute(sql`
        SELECT 
          schemaname,
          tablename,
          indexname,
          idx_scan as usage_count
        FROM pg_stat_user_indexes
        ORDER BY idx_scan DESC
        LIMIT 20
      `);

      return {
        connectionCount: Number(connectionResult[0]?.connection_count || 0),
        activeQueries: Number(connectionResult[0]?.connection_count || 0),
        cacheHitRatio: Number(cacheResult[0]?.cache_hit_ratio || 0),
        indexUsage: indexResult.map((row: any) => ({
          table: row.tablename,
          index: row.indexname,
          usage: Number(row.usage_count || 0),
        })),
      };
    } catch (error) {
      console.error('Failed to get database performance stats:', error);
      return {
        connectionCount: 0,
        activeQueries: 0,
        cacheHitRatio: 0,
        indexUsage: [],
      };
    }
  }

  /**
   * Optimize database queries by analyzing slow queries
   */
  async optimizeDatabaseQueries(): Promise<{
    slowQueries: Array<{ query: string; duration: number; calls: number }>;
    recommendations: string[];
  }> {
    try {
      const { db } = await import('@/lib/db');
      const { sql } = await import('drizzle-orm');

      // Get slow queries from PostgreSQL stats
      const slowQueriesResult = await db.execute(sql`
        SELECT 
          query,
          calls,
          total_time,
          mean_time,
          rows
        FROM pg_stat_statements
        WHERE mean_time > ${this.slowQueryThreshold}
        ORDER BY mean_time DESC
        LIMIT 20
      `);

      const recommendations: string[] = [];
      const slowQueries = slowQueriesResult.map((row: any) => {
        const query = String(row.query || '');
        const duration = Number(row.mean_time || 0);
        const calls = Number(row.calls || 0);

        // Generate recommendations based on query patterns
        if (query.includes('SELECT') && !query.includes('LIMIT')) {
          recommendations.push(
            `Add LIMIT clause to query: ${query.substring(0, 50)}...`,
          );
        }

        if (query.includes('ORDER BY') && !query.includes('INDEX')) {
          recommendations.push(
            `Consider adding index for ORDER BY in query: ${query.substring(0, 50)}...`,
          );
        }

        if (duration > this.slowQueryThreshold * 2) {
          recommendations.push(
            `Query taking ${Math.round(duration)}ms needs optimization: ${query.substring(0, 50)}...`,
          );
        }

        return { query, duration, calls };
      });

      return { slowQueries, recommendations };
    } catch (error) {
      console.error('Failed to analyze database queries:', error);
      return {
        slowQueries: [],
        recommendations: ['pg_stat_statements extension not available'],
      };
    }
  }

  /**
   * Memory optimization utilities
   */
  optimizeMemoryUsage(): {
    before: number;
    after: number;
    freed: number;
    recommendations: string[];
  } {
    const beforeMemory = process.memoryUsage().heapUsed;

    // Force garbage collection if available
    this.triggerGarbageCollection();

    const afterMemory = process.memoryUsage().heapUsed;
    const freed = beforeMemory - afterMemory;

    const recommendations = [];

    if (beforeMemory > this.memoryThreshold) {
      recommendations.push(
        'Memory usage is high - consider implementing object pooling',
      );
      recommendations.push(
        'Review large object allocations and implement lazy loading',
      );
      recommendations.push(
        'Check for memory leaks in event listeners and timers',
      );
    }

    if (freed < beforeMemory * 0.1) {
      recommendations.push(
        'Low garbage collection efficiency - review object lifecycle management',
      );
    }

    return {
      before: beforeMemory,
      after: afterMemory,
      freed,
      recommendations,
    };
  }

  /**
   * Get system resource usage
   */
  getSystemResourceUsage(): {
    memory: NodeJS.MemoryUsage;
    cpu: NodeJS.CpuUsage;
    uptime: number;
  } {
    return {
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      uptime: process.uptime(),
    };
  }

  /**
   * Export performance report
   */
  exportPerformanceReport(): {
    summary: ReturnType<PerformanceOptimizer['getAnalytics']>;
    systemResources: ReturnType<PerformanceOptimizer['getSystemResourceUsage']>;
    recommendations: string[];
    timestamp: number;
  } {
    const analytics = this.getAnalytics();
    const systemResources = this.getSystemResourceUsage();

    const recommendations = [];

    if (analytics.performanceScore < 70) {
      recommendations.push(
        'Performance score is low - consider optimizing slow operations',
      );
    }

    if (analytics.averageOperationTime > this.slowQueryThreshold) {
      recommendations.push(
        'Average operation time is high - review database queries and algorithm efficiency',
      );
    }

    if (systemResources.memory.heapUsed > this.memoryThreshold) {
      recommendations.push(
        'Memory usage is high - implement memory optimization strategies',
      );
    }

    return {
      summary: analytics,
      systemResources,
      recommendations,
      timestamp: Date.now(),
    };
  }

  private getAverageMemoryUsage(): number {
    if (this.metrics.length === 0) return 0;
    return (
      this.metrics.reduce((sum, m) => sum + m.memory.used, 0) /
      this.metrics.length
    );
  }

  private triggerGarbageCollection(): void {
    if (global.gc) {
      global.gc();
    }
  }

  /**
   * Clear all collected metrics
   */
  clearMetrics(): void {
    this.metrics = [];
  }
}

/**
 * Performance tracker for individual operations
 */
export class PerformanceTracker {
  private startTime: number;
  private startMemory: NodeJS.MemoryUsage;

  constructor(
    private operationName: string,
    private optimizer: PerformanceOptimizer,
  ) {
    this.startTime = performance.now();
    this.startMemory = process.memoryUsage();
  }

  /**
   * End tracking and record metrics
   */
  end(additionalData?: { database?: any; cache?: any }): void {
    const endTime = performance.now();
    const endMemory = process.memoryUsage();
    const duration = endTime - this.startTime;

    const metrics: PerformanceMetrics = {
      timestamp: Date.now(),
      operation: this.operationName,
      duration,
      memory: {
        used: endMemory.heapUsed,
        total: endMemory.heapTotal,
        gc: endMemory.heapUsed < this.startMemory.heapUsed,
      },
      ...additionalData,
    };

    this.optimizer.recordMetrics(metrics);
  }
}

// Export singleton instance
export const performanceOptimizer = new PerformanceOptimizer();
