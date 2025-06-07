import 'server-only';

import { type NextRequest, NextResponse } from 'next/server';

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  keyGenerator?: (request: NextRequest) => string; // Custom key generator
  onLimitReached?: (request: NextRequest) => NextResponse; // Custom handler for rate limit exceeded
}

// In-memory store for rate limiting (in production, use Redis)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of rateLimitStore.entries()) {
    if (now > data.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}, 60000); // Cleanup every minute

export function createRateLimit(config: RateLimitConfig) {
  return async function rateLimit(request: NextRequest): Promise<NextResponse | null> {
    const now = Date.now();
    const key = config.keyGenerator 
      ? config.keyGenerator(request)
      : getDefaultKey(request);

    const entry = rateLimitStore.get(key);
    
    if (!entry || now > entry.resetTime) {
      // First request or window expired
      rateLimitStore.set(key, {
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
          },
        }
      );
    }

    // Increment counter
    entry.count++;
    
    return null; // Allow request
  };
}

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

// Predefined rate limiters for different use cases
export const chatRateLimit = createRateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 20, // 20 requests per minute per IP
});

export const authRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5, // 5 auth attempts per 15 minutes
});

export const uploadRateLimit = createRateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 5, // 5 uploads per minute
});

export const searchRateLimit = createRateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 30, // 30 searches per minute
});