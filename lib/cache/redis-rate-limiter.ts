import 'server-only';

import { type NextRequest, NextResponse } from 'next/server';
import { getRedisClient, CacheKeys, CacheTTL } from './redis-client';
import { logger } from '../monitoring/logger';

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  keyGenerator?: (request: NextRequest) => string; // Custom key generator
  onLimitReached?: (request: NextRequest) => NextResponse; // Custom handler for rate limit exceeded
  fallbackToMemory?: boolean; // Whether to fallback to in-memory if Redis is unavailable
}

// In-memory fallback store with lazy cleanup
const memoryStore = new Map<string, { count: number; resetTime: number }>();

// Lazy cleanup function - called during rate limit checks
function cleanupExpiredRateLimits() {
  const now = Date.now();
  for (const [key, data] of memoryStore.entries()) {
    if (now > data.resetTime) {
      memoryStore.delete(key);
    }
  }
}

/**
 * Create a Redis-backed rate limiter with automatic fallback
 */
export function createRedisRateLimit(config: RateLimitConfig) {
  return async function rateLimit(
    request: NextRequest,
  ): Promise<NextResponse | null> {
    const now = Date.now();
    const key = config.keyGenerator
      ? config.keyGenerator(request)
      : getDefaultKey(request);
    
    const redisKey = CacheKeys.rateLimit(key);
    const windowSec = Math.ceil(config.windowMs / 1000);
    
    try {
      const redis = await getRedisClient();
      
      if (!redis) {
        // Redis not available, fallback to memory if configured
        if (config.fallbackToMemory !== false) {
          return handleMemoryFallback(request, key, now, config);
        }
        // If no fallback, allow the request
        logger.warn('Redis unavailable and memory fallback disabled, allowing request');
        return null;
      }
      
      // Use Redis INCR with TTL for atomic rate limiting
      const count = await redis.incr(redisKey);
      
      if (count === 1) {
        // First request, set TTL
        await redis.expire(redisKey, windowSec);
      }
      
      if (count > config.maxRequests) {
        // Rate limit exceeded
        const ttl = await redis.ttl(redisKey);
        
        if (config.onLimitReached) {
          return config.onLimitReached(request);
        }
        
        return new NextResponse(
          JSON.stringify({
            error: 'Rate limit exceeded',
            retryAfter: ttl > 0 ? ttl : windowSec,
          }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'Retry-After': String(ttl > 0 ? ttl : windowSec),
              'X-RateLimit-Limit': String(config.maxRequests),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': String(Math.floor(now / 1000) + (ttl > 0 ? ttl : windowSec)),
            },
          },
        );
      }
      
      // Request allowed
      const remaining = Math.max(0, config.maxRequests - count);
      const resetTime = Math.floor(now / 1000) + (await redis.ttl(redisKey));
      
      // Add rate limit headers to the response
      const response = NextResponse.next();
      response.headers.set('X-RateLimit-Limit', String(config.maxRequests));
      response.headers.set('X-RateLimit-Remaining', String(remaining));
      response.headers.set('X-RateLimit-Reset', String(resetTime));
      
      return null; // Allow request to proceed
      
    } catch (error) {
      logger.error('Redis rate limit error', error);
      
      // Fallback to memory if configured
      if (config.fallbackToMemory !== false) {
        return handleMemoryFallback(request, key, now, config);
      }
      
      // If no fallback and error, allow the request
      return null;
    }
  };
}

/**
 * Handle rate limiting with in-memory fallback
 */
function handleMemoryFallback(
  request: NextRequest,
  key: string,
  now: number,
  config: RateLimitConfig,
): NextResponse | null {
  // Clean up expired entries if store gets large
  if (memoryStore.size > 50) {
    cleanupExpiredRateLimits();
  }
  
  const entry = memoryStore.get(key);
  
  if (!entry || now > entry.resetTime) {
    // First request or window expired
    memoryStore.set(key, {
      count: 1,
      resetTime: now + config.windowMs,
    });
    return null; // Allow request
  }
  
  if (entry.count >= config.maxRequests) {
    // Rate limit exceeded
    if (config.onLimitReached) {
      return config.onLimitReached(request);
    }
    
    return new NextResponse(
      JSON.stringify({
        error: 'Rate limit exceeded',
        retryAfter: Math.ceil((entry.resetTime - now) / 1000),
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(Math.ceil((entry.resetTime - now) / 1000)),
          'X-RateLimit-Limit': String(config.maxRequests),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(entry.resetTime),
          'X-RateLimit-Fallback': 'memory',
        },
      },
    );
  }
  
  // Increment counter
  entry.count++;
  
  return null; // Allow request
}

/**
 * Get default key for rate limiting
 */
function getDefaultKey(request: NextRequest): string {
  // Try to get IP from various headers
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const cfConnectingIp = request.headers.get('cf-connecting-ip');
  
  const ip = forwarded?.split(',')[0] || realIp || cfConnectingIp || 'unknown';
  
  // Include user agent for additional uniqueness
  const userAgent = request.headers.get('user-agent') || 'unknown';
  
  return `${ip}:${userAgent.slice(0, 100)}`;
}

/**
 * Clear rate limit for a specific key
 */
export async function clearRateLimit(key: string): Promise<boolean> {
  try {
    const redis = await getRedisClient();
    if (!redis) {
      memoryStore.delete(key);
      return true;
    }
    
    const redisKey = CacheKeys.rateLimit(key);
    await redis.del(redisKey);
    return true;
  } catch (error) {
    logger.error('Failed to clear rate limit', error);
    return false;
  }
}

/**
 * Get current rate limit status for a key
 */
export async function getRateLimitStatus(key: string): Promise<{
  count: number;
  remaining: number;
  resetTime: number;
} | null> {
  try {
    const redis = await getRedisClient();
    const redisKey = CacheKeys.rateLimit(key);
    
    if (!redis) {
      const entry = memoryStore.get(key);
      if (!entry) return null;
      
      return {
        count: entry.count,
        remaining: Math.max(0, 20 - entry.count), // Assuming max 20
        resetTime: entry.resetTime,
      };
    }
    
    const count = await redis.get(redisKey);
    const ttl = await redis.ttl(redisKey);
    
    if (!count) return null;
    
    const countNum = Number.parseInt(count, 10);
    return {
      count: countNum,
      remaining: Math.max(0, 20 - countNum), // Assuming max 20
      resetTime: Math.floor(Date.now() / 1000) + ttl,
    };
  } catch (error) {
    logger.error('Failed to get rate limit status', error);
    return null;
  }
}

// Predefined Redis-backed rate limiters
export const chatRateLimit = createRedisRateLimit({
  windowMs: CacheTTL.rateLimit.chat * 1000,
  maxRequests: 20,
  fallbackToMemory: true,
});

export const authRateLimit = createRedisRateLimit({
  windowMs: CacheTTL.rateLimit.auth * 1000,
  maxRequests: 5,
  fallbackToMemory: true,
});

export const uploadRateLimit = createRedisRateLimit({
  windowMs: CacheTTL.rateLimit.upload * 1000,
  maxRequests: 5,
  fallbackToMemory: true,
});

export const searchRateLimit = createRedisRateLimit({
  windowMs: CacheTTL.rateLimit.search * 1000,
  maxRequests: 30,
  fallbackToMemory: true,
});