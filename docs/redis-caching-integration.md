# Redis Caching Integration Documentation

## Overview

This document outlines the comprehensive Redis caching integration implemented in RRA_V2. The caching system provides significant performance improvements by reducing database queries, API calls, and computation time across the application.

## Architecture

### Core Components

1. **Redis Cache Manager** (`lib/cache/redis-cache-manager.ts`)
   - Central caching service with Redis backend
   - Supports basic operations, hash operations, and list operations
   - Includes compression, monitoring, and health checks

2. **Cache Middleware** (`lib/middleware/cache-middleware.ts`)
   - HTTP response caching for API routes
   - ETag support for conditional requests
   - Stale-while-revalidate functionality

3. **Enhanced Cohere Client** (`lib/ai/enhanced-cohere-client.ts`)
   - Caches embedding generation results
   - Caches reranking results
   - Reduces API calls and costs

4. **Specialized Cache Services**
   - Document Cache: Caches document processing results
   - Workflow Cache: Caches workflow states and events
   - Embedding Cache: Caches embedding vectors and search queries

## Environment Configuration

### Required Environment Variables

```bash
# Redis Configuration
REDIS_URL=redis://localhost:6379
# For Redis Cluster or Redis Cloud:
# REDIS_URL=redis://user:password@host:port

# Optional Cache Configuration
SEARCH_CACHE_ENABLED=true
SEARCH_CACHE_TTL=1800
CACHE_MONITORING_ENABLED=true
LOG_LEVEL=info

# Cohere API (for embedding caching)
COHERE_API_KEY=your_cohere_api_key
COHERE_EMBED_MODEL=v3.0  # or v4.0
```

### Redis Setup Options

#### Option 1: Local Redis (Development)
```bash
# Install Redis locally
# macOS
brew install redis
brew services start redis

# Ubuntu/Debian
sudo apt update
sudo apt install redis-server
sudo systemctl start redis-server

# Verify installation
redis-cli ping
# Should return: PONG
```

#### Option 2: Docker Redis
```bash
# Run Redis in Docker
docker run -d --name redis-cache -p 6379:6379 redis:7-alpine

# With persistence
docker run -d --name redis-cache \
  -p 6379:6379 \
  -v redis-data:/data \
  redis:7-alpine redis-server --appendonly yes
```

#### Option 3: Redis Cloud (Production)
1. Sign up at [Redis Cloud](https://redis.com/redis-enterprise-cloud/)
2. Create a database
3. Copy the connection string to `REDIS_URL`

## Usage Examples

### Basic Cache Operations

```typescript
import { redisCacheManager } from '@/lib/cache';

// Set data with TTL
await redisCacheManager.set('user:123', userData, { ttl: 3600 });

// Get data
const user = await redisCacheManager.get('user:123');

// Delete data
await redisCacheManager.delete('user:123');

// Check existence
const exists = await redisCacheManager.exists('user:123');
```

### Document Caching

```typescript
import { documentCache } from '@/lib/cache';

// Cache document data
await documentCache.cacheDocument('doc-123', {
  title: 'Document Title',
  content: 'Document content...',
  metadata: { size: '1MB', pages: 10 }
});

// Cache processing status
await documentCache.cacheProcessingStatus('doc-123', 'processing', {
  progress: 75,
  currentStep: 'text-extraction'
});
```

### Workflow Caching

```typescript
import { workflowCache } from '@/lib/cache';

// Cache workflow state
await workflowCache.cacheWorkflowState('workflow-456', {
  currentStep: 'embedding-generation',
  status: 'running',
  progress: 60
});

// Add workflow events
await workflowCache.addWorkflowEvent('workflow-456', {
  type: 'step_completed',
  stepId: 'text-extraction',
  timestamp: Date.now()
});
```

### Enhanced Cohere Client

```typescript
import { enhancedCohereService } from '@/lib/cache';

// Generate embedding with caching
const result = await enhancedCohereService.generateEmbedding('text to embed', {
  model: 'v4.0',
  useCache: true
});

console.log('Cache hit:', result.cacheHit);
console.log('Processing time:', result.processingTimeMs);

// Batch embeddings with mixed cache hits/misses
const batchResult = await enhancedCohereService.generateEmbeddingBatch([
  'text 1',
  'text 2',
  'text 3'
]);

console.log('Cache hit rate:', batchResult.cacheHitRate);
```

### API Route Caching

```typescript
import { withCache, searchCache } from '@/lib/cache';

// Basic API caching
export const GET = withCache({ ttl: 300 })(async (req: NextRequest) => {
  // Your API logic here
  return NextResponse.json({ data: 'response' });
});

// Search-specific caching
export const GET = searchCache(1800)(async (req: NextRequest) => {
  // Search logic here
  return NextResponse.json({ results: [] });
});
```

### Cache Invalidation

```typescript
import { CacheInvalidation } from '@/lib/cache';

// Invalidate document-related caches
await CacheInvalidation.invalidateDocument('doc-123');

// Invalidate search caches for a user
await CacheInvalidation.invalidateSearch('user-456');

// Invalidate workflow caches
await CacheInvalidation.invalidateWorkflow('workflow-789');
```

## Cache Configuration

### Development Configuration

```typescript
import { CacheConfig } from '@/lib/cache';

const devConfig = CacheConfig.getDevelopmentConfig();
// - Shorter TTLs for faster development iteration
// - Compression disabled for easier debugging
// - Development-specific key prefixes
```

### Production Configuration

```typescript
const prodConfig = CacheConfig.getProductionConfig();
// - Longer TTLs for better performance
// - Compression enabled to save memory
// - Production-specific key prefixes
```

## Performance Benefits

### Before Caching (Estimated)
- Search query: ~500-1000ms (DB + embedding generation)
- Document processing: ~2-5 seconds per document
- Reranking: ~200-500ms per query
- API responses: ~100-300ms

### After Caching (Estimated)
- Search query (cache hit): ~50-100ms (80-90% improvement)
- Document processing (cached): ~100-200ms (95% improvement)
- Reranking (cache hit): ~10-20ms (95% improvement)
- API responses (cached): ~5-10ms (95% improvement)

### Expected Cache Hit Rates
- Embeddings: 70-80% (repeated content)
- Search queries: 60-70% (common searches)
- API responses: 40-60% (varies by endpoint)
- Document data: 90%+ (stable content)

## Monitoring and Metrics

### Cache Health Monitoring

```typescript
import { CacheUtils } from '@/lib/cache';

// Get comprehensive stats
const stats = await CacheUtils.getAllCacheStats();
console.log('Redis hit rate:', stats.redis.hitRate);
console.log('Cohere cache hit rate:', stats.cohere.hitRate);

// Monitor cache health
const health = await CacheUtils.monitorCacheHealth();
if (!health.healthy) {
  console.log('Cache issues:', health.issues);
  console.log('Recommendations:', health.recommendations);
}
```

### Performance Metrics

```typescript
// Get Cohere client metrics
const cohereMetrics = enhancedCohereService.getMetrics();
console.log('Embedding cache hit rate:', cohereMetrics.embeddingCacheHitRate);
console.log('Average API response time:', cohereMetrics.avgApiResponseTime);
console.log('Average cache response time:', cohereMetrics.avgCacheResponseTime);
```

## Best Practices

### 1. Cache Key Design
- Use consistent, hierarchical naming: `prefix:entity:id`
- Include relevant parameters in key generation
- Use hashing for complex objects

### 2. TTL Strategy
- Short TTL for frequently changing data (5-30 minutes)
- Medium TTL for semi-static data (1-4 hours)
- Long TTL for stable data (4-24 hours)

### 3. Cache Invalidation
- Invalidate on data updates
- Use tags for bulk invalidation
- Implement stale-while-revalidate for high availability

### 4. Error Handling
- Always handle cache failures gracefully
- Fall back to original data source
- Log cache errors for monitoring

### 5. Memory Management
- Monitor cache memory usage
- Implement cache cleanup policies
- Use compression for large objects

## Troubleshooting

### Common Issues

1. **Redis Connection Failures**
   ```typescript
   // Check Redis health
   const health = await redisCacheManager.healthCheck();
   console.log('Connected:', health.connected);
   ```

2. **Low Cache Hit Rates**
   - Review TTL settings
   - Check cache key consistency
   - Monitor invalidation patterns

3. **Memory Usage Issues**
   - Enable compression
   - Reduce TTL values
   - Implement cache cleanup

4. **Performance Problems**
   - Monitor cache response times
   - Check Redis server performance
   - Consider Redis clustering for scale

### Debug Commands

```bash
# Check Redis connection
redis-cli ping

# Monitor Redis operations
redis-cli monitor

# Check memory usage
redis-cli info memory

# List all keys (development only)
redis-cli keys "*"

# Get cache statistics
redis-cli info stats
```

## Testing

### Unit Tests
Run the Redis cache integration tests:
```bash
bun test tests/lib/redis-cache-integration.test.ts
```

### Integration Tests
Test with real Redis instance:
```bash
# Start Redis
docker run -d --name test-redis -p 6379:6379 redis:7-alpine

# Run tests
REDIS_URL=redis://localhost:6379 bun test tests/lib/redis-cache-integration.test.ts

# Cleanup
docker stop test-redis && docker rm test-redis
```

## Migration Guide

### Upgrading from No Caching

1. **Install Redis**
   ```bash
   # Local development
   brew install redis
   brew services start redis
   ```

2. **Update Environment Variables**
   ```bash
   echo "REDIS_URL=redis://localhost:6379" >> .env.local
   ```

3. **Update Import Statements**
   ```typescript
   // Before
   import { cohereService } from '@/lib/ai/cohere-client';
   
   // After
   import { enhancedCohereService as cohereService } from '@/lib/cache';
   ```

4. **Add Cache Middleware to API Routes**
   ```typescript
   // Before
   export async function GET(req: NextRequest) {
     // Your logic
   }
   
   // After
   import { searchCache } from '@/lib/cache';
   export const GET = searchCache()(async (req: NextRequest) => {
     // Your logic
   });
   ```

5. **Test and Monitor**
   - Verify cache hit rates
   - Monitor performance improvements
   - Adjust TTL values as needed

## Security Considerations

1. **Redis Security**
   - Use AUTH for Redis connections
   - Enable SSL/TLS for production
   - Restrict Redis network access

2. **Data Privacy**
   - Don't cache sensitive user data
   - Use encryption for sensitive cache content
   - Implement proper cache invalidation

3. **Access Control**
   - User-specific cache isolation
   - Validate cache key access
   - Monitor cache access patterns

## Cost Optimization

### Redis Cloud Pricing
- **Free Tier**: 30MB, suitable for development
- **Paid Plans**: Start at $5/month for 100MB
- **Enterprise**: Custom pricing for larger deployments

### Cost Reduction Strategies
1. **Optimize TTL Values**
   - Don't cache data longer than necessary
   - Use shorter TTL for development

2. **Implement Compression**
   - Reduces memory usage by 60-80%
   - Trade CPU for memory savings

3. **Monitor Usage**
   - Track cache hit rates
   - Identify unused cache patterns
   - Clean up stale data

## Future Enhancements

1. **Cache Warming**
   - Pre-populate caches with common data
   - Background cache refresh

2. **Multi-Level Caching**
   - In-memory L1 cache
   - Redis L2 cache
   - CDN L3 cache

3. **Advanced Analytics**
   - Cache performance dashboards
   - Predictive cache warming
   - Automatic TTL optimization

4. **Cache Clustering**
   - Redis Cluster for horizontal scaling
   - Sharding strategies
   - High availability setup