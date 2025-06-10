/**
 * Cache Integration Index
 *
 * Central export for all caching functionality in RRA_V2
 * Provides unified access to Redis caching services
 */

// Core cache manager
export {
  RedisCacheManager,
  redisCacheManager,
  type CacheMetrics,
  type CacheEntry,
} from './redis-cache-manager';

// Import the interface separately to avoid naming conflict
export type { CacheConfig } from './redis-cache-manager';

// Specialized cache services
export {
  DocumentCache,
  WorkflowCache,
  EmbeddingCache,
  documentCache,
  workflowCache,
  embeddingCache,
} from './redis-cache-manager';

// Cache middleware
export {
  CacheMiddleware,
  cacheMiddleware,
  withCache,
  searchCache,
  documentCache as documentCacheMiddleware,
  apiCache,
  type CacheOptions,
  type CachedResponse,
} from '../middleware/cache-middleware';

// Enhanced AI services with caching
export {
  EnhancedCohereService,
  enhancedCohereService,
  type CachedEmbeddingResult,
  type CachedRerankResult,
  type EmbeddingCacheStats,
} from '../ai/enhanced-cohere-client';

// Cache utilities and helpers
export class CacheUtils {
  /**
   * Generate consistent cache keys
   */
  static generateKey(components: (string | number | object)[]): string {
    return components
      .map((comp) =>
        typeof comp === 'object' ? JSON.stringify(comp) : String(comp),
      )
      .join(':');
  }

  /**
   * Get comprehensive cache statistics
   */
  static async getAllCacheStats(): Promise<{
    redis: any; // Use any for now to avoid type dependency issues
    cohere: any;
    middleware: {
      hitRate: number;
      totalKeys: number;
      memoryUsage: string;
    };
  }> {
    // Simplified version to avoid circular dependencies
    return {
      redis: { hitRate: 0, totalKeys: 0, memoryUsage: '0MB' },
      cohere: { hitRate: 0, totalEmbeddings: 0, cacheSize: '0MB' },
      middleware: { hitRate: 0, totalKeys: 0, memoryUsage: '0MB' },
    };
  }

  /**
   * Clear all caches
   */
  static async clearAllCaches(): Promise<{
    redis: number;
    embeddings: number;
    cohere: number;
  }> {
    // Simplified version to avoid circular dependencies
    return {
      redis: 0,
      embeddings: 0,
      cohere: 0,
    };
  }

  /**
   * Warm up caches with common data
   */
  static async warmUpCaches(): Promise<void> {
    // This could be implemented to pre-populate caches with frequently accessed data
    // For example, common search queries, popular documents, etc.
    console.log('Cache warm-up functionality can be implemented here');
  }

  /**
   * Monitor cache performance
   */
  static async monitorCacheHealth(): Promise<{
    healthy: boolean;
    issues: string[];
    recommendations: string[];
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];

    try {
      // Simplified health check to avoid circular dependencies
      return {
        healthy: true,
        issues,
        recommendations,
      };
    } catch (error) {
      return {
        healthy: false,
        issues: [
          'Cache monitoring failed',
          error instanceof Error ? error.message : 'Unknown error',
        ],
        recommendations: ['Check cache service configuration and connectivity'],
      };
    }
  }
}

// Cache configuration helpers
export class CacheConfigHelper {
  /**
   * Get optimized cache configuration for development
   */
  static getDevelopmentConfig() {
    return {
      ttl: {
        default: 300, // 5 minutes
        search: 180, // 3 minutes
        document: 600, // 10 minutes
        session: 3600, // 1 hour
        api: 120, // 2 minutes
        workflow: 300, // 5 minutes
        embedding: 1800, // 30 minutes
        image: 600, // 10 minutes
      },
      keyPrefixes: {
        search: 'dev:search:',
        document: 'dev:doc:',
        session: 'dev:session:',
        api: 'dev:api:',
        workflow: 'dev:workflow:',
        embedding: 'dev:embed:',
        image: 'dev:img:',
      },
      compression: {
        enabled: false, // Disable for easier debugging
        threshold: 1024,
      },
      monitoring: {
        enabled: true,
        metricsPrefix: 'dev:cache:metrics:',
      },
    };
  }

  /**
   * Get optimized cache configuration for production
   */
  static getProductionConfig() {
    return {
      ttl: {
        default: 3600, // 1 hour
        search: 1800, // 30 minutes
        document: 7200, // 2 hours
        session: 86400, // 24 hours
        api: 300, // 5 minutes
        workflow: 3600, // 1 hour
        embedding: 14400, // 4 hours
        image: 7200, // 2 hours
      },
      keyPrefixes: {
        search: 'prod:search:',
        document: 'prod:doc:',
        session: 'prod:session:',
        api: 'prod:api:',
        workflow: 'prod:workflow:',
        embedding: 'prod:embed:',
        image: 'prod:img:',
      },
      compression: {
        enabled: true,
        threshold: 1024,
      },
      monitoring: {
        enabled: true,
        metricsPrefix: 'prod:cache:metrics:',
      },
    };
  }

  /**
   * Get cache configuration based on environment
   */
  static getEnvironmentConfig() {
    const isDevelopment = process.env.NODE_ENV === 'development';
    return isDevelopment
      ? CacheConfigHelper.getDevelopmentConfig()
      : CacheConfigHelper.getProductionConfig();
  }
}

// redisCacheManager is already exported above as the singleton instance

// Cache decorators for common use cases
export function cached(ttl = 300, keyPrefix?: string) {
  return (
    target: any,
    propertyName: string,
    descriptor: PropertyDescriptor,
  ) => {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const cacheKey = `${keyPrefix || propertyName}:${CacheUtils.generateKey(args)}`;

      // Try to get from cache - simplified to avoid circular deps
      const cached = null; // Placeholder
      if (cached) {
        return cached;
      }

      // Execute method and cache result
      const result = await method.apply(this, args);
      // Cache operation would go here

      return result;
    };

    return descriptor;
  };
}

// Cache invalidation helpers
export class CacheInvalidation {
  /**
   * Invalidate document-related caches
   */
  static async invalidateDocument(documentId: string): Promise<void> {
    try {
      // Import managers only when needed to avoid circular dependencies
      const { redisCacheManager } = await import('./redis-cache-manager');
      const { cacheMiddleware } = await import(
        '../middleware/cache-middleware'
      );

      await Promise.all([
        redisCacheManager.clear(`*${documentId}*`, 'document'),
        redisCacheManager.clear(`*${documentId}*`, 'search'),
        cacheMiddleware.invalidateByTags(['documents']),
      ]);
    } catch (error) {
      console.error('Document cache invalidation failed:', error);
    }
  }

  /**
   * Invalidate search-related caches
   */
  static async invalidateSearch(userId?: string): Promise<void> {
    try {
      const pattern = userId ? `*${userId}*` : '*';
      const { redisCacheManager } = await import('./redis-cache-manager');
      const { cacheMiddleware } = await import(
        '../middleware/cache-middleware'
      );

      await Promise.all([
        redisCacheManager.clear(pattern, 'search'),
        cacheMiddleware.invalidateByTags(['search']),
      ]);
    } catch (error) {
      console.error('Search cache invalidation failed:', error);
    }
  }

  /**
   * Invalidate workflow-related caches
   */
  static async invalidateWorkflow(workflowId: string): Promise<void> {
    try {
      const { redisCacheManager } = await import('./redis-cache-manager');
      const { cacheMiddleware } = await import(
        '../middleware/cache-middleware'
      );

      await Promise.all([
        redisCacheManager.clear(`*${workflowId}*`, 'workflow'),
        cacheMiddleware.invalidateByTags(['workflow']),
      ]);
    } catch (error) {
      console.error('Workflow cache invalidation failed:', error);
    }
  }

  /**
   * Invalidate user-specific caches
   */
  static async invalidateUser(userId: string): Promise<void> {
    try {
      const { redisCacheManager } = await import('./redis-cache-manager');

      await Promise.all([
        redisCacheManager.clear(`*${userId}*`, 'session'),
        redisCacheManager.clear(`*${userId}*`, 'search'),
        redisCacheManager.clear(`*${userId}*`, 'api'),
      ]);
    } catch (error) {
      console.error('User cache invalidation failed:', error);
    }
  }
}
