import 'server-only';

import Redis, { type Redis as RedisType, type RedisOptions } from 'ioredis';
import { logger } from '../monitoring/logger';

// Redis client singleton
let redisClient: RedisType | null = null;
let isInitialized = false;

// Default configuration with fallback to in-memory if Redis is not available
const DEFAULT_CONFIG: RedisOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD,
  db: Number.parseInt(process.env.REDIS_DB || '0', 10),
  retryStrategy: (times: number) => {
    // Retry with exponential backoff, max 3 attempts
    if (times > 3) {
      logger.error('Redis connection failed after 3 attempts');
      return null; // Stop retrying
    }
    return Math.min(times * 1000, 3000);
  },
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  enableOfflineQueue: true,
  connectTimeout: 5000,
  lazyConnect: true, // Don't connect immediately
};

/**
 * Initialize Redis client with lazy loading
 */
export async function getRedisClient(): Promise<RedisType | null> {
  if (isInitialized && redisClient) {
    return redisClient;
  }

  try {
    if (!redisClient) {
      redisClient = new Redis(DEFAULT_CONFIG);

      // Set up event handlers
      redisClient.on('connect', () => {
        logger.info('Redis client connected');
      });

      redisClient.on('ready', () => {
        logger.info('Redis client ready');
        isInitialized = true;
      });

      redisClient.on('error', (error) => {
        logger.error('Redis client error', error);
      });

      redisClient.on('close', () => {
        logger.warn('Redis client connection closed');
        isInitialized = false;
      });

      redisClient.on('reconnecting', () => {
        logger.info('Redis client reconnecting...');
      });

      // Connect to Redis
      await redisClient.connect();
    }

    return redisClient;
  } catch (error) {
    logger.error('Failed to initialize Redis client', error);
    return null;
  }
}

/**
 * Gracefully shutdown Redis connection
 */
export async function closeRedisConnection(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit();
      redisClient = null;
      isInitialized = false;
      logger.info('Redis connection closed gracefully');
    } catch (error) {
      logger.error('Error closing Redis connection', error);
    }
  }
}

/**
 * Check if Redis is available
 */
export async function isRedisAvailable(): Promise<boolean> {
  try {
    const client = await getRedisClient();
    if (!client) return false;

    const pong = await client.ping();
    return pong === 'PONG';
  } catch (error) {
    logger.error('Redis health check failed', error);
    return false;
  }
}

/**
 * Cache key utilities
 */
export const CacheKeys = {
  // Rate limiting keys
  rateLimit: (key: string) => `rate_limit:${key}`,

  // Query cache keys
  query: {
    user: {
      byEmail: (email: string) => `query:user:email:${email}`,
      pattern: 'query:user:*',
    },
    chat: {
      byId: (id: string) => `query:chat:id:${id}`,
      byUserId: (userId: string) => `query:chat:user:${userId}`,
      pattern: 'query:chat:*',
    },
    messages: {
      byChatId: (chatId: string) => `query:messages:chat:${chatId}`,
      pattern: 'query:messages:*',
    },
    ragDocuments: {
      byUserId: (userId: string, limit: number) =>
        `query:rag_documents:user:${userId}:limit:${limit}`,
      byId: (id: string, userId: string) =>
        `query:rag_document:${id}:${userId}`,
      stats: (userId: string) => `query:document_stats:user:${userId}`,
      pattern: 'query:rag_document*',
    },
  },

  // Session/auth keys
  auth: {
    session: (sessionId: string) => `auth:session:${sessionId}`,
    user: (userId: string) => `auth:user:${userId}`,
    pattern: 'auth:*',
  },
};

/**
 * TTL (Time To Live) configurations in seconds
 */
export const CacheTTL = {
  // Rate limiting TTLs
  rateLimit: {
    chat: 60, // 1 minute
    auth: 900, // 15 minutes
    upload: 60, // 1 minute
    search: 60, // 1 minute
  },

  // Query cache TTLs
  query: {
    user: 300, // 5 minutes
    chat: 180, // 3 minutes
    messages: 120, // 2 minutes
    ragDocuments: 60, // 1 minute
    documentStats: 30, // 30 seconds
  },

  // Session TTLs
  auth: {
    session: 3600, // 1 hour
    user: 1800, // 30 minutes
  },
};

/**
 * Batch operations utility
 */
export class RedisBatch {
  private pipeline: any;

  constructor(private client: RedisType) {
    this.pipeline = client.pipeline();
  }

  set(key: string, value: string, ttl?: number): this {
    if (ttl) {
      this.pipeline.setex(key, ttl, value);
    } else {
      this.pipeline.set(key, value);
    }
    return this;
  }

  get(key: string): this {
    this.pipeline.get(key);
    return this;
  }

  del(key: string): this {
    this.pipeline.del(key);
    return this;
  }

  expire(key: string, ttl: number): this {
    this.pipeline.expire(key, ttl);
    return this;
  }

  async exec(): Promise<any[]> {
    return await this.pipeline.exec();
  }
}

/**
 * Create a batch operation
 */
export async function createBatch(): Promise<RedisBatch | null> {
  const client = await getRedisClient();
  if (!client) return null;
  return new RedisBatch(client);
}

/**
 * Cache warming utility
 */
export async function warmCache(patterns: string[]): Promise<void> {
  const client = await getRedisClient();
  if (!client) return;

  try {
    for (const pattern of patterns) {
      const keys = await client.keys(pattern);
      if (keys.length > 0) {
        // Touch keys to refresh TTL
        const batch = client.pipeline();
        for (const key of keys) {
          batch.expire(key, await client.ttl(key));
        }
        await batch.exec();
      }
    }
    logger.info(`Cache warmed for patterns: ${patterns.join(', ')}`);
  } catch (error) {
    logger.error('Cache warming failed', error);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  await closeRedisConnection();
});

process.on('SIGINT', async () => {
  await closeRedisConnection();
});
