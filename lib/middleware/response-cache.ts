import 'server-only';

import { type NextRequest, NextResponse } from 'next/server';

export interface CacheConfig {
  ttl: number; // Time to live in seconds
  keyGenerator?: (request: NextRequest) => string;
  shouldCache?: (request: NextRequest, response: NextResponse) => boolean;
  vary?: string[]; // Headers to vary cache on
}

// In-memory cache store (in production, use Redis or similar)
const responseCache = new Map<string, {
  data: any;
  headers: Record<string, string>;
  status: number;
  timestamp: number;
  ttl: number;
}>();

// Cleanup expired entries
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of responseCache.entries()) {
    if (now - entry.timestamp > entry.ttl * 1000) {
      responseCache.delete(key);
    }
  }
}, 60000); // Cleanup every minute

export function createResponseCache(config: CacheConfig) {
  return {
    get: async (request: NextRequest): Promise<NextResponse | null> => {
      const key = config.keyGenerator 
        ? config.keyGenerator(request)
        : getDefaultCacheKey(request);
      
      const cached = responseCache.get(key);
      if (!cached) return null;
      
      const now = Date.now();
      if (now - cached.timestamp > cached.ttl * 1000) {
        responseCache.delete(key);
        return null;
      }
      
      // Return cached response
      const response = new NextResponse(JSON.stringify(cached.data), {
        status: cached.status,
        headers: {
          ...cached.headers,
          'X-Cache': 'HIT',
          'Cache-Control': `max-age=${Math.floor((cached.ttl * 1000 - (now - cached.timestamp)) / 1000)}`,
        },
      });
      
      return response;
    },
    
    set: async (request: NextRequest, response: NextResponse): Promise<void> => {
      if (config.shouldCache && !config.shouldCache(request, response)) {
        return;
      }
      
      // Only cache successful responses
      if (response.status < 200 || response.status >= 300) {
        return;
      }
      
      const key = config.keyGenerator 
        ? config.keyGenerator(request)
        : getDefaultCacheKey(request);
      
      try {
        const data = await response.clone().json();
        const headers: Record<string, string> = {};
        
        response.headers.forEach((value, name) => {
          headers[name] = value;
        });
        
        responseCache.set(key, {
          data,
          headers,
          status: response.status,
          timestamp: Date.now(),
          ttl: config.ttl,
        });
      } catch (error) {
        // Skip caching if response is not JSON
        console.warn('Failed to cache response:', error);
      }
    },
  };
}

function getDefaultCacheKey(request: NextRequest): string {
  const url = new URL(request.url);
  const method = request.method;
  
  // Include query parameters in cache key
  const searchParams = url.searchParams.toString();
  
  return `${method}:${url.pathname}${searchParams ? `?${searchParams}` : ''}`;
}

// ETags for conditional requests
export function generateETag(data: any): string {
  const str = typeof data === 'string' ? data : JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `"${Math.abs(hash).toString(36)}"`;
}

export function handleConditionalRequest(
  request: NextRequest,
  etag: string
): NextResponse | null {
  const ifNoneMatch = request.headers.get('if-none-match');
  
  if (ifNoneMatch === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: {
        'ETag': etag,
        'Cache-Control': 'max-age=300', // 5 minutes
      },
    });
  }
  
  return null;
}

// Predefined caches for different endpoints
export const chatCache = createResponseCache({
  ttl: 60, // 1 minute
  keyGenerator: (request) => {
    const url = new URL(request.url);
    const chatId = url.searchParams.get('chatId');
    return `chat:${chatId}`;
  },
  shouldCache: (request, response) => {
    return request.method === 'GET' && response.status === 200;
  },
});

export const documentCache = createResponseCache({
  ttl: 300, // 5 minutes
  keyGenerator: (request) => {
    const url = new URL(request.url);
    const docId = url.searchParams.get('id');
    return `document:${docId}`;
  },
});

export const searchCache = createResponseCache({
  ttl: 180, // 3 minutes
  keyGenerator: (request) => {
    const url = new URL(request.url);
    const query = url.searchParams.get('q');
    const limit = url.searchParams.get('limit') || '10';
    return `search:${query}:${limit}`;
  },
});