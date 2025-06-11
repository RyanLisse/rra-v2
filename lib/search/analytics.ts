/**
 * Search Analytics and Metrics Module
 *
 * Handles all search analytics, performance metrics tracking, and statistical analysis
 * for the vector search system. Provides comprehensive monitoring capabilities
 * including response times, cache performance, query patterns, and usage analytics.
 */

import type { RedisClientType } from 'redis';
import type { SearchConfig } from './config';

export interface SearchAnalyticsData {
  totalSearches: number;
  avgResponseTime: number;
  cacheHitRate: number;
  popularQueries: { query: string; count: number }[];
  algorithmUsage: Record<string, number>;
}

export interface SearchMetricsEntry {
  timestamp: string;
  userId: string;
  query: string;
  responseTime: number;
  algorithm: string;
  cacheHit: boolean;
  resultCount: number;
  success: boolean;
}

export interface CacheStatistics {
  totalKeys: number;
  memoryUsage: string;
  hitRate: number;
  missRate: number;
  avgResponseTime: number;
}

/**
 * Comprehensive analytics service for search operations
 */
export class SearchAnalytics {
  private redis: RedisClientType | null = null;
  private searchConfig: SearchConfig;
  private metricsBuffer: SearchMetricsEntry[] = [];
  private bufferFlushInterval: NodeJS.Timeout | null = null;

  constructor(searchConfig: SearchConfig) {
    this.searchConfig = searchConfig;
    this.redis = searchConfig.getRedisClient();
    this.initializeMetricsBuffer();
  }

  /**
   * Initialize metrics buffering for batch writes
   */
  private initializeMetricsBuffer(): void {
    // Flush metrics buffer every 30 seconds
    this.bufferFlushInterval = setInterval(() => {
      this.flushMetricsBuffer();
    }, 30000);
  }

  /**
   * Track search metrics for analytics
   */
  async trackSearchMetrics(
    userId: string,
    query: string,
    responseTime: number,
    algorithm: string,
    cacheHit: boolean,
    resultCount = 0,
    success = true,
  ): Promise<void> {
    if (!this.redis || !this.searchConfig.isAnalyticsEnabled()) {
      return;
    }

    // Add to buffer for batch processing
    this.metricsBuffer.push({
      timestamp: new Date().toISOString(),
      userId,
      query,
      responseTime,
      algorithm,
      cacheHit,
      resultCount,
      success,
    });

    // Flush immediately if buffer is full
    if (this.metricsBuffer.length >= 50) {
      await this.flushMetricsBuffer();
    }

    try {
      const metricsKey = `search_metrics:${userId}`;
      const today = new Date().toISOString().split('T')[0];

      // Track daily metrics
      await Promise.all([
        this.redis.hIncrBy(`${metricsKey}:${today}`, 'total_searches', 1),
        this.redis.hIncrBy(
          `${metricsKey}:${today}`,
          'total_response_time',
          responseTime,
        ),
        this.redis.hIncrBy(
          `${metricsKey}:${today}`,
          `algorithm_${algorithm}`,
          1,
        ),
        cacheHit
          ? this.redis.hIncrBy(`${metricsKey}:${today}`, 'cache_hits', 1)
          : Promise.resolve(),
        success
          ? this.redis.hIncrBy(
              `${metricsKey}:${today}`,
              'successful_searches',
              1,
            )
          : this.redis.hIncrBy(`${metricsKey}:${today}`, 'failed_searches', 1),
      ]);

      // Track popular queries with decay
      await this.redis.zIncrBy(`popular_queries:${userId}:${today}`, 1, query);

      // Set expiration for cleanup (7 days)
      await Promise.all([
        this.redis.expire(`${metricsKey}:${today}`, 86400 * 7),
        this.redis.expire(`popular_queries:${userId}:${today}`, 86400 * 7),
      ]);
    } catch (error) {
      console.error('Metrics tracking error:', error);
    }
  }

  /**
   * Flush metrics buffer to persistent storage
   */
  private async flushMetricsBuffer(): Promise<void> {
    if (this.metricsBuffer.length === 0 || !this.redis) {
      return;
    }

    const bufferCopy = [...this.metricsBuffer];
    this.metricsBuffer.length = 0; // Clear buffer

    try {
      // Store detailed metrics for analysis
      const pipeline = this.redis.multi();

      bufferCopy.forEach((entry) => {
        const key = `search_metrics_detail:${entry.timestamp.split('T')[0]}`;
        pipeline.lPush(key, JSON.stringify(entry));
      });

      await pipeline.exec();
    } catch (error) {
      console.error('Metrics buffer flush error:', error);
      // Re-add failed entries to buffer
      this.metricsBuffer.unshift(...bufferCopy);
    }
  }

  /**
   * Get comprehensive search analytics for a user
   */
  async getSearchAnalytics(
    userId: string,
    timeRange: 'day' | 'week' | 'month' = 'day',
  ): Promise<SearchAnalyticsData> {
    if (!this.redis) {
      return this.getEmptyAnalytics();
    }

    try {
      const days = this.getTimeRangeDays(timeRange);
      const dateKeys = this.generateDateKeys(days);

      const analytics = await this.aggregateMetricsForDates(userId, dateKeys);

      return analytics;
    } catch (error) {
      console.error('Analytics retrieval error:', error);
      return this.getEmptyAnalytics();
    }
  }

  /**
   * Get popular queries for a user within a time range
   */
  async getPopularQueries(
    userId: string,
    timeRange: 'day' | 'week' | 'month' = 'day',
    limit = 10,
  ): Promise<{ query: string; count: number }[]> {
    if (!this.redis) {
      return [];
    }

    try {
      const days = this.getTimeRangeDays(timeRange);
      const dateKeys = this.generateDateKeys(days);

      const allQueries = new Map<string, number>();

      for (const date of dateKeys) {
        const key = `popular_queries:${userId}:${date}`;
        const queries = await this.redis.zRangeWithScores(key, 0, -1, {
          REV: true,
        });

        for (const entry of queries) {
          allQueries.set(
            entry.value,
            (allQueries.get(entry.value) || 0) + entry.score,
          );
        }
      }

      return Array.from(allQueries.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([query, count]) => ({ query, count }));
    } catch (error) {
      console.error('Popular queries retrieval error:', error);
      return [];
    }
  }

  /**
   * Get cache performance statistics
   */
  async getCacheStats(): Promise<CacheStatistics> {
    if (!this.redis) {
      return {
        totalKeys: 0,
        memoryUsage: '0B',
        hitRate: 0,
        missRate: 0,
        avgResponseTime: 0,
      };
    }

    try {
      const config = this.searchConfig.getConfig();
      const cacheKeys = await this.redis.keys(`${config.cache.keyPrefix}*`);

      // Get Redis memory info
      const info = await this.redis.info('memory');
      const memoryMatch = info.match(/used_memory_human:([^\r\n]+)/);

      // Calculate hit/miss rates from recent metrics
      const { hitRate, missRate, avgResponseTime } =
        await this.calculateCachePerformance();

      return {
        totalKeys: cacheKeys.length,
        memoryUsage: memoryMatch ? memoryMatch[1] : '0B',
        hitRate,
        missRate,
        avgResponseTime,
      };
    } catch (error) {
      console.error('Cache stats error:', error);
      return {
        totalKeys: 0,
        memoryUsage: '0B',
        hitRate: 0,
        missRate: 0,
        avgResponseTime: 0,
      };
    }
  }

  /**
   * Calculate cache performance metrics
   */
  private async calculateCachePerformance(): Promise<{
    hitRate: number;
    missRate: number;
    avgResponseTime: number;
  }> {
    if (!this.redis) {
      return { hitRate: 0, missRate: 0, avgResponseTime: 0 };
    }

    try {
      const today = new Date().toISOString().split('T')[0];
      const metricsKey = `search_metrics_aggregated:${today}`;

      const [totalHits, totalMisses, totalResponseTime, totalSearches] =
        await Promise.all([
          this.redis
            .hGet(metricsKey, 'cache_hits')
            .then((val: string | null) => Number.parseInt(val || '0')),
          this.redis
            .hGet(metricsKey, 'cache_misses')
            .then((val: string | null) => Number.parseInt(val || '0')),
          this.redis
            .hGet(metricsKey, 'total_response_time')
            .then((val: string | null) => Number.parseInt(val || '0')),
          this.redis
            .hGet(metricsKey, 'total_searches')
            .then((val: string | null) => Number.parseInt(val || '0')),
        ]);

      const totalRequests = totalHits + totalMisses;

      return {
        hitRate: totalRequests > 0 ? totalHits / totalRequests : 0,
        missRate: totalRequests > 0 ? totalMisses / totalRequests : 0,
        avgResponseTime:
          totalSearches > 0 ? totalResponseTime / totalSearches : 0,
      };
    } catch (error) {
      console.error('Cache performance calculation error:', error);
      return { hitRate: 0, missRate: 0, avgResponseTime: 0 };
    }
  }

  /**
   * Get search performance trends
   */
  async getPerformanceTrends(
    userId: string,
    days = 7,
  ): Promise<
    Array<{
      date: string;
      totalSearches: number;
      avgResponseTime: number;
      cacheHitRate: number;
      successRate: number;
    }>
  > {
    if (!this.redis) {
      return [];
    }

    try {
      const dateKeys = this.generateDateKeys(days);
      const trends = [];

      for (const date of dateKeys) {
        const metricsKey = `search_metrics:${userId}:${date}`;

        const [
          totalSearches,
          totalResponseTime,
          cacheHits,
          successfulSearches,
        ] = await Promise.all([
          this.redis
            .hGet(metricsKey, 'total_searches')
            .then((val: string | null) => Number.parseInt(val || '0')),
          this.redis
            .hGet(metricsKey, 'total_response_time')
            .then((val: string | null) => Number.parseInt(val || '0')),
          this.redis
            .hGet(metricsKey, 'cache_hits')
            .then((val: string | null) => Number.parseInt(val || '0')),
          this.redis
            .hGet(metricsKey, 'successful_searches')
            .then((val: string | null) => Number.parseInt(val || '0')),
        ]);

        trends.push({
          date,
          totalSearches,
          avgResponseTime:
            totalSearches > 0 ? totalResponseTime / totalSearches : 0,
          cacheHitRate: totalSearches > 0 ? cacheHits / totalSearches : 0,
          successRate:
            totalSearches > 0 ? successfulSearches / totalSearches : 0,
        });
      }

      return trends;
    } catch (error) {
      console.error('Performance trends retrieval error:', error);
      return [];
    }
  }

  /**
   * Clear analytics data for a user or globally
   */
  async clearAnalytics(userId?: string, olderThanDays = 30): Promise<boolean> {
    if (!this.redis) {
      return false;
    }

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const pattern = userId ? `*${userId}*` : '*';
      const searchKeys = await this.redis.keys(`search_metrics${pattern}`);
      const queryKeys = await this.redis.keys(`popular_queries${pattern}`);

      // Filter keys older than cutoff date
      const keysToDelete = [...searchKeys, ...queryKeys].filter((key) => {
        const dateMatch = key.match(/(\d{4}-\d{2}-\d{2})/);
        if (dateMatch) {
          const keyDate = new Date(dateMatch[1]);
          return keyDate < cutoffDate;
        }
        return false;
      });

      if (keysToDelete.length > 0) {
        await this.redis.del(keysToDelete);
      }

      return true;
    } catch (error) {
      console.error('Analytics clear error:', error);
      return false;
    }
  }

  /**
   * Generate health report for search system
   */
  async generateHealthReport(): Promise<{
    status: 'healthy' | 'warning' | 'error';
    metrics: {
      totalUsers: number;
      totalQueries: number;
      avgResponseTime: number;
      errorRate: number;
      cacheEfficiency: number;
    };
    issues: string[];
  }> {
    const issues: string[] = [];
    let status: 'healthy' | 'warning' | 'error' = 'healthy';

    try {
      // Get global metrics for today
      const today = new Date().toISOString().split('T')[0];
      const globalKey = `search_metrics_global:${today}`;

      const [
        totalQueries,
        totalResponseTime,
        totalErrors,
        cacheHits,
        cacheMisses,
      ] = await Promise.all([
        this.redis
          ?.hGet(globalKey, 'total_queries')
          .then((val: string | null) => Number.parseInt(val || '0')) || 0,
        this.redis
          ?.hGet(globalKey, 'total_response_time')
          .then((val: string | null) => Number.parseInt(val || '0')) || 0,
        this.redis
          ?.hGet(globalKey, 'total_errors')
          .then((val: string | null) => Number.parseInt(val || '0')) || 0,
        this.redis
          ?.hGet(globalKey, 'cache_hits')
          .then((val: string | null) => Number.parseInt(val || '0')) || 0,
        this.redis
          ?.hGet(globalKey, 'cache_misses')
          .then((val: string | null) => Number.parseInt(val || '0')) || 0,
      ]);

      const avgResponseTime =
        totalQueries > 0 ? totalResponseTime / totalQueries : 0;
      const errorRate = totalQueries > 0 ? totalErrors / totalQueries : 0;
      const totalCacheRequests = cacheHits + cacheMisses;
      const cacheEfficiency =
        totalCacheRequests > 0 ? cacheHits / totalCacheRequests : 0;

      // Check for issues
      if (avgResponseTime > 2000) {
        issues.push('High average response time (>2s)');
        status = 'warning';
      }

      if (errorRate > 0.05) {
        issues.push('High error rate (>5%)');
        status = 'error';
      }

      if (cacheEfficiency < 0.3 && totalCacheRequests > 100) {
        issues.push('Low cache efficiency (<30%)');
        status = 'warning';
      }

      if (!this.redis || !this.redis.isReady) {
        issues.push('Redis connection unavailable');
        status = 'error';
      }

      return {
        status,
        metrics: {
          totalUsers: 0, // Would need user counting logic
          totalQueries,
          avgResponseTime,
          errorRate,
          cacheEfficiency,
        },
        issues,
      };
    } catch (error) {
      console.error('Health report generation error:', error);
      return {
        status: 'error',
        metrics: {
          totalUsers: 0,
          totalQueries: 0,
          avgResponseTime: 0,
          errorRate: 0,
          cacheEfficiency: 0,
        },
        issues: ['Failed to generate health report'],
      };
    }
  }

  // Helper methods

  private getEmptyAnalytics(): SearchAnalyticsData {
    return {
      totalSearches: 0,
      avgResponseTime: 0,
      cacheHitRate: 0,
      popularQueries: [],
      algorithmUsage: {},
    };
  }

  private getTimeRangeDays(timeRange: 'day' | 'week' | 'month'): number {
    switch (timeRange) {
      case 'day':
        return 1;
      case 'week':
        return 7;
      case 'month':
        return 30;
      default:
        return 1;
    }
  }

  private generateDateKeys(days: number): string[] {
    const keys: string[] = [];
    const today = new Date();

    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      keys.push(date.toISOString().split('T')[0]);
    }

    return keys;
  }

  private async aggregateMetricsForDates(
    userId: string,
    dateKeys: string[],
  ): Promise<SearchAnalyticsData> {
    if (!this.redis) {
      return this.getEmptyAnalytics();
    }

    let totalSearches = 0;
    let totalResponseTime = 0;
    let cacheHits = 0;
    const algorithmUsage: Record<string, number> = {};
    const popularQueries: Map<string, number> = new Map();

    for (const date of dateKeys) {
      const metricsKey = `search_metrics:${userId}:${date}`;
      const metrics = await this.redis.hGetAll(metricsKey);

      totalSearches += Number.parseInt(metrics.total_searches || '0');
      totalResponseTime += Number.parseInt(metrics.total_response_time || '0');
      cacheHits += Number.parseInt(metrics.cache_hits || '0');

      // Aggregate algorithm usage
      Object.entries(metrics).forEach(([key, value]) => {
        if (key.startsWith('algorithm_')) {
          const algorithm = key.replace('algorithm_', '');
          algorithmUsage[algorithm] =
            (algorithmUsage[algorithm] || 0) + Number.parseInt(String(value || '0'));
        }
      });

      // Aggregate popular queries
      const queryKey = `popular_queries:${userId}:${date}`;
      const queries = await this.redis.zRangeWithScores(queryKey, 0, 9, {
        REV: true,
      });

      for (const entry of queries) {
        popularQueries.set(
          entry.value,
          (popularQueries.get(entry.value) || 0) + entry.score,
        );
      }
    }

    return {
      totalSearches,
      avgResponseTime:
        totalSearches > 0 ? totalResponseTime / totalSearches : 0,
      cacheHitRate: totalSearches > 0 ? cacheHits / totalSearches : 0,
      popularQueries: Array.from(popularQueries.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([query, count]) => ({ query, count })),
      algorithmUsage,
    };
  }

  /**
   * Cleanup method
   */
  async cleanup(): Promise<void> {
    if (this.bufferFlushInterval) {
      clearInterval(this.bufferFlushInterval);
      this.bufferFlushInterval = null;
    }

    // Flush any remaining metrics
    await this.flushMetricsBuffer();
  }
}
