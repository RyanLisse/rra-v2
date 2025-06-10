#!/usr/bin/env bun

/**
 * Cache Statistics Script
 *
 * Displays comprehensive cache statistics across all cache services
 */

import { CacheUtils, enhancedCohereService } from '@/lib/cache';
import pino from 'pino';

const logger = pino({
  name: 'cache-stats',
  level: 'info',
  transport: {
    target: 'pino-pretty',
  },
});

async function displayCacheStats(): Promise<void> {
  try {
    console.log('🔍 Gathering cache statistics...\n');

    // Get comprehensive stats
    const allStats = await CacheUtils.getAllCacheStats();
    const cohereMetrics = enhancedCohereService.getMetrics();

    // Display Redis Cache Stats
    console.log('📊 Redis Cache Statistics');
    console.log('========================');
    console.log(`Hit Rate: ${allStats.redis.hitRate}%`);
    console.log(`Total Keys: ${allStats.redis.totalKeys.toLocaleString()}`);
    console.log(`Memory Usage: ${allStats.redis.memoryUsage}`);
    console.log(`Operations/sec: ${allStats.redis.operationsPerSecond}`);
    console.log(`Cache Hits: ${allStats.redis.hits.toLocaleString()}`);
    console.log(`Cache Misses: ${allStats.redis.misses.toLocaleString()}`);
    console.log('');

    // Display Cohere Cache Stats
    console.log('🧠 Cohere Embedding Cache Statistics');
    console.log('===================================');
    console.log(`Hit Rate: ${allStats.cohere.hitRate}%`);
    console.log(
      `Total Embeddings: ${allStats.cohere.totalEmbeddings.toLocaleString()}`,
    );
    console.log(`Cache Size: ${allStats.cohere.cacheSize}`);
    console.log(`Avg Response Time: ${allStats.cohere.avgResponseTime}ms`);
    console.log('');

    // Display Cohere Performance Metrics
    console.log('⚡ Cohere Performance Metrics');
    console.log('============================');
    console.log(
      `Embedding Cache Hit Rate: ${cohereMetrics.embeddingCacheHitRate}%`,
    );
    console.log(`Rerank Cache Hit Rate: ${cohereMetrics.rerankCacheHitRate}%`);
    console.log(`Avg API Response Time: ${cohereMetrics.avgApiResponseTime}ms`);
    console.log(
      `Avg Cache Response Time: ${cohereMetrics.avgCacheResponseTime}ms`,
    );
    console.log(
      `Total Requests: ${cohereMetrics.totalRequests.toLocaleString()}`,
    );
    console.log('');

    // Display Middleware Cache Stats
    console.log('🌐 API Middleware Cache Statistics');
    console.log('=================================');
    console.log(`Hit Rate: ${allStats.middleware.hitRate}%`);
    console.log(
      `Total Keys: ${allStats.middleware.totalKeys.toLocaleString()}`,
    );
    console.log(`Memory Usage: ${allStats.middleware.memoryUsage}`);
    console.log('');

    // Calculate performance improvements
    const embeddingCacheHitRate = cohereMetrics.embeddingCacheHitRate / 100;
    const avgApiTime = cohereMetrics.avgApiResponseTime || 500; // Default estimate
    const avgCacheTime = cohereMetrics.avgCacheResponseTime || 10;

    const timeSaved = embeddingCacheHitRate * (avgApiTime - avgCacheTime);
    const percentageImprovement =
      embeddingCacheHitRate * ((avgApiTime - avgCacheTime) / avgApiTime) * 100;

    console.log('💡 Performance Impact');
    console.log('====================');
    console.log(`Estimated time saved per request: ${timeSaved.toFixed(1)}ms`);
    console.log(
      `Performance improvement: ${percentageImprovement.toFixed(1)}%`,
    );

    // Cost savings (rough estimate)
    const totalRequests = cohereMetrics.totalRequests;
    const cacheHits =
      totalRequests * (cohereMetrics.embeddingCacheHitRate / 100);
    const estimatedCostPerRequest = 0.0001; // $0.0001 per embedding request (estimate)
    const costSaved = cacheHits * estimatedCostPerRequest;

    console.log(`Estimated API calls saved: ${cacheHits.toLocaleString()}`);
    console.log(`Estimated cost savings: $${costSaved.toFixed(4)}`);
    console.log('');

    // Cache health assessment
    const health = await CacheUtils.monitorCacheHealth();
    console.log('🏥 Cache Health Assessment');
    console.log('=========================');
    console.log(
      `Overall Health: ${health.healthy ? '✅ Healthy' : '❌ Issues Detected'}`,
    );

    if (health.issues.length > 0) {
      console.log('\n⚠️  Issues Found:');
      health.issues.forEach((issue, index) => {
        console.log(`${index + 1}. ${issue}`);
      });
    }

    if (health.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      health.recommendations.forEach((rec, index) => {
        console.log(`${index + 1}. ${rec}`);
      });
    }

    console.log('\n✅ Cache statistics completed successfully!');
  } catch (error) {
    logger.error({ error }, 'Failed to gather cache statistics');
    process.exit(1);
  }
}

// Run the stats display
displayCacheStats().catch((error) => {
  logger.error({ error }, 'Cache stats script failed');
  process.exit(1);
});
