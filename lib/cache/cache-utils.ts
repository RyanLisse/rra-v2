import 'server-only';

import { getRedisClient, CacheKeys, CacheTTL, warmCache } from './redis-client';
import { getCacheStats, } from './redis-query-cache';
import { logger } from '../monitoring/logger';

/**
 * Cache health check - verifies Redis connection and returns stats
 */
export async function checkCacheHealth() {
  try {
    const redis = await getRedisClient();
    const isConnected = !!redis;
    const stats = await getCacheStats();
    
    return {
      healthy: isConnected,
      ...stats,
    };
  } catch (error) {
    logger.error('Cache health check failed', error);
    return {
      healthy: false,
      redisKeys: 0,
      memoryKeys: 0,
      redisMemoryUsage: 'N/A',
      isRedisConnected: false,
    };
  }
}

/**
 * Warm up frequently accessed cache entries
 */
export async function warmupCache() {
  try {
    logger.info('Starting cache warmup...');
    
    // Warm up frequently accessed patterns
    await warmCache([
      CacheKeys.query.user.pattern,
      CacheKeys.query.chat.pattern,
      CacheKeys.query.messages.pattern,
      CacheKeys.query.ragDocuments.pattern,
    ]);
    
    logger.info('Cache warmup completed');
  } catch (error) {
    logger.error('Cache warmup failed', error);
  }
}

/**
 * Clear specific cache patterns
 */
export async function clearCachePatterns(patterns: string[]) {
  try {
    const redis = await getRedisClient();
    if (!redis) {
      logger.warn('Redis not available, cannot clear cache patterns');
      return;
    }
    
    for (const pattern of patterns) {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
        logger.info(`Cleared ${keys.length} keys matching pattern: ${pattern}`);
      }
    }
  } catch (error) {
    logger.error('Failed to clear cache patterns', error);
  }
}

/**
 * Monitor cache performance
 */
export async function monitorCachePerformance() {
  const stats = await getCacheStats();
  
  // Log cache stats
  logger.info('Cache performance stats', stats);
  
  // Check if cache is getting too large
  if (stats.redisKeys > 10000) {
    logger.warn('Redis cache has over 10,000 keys, consider cleanup');
  }
  
  if (stats.memoryKeys > 1000) {
    logger.warn('Memory cache has over 1,000 keys, consider cleanup');
  }
  
  return stats;
}

/**
 * Cache maintenance - cleanup old entries
 */
export async function performCacheMaintenance() {
  try {
    const redis = await getRedisClient();
    if (!redis) return;
    
    // Get all keys with their TTLs
    const keys = await redis.keys('*');
    let expiredCount = 0;
    let nearExpiryCount = 0;
    
    for (const key of keys) {
      const ttl = await redis.ttl(key);
      
      // Remove keys with negative TTL (should not exist but just in case)
      if (ttl < 0) {
        await redis.del(key);
        expiredCount++;
      }
      // Count keys expiring soon (within 60 seconds)
      else if (ttl < 60) {
        nearExpiryCount++;
      }
    }
    
    logger.info(`Cache maintenance: removed ${expiredCount} expired keys, ${nearExpiryCount} keys expiring soon`);
  } catch (error) {
    logger.error('Cache maintenance failed', error);
  }
}

/**
 * Export cache configuration for debugging
 */
export function getCacheConfig() {
  return {
    ttl: CacheTTL,
    keys: CacheKeys,
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || '6379',
      db: process.env.REDIS_DB || '0',
    },
  };
}