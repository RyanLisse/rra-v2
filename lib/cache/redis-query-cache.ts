import 'server-only';

import { getRedisClient, } from './redis-client';
import { logger } from '../monitoring/logger';

// In-memory fallback cache with lazy cleanup
const memoryCache = new Map<
  string,
  { data: any; timestamp: number; ttl: number }
>();

// Lazy cleanup function - called during get operations
function cleanupExpiredEntries() {
  const now = Date.now();
  for (const [key, cached] of memoryCache.entries()) {
    if (now - cached.timestamp > cached.ttl) {
      memoryCache.delete(key);
    }
  }
}

/**
 * Get cached result from Redis with automatic fallback
 */
export async function getCachedResult<T>(key: string): Promise<T | null> {
  try {
    const redis = await getRedisClient();
    
    if (!redis) {
      // Clean up expired entries before checking memory cache
      if (memoryCache.size > 100) { // Only cleanup when cache grows large
        cleanupExpiredEntries();
      }
      
      // Fallback to memory cache
      const cached = memoryCache.get(key);
      if (cached && Date.now() - cached.timestamp < cached.ttl) {
        return cached.data as T;
      }
      memoryCache.delete(key);
      return null;
    }
    
    const result = await redis.get(key);
    if (!result) return null;
    
    try {
      return JSON.parse(result) as T;
    } catch (error) {
      logger.error('Failed to parse cached result', { key, error });
      await redis.del(key); // Remove corrupted cache entry
      return null;
    }
  } catch (error) {
    logger.error('Redis cache get error', { key, error });
    
    // Fallback to memory cache
    const cached = memoryCache.get(key);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.data as T;
    }
    return null;
  }
}

/**
 * Set cached result in Redis with automatic fallback
 */
export async function setCachedResult<T>(
  key: string,
  data: T,
  ttlMs = 60000,
): Promise<void> {
  try {
    const redis = await getRedisClient();
    
    if (!redis) {
      // Fallback to memory cache
      memoryCache.set(key, { data, timestamp: Date.now(), ttl: ttlMs });
      return;
    }
    
    const ttlSec = Math.ceil(ttlMs / 1000);
    const serialized = JSON.stringify(data);
    
    await redis.setex(key, ttlSec, serialized);
    
    // Also set in memory cache for faster access
    memoryCache.set(key, { data, timestamp: Date.now(), ttl: ttlMs });
  } catch (error) {
    logger.error('Redis cache set error', { key, error });
    
    // Fallback to memory cache
    memoryCache.set(key, { data, timestamp: Date.now(), ttl: ttlMs });
  }
}

/**
 * Invalidate cache entries matching a pattern
 */
export async function invalidateCache(pattern: string): Promise<void> {
  try {
    const redis = await getRedisClient();
    
    if (!redis) {
      // Fallback to memory cache
      for (const key of memoryCache.keys()) {
        if (key.includes(pattern)) {
          memoryCache.delete(key);
        }
      }
      return;
    }
    
    // Use SCAN instead of KEYS for better performance
    const stream = redis.scanStream({
      match: `*${pattern}*`,
      count: 100,
    });
    
    const pipeline = redis.pipeline();
    
    stream.on('data', (keys: string[]) => {
      if (keys.length) {
        keys.forEach((key) => {
          pipeline.del(key);
          memoryCache.delete(key); // Also remove from memory cache
        });
      }
    });
    
    stream.on('end', async () => {
      await pipeline.exec();
      logger.info(`Cache invalidated for pattern: ${pattern}`);
    });
    
    stream.on('error', (error) => {
      logger.error('Cache invalidation error', { pattern, error });
    });
  } catch (error) {
    logger.error('Redis cache invalidation error', { pattern, error });
    
    // Fallback to memory cache invalidation
    for (const key of memoryCache.keys()) {
      if (key.includes(pattern)) {
        memoryCache.delete(key);
      }
    }
  }
}

/**
 * Clear all cache entries
 */
export async function clearAllCache(): Promise<void> {
  try {
    const redis = await getRedisClient();
    
    if (!redis) {
      memoryCache.clear();
      return;
    }
    
    await redis.flushdb();
    memoryCache.clear();
    logger.info('All cache cleared');
  } catch (error) {
    logger.error('Failed to clear all cache', error);
    memoryCache.clear();
  }
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
  redisKeys: number;
  memoryKeys: number;
  redisMemoryUsage: string;
  isRedisConnected: boolean;
}> {
  try {
    const redis = await getRedisClient();
    let redisKeys = 0;
    let redisMemoryUsage = 'N/A';
    let isRedisConnected = false;
    
    if (redis) {
      try {
        redisKeys = await redis.dbsize();
        const info = await redis.info('memory');
        const memoryMatch = info.match(/used_memory_human:(\S+)/);
        redisMemoryUsage = memoryMatch ? memoryMatch[1] : 'N/A';
        isRedisConnected = true;
      } catch (error) {
        logger.error('Failed to get Redis stats', error);
      }
    }
    
    return {
      redisKeys,
      memoryKeys: memoryCache.size,
      redisMemoryUsage,
      isRedisConnected,
    };
  } catch (error) {
    logger.error('Failed to get cache stats', error);
    return {
      redisKeys: 0,
      memoryKeys: memoryCache.size,
      redisMemoryUsage: 'N/A',
      isRedisConnected: false,
    };
  }
}

/**
 * Batch get multiple cache entries
 */
export async function getBatchCached<T>(
  keys: string[],
): Promise<Map<string, T>> {
  const results = new Map<string, T>();
  
  try {
    const redis = await getRedisClient();
    
    if (!redis) {
      // Fallback to memory cache
      for (const key of keys) {
        const cached = memoryCache.get(key);
        if (cached && Date.now() - cached.timestamp < cached.ttl) {
          results.set(key, cached.data as T);
        }
      }
      return results;
    }
    
    const values = await redis.mget(...keys);
    
    values.forEach((value, index) => {
      if (value) {
        try {
          results.set(keys[index], JSON.parse(value) as T);
        } catch (error) {
          logger.error('Failed to parse batch cached result', {
            key: keys[index],
            error,
          });
        }
      }
    });
    
    // Fill missing values from memory cache
    for (const key of keys) {
      if (!results.has(key)) {
        const cached = memoryCache.get(key);
        if (cached && Date.now() - cached.timestamp < cached.ttl) {
          results.set(key, cached.data as T);
        }
      }
    }
    
    return results;
  } catch (error) {
    logger.error('Batch cache get error', error);
    
    // Fallback to memory cache
    for (const key of keys) {
      const cached = memoryCache.get(key);
      if (cached && Date.now() - cached.timestamp < cached.ttl) {
        results.set(key, cached.data as T);
      }
    }
    return results;
  }
}

/**
 * Batch set multiple cache entries
 */
export async function setBatchCached<T>(
  entries: Array<{ key: string; data: T; ttlMs?: number }>,
): Promise<void> {
  try {
    const redis = await getRedisClient();
    
    if (!redis) {
      // Fallback to memory cache
      for (const { key, data, ttlMs = 60000 } of entries) {
        memoryCache.set(key, { data, timestamp: Date.now(), ttl: ttlMs });
      }
      return;
    }
    
    const pipeline = redis.pipeline();
    
    for (const { key, data, ttlMs = 60000 } of entries) {
      const ttlSec = Math.ceil(ttlMs / 1000);
      const serialized = JSON.stringify(data);
      pipeline.setex(key, ttlSec, serialized);
      
      // Also set in memory cache
      memoryCache.set(key, { data, timestamp: Date.now(), ttl: ttlMs });
    }
    
    await pipeline.exec();
  } catch (error) {
    logger.error('Batch cache set error', error);
    
    // Fallback to memory cache
    for (const { key, data, ttlMs = 60000 } of entries) {
      memoryCache.set(key, { data, timestamp: Date.now(), ttl: ttlMs });
    }
  }
}

/**
 * Cache wrapper for async functions
 */
export function withCache<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options: {
    keyGenerator: (...args: Parameters<T>) => string;
    ttlMs?: number;
    namespace?: string;
  },
): T {
  return (async (...args: Parameters<T>) => {
    const key = options.namespace
      ? `${options.namespace}:${options.keyGenerator(...args)}`
      : options.keyGenerator(...args);
    
    // Try to get from cache
    const cached = await getCachedResult<ReturnType<T>>(key);
    if (cached !== null) {
      return cached;
    }
    
    // Execute function
    const result = await fn(...args);
    
    // Cache the result
    await setCachedResult(key, result, options.ttlMs);
    
    return result;
  }) as T;
}