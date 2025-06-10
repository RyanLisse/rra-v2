/**
 * Redis Cache Manager - Comprehensive caching layer for RRA_V2
 *
 * Implements Redis caching integration across the application:
 * - Document processing cache
 * - Search result caching (extends existing implementation)
 * - Session data caching
 * - API response caching
 * - Multimodal content caching
 * - Workflow state caching
 */

import { createClient, type RedisClientType } from 'redis';
import crypto from 'node:crypto';
import pino from 'pino';

const logger = pino({
  name: 'redis-cache-manager',
  level: process.env.LOG_LEVEL || 'info',
});

export interface CacheConfig {
  url?: string;
  ttl: {
    default: number;
    search: number;
    document: number;
    session: number;
    api: number;
    workflow: number;
    embedding: number;
    image: number;
  };
  keyPrefixes: {
    search: string;
    document: string;
    session: string;
    api: string;
    workflow: string;
    embedding: string;
    image: string;
  };
  compression: {
    enabled: boolean;
    threshold: number; // bytes
  };
  monitoring: {
    enabled: boolean;
    metricsPrefix: string;
  };
}

export interface CacheMetrics {
  hits: number;
  misses: number;
  hitRate: number;
  totalKeys: number;
  memoryUsage: string;
  avgResponseTime: number;
  operationsPerSecond: number;
}

export interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  ttl: number;
  compressed?: boolean;
  version?: string;
  metadata?: Record<string, any>;
}

export class RedisCacheManager {
  private client: RedisClientType | null = null;
  private config: CacheConfig;
  private isConnected = false;
  private metrics = {
    hits: 0,
    misses: 0,
    operations: 0,
    errors: 0,
    lastResetTime: Date.now(),
  };

  constructor(config?: Partial<CacheConfig>) {
    this.config = {
      url: process.env.REDIS_URL,
      ttl: {
        default: 3600, // 1 hour
        search: 1800, // 30 minutes
        document: 7200, // 2 hours
        session: 86400, // 24 hours
        api: 300, // 5 minutes
        workflow: 3600, // 1 hour
        embedding: 14400, // 4 hours
        image: 7200, // 2 hours (same as document)
      },
      keyPrefixes: {
        search: 'search:',
        document: 'doc:',
        session: 'session:',
        api: 'api:',
        workflow: 'workflow:',
        embedding: 'embed:',
        image: 'img:',
      },
      compression: {
        enabled: true,
        threshold: 1024, // 1KB
      },
      monitoring: {
        enabled: process.env.CACHE_MONITORING_ENABLED !== 'false',
        metricsPrefix: 'cache:metrics:',
      },
      ...config,
    };

    this.initializeRedis();
  }

  private async initializeRedis(): Promise<void> {
    if (!this.config.url) {
      logger.warn('Redis URL not configured, caching disabled');
      return;
    }

    try {
      this.client = createClient({
        url: this.config.url,
        socket: {
          reconnectStrategy: (retries) => Math.min(retries * 50, 500),
        },
      });

      this.client.on('error', (error) => {
        logger.error({ error }, 'Redis connection error');
        this.isConnected = false;
        this.metrics.errors++;
      });

      this.client.on('connect', () => {
        logger.info('Redis client connected');
        this.isConnected = true;
      });

      this.client.on('ready', () => {
        logger.info('Redis client ready');
      });

      this.client.on('disconnect', () => {
        logger.warn('Redis client disconnected');
        this.isConnected = false;
      });

      await this.client.connect();
    } catch (error) {
      logger.error({ error }, 'Failed to initialize Redis client');
      this.client = null;
    }
  }

  /**
   * Get data from cache
   */
  async get<T = any>(
    key: string,
    prefix?: keyof CacheConfig['keyPrefixes'],
  ): Promise<T | null> {
    if (!this.isAvailable()) return null;

    const cacheKey = this.buildKey(key, prefix);
    const startTime = Date.now();

    try {
      const rawData = await this.client?.get(cacheKey);

      if (!rawData) {
        this.metrics.misses++;
        this.trackMetrics('miss', Date.now() - startTime);
        return null;
      }

      const entry: CacheEntry<T> = JSON.parse(rawData);

      // Check if expired (additional safety check)
      if (entry.timestamp + entry.ttl * 1000 < Date.now()) {
        await this.delete(key, prefix);
        this.metrics.misses++;
        this.trackMetrics('miss', Date.now() - startTime);
        return null;
      }

      this.metrics.hits++;
      this.trackMetrics('hit', Date.now() - startTime);

      return entry.data;
    } catch (error) {
      logger.error({ error, key: cacheKey }, 'Cache get error');
      this.metrics.errors++;
      return null;
    }
  }

  /**
   * Set data in cache
   */
  async set<T = any>(
    key: string,
    data: T,
    options: {
      prefix?: keyof CacheConfig['keyPrefixes'];
      ttl?: number;
      metadata?: Record<string, any>;
      version?: string;
    } = {},
  ): Promise<boolean> {
    if (!this.isAvailable()) return false;

    const { prefix, ttl, metadata, version } = options;
    const cacheKey = this.buildKey(key, prefix);
    const cacheTtl = ttl || this.getTtl(prefix);
    const startTime = Date.now();

    try {
      const entry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
        ttl: cacheTtl,
        metadata,
        version,
      };

      const serializedData = JSON.stringify(entry);

      // Check if compression is needed
      if (
        this.config.compression.enabled &&
        serializedData.length > this.config.compression.threshold
      ) {
        entry.compressed = true;
        // Note: In production, you might want to use actual compression like gzip
      }

      await this.client?.setEx(cacheKey, cacheTtl, JSON.stringify(entry));

      this.trackMetrics('set', Date.now() - startTime);
      return true;
    } catch (error) {
      logger.error({ error, key: cacheKey }, 'Cache set error');
      this.metrics.errors++;
      return false;
    }
  }

  /**
   * Delete data from cache
   */
  async delete(
    key: string,
    prefix?: keyof CacheConfig['keyPrefixes'],
  ): Promise<boolean> {
    if (!this.isAvailable()) return false;

    const cacheKey = this.buildKey(key, prefix);

    try {
      const result = await this.client?.del(cacheKey);
      return (result || 0) > 0;
    } catch (error) {
      logger.error({ error, key: cacheKey }, 'Cache delete error');
      this.metrics.errors++;
      return false;
    }
  }

  /**
   * Check if key exists in cache
   */
  async exists(
    key: string,
    prefix?: keyof CacheConfig['keyPrefixes'],
  ): Promise<boolean> {
    if (!this.isAvailable()) return false;

    const cacheKey = this.buildKey(key, prefix);

    try {
      const result = await this.client?.exists(cacheKey);
      return result === 1;
    } catch (error) {
      logger.error({ error, key: cacheKey }, 'Cache exists error');
      return false;
    }
  }

  /**
   * Increment counter in cache
   */
  async increment(
    key: string,
    prefix?: keyof CacheConfig['keyPrefixes'],
    increment = 1,
  ): Promise<number | null> {
    if (!this.isAvailable()) return null;

    const cacheKey = this.buildKey(key, prefix);

    try {
      const result = await this.client?.incrBy(cacheKey, increment);

      // Set expiration if this is a new key
      const ttl = await this.client?.ttl(cacheKey);
      if (ttl === -1) {
        await this.client?.expire(cacheKey, this.getTtl(prefix));
      }

      return result || null;
    } catch (error) {
      logger.error({ error, key: cacheKey }, 'Cache increment error');
      this.metrics.errors++;
      return null;
    }
  }

  /**
   * Set with hash operations for complex objects
   */
  async hSet(
    key: string,
    field: string,
    value: any,
    options: {
      prefix?: keyof CacheConfig['keyPrefixes'];
      ttl?: number;
    } = {},
  ): Promise<boolean> {
    if (!this.isAvailable()) return false;

    const { prefix, ttl } = options;
    const cacheKey = this.buildKey(key, prefix);

    try {
      const serializedValue =
        typeof value === 'string' ? value : JSON.stringify(value);
      await this.client?.hSet(cacheKey, field, serializedValue);

      // Set expiration
      const cacheTtl = ttl || this.getTtl(prefix);
      await this.client?.expire(cacheKey, cacheTtl);

      return true;
    } catch (error) {
      logger.error({ error, key: cacheKey, field }, 'Cache hSet error');
      this.metrics.errors++;
      return false;
    }
  }

  /**
   * Get from hash
   */
  async hGet<T = any>(
    key: string,
    field: string,
    prefix?: keyof CacheConfig['keyPrefixes'],
  ): Promise<T | null> {
    if (!this.isAvailable()) return null;

    const cacheKey = this.buildKey(key, prefix);

    try {
      const value = await this.client?.hGet(cacheKey, field);

      if (!value) return null;

      try {
        return JSON.parse(value);
      } catch {
        return value as T;
      }
    } catch (error) {
      logger.error({ error, key: cacheKey, field }, 'Cache hGet error');
      this.metrics.errors++;
      return null;
    }
  }

  /**
   * Get all hash fields
   */
  async hGetAll<T = Record<string, any>>(
    key: string,
    prefix?: keyof CacheConfig['keyPrefixes'],
  ): Promise<T | null> {
    if (!this.isAvailable()) return null;

    const cacheKey = this.buildKey(key, prefix);

    try {
      const hash = await this.client?.hGetAll(cacheKey);

      if (!hash || Object.keys(hash).length === 0) return null;

      // Parse JSON values
      const parsed: any = {};
      for (const [field, value] of Object.entries(hash)) {
        try {
          parsed[field] = JSON.parse(value);
        } catch {
          parsed[field] = value;
        }
      }

      return parsed;
    } catch (error) {
      logger.error({ error, key: cacheKey }, 'Cache hGetAll error');
      this.metrics.errors++;
      return null;
    }
  }

  /**
   * List operations for queue-like functionality
   */
  async lpush(
    key: string,
    value: any,
    prefix?: keyof CacheConfig['keyPrefixes'],
  ): Promise<number | null> {
    if (!this.isAvailable()) return null;

    const cacheKey = this.buildKey(key, prefix);

    try {
      const serializedValue =
        typeof value === 'string' ? value : JSON.stringify(value);
      const result = await this.client?.lPush(cacheKey, serializedValue);

      // Set expiration if this is a new key
      const ttl = await this.client?.ttl(cacheKey);
      if (ttl === -1) {
        await this.client?.expire(cacheKey, this.getTtl(prefix));
      }

      return result || null;
    } catch (error) {
      logger.error({ error, key: cacheKey }, 'Cache lpush error');
      this.metrics.errors++;
      return null;
    }
  }

  /**
   * Pop from list
   */
  async lpop<T = any>(
    key: string,
    prefix?: keyof CacheConfig['keyPrefixes'],
  ): Promise<T | null> {
    if (!this.isAvailable()) return null;

    const cacheKey = this.buildKey(key, prefix);

    try {
      const value = await this.client?.lPop(cacheKey);

      if (!value) return null;

      try {
        return JSON.parse(value);
      } catch {
        return value as T;
      }
    } catch (error) {
      logger.error({ error, key: cacheKey }, 'Cache lpop error');
      this.metrics.errors++;
      return null;
    }
  }

  /**
   * Get list range
   */
  async lrange<T = any>(
    key: string,
    start: number,
    end: number,
    prefix?: keyof CacheConfig['keyPrefixes'],
  ): Promise<T[]> {
    if (!this.isAvailable()) return [];

    const cacheKey = this.buildKey(key, prefix);

    try {
      const values = await this.client?.lRange(cacheKey, start, end);

      return (values || []).map((value) => {
        try {
          return JSON.parse(value);
        } catch {
          return value as T;
        }
      });
    } catch (error) {
      logger.error({ error, key: cacheKey }, 'Cache lrange error');
      this.metrics.errors++;
      return [];
    }
  }

  /**
   * Clear cache by pattern
   */
  async clear(
    pattern?: string,
    prefix?: keyof CacheConfig['keyPrefixes'],
  ): Promise<number> {
    if (!this.isAvailable()) return 0;

    try {
      const searchPattern = pattern
        ? this.buildKey(pattern, prefix)
        : prefix
          ? `${this.config.keyPrefixes[prefix]}*`
          : '*';

      const keys = await this.client?.keys(searchPattern);

      if (!keys || keys.length === 0) return 0;

      const result = await this.client?.del(keys);
      logger.info(
        { deletedKeys: result, pattern: searchPattern },
        'Cache cleared',
      );

      return result || 0;
    } catch (error) {
      logger.error({ error, pattern }, 'Cache clear error');
      this.metrics.errors++;
      return 0;
    }
  }

  /**
   * Get cache metrics
   */
  async getMetrics(): Promise<CacheMetrics> {
    const hitRate =
      this.metrics.hits + this.metrics.misses > 0
        ? (this.metrics.hits / (this.metrics.hits + this.metrics.misses)) * 100
        : 0;

    const timeElapsed = (Date.now() - this.metrics.lastResetTime) / 1000;
    const operationsPerSecond =
      timeElapsed > 0 ? this.metrics.operations / timeElapsed : 0;

    let totalKeys = 0;
    let memoryUsage = '0B';

    if (this.isAvailable()) {
      try {
        const keys = await this.client?.keys('*');
        totalKeys = keys?.length || 0;

        const info = await this.client?.info('memory');
        const memoryMatch = info?.match(/used_memory_human:([^\r\n]+)/);
        memoryUsage = memoryMatch ? memoryMatch[1] : '0B';
      } catch (error) {
        logger.error({ error }, 'Error getting cache metrics');
      }
    }

    return {
      hits: this.metrics.hits,
      misses: this.metrics.misses,
      hitRate: Number(hitRate.toFixed(2)),
      totalKeys,
      memoryUsage,
      avgResponseTime: 0, // Would need separate tracking
      operationsPerSecond: Number(operationsPerSecond.toFixed(2)),
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      hits: 0,
      misses: 0,
      operations: 0,
      errors: 0,
      lastResetTime: Date.now(),
    };
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{
    connected: boolean;
    latency?: number;
    error?: string;
  }> {
    if (!this.client) {
      return { connected: false, error: 'Client not initialized' };
    }

    try {
      const start = Date.now();
      await this.client.ping();
      const latency = Date.now() - start;

      return { connected: true, latency };
    } catch (error) {
      return {
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.isConnected = false;
      logger.info('Redis client closed');
    }
  }

  // Private helper methods

  private isAvailable(): boolean {
    return this.client !== null && this.isConnected;
  }

  private buildKey(
    key: string,
    prefix?: keyof CacheConfig['keyPrefixes'],
  ): string {
    const keyPrefix = prefix ? this.config.keyPrefixes[prefix] : '';
    return `${keyPrefix}${key}`;
  }

  private getTtl(prefix?: keyof CacheConfig['keyPrefixes']): number {
    return prefix ? this.config.ttl[prefix] : this.config.ttl.default;
  }

  private trackMetrics(operation: string, responseTime: number): void {
    this.metrics.operations++;

    if (this.config.monitoring.enabled) {
      // Track operation metrics - in production, this could send to monitoring service
      logger.debug(
        {
          operation,
          responseTime,
          hitRate:
            (this.metrics.hits / (this.metrics.hits + this.metrics.misses)) *
            100,
        },
        'Cache operation metrics',
      );
    }
  }

  /**
   * Generate cache key with hash for complex objects
   */
  static generateKey(components: (string | number | object)[]): string {
    const keyString = components
      .map((comp) =>
        typeof comp === 'object' ? JSON.stringify(comp) : String(comp),
      )
      .join(':');

    return crypto.createHash('md5').update(keyString).digest('hex');
  }
}

// Singleton instance
export const redisCacheManager = new RedisCacheManager();

// Specialized cache interfaces for different use cases

export class DocumentCache {
  constructor(private cache: RedisCacheManager) {}

  async cacheDocument(
    documentId: string,
    data: any,
    ttl?: number,
  ): Promise<boolean> {
    return this.cache.set(documentId, data, { prefix: 'document', ttl });
  }

  async getDocument<T>(documentId: string): Promise<T | null> {
    return this.cache.get<T>(documentId, 'document');
  }

  async cacheProcessingStatus(
    documentId: string,
    status: string,
    metadata?: any,
  ): Promise<boolean> {
    return this.cache.hSet(
      `${documentId}:status`,
      'current',
      { status, metadata, timestamp: Date.now() },
      { prefix: 'document', ttl: 7200 },
    );
  }

  async getProcessingStatus(documentId: string): Promise<any | null> {
    return this.cache.hGet(`${documentId}:status`, 'current', 'document');
  }
}

export class WorkflowCache {
  constructor(private cache: RedisCacheManager) {}

  async cacheWorkflowState(
    workflowId: string,
    state: any,
    ttl?: number,
  ): Promise<boolean> {
    return this.cache.set(workflowId, state, { prefix: 'workflow', ttl });
  }

  async getWorkflowState<T>(workflowId: string): Promise<T | null> {
    return this.cache.get<T>(workflowId, 'workflow');
  }

  async addWorkflowEvent(
    workflowId: string,
    event: any,
  ): Promise<number | null> {
    return this.cache.lpush(`${workflowId}:events`, event, 'workflow');
  }

  async getWorkflowEvents(workflowId: string, limit = 50): Promise<any[]> {
    return this.cache.lrange(`${workflowId}:events`, 0, limit - 1, 'workflow');
  }
}

export class EmbeddingCache {
  constructor(private cache: RedisCacheManager) {}

  async cacheEmbedding(
    contentHash: string,
    embedding: number[],
    metadata?: any,
  ): Promise<boolean> {
    return this.cache.set(
      contentHash,
      { embedding, metadata },
      { prefix: 'embedding', ttl: 14400 }, // 4 hours
    );
  }

  async getEmbedding(contentHash: string): Promise<{
    embedding: number[];
    metadata?: any;
  } | null> {
    return this.cache.get(contentHash, 'embedding');
  }

  async cacheSearchEmbedding(
    query: string,
    embedding: number[],
    tokens: number,
  ): Promise<boolean> {
    const queryHash = crypto.createHash('md5').update(query).digest('hex');
    return this.cache.set(
      `query:${queryHash}`,
      { embedding, tokens, query },
      { prefix: 'embedding', ttl: 1800 }, // 30 minutes
    );
  }

  async getSearchEmbedding(query: string): Promise<{
    embedding: number[];
    tokens: number;
  } | null> {
    const queryHash = crypto.createHash('md5').update(query).digest('hex');
    const cached = await this.cache.get(`query:${queryHash}`, 'embedding');
    return cached
      ? { embedding: cached.embedding, tokens: cached.tokens }
      : null;
  }
}

// Export cache instances
export const documentCache = new DocumentCache(redisCacheManager);
export const workflowCache = new WorkflowCache(redisCacheManager);
export const embeddingCache = new EmbeddingCache(redisCacheManager);
