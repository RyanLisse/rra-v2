/**
 * Cache Middleware for API Routes
 *
 * Provides HTTP response caching with Redis backend
 * Includes intelligent cache invalidation and conditional responses
 */

import { type NextRequest, NextResponse } from 'next/server';
import { redisCacheManager } from '@/lib/cache/redis-cache-manager';
import crypto from 'node:crypto';
import pino from 'pino';

const logger = pino({
  name: 'cache-middleware',
  level: process.env.LOG_LEVEL || 'info',
});

export interface CacheOptions {
  ttl?: number;
  vary?: string[]; // Headers to vary cache on
  skipCache?: (req: NextRequest) => boolean;
  keyGenerator?: (req: NextRequest) => string;
  shouldCache?: (res: NextResponse) => boolean;
  tags?: string[]; // For cache invalidation
  staleWhileRevalidate?: number; // Seconds to serve stale content
}

export interface CachedResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  timestamp: number;
  etag: string;
  tags?: string[];
}

export class CacheMiddleware {
  private cache = redisCacheManager;

  /**
   * Create cache middleware for API routes
   */
  createMiddleware(options: CacheOptions = {}) {
    return async (
      req: NextRequest,
      handler: (req: NextRequest) => Promise<NextResponse>,
    ): Promise<NextResponse> => {
      const {
        ttl = 300, // 5 minutes default
        vary = ['authorization'],
        skipCache = () => false,
        keyGenerator = this.defaultKeyGenerator,
        shouldCache = this.defaultShouldCache,
        tags = [],
        staleWhileRevalidate = 0,
      } = options;

      // Skip caching for certain conditions
      if (
        skipCache(req) ||
        req.method !== 'GET' ||
        req.headers.get('cache-control') === 'no-cache'
      ) {
        return handler(req);
      }

      const cacheKey = keyGenerator(req);

      // Check for cached response
      const cached = await this.getCachedResponse(cacheKey);

      if (cached) {
        const isStale = this.isStale(cached, ttl);
        const acceptsStale =
          staleWhileRevalidate > 0 &&
          this.isWithinStaleWindow(cached, ttl, staleWhileRevalidate);

        // Handle conditional requests (ETag)
        const ifNoneMatch = req.headers.get('if-none-match');
        if (ifNoneMatch === cached.etag) {
          return new NextResponse(null, {
            status: 304,
            statusText: 'Not Modified',
            headers: {
              etag: cached.etag,
              'cache-control': `max-age=${ttl}`,
            },
          });
        }

        // Return cached response if not stale or if stale is acceptable
        if (!isStale || acceptsStale) {
          const response = this.createResponseFromCache(cached, ttl, isStale);

          // If stale but acceptable, trigger background revalidation
          if (isStale && acceptsStale) {
            this.revalidateInBackground(req, handler, cacheKey, ttl, tags);
          }

          return response;
        }
      }

      // Generate fresh response
      try {
        const response = await handler(req);

        // Cache the response if it should be cached
        if (shouldCache(response)) {
          await this.cacheResponse(cacheKey, response, ttl, tags);
        }

        return response;
      } catch (error) {
        logger.error({ error, cacheKey }, 'Error generating fresh response');

        // If we have stale content, serve it during errors
        if (cached && staleWhileRevalidate > 0) {
          return this.createResponseFromCache(cached, ttl, true);
        }

        throw error;
      }
    };
  }

  /**
   * Invalidate cache by tags
   */
  async invalidateByTags(tags: string[]): Promise<number> {
    let totalInvalidated = 0;

    for (const tag of tags) {
      try {
        // Get all keys with this tag
        const tagKey = `cache:tag:${tag}`;
        const keys = await this.cache.lrange(tagKey, 0, -1, 'api');

        if (keys.length > 0) {
          // Delete all cached responses with this tag
          for (const key of keys) {
            await this.cache.delete(key, 'api');
            totalInvalidated++;
          }

          // Clear the tag list
          await this.cache.delete(tagKey, 'api');
        }
      } catch (error) {
        logger.error({ error, tag }, 'Error invalidating cache by tag');
      }
    }

    logger.info({ tags, totalInvalidated }, 'Cache invalidated by tags');
    return totalInvalidated;
  }

  /**
   * Invalidate specific cache key
   */
  async invalidateKey(key: string): Promise<boolean> {
    return this.cache.delete(key, 'api');
  }

  /**
   * Warm cache with pre-computed responses
   */
  async warmCache(
    key: string,
    response: NextResponse,
    ttl: number,
    tags: string[] = [],
  ): Promise<boolean> {
    return this.cacheResponse(key, response, ttl, tags);
  }

  /**
   * Get cache statistics for monitoring
   */
  async getCacheStats(): Promise<{
    hitRate: number;
    totalKeys: number;
    memoryUsage: string;
  }> {
    const metrics = await this.cache.getMetrics();
    return {
      hitRate: metrics.hitRate,
      totalKeys: metrics.totalKeys,
      memoryUsage: metrics.memoryUsage,
    };
  }

  // Private methods

  private async getCachedResponse(key: string): Promise<CachedResponse | null> {
    return this.cache.get<CachedResponse>(key, 'api');
  }

  private async cacheResponse(
    key: string,
    response: NextResponse,
    ttl: number,
    tags: string[] = [],
  ): Promise<boolean> {
    try {
      // Read the response body
      const body = await response.text();

      // Generate ETag
      const etag = this.generateETag(body);

      // Prepare cached response
      const cachedResponse: CachedResponse = {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body,
        timestamp: Date.now(),
        etag,
        tags,
      };

      // Store in cache
      const success = await this.cache.set(key, cachedResponse, {
        prefix: 'api',
        ttl,
      });

      // Store tag associations for invalidation
      if (success && tags.length > 0) {
        for (const tag of tags) {
          await this.cache.lpush(`cache:tag:${tag}`, key, 'api');
        }
      }

      return success;
    } catch (error) {
      logger.error({ error, key }, 'Error caching response');
      return false;
    }
  }

  private createResponseFromCache(
    cached: CachedResponse,
    ttl: number,
    isStale = false,
  ): NextResponse {
    const age = Math.floor((Date.now() - cached.timestamp) / 1000);
    const maxAge = Math.max(0, ttl - age);

    const headers = new Headers(cached.headers);
    headers.set('cache-control', `max-age=${maxAge}`);
    headers.set('age', age.toString());
    headers.set('etag', cached.etag);
    headers.set('x-cache', isStale ? 'STALE' : 'HIT');

    if (isStale) {
      headers.set('warning', '110 - "Response is stale"');
    }

    return new NextResponse(cached.body, {
      status: cached.status,
      statusText: cached.statusText,
      headers,
    });
  }

  private isStale(cached: CachedResponse, ttl: number): boolean {
    return (Date.now() - cached.timestamp) / 1000 > ttl;
  }

  private isWithinStaleWindow(
    cached: CachedResponse,
    ttl: number,
    staleWhileRevalidate: number,
  ): boolean {
    const age = (Date.now() - cached.timestamp) / 1000;
    return age <= ttl + staleWhileRevalidate;
  }

  private async revalidateInBackground(
    req: NextRequest,
    handler: (req: NextRequest) => Promise<NextResponse>,
    cacheKey: string,
    ttl: number,
    tags: string[],
  ): Promise<void> {
    // Fire and forget background revalidation
    setImmediate(async () => {
      try {
        const freshResponse = await handler(req);
        await this.cacheResponse(cacheKey, freshResponse, ttl, tags);
        logger.debug({ cacheKey }, 'Background revalidation completed');
      } catch (error) {
        logger.warn({ error, cacheKey }, 'Background revalidation failed');
      }
    });
  }

  private generateETag(content: string): string {
    return `"${crypto.createHash('md5').update(content).digest('hex')}"`;
  }

  private defaultKeyGenerator(req: NextRequest): string {
    const url = new URL(req.url);
    const baseKey = `${req.method}:${url.pathname}:${url.search}`;

    // Include relevant headers in cache key
    const relevantHeaders = ['authorization', 'accept-language'];
    const headerParts = relevantHeaders
      .map((header) => `${header}:${req.headers.get(header) || ''}`)
      .join('|');

    return crypto
      .createHash('md5')
      .update(`${baseKey}|${headerParts}`)
      .digest('hex');
  }

  private defaultShouldCache(response: NextResponse): boolean {
    // Only cache successful responses
    if (response.status < 200 || response.status >= 300) {
      return false;
    }

    // Don't cache responses with certain headers
    const cacheControl = response.headers.get('cache-control');
    if (
      cacheControl?.includes('no-cache') ||
      cacheControl?.includes('private')
    ) {
      return false;
    }

    return true;
  }
}

// Singleton instance
export const cacheMiddleware = new CacheMiddleware();

// Helper functions for route-specific caching

export function withCache(options: CacheOptions = {}) {
  return (handler: (req: NextRequest) => Promise<NextResponse>) => {
    const middleware = cacheMiddleware.createMiddleware(options);
    return (req: NextRequest) => middleware(req, handler);
  };
}

export function searchCache(ttl = 1800) {
  // 30 minutes
  return withCache({
    ttl,
    tags: ['search'],
    keyGenerator: (req) => {
      const url = new URL(req.url);
      const query = url.searchParams.get('q') || '';
      const userId = req.headers.get('authorization') || 'anonymous';
      const limit = url.searchParams.get('limit') || '10';

      return `search:${crypto
        .createHash('md5')
        .update(`${query}:${userId}:${limit}`)
        .digest('hex')}`;
    },
  });
}

export function documentCache(ttl = 7200) {
  // 2 hours
  return withCache({
    ttl,
    tags: ['documents'],
    keyGenerator: (req) => {
      const url = new URL(req.url);
      const userId = req.headers.get('authorization') || 'anonymous';

      return `documents:${crypto
        .createHash('md5')
        .update(`${url.pathname}:${userId}`)
        .digest('hex')}`;
    },
  });
}

export function apiCache(ttl = 300) {
  // 5 minutes
  return withCache({
    ttl,
    tags: ['api'],
  });
}
