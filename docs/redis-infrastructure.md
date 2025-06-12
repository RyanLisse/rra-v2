# Redis Infrastructure Documentation

## Overview

The RRA_V2 application now uses Redis as the primary caching and rate-limiting backend, with automatic fallback to in-memory storage when Redis is unavailable.

## Architecture

### 1. Redis Client (`lib/cache/redis-client.ts`)
- Singleton Redis client with connection pooling
- Lazy initialization for better startup performance
- Automatic retry logic with exponential backoff
- Graceful fallback when Redis is unavailable
- Event-driven connection monitoring

### 2. Rate Limiting (`lib/cache/redis-rate-limiter.ts`)
- Redis-backed rate limiting using atomic INCR operations
- Automatic TTL management for sliding windows
- Fallback to in-memory rate limiting when Redis is down
- Pre-configured limiters for different endpoints:
  - Chat: 20 requests/minute
  - Auth: 5 requests/15 minutes
  - Upload: 5 requests/minute
  - Search: 30 requests/minute

### 3. Query Caching (`lib/cache/redis-query-cache.ts`)
- Transparent caching layer for database queries
- JSON serialization/deserialization
- Batch operations for improved performance
- Pattern-based cache invalidation
- Memory fallback with automatic cleanup

### 4. Cache Keys Structure
```typescript
CacheKeys = {
  rateLimit: (key) => `rate_limit:${key}`,
  query: {
    user: {
      byEmail: (email) => `query:user:email:${email}`,
      pattern: 'query:user:*',
    },
    chat: {
      byId: (id) => `query:chat:id:${id}`,
      byUserId: (userId) => `query:chat:user:${userId}`,
      pattern: 'query:chat:*',
    },
    messages: {
      byChatId: (chatId) => `query:messages:chat:${chatId}`,
      pattern: 'query:messages:*',
    },
    ragDocuments: {
      byUserId: (userId, limit) => `query:rag_documents:user:${userId}:limit:${limit}`,
      byId: (id, userId) => `query:rag_document:${id}:${userId}`,
      stats: (userId) => `query:document_stats:user:${userId}`,
      pattern: 'query:rag_document*',
    },
  },
  auth: {
    session: (sessionId) => `auth:session:${sessionId}`,
    user: (userId) => `auth:user:${userId}`,
    pattern: 'auth:*',
  },
}
```

## Configuration

### Environment Variables
```bash
# Redis Configuration (optional - defaults shown)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=          # Leave empty if no auth required
REDIS_DB=0              # Database number
```

### TTL Configuration
- Rate Limiting: 60s - 900s depending on endpoint
- User queries: 300s (5 minutes)
- Chat queries: 180s (3 minutes)
- Message queries: 120s (2 minutes)
- Document queries: 60s (1 minute)
- Document stats: 30s

## Usage Examples

### Rate Limiting
```typescript
// The rate limiter is automatically applied via middleware
// No code changes required - just works!

// Manual rate limit check
import { getRateLimitStatus } from '@/lib/cache';

const status = await getRateLimitStatus('user-key');
console.log(`Remaining requests: ${status.remaining}`);
```

### Query Caching
```typescript
// Automatic caching in queries.ts
export async function getUser(email: string) {
  const cacheKey = CacheKeys.query.user.byEmail(email);
  const cached = getCachedResult<User[]>(cacheKey);
  if (cached) return cached;

  const result = await db.select().from(user).where(eq(user.email, email));
  setCachedResult(cacheKey, result, CacheTTL.query.user * 1000);
  return result;
}

// Manual cache invalidation
invalidateCache(CacheKeys.query.user.pattern);
```

### Cache Utilities
```typescript
import { checkCacheHealth, warmupCache, monitorCachePerformance } from '@/lib/cache';

// Health check
const health = await checkCacheHealth();
if (!health.healthy) {
  console.warn('Cache using fallback mode');
}

// Warmup frequently accessed data
await warmupCache();

// Monitor performance
const stats = await monitorCachePerformance();
```

## Management Scripts

### Health Check
```bash
bun run cache:health
```
Checks Redis connection and provides diagnostics.

### Monitor
```bash
bun run cache:monitor
```
Real-time monitoring of cache performance and statistics.

### Clear Cache
```bash
bun run cache:clear
```
Clears all cache entries (both Redis and memory).

### Warm Cache
```bash
bun run cache:warm
```
Pre-populates cache with frequently accessed data.

### Statistics
```bash
bun run cache:stats
```
Shows detailed cache statistics and usage patterns.

## Fallback Behavior

When Redis is unavailable:
1. **Rate Limiting**: Falls back to in-memory Map with periodic cleanup
2. **Query Caching**: Falls back to in-memory Map with TTL enforcement
3. **Performance**: Slightly reduced but still functional
4. **Data Persistence**: Lost on server restart
5. **Monitoring**: Limited statistics available

## Best Practices

1. **Always check Redis availability in production**
   ```bash
   bun run cache:health
   ```

2. **Use consistent cache keys**
   - Always use the `CacheKeys` utility
   - Never hardcode cache keys

3. **Invalidate intelligently**
   - Use pattern-based invalidation for related data
   - Invalidate immediately after mutations

4. **Monitor performance**
   - Set up alerts for high cache miss rates
   - Monitor Redis memory usage
   - Check for stale data

5. **Handle failures gracefully**
   - The system automatically falls back to memory
   - Log Redis connection failures for monitoring

## Troubleshooting

### Redis Connection Failed
```bash
# Check if Redis is running
redis-cli ping

# Start Redis
redis-server

# Check connection settings
bun run cache:health
```

### High Memory Usage
```bash
# Check cache statistics
bun run cache:stats

# Clear cache if needed
bun run cache:clear

# Monitor in real-time
bun run cache:monitor
```

### Cache Inconsistency
```bash
# Clear specific patterns
bun run scripts/cache-clear.ts --pattern "query:user:*"

# Rebuild cache
bun run cache:warm
```

## Performance Impact

### With Redis
- Sub-millisecond cache lookups
- Distributed caching across instances
- Persistent cache across restarts
- Atomic rate limiting

### Without Redis (Fallback)
- Microsecond cache lookups (faster for single instance)
- Limited to single instance
- Cache lost on restart
- Potential race conditions in rate limiting

## Future Enhancements

1. **Redis Cluster Support**: For horizontal scaling
2. **Cache Preloading**: Background jobs to maintain hot cache
3. **Compression**: For large cached objects
4. **Cache Analytics**: Detailed hit/miss tracking
5. **Pub/Sub**: For cache invalidation across instances